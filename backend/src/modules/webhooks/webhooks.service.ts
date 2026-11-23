import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Queue } from 'bullmq';
import { randomBytes, timingSafeEqual, createHmac } from 'node:crypto';
import { z } from 'zod';
import { DRIZZLE } from '../../database/database.module';
import * as schema from '../../database/schema';

const createEndpointSchema = z.object({
  projectId: z.string().uuid(),
  endpointUrl: z.string().url(),
});

const projectIdSchema = z.string().uuid();

@Injectable()
export class WebhooksService implements OnModuleInit, OnModuleDestroy {
  private queue!: Queue;

  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    this.queue = new Queue('webhook-deliveries', {
      connection: { url: this.config.getOrThrow<string>('REDIS_URL') },
      defaultJobOptions: { attempts: 5, backoff: { type: 'exponential', delay: 1000 } },
    });
  }

  async onModuleDestroy() {
    await this.queue?.close();
  }

  async create(organizationId: string, input: unknown) {
    const data = createEndpointSchema.safeParse(input);
    if (!data.success) throw new BadRequestException(data.error.issues.map((issue) => issue.message).join(', '));

    const projects = await this.db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(and(
        eq(schema.projects.id, data.data.projectId),
        eq(schema.projects.organizationId, organizationId),
      ))
      .limit(1);
    if (!projects.length) throw new NotFoundException('Project not found');

    const secret = randomBytes(32).toString('hex');
    const [endpoint] = await this.db.insert(schema.webhookEndpoints).values({
      projectId: data.data.projectId,
      endpointUrl: data.data.endpointUrl,
      secretReference: secret,
      active: true,
    }).returning();

    return {
      id: endpoint.id,
      projectId: endpoint.projectId,
      endpointUrl: endpoint.endpointUrl,
      ingestionUrl: `/api/webhooks/ingest/${endpoint.id}`,
      secret,
      active: endpoint.active,
    };
  }

  async list(organizationId: string, projectId?: string) {
    const conditions = [eq(schema.projects.organizationId, organizationId)];
    if (projectId) {
      const parsedProjectId = projectIdSchema.safeParse(projectId);
      if (!parsedProjectId.success) throw new BadRequestException('Invalid projectId');
      conditions.push(eq(schema.projects.id, parsedProjectId.data));
    }

    return this.db
      .select({
        id: schema.webhookEndpoints.id,
        projectId: schema.webhookEndpoints.projectId,
        endpointUrl: schema.webhookEndpoints.endpointUrl,
        active: schema.webhookEndpoints.active,
      })
      .from(schema.webhookEndpoints)
      .innerJoin(schema.projects, eq(schema.webhookEndpoints.projectId, schema.projects.id))
      .where(and(...conditions));
  }

  async ingest(endpointId: string, signatureHeader: string | undefined, idempotencyKey: string | undefined, eventType: string | undefined, payload: unknown) {
    if (!idempotencyKey?.trim()) throw new BadRequestException('X-Idempotency-Key header is required');
    if (!signatureHeader) throw new BadRequestException('X-Webhook-Signature header is required');

    const endpoints = await this.db
      .select()
      .from(schema.webhookEndpoints)
      .where(and(eq(schema.webhookEndpoints.id, endpointId), eq(schema.webhookEndpoints.active, true)))
      .limit(1);
    if (!endpoints.length) throw new NotFoundException('Webhook endpoint not found');

    const secret = endpoints[0].secretReference;
    if (!secret) throw new ConflictException('Webhook endpoint secret is not configured');
    const serialized = typeof payload === 'string' ? payload : JSON.stringify(payload);
    let eventPayload: unknown = payload;
    if (typeof payload === 'string') {
      try {
        eventPayload = JSON.parse(payload);
      } catch {
        eventPayload = payload;
      }
    }
    const expected = createHmac('sha256', secret).update(serialized).digest('hex');
    const provided = signatureHeader.replace(/^sha256=/i, '').trim();
    if (!/^[a-f0-9]{64}$/i.test(provided) ||
      provided.length !== expected.length ||
      !timingSafeEqual(Buffer.from(provided, 'hex'), Buffer.from(expected, 'hex'))) {
      throw new BadRequestException('Invalid webhook signature');
    }

    const existing = await this.db
      .select({ id: schema.webhookEvents.id })
      .from(schema.webhookEvents)
      .where(and(
        eq(schema.webhookEvents.endpointId, endpointId),
        eq(schema.webhookEvents.idempotencyKey, idempotencyKey.trim()),
      ))
      .limit(1);
    if (existing.length) {
      return { accepted: true, duplicate: true, eventId: existing[0].id };
    }

    let result: { event: typeof schema.webhookEvents.$inferSelect; delivery: typeof schema.webhookDeliveries.$inferSelect };
    try {
      result = await this.db.transaction(async (tx) => {
        const [event] = await tx.insert(schema.webhookEvents).values({
          endpointId,
          eventType: eventType?.trim() || 'webhook.event',
          payload: eventPayload as Record<string, unknown>,
          status: 'received',
          idempotencyKey: idempotencyKey.trim(),
        }).returning();
        await tx.insert(schema.outboxMessages).values({
          eventType: 'webhook.event.received',
          payload: { eventId: event.id, endpointId, idempotencyKey: idempotencyKey.trim(), event },
        });
        const [delivery] = await tx.insert(schema.webhookDeliveries).values({
          eventId: event.id,
          attemptCount: 0,
          status: 'pending',
        }).returning();
        return { event, delivery };
      });
    } catch (error) {
      const raced = await this.db
        .select({ id: schema.webhookEvents.id })
        .from(schema.webhookEvents)
        .where(and(
          eq(schema.webhookEvents.endpointId, endpointId),
          eq(schema.webhookEvents.idempotencyKey, idempotencyKey.trim()),
        ))
        .limit(1);
      if (raced.length) {
        return { accepted: true, duplicate: true, eventId: raced[0].id };
      }
      throw error;
    }

    await this.queue.add('deliver', {
      deliveryId: result.delivery.id,
      eventId: result.event.id,
      endpointId,
    }, {
      jobId: `delivery-${result.delivery.id}`,
      attempts: 5,
      backoff: { type: 'exponential', delay: 1000 },
    });

    return { accepted: true, duplicate: false, eventId: result.event.id, deliveryId: result.delivery.id };
  }

  async replay(organizationId: string, deliveryId: string) {
    const rows = await this.db
      .select({
        deliveryId: schema.webhookDeliveries.id,
        eventId: schema.webhookDeliveries.eventId,
        endpointId: schema.webhookEvents.endpointId,
        organizationId: schema.projects.organizationId,
      })
      .from(schema.webhookDeliveries)
      .innerJoin(schema.webhookEvents, eq(schema.webhookDeliveries.eventId, schema.webhookEvents.id))
      .innerJoin(schema.webhookEndpoints, eq(schema.webhookEvents.endpointId, schema.webhookEndpoints.id))
      .innerJoin(schema.projects, eq(schema.webhookEndpoints.projectId, schema.projects.id))
      .where(and(
        eq(schema.webhookDeliveries.id, deliveryId),
        eq(schema.projects.organizationId, organizationId),
      ))
      .limit(1);
    if (!rows.length) throw new NotFoundException('Webhook delivery not found');

    await this.db.update(schema.webhookDeliveries)
      .set({ status: 'pending', attemptCount: 0, responseStatus: null, nextRetryAt: null })
      .where(eq(schema.webhookDeliveries.id, deliveryId));
    await this.queue.add('deliver', {
      deliveryId,
      eventId: rows[0].eventId,
      endpointId: rows[0].endpointId,
    }, { jobId: `replay-${deliveryId}-${Date.now()}`, attempts: 5, backoff: { type: 'exponential', delay: 1000 } });
    return { replayed: true, deliveryId };
  }

  async listDeliveries(organizationId: string, projectId?: string) {
    const conditions = [eq(schema.projects.organizationId, organizationId)];
    if (projectId) {
      const parsedProjectId = projectIdSchema.safeParse(projectId);
      if (!parsedProjectId.success) throw new BadRequestException('Invalid projectId');
      conditions.push(eq(schema.projects.id, parsedProjectId.data));
    }

    return this.db
      .select({
        id: schema.webhookDeliveries.id,
        eventId: schema.webhookDeliveries.eventId,
        eventType: schema.webhookEvents.eventType,
        attemptCount: schema.webhookDeliveries.attemptCount,
        responseStatus: schema.webhookDeliveries.responseStatus,
        nextRetryAt: schema.webhookDeliveries.nextRetryAt,
        status: schema.webhookDeliveries.status,
      })
      .from(schema.webhookDeliveries)
      .innerJoin(schema.webhookEvents, eq(schema.webhookDeliveries.eventId, schema.webhookEvents.id))
      .innerJoin(schema.webhookEndpoints, eq(schema.webhookEvents.endpointId, schema.webhookEndpoints.id))
      .innerJoin(schema.projects, eq(schema.webhookEndpoints.projectId, schema.projects.id))
      .where(and(...conditions));
  }
}
