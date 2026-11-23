import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';

describe('Phases 5 and 6 incidents, workflows, notifications, analytics, and AI', () => {
  let app: INestApplication;
  let tenantA: { accessToken: string; organizationId: string };
  let tenantB: { accessToken: string; organizationId: string };
  let incidentId: string;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalInterceptors(new ResponseInterceptor());
    await app.init();

    const register = async (label: 'A' | 'B') => {
      const registered = await request(app.getHttpServer()).post('/auth/register').send({
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

  it('creates an incident and records an audit log', async () => {
    const created = await request(app.getHttpServer())
      .post(`/organizations/${tenantA.organizationId}/incidents`)
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .send({ title: 'Webhook destination unavailable', severity: 'critical', status: 'open' });
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
    expect(listed.body.data.some((workflow: { name: string }) => workflow.name === 'Escalate delivery failures')).toBe(true);
  });

  it('provides deterministic AI fallback summaries', async () => {
    const response = await request(app.getHttpServer())
      .post(`/organizations/${tenantA.organizationId}/incidents/${incidentId}/summarize`)
      .set('Authorization', `Bearer ${tenantA.accessToken}`);
    expect(response.status).toBe(201);
    expect(response.body.data.mode).toBe('rule-based');
    expect(response.body.data.summary).toContain('Root-cause hypothesis');
  });

  it('returns tenant-scoped analytics', async () => {
    const response = await request(app.getHttpServer())
      .get(`/organizations/${tenantA.organizationId}/analytics`)
      .set('Authorization', `Bearer ${tenantA.accessToken}`);
    expect(response.status).toBe(200);
    expect(response.body.data.organizationId).toBe(tenantA.organizationId);
  });
});
