import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS } from './modules/redis/redis.module';

const heartbeatIntervalMs = 10_000;
const heartbeatTtlSeconds = 30;

@Injectable()
export class WorkerHeartbeatService
  implements OnModuleInit, OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(WorkerHeartbeatService.name);
  private readonly key = `opspulse:worker:heartbeat:${process.env.HOSTNAME ?? process.pid}`;
  private timer?: NodeJS.Timeout;

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onModuleInit(): Promise<void> {
    await this.redis.del(this.key);
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.writeHeartbeat();
    this.timer = setInterval(() => {
      void this.writeHeartbeat().catch((error: unknown) => {
        this.logger.error(
          'Could not refresh worker heartbeat',
          error instanceof Error ? error.stack : String(error),
        );
      });
    }, heartbeatIntervalMs);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async writeHeartbeat(): Promise<void> {
    await this.redis.set(this.key, Date.now().toString(), 'EX', heartbeatTtlSeconds);
  }
}
