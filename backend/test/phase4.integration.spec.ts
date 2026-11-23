import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { exponentialBackoffMs } from '../src/modules/webhooks/webhook-delivery.worker';

describe('Phase 4 webhook ingestion and delivery', () => {
  let app: INestApplication;
  let accessToken: string;
  let organizationId: string;
  let projectId: string;
  let endpointId: string;
  let secret: string;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalInterceptors(new ResponseInterceptor());
    await app.init();

    const registered = await request(app.getHttpServer()).post('/auth/register').send({
      name: 'Webhook Tenant',
      email: `webhook-${suffix}@example.com`,
      password: 'webhook-password',
      organizationName: `Webhook Org ${suffix}`,
    });
    accessToken = registered.body.data.accessToken;

    const organizations = await request(app.getHttpServer())
      .get('/organizations')
      .set('Authorization', `Bearer ${accessToken}`);
    organizationId = organizations.body.data[0].id;

    const project = await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/projects`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Webhook Project', status: 'active' });
    projectId = project.body.data.id;

    const endpoint = await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/webhooks`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ projectId, endpointUrl: 'http://127.0.0.1:65534/destination' });
    endpointId = endpoint.body.data.id;
    secret = endpoint.body.data.secret;
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects an invalid HMAC signature', async () => {
    const body = { test: 'hmac' };
    const response = await request(app.getHttpServer())
      .post(`/api/webhooks/ingest/${endpointId}`)
      .set('X-Idempotency-Key', `invalid-${suffix}`)
      .set('X-Webhook-Event-Type', 'test.event')
      .set('X-Webhook-Signature', 'sha256=0000000000000000000000000000000000000000000000000000000000000000')
      .send(body);
    expect(response.status).toBe(400);
  });

  it('accepts a valid HMAC and deduplicates by idempotency key', async () => {
    const body = { test: 'hmac', sequence: 1 };
    const raw = JSON.stringify(body);
    const signature = createHmac('sha256', secret).update(raw).digest('hex');
    const idempotencyKey = `idem-${suffix}`;

    const first = await request(app.getHttpServer())
      .post(`/api/webhooks/ingest/${endpointId}`)
      .set('X-Idempotency-Key', idempotencyKey)
      .set('X-Webhook-Event-Type', 'test.event')
      .set('X-Webhook-Signature', `sha256=${signature}`)
      .send(body);
    expect(first.status).toBe(201);
    expect(first.body.data.accepted).toBe(true);
    expect(first.body.data.duplicate).toBe(false);

    const second = await request(app.getHttpServer())
      .post(`/api/webhooks/ingest/${endpointId}`)
      .set('X-Idempotency-Key', idempotencyKey)
      .set('X-Webhook-Event-Type', 'test.event')
      .set('X-Webhook-Signature', `sha256=${signature}`)
      .send(body);
    expect(second.status).toBe(201);
    expect(second.body.data.duplicate).toBe(true);
  });

  it('requires an idempotency key', async () => {
    const body = { test: 'missing-key' };
    const signature = createHmac('sha256', secret).update(JSON.stringify(body)).digest('hex');
    const response = await request(app.getHttpServer())
      .post(`/api/webhooks/ingest/${endpointId}`)
      .set('X-Webhook-Signature', `sha256=${signature}`)
      .send(body);
    expect(response.status).toBe(400);
  });

  it('uses exponential backoff for delivery retries', () => {
    expect(exponentialBackoffMs(1)).toBe(1000);
    expect(exponentialBackoffMs(2)).toBe(2000);
    expect(exponentialBackoffMs(3)).toBe(4000);
  });
});
