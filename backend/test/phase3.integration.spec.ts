import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';

function cookiePair(response: request.Response, name: string): string {
  const cookie = response
    .get('Set-Cookie')
    ?.find((header) => header.startsWith(`${name}=`))
    ?.split(';', 1)[0];
  if (!cookie) throw new Error(`Expected ${name} cookie in response.`);
  return cookie;
}

function cookieValue(cookie: string): string {
  return cookie.slice(cookie.indexOf('=') + 1);
}

describe('Phase 3 authentication and tenant isolation', () => {
  let app: INestApplication;
  let tenantA: { accessToken: string; organizationId: string };
  let tenantB: { accessToken: string; organizationId: string };
  let tenantACookies: { refresh: string; csrf: string; csrfToken: string };
  let tenantBCookies: { refresh: string; csrf: string; csrfToken: string };
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
    expect(registerA.body.data.refreshToken).toBeUndefined();
    const refreshSetCookie = registerA
      .get('Set-Cookie')
      ?.find((header) => header.startsWith('opspulse_refresh='));
    expect(refreshSetCookie).toContain('HttpOnly');
    expect(refreshSetCookie).toContain('Path=/auth');
    expect(refreshSetCookie).toContain('SameSite=Lax');
    tenantACookies = {
      refresh: cookiePair(registerA, 'opspulse_refresh'),
      csrf: cookiePair(registerA, 'XSRF-TOKEN'),
      csrfToken: cookieValue(cookiePair(registerA, 'XSRF-TOKEN')),
    };

    const registerB = await request(app.getHttpServer()).post('/auth/register').send({
      name: 'Tenant B',
      email: `tenant-b-${suffix}@example.com`,
      password: 'tenant-b-password',
      organizationName: `Tenant B ${suffix}`,
    });
    expect(registerB.status).toBe(201);
    tenantBCookies = {
      refresh: cookiePair(registerB, 'opspulse_refresh'),
      csrf: cookiePair(registerB, 'XSRF-TOKEN'),
      csrfToken: cookieValue(cookiePair(registerB, 'XSRF-TOKEN')),
    };

    tenantA = { accessToken: registerA.body.data.accessToken, organizationId: '' };
    tenantB = { accessToken: registerB.body.data.accessToken, organizationId: '' };

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

  it('requires CSRF protection, rotates the refresh cookie, and revokes its family on reuse', async () => {
    const missingCsrf = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', `${tenantBCookies.refresh}; ${tenantBCookies.csrf}`);
    expect(missingCsrf.status).toBe(403);

    const rotated = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', `${tenantACookies.refresh}; ${tenantACookies.csrf}`)
      .set('X-XSRF-TOKEN', tenantACookies.csrfToken);
    expect(rotated.status).toBe(201);
    expect(rotated.body.data.accessToken).toBeTruthy();
    expect(rotated.body.data.refreshToken).toBeUndefined();
    const rotatedCookies = {
      refresh: cookiePair(rotated, 'opspulse_refresh'),
      csrf: cookiePair(rotated, 'XSRF-TOKEN'),
    };
    expect(rotatedCookies.refresh).not.toBe(tenantACookies.refresh);

    const reused = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', `${tenantACookies.refresh}; ${rotatedCookies.csrf}`)
      .set('X-XSRF-TOKEN', cookieValue(rotatedCookies.csrf));
    expect(reused.status).toBe(401);

    const revokedFamily = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', `${rotatedCookies.refresh}; ${rotatedCookies.csrf}`)
      .set('X-XSRF-TOKEN', cookieValue(rotatedCookies.csrf));
    expect(revokedFamily.status).toBe(401);

    const concurrentRefreshes = await Promise.all([
      request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', `${tenantBCookies.refresh}; ${tenantBCookies.csrf}`)
        .set('X-XSRF-TOKEN', tenantBCookies.csrfToken),
      request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', `${tenantBCookies.refresh}; ${tenantBCookies.csrf}`)
        .set('X-XSRF-TOKEN', tenantBCookies.csrfToken),
    ]);
    expect(
      concurrentRefreshes.map((response) => response.status).sort((a, b) => a - b),
    ).toEqual([201, 401]);
    const successfulConcurrentRefresh = concurrentRefreshes.find(
      (response) => response.status === 201,
    );
    if (!successfulConcurrentRefresh) {
      throw new Error('Exactly one concurrent refresh should rotate the token.');
    }
    const latestCookies = {
      refresh: cookiePair(successfulConcurrentRefresh, 'opspulse_refresh'),
      csrf: cookiePair(successfulConcurrentRefresh, 'XSRF-TOKEN'),
    };
    const concurrentFamilyRevoked = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', `${latestCookies.refresh}; ${latestCookies.csrf}`)
      .set('X-XSRF-TOKEN', cookieValue(latestCookies.csrf));
    expect(concurrentFamilyRevoked.status).toBe(401);
  });
});
