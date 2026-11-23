import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { parseInput } from "../../common/validation/parse-input";
import { DRIZZLE } from "../../database/database.module";
import * as schema from "../../database/schema";
import { loginSchema, registerSchema } from "./auth.schemas";

@Injectable()
export class AuthService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(ConfigService) private readonly config: ConfigService,
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

    const passwordHash = await bcrypt.hash(data.password, 12);
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
      !(await bcrypt.compare(data.password, users[0].passwordHash))
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
    const sessions = await this.db
      .select()
      .from(schema.refreshSessions)
      .where(
        and(
          eq(schema.refreshSessions.tokenHash, tokenHash),
          isNull(schema.refreshSessions.revokedAt),
          gt(schema.refreshSessions.expiresAt, new Date()),
        ),
      )
      .limit(1);
    if (!sessions.length)
      throw new UnauthorizedException("Invalid or revoked refresh token");

    const users = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, sessions[0].userId))
      .limit(1);
    if (!users.length) throw new UnauthorizedException("User not found");

    await this.db
      .update(schema.refreshSessions)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(schema.refreshSessions.id, sessions[0].id),
          isNull(schema.refreshSessions.revokedAt),
        ),
      );
    return this.issueSession(users[0].id, users[0].email);
  }

  async logout(refreshToken: unknown) {
    if (typeof refreshToken !== "string" || !refreshToken) {
      throw new BadRequestException("Refresh token required");
    }
    await this.db
      .update(schema.refreshSessions)
      .set({ revokedAt: new Date() })
      .where(
        eq(
          schema.refreshSessions.tokenHash,
          this.hashRefreshToken(refreshToken),
        ),
      );
    return { loggedOut: true };
  }

  private async issueSession(userId: string, email: string) {
    const accessToken = this.jwt.sign({ sub: userId, email });
    const refreshToken = randomBytes(48).toString("hex");
    await this.db.insert(schema.refreshSessions).values({
      userId,
      tokenHash: this.hashRefreshToken(refreshToken),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    return { accessToken, refreshToken, expiresIn: 900 };
  }

  private hashRefreshToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }
}
