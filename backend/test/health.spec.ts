import { describe, expect, it } from 'vitest';
import { envSchema } from '../src/config/env';

describe('environment validation', () => {
  it('accepts a complete Docker environment', () => {
    const result = envSchema.safeParse({
      NODE_ENV: 'development',
      PORT: 3000,
      DATABASE_URL: 'postgresql://opspulse:opspulse_password@localhost:5432/opspulse_db',
      REDIS_URL: 'redis://localhost:6379',
      JWT_SECRET: 'development-secret-at-least-16',
      JWT_REFRESH_SECRET: 'development-refresh-at-least-16',
    });
    expect(result.success).toBe(true);
  });
});
