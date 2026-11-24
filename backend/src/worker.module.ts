import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnvironment } from './config/env';
import { DatabaseModule } from './database/database.module';
import { ObservabilityLifecycle } from './common/observability';
import { IncidentsModule } from './modules/incidents/incidents.module';
import { RedisModule } from './modules/redis/redis.module';
import { OutboxRelayService } from './modules/webhooks/outbox-relay.service';
import {
  webhookDeliveryQueueProvider,
  WebhookDeliveryQueueLifecycle,
} from './modules/webhooks/webhook-delivery-queue';
import { WebhookDeliveryWorker } from './modules/webhooks/webhook-delivery.worker';
import { WorkerHeartbeatService } from './worker-heartbeat.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../.env'],
      validate: validateEnvironment,
    }),
    DatabaseModule,
    RedisModule,
    IncidentsModule,
  ],
  providers: [
    webhookDeliveryQueueProvider,
    WebhookDeliveryWorker,
    OutboxRelayService,
    WebhookDeliveryQueueLifecycle,
    WorkerHeartbeatService,
    ObservabilityLifecycle,
  ],
})
export class WorkerModule {}
