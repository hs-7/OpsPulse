import { Controller, Get, Inject } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { REDIS } from '../redis/redis.module';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    @Inject('POSTGRES_POOL') private readonly postgres: Pool,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @Get()
  async check() {
    await this.postgres.query('SELECT 1');
    await this.redis.ping();
    return { status: 'ok', postgres: 'ok', redis: 'ok' };
  }
}
