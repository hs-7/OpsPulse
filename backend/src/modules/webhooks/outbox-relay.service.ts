import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { and, asc, eq, isNull } from "drizzle-orm";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Queue } from "bullmq";
import Redis from "ioredis";
import { z } from "zod";
import { DRIZZLE } from "../../database/database.module";
import * as schema from "../../database/schema";
import { OUTBOX_RELAY_CHANNEL, REDIS_SUBSCRIBER } from "../redis/redis.module";
import { DeliveryJob } from "./webhook-delivery.worker";
import { WEBHOOK_DELIVERY_QUEUE } from "./webhook-delivery-queue";

const webhookEventPayloadSchema = z.object({
  eventId: z.string().uuid(),
  endpointId: z.string().uuid(),
  deliveryId: z.string().uuid().optional(),
});

const batchSize = 50;
const pollIntervalMs = 1000;

@Injectable()
export class OutboxRelayService implements OnModuleInit, OnModuleDestroy {
  private readonly _logger = new Logger(OutboxRelayService.name);
  private _pollTimer?: NodeJS.Timeout;
  private _relayPromise?: Promise<number>;
  private _isShuttingDown = false;
  private readonly _handleMessage = (channel: string): void => {
    if (channel === OUTBOX_RELAY_CHANNEL) this._wake();
  };

  constructor(
    @Inject(DRIZZLE) private readonly _db: NodePgDatabase<typeof schema>,
    @Inject(WEBHOOK_DELIVERY_QUEUE)
    private readonly _queue: Queue<DeliveryJob>,
    @Inject(REDIS_SUBSCRIBER) private readonly _subscriber: Redis,
  ) {}

  public async onModuleInit(): Promise<void> {
    this._subscriber.on("message", this._handleMessage);
    await this._subscriber.subscribe(OUTBOX_RELAY_CHANNEL);
    this._pollTimer = setInterval(() => this._wake(), pollIntervalMs);
    this._pollTimer.unref();
    this._wake();
  }

  public async onModuleDestroy(): Promise<void> {
    this._isShuttingDown = true;
    this._subscriber.removeListener("message", this._handleMessage);
    if (this._pollTimer) clearInterval(this._pollTimer);
    if (this._relayPromise) {
      try {
        await this._relayPromise;
      } catch (error: unknown) {
        this._logRelayError(error);
      }
    }
  }

  /** Schedules an immediate, non-blocking attempt to publish pending webhook events. */
  public notify(): void {
    this._wake();
  }

  /** Publishes one batch; also exposed for deterministic retry and integration testing. */
  public relayPending(): Promise<number> {
    if (!this._relayPromise) {
      this._relayPromise = this._publishBatch().finally(() => {
        this._relayPromise = undefined;
      });
    }

    return this._relayPromise;
  }

  private _wake(): void {
    if (this._isShuttingDown) return;
    void this.relayPending().catch((error: unknown) => this._logRelayError(error));
  }

  private async _publishBatch(): Promise<number> {
    return this._db.transaction(async (tx) => {
      const messages = await tx
        .select({
          id: schema.outboxMessages.id,
          eventType: schema.outboxMessages.eventType,
          payload: schema.outboxMessages.payload,
        })
        .from(schema.outboxMessages)
        .where(
          and(
            isNull(schema.outboxMessages.publishedAt),
            eq(schema.outboxMessages.eventType, "webhook.event.received"),
          ),
        )
        .orderBy(asc(schema.outboxMessages.createdAt))
        .limit(batchSize)
        .for("update", { skipLocked: true });

      for (const message of messages) {
        const parsedPayload = webhookEventPayloadSchema.parse(message.payload);
        const deliveryId =
          parsedPayload.deliveryId ??
          (
            await tx
              .select({ id: schema.webhookDeliveries.id })
              .from(schema.webhookDeliveries)
              .where(eq(schema.webhookDeliveries.eventId, parsedPayload.eventId))
              .limit(1)
          )[0]?.id;
        if (!deliveryId) {
          throw new Error(
            `No delivery exists for outbox event ${message.id}`,
          );
        }

        const jobData: DeliveryJob = {
          deliveryId,
          eventId: parsedPayload.eventId,
          endpointId: parsedPayload.endpointId,
        };
        await this._queue.add("deliver", jobData, {
          jobId: `delivery-${deliveryId}`,
        });
        await tx
          .update(schema.outboxMessages)
          .set({ publishedAt: new Date() })
          .where(
            and(
              eq(schema.outboxMessages.id, message.id),
              isNull(schema.outboxMessages.publishedAt),
            ),
          );
      }

      return messages.length;
    });
  }

  private _logRelayError(error: unknown): void {
    this._logger.error(
      "Could not publish webhook outbox messages",
      error instanceof Error ? error.stack : String(error),
    );
  }
}
