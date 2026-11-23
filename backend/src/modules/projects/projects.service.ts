import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { z } from 'zod';
import { DRIZZLE } from '../../database/database.module';
import * as schema from '../../database/schema';

const projectSchema = z.object({
  name: z.string().trim().min(1).max(255),
  status: z.enum(['active', 'paused', 'archived']).default('active'),
});

@Injectable()
export class ProjectsService {
  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>) {}

  async list(organizationId: string, userId: string) {
    const membership = await this.db.select({ id: schema.organizationMembers.id })
      .from(schema.organizationMembers)
      .where(and(
        eq(schema.organizationMembers.organizationId, organizationId),
        eq(schema.organizationMembers.userId, userId),
      ))
      .limit(1);
    if (!membership.length) throw new NotFoundException('Organization not found');

    return this.db
      .select({
        id: schema.projects.id,
        name: schema.projects.name,
        status: schema.projects.status,
        organizationId: schema.projects.organizationId,
      })
      .from(schema.projects)
      .where(eq(schema.projects.organizationId, organizationId));
  }

  async get(organizationId: string, projectId: string, userId: string) {
    const rows = await this.db
      .select({
        id: schema.projects.id,
        name: schema.projects.name,
        status: schema.projects.status,
        organizationId: schema.projects.organizationId,
      })
      .from(schema.projects)
      .innerJoin(
        schema.organizationMembers,
        and(
          eq(schema.organizationMembers.organizationId, schema.projects.organizationId),
          eq(schema.organizationMembers.userId, userId),
        ),
      )
      .where(and(
        eq(schema.projects.organizationId, organizationId),
        eq(schema.projects.id, projectId),
      ))
      .limit(1);
    if (!rows.length) throw new NotFoundException('Project not found');
    return rows[0];
  }

  async create(organizationId: string, input: unknown) {
    const data = projectSchema.safeParse(input);
    if (!data.success) throw new BadRequestException(data.error.issues.map((issue) => issue.message).join(', '));
    const [project] = await this.db.insert(schema.projects).values({
      organizationId,
      name: data.data.name,
      status: data.data.status,
    }).returning();
    return project;
  }
}
