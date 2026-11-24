import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { AuthModule } from '../auth/auth.module';
import { IncidentsModule } from '../incidents/incidents.module';
import { webhookDeliveryQueueProvider, WebhookDeliveryQueueLifecycle } from './webhook-delivery-queue';
@Module({
  imports: [AuthModule, IncidentsModule],
  controllers: [WebhooksController],
  providers: [
    webhookDeliveryQueueProvider,
    WebhooksService,
    WebhookDeliveryQueueLifecycle,
  ],
  exports: [WebhooksService],
})
export class WebhooksModule {}
