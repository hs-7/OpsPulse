import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, inArray } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Job, Worker } from 'bullmq';
import { createHmac } from 'node:crypto';
import { DRIZZLE } from '../../database/database.module';
import * as schema from '../../database/schema';
import { IncidentsService } from '../incidents/incidents.service';

export type DeliveryJob = {
  deliveryId: string;
  eventId: string;
  endpointId: string;
};

type FinalDeliveryFailure = Pick<Job<DeliveryJob>, 'data' | 'attemptsMade'>;

export function exponentialBackoffMs(attempt: number): number {
  return 1000 * 2 ** Math.max(0, attempt - 1);
}

@Injectable()
export class WebhookDeliveryWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WebhookDeliveryWorker.name);
  private worker?: Worker;

  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(IncidentsService) private readonly incidents: IncidentsService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.worker = new Worker<DeliveryJob>('webhook-deliveries', async (job) => this.process(job), {
      connection: { url: this.config.getOrThrow<string>('REDIS_URL') },
      concurrency: 5,
    });

    this.worker.on('failed', (job, error) => {
      if (!job) return;
      if (job.attemptsMade >= (job.opts.attempts || 5)) {
        void this.handleFinalFailure(job, error).catch((handlingError: unknown) => {
          this.logger.error(
            'Could not finalize webhook delivery failure',
            handlingError instanceof Error ? handlingError.stack : String(handlingError),
          );
        });
      }
    });
    await this.worker.waitUntilReady();
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }

  async process(job: Job<DeliveryJob>): Promise<void> {
    const deliveryRows = await this.db
      .select({
        deliveryId: schema.webhookDeliveries.id,
        eventId: schema.webhookEvents.id,
        eventType: schema.webhookEvents.eventType,
        payload: schema.webhookEvents.payload,
        endpointUrl: schema.webhookEndpoints.endpointUrl,
        secret: schema.webhookEndpoints.secretReference,
      })
      .from(schema.webhookDeliveries)
      .innerJoin(schema.webhookEvents, eq(schema.webhookDeliveries.eventId, schema.webhookEvents.id))
      .innerJoin(schema.webhookEndpoints, eq(schema.webhookEvents.endpointId, schema.webhookEndpoints.id))
      .where(and(eq(schema.webhookDeliveries.id, job.data.deliveryId), eq(schema.webhookEvents.id, job.data.eventId)))
      .limit(1);

    if (!deliveryRows.length) throw new Error('Webhook delivery not found');
    const delivery = deliveryRows[0];
    const attempt = (job.attemptsMade || 0) + 1;
    await this.db
      .update(schema.webhookDeliveries)
      .set({ attemptCount: attempt, status: 'delivering' })
      .where(eq(schema.webhookDeliveries.id, delivery.deliveryId));

    const body = JSON.stringify(delivery.payload);
    const signature = createHmac('sha256', delivery.secret || '')
      .update(body)
      .digest('hex');

    let response: Response;
    try {
      response = await fetch(delivery.endpointUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': `sha256=${signature}`,
          'X-Webhook-Event': delivery.eventType,
          'X-Webhook-Event-Id': delivery.eventId,
        },
        body,
        signal: AbortSignal.timeout(10000),
      });
    } catch (error) {
      await this.markRetry(delivery.deliveryId, attempt, error);
      throw error;
    }

    if (!response.ok) {
      const error = new Error(`Webhook destination returned HTTP ${response.status}`);
      await this.markRetry(delivery.deliveryId, attempt, error, response.status);
      throw error;
    }

    await this.db.transaction(async (tx) => {
      await tx
        .update(schema.webhookDeliveries)
        .set({
          attemptCount: attempt,
          responseStatus: response.status,
          nextRetryAt: null,
          status: 'delivered',
        })
        .where(eq(schema.webhookDeliveries.id, delivery.deliveryId));
      await tx
        .update(schema.webhookEvents)
        .set({ status: 'delivered' })
        .where(eq(schema.webhookEvents.id, delivery.eventId));
    });
  }

  private async markRetry(deliveryId: string, attempt: number, error: unknown, status?: number): Promise<void> {
    await this.db
      .update(schema.webhookDeliveries)
      .set({
        attemptCount: attempt,
        responseStatus: status || null,
        nextRetryAt: new Date(Date.now() + exponentialBackoffMs(attempt)),
        status: 'retrying',
      })
      .where(eq(schema.webhookDeliveries.id, deliveryId));
  }

  async handleFinalFailure(job: FinalDeliveryFailure, error: unknown): Promise<void> {
    await this.db
      .update(schema.webhookDeliveries)
      .set({ status: 'dead_letter', nextRetryAt: null })
      .where(eq(schema.webhookDeliveries.id, job.data.deliveryId));
    await this.db
      .update(schema.webhookEvents)
      .set({ status: 'dead_letter' })
      .where(eq(schema.webhookEvents.id, job.data.eventId));
    await this.db.insert(schema.jobTracking).values({
      jobName: `webhook-delivery:${job.data.deliveryId}`,
      status: 'dlq',
      attempts: job.attemptsMade,
      result: {
        error: error instanceof Error ? error.message : String(error),
        eventId: job.data.eventId,
      },
    });

    const context = await this.db
      .select({
        endpointId: schema.webhookEvents.endpointId,
        organizationId: schema.projects.organizationId,
      })
      .from(schema.webhookEvents)
      .innerJoin(schema.webhookEndpoints, eq(schema.webhookEvents.endpointId, schema.webhookEndpoints.id))
      .innerJoin(schema.projects, eq(schema.webhookEndpoints.projectId, schema.projects.id))
      .where(eq(schema.webhookEvents.id, job.data.eventId))
      .limit(1);
    if (!context.length) return;

    const repeated = await this.db
      .select({ id: schema.webhookDeliveries.id })
      .from(schema.webhookDeliveries)
      .innerJoin(schema.webhookEvents, eq(schema.webhookDeliveries.eventId, schema.webhookEvents.id))
      .where(
        and(
          eq(schema.webhookEvents.endpointId, context[0].endpointId),
          inArray(schema.webhookDeliveries.status, ['retrying', 'dead_letter']),
        ),
      );
    if (repeated.length >= 3) {
      await this.incidents.escalateRepeatedFailure(
        context[0].organizationId,
        job.data.deliveryId,
        context[0].endpointId,
        job.data.eventId,
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}
