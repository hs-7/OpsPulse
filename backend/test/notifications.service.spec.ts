import { Logger } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import Redis from 'ioredis';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../src/database/schema';
import { NotificationsService } from '../src/modules/notifications/notifications.service';

describe('NotificationsService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs Redis publish failures without failing the persisted operation', async () => {
    const redis = {
      publish: vi.fn().mockRejectedValue(new Error('Redis unavailable')),
    } as unknown as Redis;
    const subscriber = {} as Redis;
    const db = {} as NodePgDatabase<typeof schema>;
    const service = new NotificationsService(db, redis, subscriber);
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    await expect(
      service.publish({
        organizationId: 'org-1',
        type: 'incident',
        resourceType: 'incident',
        resourceId: 'incident-1',
        title: 'Delivery failure',
        timestamp: new Date().toISOString(),
      }),
    ).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toContain('Redis unavailable');
  });
});
