import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { WebhookDeliveryWorker } from './webhook-delivery.worker';
import { AuthModule } from '../auth/auth.module';
import { IncidentsModule } from '../incidents/incidents.module';
import { OutboxRelayService } from './outbox-relay.service';
import { webhookDeliveryQueueProvider } from './webhook-delivery-queue';
@Module({
  imports: [AuthModule, IncidentsModule],
  controllers: [WebhooksController],
  providers: [
    webhookDeliveryQueueProvider,
    WebhooksService,
    WebhookDeliveryWorker,
    OutboxRelayService,
  ],
  exports: [WebhooksService],
})
export class WebhooksModule {}
