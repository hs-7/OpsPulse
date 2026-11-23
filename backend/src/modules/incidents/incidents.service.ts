import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { parseInput } from "../../common/validation/parse-input";
import { DRIZZLE } from "../../database/database.module";
import * as schema from "../../database/schema";
import { NotificationsService } from "../notifications/notifications.service";
import { AIInsightsService } from "../ai-insights/ai-insights.service";
import { incidentSchema } from "./incidents.schemas";

@Injectable()
export class IncidentsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    @Inject(NotificationsService)
    private readonly notifications: NotificationsService,
    @Inject(AIInsightsService) private readonly ai: AIInsightsService,
  ) {}

  async list(organizationId: string) {
    return this.db
      .select()
      .from(schema.incidents)
      .where(eq(schema.incidents.organizationId, organizationId));
  }

  async get(organizationId: string, incidentId: string) {
    const rows = await this.db
      .select()
      .from(schema.incidents)
      .where(
        and(
          eq(schema.incidents.organizationId, organizationId),
          eq(schema.incidents.id, incidentId),
        ),
      )
      .limit(1);
    if (!rows.length) throw new NotFoundException("Incident not found");
    return rows[0];
  }

  async create(
    organizationId: string,
    actorId: string | undefined,
    input: unknown,
  ) {
    const parsed = parseInput(incidentSchema, input);
    const [incident] = await this.db
      .insert(schema.incidents)
      .values({
        organizationId,
        title: parsed.title,
        severity: parsed.severity,
        status: parsed.status,
      })
      .returning();
    await this.recordAudit(
      organizationId,
      actorId,
      "incident.create",
      "incident",
      incident.id,
    );
    this.publish(organizationId, incident.id, incident.title);
    return incident;
  }

  async update(
    organizationId: string,
    incidentId: string,
    actorId: string | undefined,
    input: unknown,
  ) {
    const parsed = parseInput(incidentSchema.partial(), input);
    const [incident] = await this.db
      .update(schema.incidents)
      .set(parsed)
      .where(
        and(
          eq(schema.incidents.organizationId, organizationId),
          eq(schema.incidents.id, incidentId),
        ),
      )
      .returning();
    if (!incident) throw new NotFoundException("Incident not found");
    await this.recordAudit(
      organizationId,
      actorId,
      "incident.update",
      "incident",
      incident.id,
    );
    this.publish(organizationId, incident.id, incident.title);
    return incident;
  }

  async summarize(organizationId: string, incidentId: string) {
    const incident = await this.get(organizationId, incidentId);
    const deliveries = await this.db
      .select({
        attemptCount: schema.webhookDeliveries.attemptCount,
        status: schema.webhookDeliveries.status,
        responseStatus: schema.webhookDeliveries.responseStatus,
      })
      .from(schema.webhookDeliveries)
      .limit(20);
    return this.ai.summarize({
      organizationId,
      title: incident.title,
      severity: incident.severity,
      status: incident.status,
      deliveryFailures: deliveries.filter(
        (delivery) => delivery.status !== "delivered",
      ).length,
      responseStatus: deliveries
        .map((delivery) => delivery.responseStatus)
        .find((status) => status !== null),
    });
  }

  async escalateRepeatedFailure(
    organizationId: string,
    deliveryId: string,
    endpointId: string,
    eventId: string,
    error: string,
  ) {
    const open = await this.db
      .select({ id: schema.incidents.id })
      .from(schema.incidents)
      .where(
        and(
          eq(schema.incidents.organizationId, organizationId),
          eq(schema.incidents.status, "open"),
          eq(
            schema.incidents.title,
            `Repeated webhook delivery failures (${endpointId})`,
          ),
        ),
      )
      .limit(1);
    if (open.length) return open[0];

    const [incident] = await this.db
      .insert(schema.incidents)
      .values({
        organizationId,
        title: `Repeated webhook delivery failures (${endpointId})`,
        severity: "critical",
        status: "open",
      })
      .returning();
    await this.recordAudit(
      organizationId,
      undefined,
      "incident.auto_escalate",
      "incident",
      incident.id,
    );
    this.publish(organizationId, incident.id, incident.title);
    void this.ai.summarize({
      organizationId,
      title: incident.title,
      severity: incident.severity,
      status: incident.status,
    });
    return incident;
  }

  private publish(
    organizationId: string,
    resourceId: string,
    title: string,
  ): void {
    this.notifications.publish({
      organizationId,
      type: "incident",
      resourceType: "incident",
      resourceId,
      title,
      timestamp: new Date().toISOString(),
    });
  }

  private recordAudit(
    organizationId: string,
    actorId: string | undefined,
    action: string,
    resourceType: string,
    resourceId: string,
  ) {
    return this.db.insert(schema.auditLogs).values({
      organizationId,
      actorId,
      action,
      resourceType,
      resourceId,
    });
  }
}
