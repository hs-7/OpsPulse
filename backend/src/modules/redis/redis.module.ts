import { Global, Inject, Injectable, Module, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const REDIS = 'REDIS';
export const REDIS_SUBSCRIBER = 'REDIS_SUBSCRIBER';
export const OUTBOX_RELAY_CHANNEL = 'opspulse:outbox:relay';
export const NOTIFICATIONS_CHANNEL = 'opspulse:notifications';

@Injectable()
class RedisLifecycle implements OnModuleDestroy {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(REDIS_SUBSCRIBER) private readonly subscriber: Redis,
  ) {}

  async onModuleDestroy(): Promise<void> {
    await Promise.all([this.subscriber.quit(), this.redis.quit()]);
  }
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => new Redis(config.getOrThrow<string>('REDIS_URL')),
    },
    {
      provide: REDIS_SUBSCRIBER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => new Redis(config.getOrThrow<string>('REDIS_URL')),
    },
    RedisLifecycle,
  ],
  exports: [REDIS, REDIS_SUBSCRIBER],
})
export class RedisModule {}
