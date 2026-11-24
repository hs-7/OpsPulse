import { Controller, Get, Inject } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { ApiTags } from '@nestjs/swagger';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { POSTGRES_POOL } from '../../database/database.module';
import { REDIS } from '../redis/redis.module';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    @Inject(HealthCheckService) private readonly health: HealthCheckService,
    @Inject(POSTGRES_POOL) private readonly postgres: Pool,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @Get('live')
  @HealthCheck()
  live() {
    return this.health.check([async () => ({ application: { status: 'up' } })]);
  }

  @Get('ready')
  @HealthCheck()
  ready() {
    return this.health.check([
      async () => {
        await this.postgres.query('SELECT 1');
        return { postgres: { status: 'up' } };
      },
      async () => {
        await this.redis.ping();
        return { redis: { status: 'up' } };
      },
    ]);
  }
}
