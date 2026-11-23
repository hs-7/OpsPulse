import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

export const DRIZZLE = 'DRIZZLE';

@Global()
@Module({
  providers: [
    {
      provide: 'POSTGRES_POOL',
      inject: [ConfigService],
      useFactory: (config: ConfigService) => new Pool({ connectionString: config.getOrThrow<string>('DATABASE_URL') }),
    },
    {
      provide: DRIZZLE,
      inject: ['POSTGRES_POOL'],
      useFactory: (pool: Pool) => drizzle(pool),
    },
  ],
  exports: ['POSTGRES_POOL', DRIZZLE],
})
export class DatabaseModule {}
