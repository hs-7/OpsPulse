import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { DRIZZLE } from '../src/database/database.module';
import * as schema from '../src/database/schema';
import { AIInsightsService } from '../src/modules/ai-insights/ai-insights.service';
import { WebhookDeliveryWorker } from '../src/modules/webhooks/webhook-delivery.worker';

describe('Phases 5 and 6 incidents, workflows, notifications, analytics, and AI', () => {
  let app: INestApplication;
  let tenantA: { accessToken: string; organizationId: string };
  let tenantB: { accessToken: string; organizationId: string };
  let incidentId: string;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  async function createEndpoint(organizationId: string, key: string): Promise<string> {
    const db = app.get(DRIZZLE);
    const [project] = await db
      .insert(schema.projects)
      .values({ organizationId, name: `Project ${key}`, status: 'active' })
      .returning();
    const [endpoint] = await db
      .insert(schema.webhookEndpoints)
      .values({
        projectId: project.id,
        endpointUrl: 'http://127.0.0.1:65534/destination',
        secretReference: `test-secret-${key}`,
        active: true,
      })
      .returning();

    return endpoint.id;
  }

  async function createDelivery(
    endpointId: string,
    key: string,
    status: string,
    responseStatus: number | null,
  ): Promise<{ deliveryId: string; eventId: string }> {
    const db = app.get(DRIZZLE);
    const [event] = await db
      .insert(schema.webhookEvents)
      .values({
        endpointId,
        eventType: 'test.summary',
        payload: { key },
        status,
        idempotencyKey: `idempotency-${key}`,
      })
      .returning();
    const [delivery] = await db
      .insert(schema.webhookDeliveries)
      .values({
        eventId: event.id,
        attemptCount: 1,
        responseStatus,
        status,
      })
      .returning();

    return { deliveryId: delivery.id, eventId: event.id };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalInterceptors(new ResponseInterceptor());
    await app.init();

    const register = async (label: 'A' | 'B') => {
      const registered = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          name: `Tenant ${label}`,
          email: `tenant-${label.toLowerCase()}-${suffix}@example.com`,
          password: `tenant-${label.toLowerCase()}-password`,
          organizationName: `Tenant ${label} ${suffix}`,
        });
      expect(registered.status).toBe(201);
      const organizations = await request(app.getHttpServer())
        .get('/organizations')
        .set('Authorization', `Bearer ${registered.body.data.accessToken}`);
      return {
        accessToken: registered.body.data.accessToken,
        organizationId: organizations.body.data[0].id,
      };
    };

    tenantA = await register('A');
    tenantB = await register('B');
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates an incident and records an audit log', async () => {
    const created = await request(app.getHttpServer())
      .post(`/organizations/${tenantA.organizationId}/incidents`)
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .send({
        title: 'Webhook destination unavailable',
        severity: 'critical',
        status: 'open',
      });
    expect(created.status).toBe(201);
    incidentId = created.body.data.id;

    const notifications = await request(app.getHttpServer())
      .get(`/organizations/${tenantA.organizationId}/notifications`)
      .set('Authorization', `Bearer ${tenantA.accessToken}`);
    expect(notifications.status).toBe(200);
    expect(notifications.body.data.some((entry: { action: string }) => entry.action === 'incident.create')).toBe(true);
  });

  it('enforces incident tenant isolation', async () => {
    const response = await request(app.getHttpServer())
      .get(`/organizations/${tenantA.organizationId}/incidents/${incidentId}`)
      .set('Authorization', `Bearer ${tenantB.accessToken}`);
    expect(response.status).toBe(404);
  });

  it('creates and retrieves a tenant-scoped workflow', async () => {
    const created = await request(app.getHttpServer())
      .post(`/organizations/${tenantA.organizationId}/workflows`)
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .send({
        name: 'Escalate delivery failures',
        definition: { trigger: 'delivery.failed', action: 'create_incident' },
      });
    expect(created.status).toBe(201);

    const listed = await request(app.getHttpServer())
      .get(`/organizations/${tenantA.organizationId}/workflows`)
      .set('Authorization', `Bearer ${tenantA.accessToken}`);
    expect(listed.status).toBe(200);
    expect(listed.body.data.some((workflow: { name: string }) => workflow.name === 'Escalate delivery failures')).toBe(
      true,
    );
  });

  it('provides deterministic AI fallback summaries', async () => {
    const response = await request(app.getHttpServer())
      .post(`/organizations/${tenantA.organizationId}/incidents/${incidentId}/summarize`)
      .set('Authorization', `Bearer ${tenantA.accessToken}`);
    expect(response.status).toBe(201);
    expect(response.body.data.mode).toBe('rule-based');
    expect(response.body.data.summary).toContain('Root-cause hypothesis');
  });

  it('only includes deliveries owned by the incident organization in AI summary input', async () => {
    const incident = await request(app.getHttpServer())
      .post(`/organizations/${tenantA.organizationId}/incidents`)
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .send({
        title: 'Tenant A isolated summary',
        severity: 'high',
        status: 'open',
      });
    expect(incident.status).toBe(201);

    const tenantBEndpoint = await createEndpoint(tenantB.organizationId, `foreign-${suffix}`);
    await createDelivery(tenantBEndpoint, `foreign-${suffix}`, 'dead_letter', 598);

    const tenantAEndpoint = await createEndpoint(tenantA.organizationId, `owned-${suffix}`);
    await createDelivery(tenantAEndpoint, `owned-${suffix}`, 'delivered', 204);

    let summaryInput: Parameters<AIInsightsService['summarize']>[0] | undefined;
    vi.spyOn(app.get(AIInsightsService), 'summarize').mockImplementation(async (input) => {
      summaryInput = input;
      return {
        mode: 'rule-based',
        organizationId: input.organizationId,
        summary: 'Captured test summary',
      };
    });

    const response = await request(app.getHttpServer())
      .post(`/organizations/${tenantA.organizationId}/incidents/${incident.body.data.id}/summarize`)
      .set('Authorization', `Bearer ${tenantA.accessToken}`);

    expect(response.status).toBe(201);
    expect(summaryInput).toMatchObject({
      organizationId: tenantA.organizationId,
      deliveryFailures: 0,
      responseStatus: 204,
    });
  });

  it('escalates an incident after three dead-letter deliveries for the same endpoint', async () => {
    const endpointId = await createEndpoint(tenantA.organizationId, `escalation-${suffix}`);
    const deliveries: Array<{ deliveryId: string; eventId: string }> = [];
    for (let index = 1; index <= 3; index += 1) {
      deliveries.push(await createDelivery(endpointId, `escalation-${suffix}-${index}`, 'dead_letter', 503));
    }

    const worker = app.get(WebhookDeliveryWorker);
    const finalDelivery = deliveries[0];
    await worker.handleFinalFailure(
      {
        data: {
          deliveryId: finalDelivery.deliveryId,
          eventId: finalDelivery.eventId,
          endpointId,
        },
        attemptsMade: 5,
      },
      new Error('Destination unavailable'),
    );

    const tenantAIncidents = await request(app.getHttpServer())
      .get(`/organizations/${tenantA.organizationId}/incidents`)
      .set('Authorization', `Bearer ${tenantA.accessToken}`);
    const incidentTitle = `Repeated webhook delivery failures (${endpointId})`;
    expect(tenantAIncidents.status).toBe(200);
    expect(
      tenantAIncidents.body.data.some(
        (item: { title: string; severity: string }) => item.title === incidentTitle && item.severity === 'critical',
      ),
    ).toBe(true);

    const tenantBIncidents = await request(app.getHttpServer())
      .get(`/organizations/${tenantB.organizationId}/incidents`)
      .set('Authorization', `Bearer ${tenantB.accessToken}`);
    expect(tenantBIncidents.body.data.some((item: { title: string }) => item.title === incidentTitle)).toBe(false);
  });

  it('returns tenant-scoped analytics', async () => {
    const response = await request(app.getHttpServer())
      .get(`/organizations/${tenantA.organizationId}/analytics`)
      .set('Authorization', `Bearer ${tenantA.accessToken}`);
    expect(response.status).toBe(200);
    expect(response.body.data.organizationId).toBe(tenantA.organizationId);
  });
});
