import { Global, Inject, Injectable, Module, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

export const DRIZZLE = 'DRIZZLE';
export const POSTGRES_POOL = 'POSTGRES_POOL';

@Injectable()
class PostgresPoolLifecycle implements OnModuleDestroy {
  constructor(@Inject(POSTGRES_POOL) private readonly pool: Pool) {}

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: POSTGRES_POOL,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => new Pool({ connectionString: config.getOrThrow<string>('DATABASE_URL') }),
    },
    {
      provide: DRIZZLE,
      inject: [POSTGRES_POOL],
      useFactory: (pool: Pool) => drizzle(pool),
    },
    PostgresPoolLifecycle,
  ],
  exports: [POSTGRES_POOL, DRIZZLE],
})
export class DatabaseModule {}
