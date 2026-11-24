import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Subject } from 'rxjs';
import { and, eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import Redis from 'ioredis';
import { z } from 'zod';
import { DRIZZLE } from '../../database/database.module';
import * as schema from '../../database/schema';
import { NOTIFICATIONS_CHANNEL, REDIS, REDIS_SUBSCRIBER } from '../redis/redis.module';

export type RealtimeNotification = {
  organizationId: string;
  type: string;
  resourceType: string;
  resourceId: string;
  title: string;
  timestamp: string;
};

const realtimeNotificationSchema = z.object({
  organizationId: z.string(),
  type: z.string(),
  resourceType: z.string(),
  resourceId: z.string(),
  title: z.string(),
  timestamp: z.string(),
});

@Injectable()
export class NotificationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly stream = new Subject<RealtimeNotification>();
  private readonly handleMessage = (channel: string, message: string): void => {
    if (channel !== NOTIFICATIONS_CHANNEL) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(message);
    } catch (error) {
      this.logger.warn(`Ignoring invalid notification message: ${String(error)}`);
      return;
    }

    const notification = realtimeNotificationSchema.safeParse(parsed);
    if (!notification.success) {
      this.logger.warn(`Ignoring malformed notification: ${notification.error.message}`);
      return;
    }
    this.stream.next(notification.data);
  };

  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(REDIS_SUBSCRIBER) private readonly subscriber: Redis,
  ) {}

  async onModuleInit(): Promise<void> {
    this.subscriber.on('message', this.handleMessage);
    await this.subscriber.subscribe(NOTIFICATIONS_CHANNEL);
  }

  onModuleDestroy(): void {
    this.subscriber.removeListener('message', this.handleMessage);
    this.stream.complete();
  }

  list(
    organizationId: string,
  ): Promise<Array<typeof schema.auditLogs.$inferSelect>> {
    return this.db
      .select()
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.organizationId, organizationId))
      .orderBy(schema.auditLogs.createdAt);
  }

  async publish(notification: RealtimeNotification): Promise<void> {
    try {
      await this.redis.publish(NOTIFICATIONS_CHANNEL, JSON.stringify(notification));
    } catch (error) {
      this.logger.warn(
        `Could not publish live notification; the database change remains saved: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  forOrganization(organizationId: string) {
    return this.stream.asObservable();
  }
}
