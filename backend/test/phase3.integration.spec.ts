import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';

describe('Phase 3 authentication and tenant isolation', () => {
  let app: INestApplication;
  let tenantA: { accessToken: string; refreshToken: string; organizationId: string };
  let tenantB: { accessToken: string; refreshToken: string; organizationId: string };
  let tenantAProjectId: string;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalInterceptors(new ResponseInterceptor());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('registers two independent tenants', async () => {
    const registerA = await request(app.getHttpServer()).post('/auth/register').send({
      name: 'Tenant A',
      email: `tenant-a-${suffix}@example.com`,
      password: 'tenant-a-password',
      organizationName: `Tenant A ${suffix}`,
    });
    expect(registerA.status).toBe(201);
    expect(registerA.body.success).toBe(true);

    const registerB = await request(app.getHttpServer()).post('/auth/register').send({
      name: 'Tenant B',
      email: `tenant-b-${suffix}@example.com`,
      password: 'tenant-b-password',
      organizationName: `Tenant B ${suffix}`,
    });
    expect(registerB.status).toBe(201);

    tenantA = { ...registerA.body.data, organizationId: '' };
    tenantB = { ...registerB.body.data, organizationId: '' };

    const organizationsA = await request(app.getHttpServer())
      .get('/organizations')
      .set('Authorization', `Bearer ${tenantA.accessToken}`);
    const organizationsB = await request(app.getHttpServer())
      .get('/organizations')
      .set('Authorization', `Bearer ${tenantB.accessToken}`);

    tenantA.organizationId = organizationsA.body.data[0].id;
    tenantB.organizationId = organizationsB.body.data[0].id;
    expect(tenantA.organizationId).not.toBe(tenantB.organizationId);
  });

  it('allows Tenant A to create and read a project', async () => {
    const created = await request(app.getHttpServer())
      .post(`/organizations/${tenantA.organizationId}/projects`)
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .send({ name: 'A Private Project', status: 'active' });
    expect(created.status).toBe(201);
    tenantAProjectId = created.body.data.id;

    const fetched = await request(app.getHttpServer())
      .get(`/organizations/${tenantA.organizationId}/projects/${tenantAProjectId}`)
      .set('Authorization', `Bearer ${tenantA.accessToken}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body.data.name).toBe('A Private Project');
  });

  it("does not allow Tenant B to access Tenant A's organization or project", async () => {
    const organization = await request(app.getHttpServer())
      .get(`/organizations/${tenantA.organizationId}`)
      .set('Authorization', `Bearer ${tenantB.accessToken}`);
    expect(organization.status).toBe(404);

    const project = await request(app.getHttpServer())
      .get(`/organizations/${tenantA.organizationId}/projects/${tenantAProjectId}`)
      .set('Authorization', `Bearer ${tenantB.accessToken}`);
    expect(project.status).toBe(404);
  });

  it('rotates refresh tokens and rejects reuse', async () => {
    const rotated = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: tenantA.refreshToken });
    expect(rotated.status).toBe(201);
    expect(rotated.body.data.accessToken).toBeTruthy();
    expect(rotated.body.data.refreshToken).not.toBe(tenantA.refreshToken);

    const reused = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: tenantA.refreshToken });
    expect(reused.status).toBe(401);
  });
});
