import { describe, expect, it } from 'vitest';
import { LoadingService } from './loading.service';

describe('LoadingService', () => {
  it('stays active until every concurrent request completes', () => {
    const loading = new LoadingService();

    loading.beginRequest();
    loading.beginRequest();
    expect(loading.isLoading()).toBe(true);

    loading.endRequest();
    expect(loading.isLoading()).toBe(true);

    loading.endRequest();
    expect(loading.isLoading()).toBe(false);
  });

  it('does not underflow when a request finalizes more than once', () => {
    const loading = new LoadingService();

    loading.endRequest();

    expect(loading.isLoading()).toBe(false);
  });
});
