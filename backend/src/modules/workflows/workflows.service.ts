import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { z } from 'zod';
import { DRIZZLE } from '../../database/database.module';
import * as schema from '../../database/schema';

const workflowSchema = z.object({
  name: z.string().trim().min(1).max(255),
  definition: z.record(z.unknown()),
  active: z.boolean().default(true),
});

@Injectable()
export class WorkflowsService {
  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>) {}

  list(organizationId: string) {
    return this.db.select().from(schema.workflows).where(eq(schema.workflows.organizationId, organizationId));
  }

  async create(organizationId: string, input: unknown) {
    const parsed = workflowSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues.map((issue) => issue.message).join(', '));
    const [workflow] = await this.db.insert(schema.workflows).values({
      organizationId,
      name: parsed.data.name,
      definition: parsed.data.definition,
      active: parsed.data.active,
    }).returning();
    return workflow;
  }

  async get(organizationId: string, workflowId: string) {
    const rows = await this.db.select().from(schema.workflows).where(and(
      eq(schema.workflows.organizationId, organizationId),
      eq(schema.workflows.id, workflowId),
    )).limit(1);
    if (!rows.length) throw new NotFoundException('Workflow not found');
    return rows[0];
  }
}
