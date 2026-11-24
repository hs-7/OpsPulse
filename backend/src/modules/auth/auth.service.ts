import {
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { parseInput } from "../../common/validation/parse-input";
import { DRIZZLE } from "../../database/database.module";
import * as schema from "../../database/schema";
import { loginSchema, registerSchema } from "./auth.schemas";
import { PASSWORD_HASHER, PasswordHasher } from "./password-hasher";

@Injectable()
export class AuthService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(PASSWORD_HASHER) private readonly passwordHasher: PasswordHasher,
  ) {}

  status() {
    return { module: "auth", ready: true };
  }

  async register(input: unknown) {
    const data = parseInput(registerSchema, input);
    const existing = await this.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, data.email))
      .limit(1);
    if (existing.length)
      throw new ConflictException("Email already registered");

    const passwordHash = await this.passwordHasher.hash(data.password);
    const created = await this.db.transaction(async (tx) => {
      const [user] = await tx
        .insert(schema.users)
        .values({
          name: data.name,
          email: data.email,
          passwordHash,
        })
        .returning();
      const [organization] = await tx
        .insert(schema.organizations)
        .values({
          name: data.organizationName || `${data.name}'s Organization`,
        })
        .returning();
      await tx.insert(schema.organizationMembers).values({
        organizationId: organization.id,
        userId: user.id,
        role: "OWNER",
      });
      return { user };
    });

    return this.issueSession(created.user.id, created.user.email);
  }

  async login(input: unknown) {
    const data = parseInput(loginSchema, input);
    const users = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, data.email))
      .limit(1);
    if (
      !users.length ||
      !(await this.passwordHasher.verify(users[0].passwordHash, data.password))
    ) {
      throw new UnauthorizedException("Invalid email or password");
    }
    return this.issueSession(users[0].id, users[0].email);
  }

  async refresh(refreshToken: unknown) {
    if (typeof refreshToken !== "string" || !refreshToken) {
      throw new UnauthorizedException("Refresh token required");
    }
    const tokenHash = this.hashRefreshToken(refreshToken);
    const outcome = await this.db.transaction(async (tx) => {
      const [candidate] = await tx
        .select({ familyId: schema.refreshSessions.familyId })
        .from(schema.refreshSessions)
        .where(eq(schema.refreshSessions.tokenHash, tokenHash))
        .limit(1);
      if (!candidate) return { type: "invalid" as const };

      const [familyLock] = await tx
        .select({ id: schema.refreshSessions.id })
        .from(schema.refreshSessions)
        .where(eq(schema.refreshSessions.id, candidate.familyId))
        .limit(1)
        .for("update");
      if (!familyLock) return { type: "invalid" as const };
      const [session] = await tx
        .select()
        .from(schema.refreshSessions)
        .where(eq(schema.refreshSessions.tokenHash, tokenHash))
        .limit(1)
        .for("update");
      if (!session) return { type: "invalid" as const };

      if (session.revokedAt) {
        await tx
          .update(schema.refreshSessions)
          .set({ revokedAt: new Date() })
          .where(
            and(
              eq(schema.refreshSessions.familyId, session.familyId),
              isNull(schema.refreshSessions.revokedAt),
            ),
          );
        return { type: "reused" as const };
      }
      if (session.expiresAt <= new Date())
        return { type: "invalid" as const };

      const [user] = await tx
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, session.userId))
        .limit(1);
      if (!user) return { type: "invalid" as const };

      const rotatedAt = new Date();
      const nextRefreshToken = randomBytes(48).toString("hex");
      await tx
        .update(schema.refreshSessions)
        .set({ revokedAt: rotatedAt })
        .where(eq(schema.refreshSessions.id, session.id));
      await tx.insert(schema.refreshSessions).values({
        userId: user.id,
        familyId: session.familyId,
        tokenHash: this.hashRefreshToken(nextRefreshToken),
        expiresAt: new Date(rotatedAt.getTime() + 7 * 24 * 60 * 60 * 1000),
      });

      return {
        type: "rotated" as const,
        session: this.createAccessSession(user.id, user.email, nextRefreshToken),
      };
    });

    if (outcome.type === "reused") {
      throw new UnauthorizedException(
        "Refresh token reuse detected; session family revoked",
      );
    }
    if (outcome.type === "invalid") {
      throw new UnauthorizedException("Invalid or expired refresh token");
    }
    return outcome.session;
  }

  async logout(refreshToken: unknown) {
    if (typeof refreshToken === "string" && refreshToken) {
      await this.db.transaction(async (tx) => {
        const [candidate] = await tx
          .select({ familyId: schema.refreshSessions.familyId })
          .from(schema.refreshSessions)
          .where(
            eq(
              schema.refreshSessions.tokenHash,
              this.hashRefreshToken(refreshToken),
            ),
          )
          .limit(1);
        if (candidate) {
          const [familyLock] = await tx
            .select({ id: schema.refreshSessions.id })
            .from(schema.refreshSessions)
            .where(eq(schema.refreshSessions.id, candidate.familyId))
            .limit(1)
            .for("update");
          if (familyLock) {
            await tx
              .update(schema.refreshSessions)
              .set({ revokedAt: new Date() })
              .where(
                and(
                  eq(schema.refreshSessions.familyId, candidate.familyId),
                  isNull(schema.refreshSessions.revokedAt),
                ),
              );
          }
        }
      });
    }
    return { loggedOut: true };
  }

  private async issueSession(userId: string, email: string) {
    const accessToken = this.jwt.sign({ sub: userId, email });
    const refreshToken = randomBytes(48).toString("hex");
    const familyId = randomUUID();
    await this.db.insert(schema.refreshSessions).values({
      id: familyId,
      userId,
      familyId,
      tokenHash: this.hashRefreshToken(refreshToken),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    return { accessToken, refreshToken, expiresIn: 900 };
  }

  private createAccessSession(
    userId: string,
    email: string,
    refreshToken: string,
  ) {
    return {
      accessToken: this.jwt.sign({ sub: userId, email }),
      refreshToken,
      expiresIn: 900,
    };
  }

  private hashRefreshToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }
}
