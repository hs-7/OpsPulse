import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../../database/database.module';
import * as schema from '../../database/schema';

@Injectable()
export class AnalyticsService {
  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>) {}

  async summary(organizationId: string) {
    const incidentRows = await this.db.select({ id: schema.incidents.id })
      .from(schema.incidents)
      .where(eq(schema.incidents.organizationId, organizationId));
    const projectRows = await this.db.select({ id: schema.projects.id })
      .from(schema.projects)
      .where(eq(schema.projects.organizationId, organizationId));
    const projectIds = projectRows.map((project) => project.id);
    let deliveries: Array<{ id: string }> = [];
    if (projectIds.length) {
      deliveries = await this.db
        .select({ id: schema.webhookDeliveries.id })
        .from(schema.webhookDeliveries)
        .innerJoin(schema.webhookEvents, eq(schema.webhookDeliveries.eventId, schema.webhookEvents.id))
        .innerJoin(schema.webhookEndpoints, eq(schema.webhookEvents.endpointId, schema.webhookEndpoints.id))
        .innerJoin(schema.projects, eq(schema.webhookEndpoints.projectId, schema.projects.id))
        .where(and(
          eq(schema.projects.organizationId, organizationId),
          inArray(schema.projects.id, projectIds),
        ));
    }
    return { organizationId, incidents: incidentRows.length, projects: projectRows.length, deliveries: deliveries.length };
  }
}
