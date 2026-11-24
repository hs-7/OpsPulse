import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { DRIZZLE } from '../src/database/database.module';
import * as schema from '../src/database/schema';
import { OutboxRelayService } from '../src/modules/webhooks/outbox-relay.service';
import { WEBHOOK_DELIVERY_QUEUE } from '../src/modules/webhooks/webhook-delivery-queue';
import { DeliveryJob } from '../src/modules/webhooks/webhook-delivery.worker';
import { Queue } from 'bullmq';
import { eq } from 'drizzle-orm';
import { exponentialBackoffMs } from '../src/modules/webhooks/webhook-delivery.worker';

describe('Phase 4 webhook ingestion and delivery', () => {
  let app: INestApplication;
  let accessToken: string;
  let organizationId: string;
  let projectId: string;
  let secondaryProjectId: string;
  let foreignProjectId: string;
  let endpointId: string;
  let secondaryEndpointId: string;
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

      const secondaryProject = await request(app.getHttpServer())
        .post(`/organizations/${organizationId}/projects`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Secondary Webhook Project', status: 'active' });
      expect(secondaryProject.status).toBe(201);
      secondaryProjectId = secondaryProject.body.data.id;

    const endpoint = await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/webhooks`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ projectId, endpointUrl: 'http://127.0.0.1:65534/destination' });
    endpointId = endpoint.body.data.id;
    secret = endpoint.body.data.secret;

      const secondaryEndpoint = await request(app.getHttpServer())
        .post(`/organizations/${organizationId}/webhooks`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ projectId: secondaryProjectId, endpointUrl: 'http://127.0.0.1:65534/secondary' });
      expect(secondaryEndpoint.status).toBe(201);
      secondaryEndpointId = secondaryEndpoint.body.data.id;

      const foreignRegistration = await request(app.getHttpServer()).post('/auth/register').send({
        name: 'Foreign Webhook Tenant',
        email: `foreign-webhook-${suffix}@example.com`,
        password: 'foreign-webhook-password',
        organizationName: `Foreign Webhook Org ${suffix}`,
      });
      expect(foreignRegistration.status).toBe(201);
      const foreignOrganization = await request(app.getHttpServer())
        .get('/organizations')
        .set('Authorization', `Bearer ${foreignRegistration.body.data.accessToken}`);
      expect(foreignOrganization.status).toBe(200);
      const foreignProject = await request(app.getHttpServer())
        .post(`/organizations/${foreignOrganization.body.data[0].id}/projects`)
        .set('Authorization', `Bearer ${foreignRegistration.body.data.accessToken}`)
        .send({ name: 'Foreign Project', status: 'active' });
      expect(foreignProject.status).toBe(201);
      foreignProjectId = foreignProject.body.data.id;
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

  it('filters webhook endpoints and deliveries to the selected project', async () => {
    const eventBody = { test: 'project-filter' };
    const signature = createHmac('sha256', secret).update(JSON.stringify(eventBody)).digest('hex');
    const ingest = await request(app.getHttpServer())
      .post(`/api/webhooks/ingest/${endpointId}`)
      .set('X-Idempotency-Key', `project-filter-${suffix}`)
      .set('X-Webhook-Event-Type', 'test.project.filter')
      .set('X-Webhook-Signature', `sha256=${signature}`)
      .send(eventBody);
    expect(ingest.status).toBe(201);

    const primaryEndpoints = await request(app.getHttpServer())
      .get(`/organizations/${organizationId}/webhooks`)
      .query({ projectId })
      .set('Authorization', `Bearer ${accessToken}`);
    expect(primaryEndpoints.status).toBe(200);
    expect(primaryEndpoints.body.data.map((endpoint: { id: string }) => endpoint.id)).toEqual([
      endpointId,
    ]);

    const secondaryEndpoints = await request(app.getHttpServer())
      .get(`/organizations/${organizationId}/webhooks`)
      .query({ projectId: secondaryProjectId })
      .set('Authorization', `Bearer ${accessToken}`);
    expect(secondaryEndpoints.body.data.map((endpoint: { id: string }) => endpoint.id)).toEqual([
      secondaryEndpointId,
    ]);

    const foreignProjectEndpoints = await request(app.getHttpServer())
      .get(`/organizations/${organizationId}/webhooks`)
      .query({ projectId: foreignProjectId })
      .set('Authorization', `Bearer ${accessToken}`);
    expect(foreignProjectEndpoints.status).toBe(200);
    expect(foreignProjectEndpoints.body.data).toEqual([]);

    const primaryDeliveries = await request(app.getHttpServer())
      .get(`/organizations/${organizationId}/webhooks/deliveries`)
      .query({ projectId })
      .set('Authorization', `Bearer ${accessToken}`);
    const secondaryDeliveries = await request(app.getHttpServer())
      .get(`/organizations/${organizationId}/webhooks/deliveries`)
      .query({ projectId: secondaryProjectId })
      .set('Authorization', `Bearer ${accessToken}`);
    expect(primaryDeliveries.status).toBe(200);
    expect(primaryDeliveries.body.data.length).toBeGreaterThan(0);
    expect(secondaryDeliveries.status).toBe(200);
    expect(secondaryDeliveries.body.data).toEqual([]);
  });

  it('rejects malformed project filters', async () => {
    const response = await request(app.getHttpServer())
      .get(`/organizations/${organizationId}/webhooks`)
      .query({ projectId: 'not-a-uuid' })
      .set('Authorization', `Bearer ${accessToken}`);
    expect(response.status).toBe(400);
  });

  it('uses exponential backoff for delivery retries', () => {
    expect(exponentialBackoffMs(1)).toBe(1000);
    expect(exponentialBackoffMs(2)).toBe(2000);
    expect(exponentialBackoffMs(3)).toBe(4000);
  });

  it('keeps an outbox event pending when Redis rejects publishing and relays it after recovery', async () => {
    const relay = app.get(OutboxRelayService);
    await relay.relayPending();

    const queue = app.get<Queue<DeliveryJob>>(WEBHOOK_DELIVERY_QUEUE);
    let rejectQueueAdd!: (error: Error) => void;
    const redisUnavailable =
      new Promise<Awaited<ReturnType<typeof queue.add>>>((_, reject) => {
        rejectQueueAdd = reject;
      });
    const addSpy = vi.spyOn(queue, 'add').mockReturnValue(redisUnavailable);
    const body = { test: 'outbox-recovery' };
    const idempotencyKey = `outbox-recovery-${suffix}`;
    const signature = createHmac('sha256', secret).update(JSON.stringify(body)).digest('hex');
    const response = await request(app.getHttpServer())
      .post(`/api/webhooks/ingest/${endpointId}`)
      .set('X-Idempotency-Key', idempotencyKey)
      .set('X-Webhook-Signature', `sha256=${signature}`)
      .send(body);

    expect(response.status).toBe(201);
    await vi.waitFor(() => expect(addSpy).toHaveBeenCalledTimes(1));

    const db = app.get(DRIZZLE);
    const messages = await db
      .select()
      .from(schema.outboxMessages)
      .where(eq(schema.outboxMessages.eventType, 'webhook.event.received'));
    const outboxMessage = messages.find(
      (message: { payload: unknown }) =>
        typeof message.payload === 'object' &&
        message.payload !== null &&
        'eventId' in message.payload &&
        message.payload.eventId === response.body.data.eventId,
    );
    expect(outboxMessage).toBeDefined();
    if (!outboxMessage) throw new Error('Expected the ingestion outbox row to exist.');
    expect(outboxMessage.publishedAt).toBeNull();

    const deliveries = await db
      .select({ id: schema.webhookDeliveries.id })
      .from(schema.webhookDeliveries)
      .where(eq(schema.webhookDeliveries.eventId, response.body.data.eventId));
    expect(deliveries).toHaveLength(1);

    rejectQueueAdd(new Error('Redis temporarily unavailable'));
    await expect(relay.relayPending()).rejects.toThrow('Redis temporarily unavailable');
    const pending = await db
      .select({ publishedAt: schema.outboxMessages.publishedAt })
      .from(schema.outboxMessages)
      .where(eq(schema.outboxMessages.id, outboxMessage.id))
      .limit(1);
    expect(pending[0].publishedAt).toBeNull();

    addSpy.mockRestore();
    await expect(relay.relayPending()).resolves.toBeGreaterThan(0);

    const published = await db
      .select({ publishedAt: schema.outboxMessages.publishedAt })
      .from(schema.outboxMessages)
      .where(eq(schema.outboxMessages.id, outboxMessage.id))
      .limit(1);
    expect(published[0].publishedAt).toBeInstanceOf(Date);
    const job = await queue.getJob(`delivery-${deliveries[0].id}`);
    expect(job?.data).toEqual({
      deliveryId: deliveries[0].id,
      eventId: response.body.data.eventId,
      endpointId,
    });
  });
});
