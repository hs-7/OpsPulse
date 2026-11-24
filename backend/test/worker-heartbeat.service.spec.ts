import Redis from 'ioredis';
import { describe, expect, it, vi } from 'vitest';
import { WorkerHeartbeatService } from '../src/worker-heartbeat.service';

describe('WorkerHeartbeatService', () => {
  it('clears stale state and publishes a TTL-bound heartbeat after bootstrap', async () => {
    const redis = {
      del: vi.fn().mockResolvedValue(1),
      set: vi.fn().mockResolvedValue('OK'),
    } as unknown as Redis;
    const service = new WorkerHeartbeatService(redis);
    const key = `opspulse:worker:heartbeat:${process.env.HOSTNAME ?? process.pid}`;

    await service.onModuleInit();
    expect(redis.del).toHaveBeenCalledWith(key);

    await service.onApplicationBootstrap();
    expect(redis.set).toHaveBeenCalledWith(key, expect.any(String), 'EX', 30);

    service.onModuleDestroy();
  });
});
