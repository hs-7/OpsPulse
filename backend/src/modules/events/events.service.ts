import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../../database/database.module';
import * as schema from '../../database/schema';

@Injectable()
export class EventsService {
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
        id: schema.webhookEvents.id,
        endpointId: schema.webhookEvents.endpointId,
        eventType: schema.webhookEvents.eventType,
        payload: schema.webhookEvents.payload,
        status: schema.webhookEvents.status,
        idempotencyKey: schema.webhookEvents.idempotencyKey,
        receivedAt: schema.webhookEvents.receivedAt,
      })
      .from(schema.webhookEvents)
      .innerJoin(schema.webhookEndpoints, eq(schema.webhookEvents.endpointId, schema.webhookEndpoints.id))
      .innerJoin(schema.projects, eq(schema.webhookEndpoints.projectId, schema.projects.id))
      .where(eq(schema.projects.organizationId, organizationId));
  }
}
