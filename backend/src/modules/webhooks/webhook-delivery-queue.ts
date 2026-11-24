import { Provider } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue } from "bullmq";
import { DeliveryJob } from "./webhook-delivery.worker";

export const WEBHOOK_DELIVERY_QUEUE = "WEBHOOK_DELIVERY_QUEUE";

export const webhookDeliveryQueueProvider: Provider = {
  provide: WEBHOOK_DELIVERY_QUEUE,
  inject: [ConfigService],
  useFactory: (config: ConfigService) =>
    new Queue<DeliveryJob>("webhook-deliveries", {
      connection: {
        url: config.getOrThrow<string>("REDIS_URL"),
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
      },
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: "exponential", delay: 1000 },
      },
    }),
};
