import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { parseInput } from "../../common/validation/parse-input";
import { DRIZZLE } from "../../database/database.module";
import * as schema from "../../database/schema";
import { workflowSchema } from "./workflows.schemas";

@Injectable()
export class WorkflowsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  list(organizationId: string) {
    return this.db
      .select()
      .from(schema.workflows)
      .where(eq(schema.workflows.organizationId, organizationId));
  }

  async create(organizationId: string, input: unknown) {
    const parsed = parseInput(workflowSchema, input);
    const [workflow] = await this.db
      .insert(schema.workflows)
      .values({
        organizationId,
        name: parsed.name,
        definition: parsed.definition,
        active: parsed.active,
      })
      .returning();
    return workflow;
  }

  async get(organizationId: string, workflowId: string) {
    const rows = await this.db
      .select()
      .from(schema.workflows)
      .where(
        and(
          eq(schema.workflows.organizationId, organizationId),
          eq(schema.workflows.id, workflowId),
        ),
      )
      .limit(1);
    if (!rows.length) throw new NotFoundException("Workflow not found");
    return rows[0];
  }
}
