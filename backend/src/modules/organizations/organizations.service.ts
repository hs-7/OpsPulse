import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { parseInput } from "../../common/validation/parse-input";
import { DRIZZLE } from "../../database/database.module";
import * as schema from "../../database/schema";
import {
  addMemberSchema,
  createOrganizationSchema,
} from "./organizations.schemas";

@Injectable()
export class OrganizationsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async list(userId: string) {
    return this.db
      .select({
        id: schema.organizations.id,
        name: schema.organizations.name,
        role: schema.organizationMembers.role,
        createdAt: schema.organizations.createdAt,
      })
      .from(schema.organizationMembers)
      .innerJoin(
        schema.organizations,
        eq(schema.organizationMembers.organizationId, schema.organizations.id),
      )
      .where(eq(schema.organizationMembers.userId, userId));
  }

  async get(organizationId: string, userId: string) {
    const rows = await this.db
      .select({
        id: schema.organizations.id,
        name: schema.organizations.name,
        role: schema.organizationMembers.role,
      })
      .from(schema.organizationMembers)
      .innerJoin(
        schema.organizations,
        eq(schema.organizationMembers.organizationId, schema.organizations.id),
      )
      .where(
        and(
          eq(schema.organizationMembers.organizationId, organizationId),
          eq(schema.organizationMembers.userId, userId),
        ),
      )
      .limit(1);
    if (!rows.length) throw new NotFoundException("Organization not found");
    return rows[0];
  }

  async create(userId: string, input: unknown) {
    const data = parseInput(createOrganizationSchema, input);
    return this.db.transaction(async (tx) => {
      const [organization] = await tx
        .insert(schema.organizations)
        .values({ name: data.name })
        .returning();
      await tx.insert(schema.organizationMembers).values({
        organizationId: organization.id,
        userId,
        role: "OWNER",
      });
      return organization;
    });
  }

  async addMember(organizationId: string, input: unknown) {
    const data = parseInput(addMemberSchema, input);
    const users = await this.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, data.email))
      .limit(1);
    if (!users.length) throw new NotFoundException("User not found");
    const existing = await this.db
      .select({ id: schema.organizationMembers.id })
      .from(schema.organizationMembers)
      .where(
        and(
          eq(schema.organizationMembers.organizationId, organizationId),
          eq(schema.organizationMembers.userId, users[0].id),
        ),
      )
      .limit(1);
    if (existing.length)
      throw new BadRequestException("User is already a member");
    const [membership] = await this.db
      .insert(schema.organizationMembers)
      .values({
        organizationId,
        userId: users[0].id,
        role: data.role,
      })
      .returning();
    return membership;
  }
}
