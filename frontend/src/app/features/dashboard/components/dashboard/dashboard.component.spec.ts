import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { Router, provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { of, Subject, throwError } from 'rxjs';
import { AuthSessionService } from '../../../../core/services/auth-session.service';
import {
  Delivery,
  Incident,
  IncidentSummary,
  Organization,
  Project,
  WebhookEndpoint,
} from '../../../../core/models/api.models';
import { DashboardComponent } from './dashboard.component';
import { DashboardApiService } from '../../data-access/dashboard-api.service';

describe('DashboardComponent', () => {
  let fixture: ComponentFixture<DashboardComponent>;
  let api: DashboardApiService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [provideRouter([]), provideHttpClient()],
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardComponent);
    api = TestBed.inject(DashboardApiService);
    localStorage.removeItem('opspulse_access');
  });

  afterEach(() => {
    fixture.destroy();
    localStorage.removeItem('opspulse_access');
    localStorage.removeItem('opspulse_refresh');
    localStorage.removeItem('opspulse_organization');
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('creates the dashboard view', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('redirects to login when there is no access token', () => {
    const router = TestBed.inject(Router);
    const navigateByUrl = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    fixture.detectChanges();

    expect(navigateByUrl).toHaveBeenCalledWith('/auth/login');
  });

  it('displays organization loading failures in the dashboard', () => {
    localStorage.setItem('opspulse_access', 'test-token');
    vi.spyOn(api, 'organizations').mockReturnValue(throwError(() => new Error('offline')));

    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain(
      'Could not load organizations.',
    );
  });

  it('clears old tenant data and ignores a late project response after switching organizations', () => {
    const firstOrganizationProjects = new Subject<Project[]>();
    const secondOrganizationProjects = new Subject<Project[]>();
    const staleProject: Project = {
      id: 'project-old',
      name: 'Old project',
      status: 'active',
      organizationId: 'org-old',
    };
    const currentProject: Project = {
      id: 'project-current',
      name: 'Current project',
      status: 'active',
      organizationId: 'org-current',
    };
    const staleIncident = {
      id: 'old-incident',
      organizationId: 'org-old',
      title: 'Old incident',
      severity: 'high' as const,
      status: 'open' as const,
    };
    const component = fixture.componentInstance;

    vi.spyOn(api, 'projects').mockImplementation((organizationId) =>
      organizationId === 'org-old' ? firstOrganizationProjects : secondOrganizationProjects,
    );
    vi.spyOn(api, 'webhooks').mockReturnValue(of([]));
    vi.spyOn(api, 'deliveries').mockReturnValue(of([]));
    vi.spyOn(api, 'incidents').mockReturnValue(of([]));
    component.organizationId.set('org-old');
    component.endpoints.set([
      {
        id: 'old-endpoint',
        projectId: 'project-old',
        endpointUrl: 'https://old.example.com',
        active: true,
      },
    ]);
    component.deliveries.set([
      {
        id: 'old-delivery',
        eventId: 'old-event',
        eventType: 'old.event',
        attemptCount: 1,
        responseStatus: null,
        nextRetryAt: null,
        status: 'pending',
      },
    ]);
    component.liveIncidents.set([staleIncident]);
    component.summary.set({
      mode: 'rule-based',
      summary: 'Old summary',
    } satisfies IncidentSummary);
    component.loadTenant();

    component.organizationId.set('org-current');
    component.loadTenant();
    expect(component.endpoints()).toEqual([]);
    expect(component.deliveries()).toEqual([]);
    expect(component.liveIncidents()).toEqual([]);
    expect(component.summary()).toBeNull();

    firstOrganizationProjects.next([staleProject]);
    expect(component.projects()).toEqual([]);

    secondOrganizationProjects.next([currentProject]);
    expect(component.projects()).toEqual([currentProject]);
    expect(api.webhooks).toHaveBeenCalledWith('org-current', 'project-current');
  });

  it('clears and ignores stale project data when changing projects', () => {
    const firstProjectEndpoints = new Subject<WebhookEndpoint[]>();
    const currentProjectEndpoints = new Subject<WebhookEndpoint[]>();
    const firstProjectDeliveries = new Subject<Delivery[]>();
    const currentProjectDeliveries = new Subject<Delivery[]>();
    const component = fixture.componentInstance;
    let webhookRequest = 0;
    let deliveryRequest = 0;

    vi.spyOn(api, 'webhooks').mockImplementation(() =>
      ++webhookRequest === 1 ? firstProjectEndpoints : currentProjectEndpoints,
    );
    vi.spyOn(api, 'deliveries').mockImplementation(() =>
      ++deliveryRequest === 1 ? firstProjectDeliveries : currentProjectDeliveries,
    );
    vi.spyOn(api, 'incidents').mockReturnValue(of([]));
    component.organizationId.set('org-1');
    component.projectId.set('project-1');
    component.endpoints.set([
      {
        id: 'old-endpoint',
        projectId: 'project-1',
        endpointUrl: 'https://old.example.com',
        active: true,
      },
    ]);
    component.deliveries.set([
      {
        id: 'old-delivery',
        eventId: 'old-event',
        eventType: 'old.event',
        attemptCount: 1,
        responseStatus: null,
        nextRetryAt: null,
        status: 'pending',
      },
    ]);
    component.loadAll();

    component.projectId.set('project-2');
    component.loadAll();
    expect(component.endpoints()).toEqual([]);
    expect(component.deliveries()).toEqual([]);

    firstProjectEndpoints.next([
      {
        id: 'stale-endpoint',
        projectId: 'project-1',
        endpointUrl: 'https://stale.example.com',
        active: true,
      },
    ]);
    firstProjectDeliveries.next([]);
    expect(component.endpoints()).toEqual([]);

    const currentEndpoint: WebhookEndpoint = {
      id: 'current-endpoint',
      projectId: 'project-2',
      endpointUrl: 'https://current.example.com',
      active: true,
    };
    currentProjectEndpoints.next([currentEndpoint]);
    currentProjectDeliveries.next([]);
    expect(component.endpoints()).toEqual([currentEndpoint]);
  });

  it('does not add an endpoint response to a different organization or project', () => {
    const createEndpointResponse = new Subject<WebhookEndpoint>();
    const component = fixture.componentInstance;

    vi.stubGlobal('prompt', vi.fn().mockReturnValue('https://destination.example.com'));
    vi.spyOn(api, 'createWebhook').mockReturnValue(createEndpointResponse);
    component.organizationId.set('org-1');
    component.projectId.set('project-1');
    component.createEndpoint();

    component.organizationId.set('org-2');
    component.projectId.set('project-2');
    createEndpointResponse.next({
      id: 'endpoint-org-1',
      projectId: 'project-1',
      endpointUrl: 'https://destination.example.com',
      active: true,
    });

    expect(component.endpoints()).toEqual([]);
  });

  it('ignores a summary response after switching organizations', () => {
    const summaryResponse = new Subject<IncidentSummary>();
    const component = fixture.componentInstance;
    const incident: Incident = {
      id: 'incident-1',
      organizationId: 'org-1',
      title: 'Old incident',
      severity: 'high',
      status: 'open',
    };

    vi.spyOn(api, 'summarize').mockReturnValue(summaryResponse);
    vi.spyOn(api, 'projects').mockReturnValue(of([]));
    vi.spyOn(api, 'webhooks').mockReturnValue(of([]));
    vi.spyOn(api, 'deliveries').mockReturnValue(of([]));
    vi.spyOn(api, 'incidents').mockReturnValue(of([]));
    component.organizationId.set('org-1');
    component.selectIncident(incident);

    component.organizationId.set('org-2');
    component.loadTenant();
    summaryResponse.next({ mode: 'rule-based', summary: 'Old organization summary' });

    expect(component.summary()).toBeNull();
  });

  it('keeps the most recently requested incident summary when responses arrive out of order', () => {
    const earlierResponse = new Subject<IncidentSummary>();
    const latestResponse = new Subject<IncidentSummary>();
    const component = fixture.componentInstance;
    const earlierIncident: Incident = {
      id: 'incident-1',
      organizationId: 'org-1',
      title: 'Earlier incident',
      severity: 'high',
      status: 'open',
    };
    const latestIncident: Incident = {
      id: 'incident-2',
      organizationId: 'org-1',
      title: 'Latest incident',
      severity: 'critical',
      status: 'open',
    };
    const latestSummary: IncidentSummary = {
      mode: 'rule-based',
      summary: 'Latest incident summary',
    };

    vi.spyOn(api, 'summarize').mockImplementation((_organizationId, incidentId) =>
      incidentId === earlierIncident.id ? earlierResponse : latestResponse,
    );
    component.organizationId.set('org-1');
    component.selectIncident(earlierIncident);
    component.selectIncident(latestIncident);

    latestResponse.next(latestSummary);
    earlierResponse.next({ mode: 'rule-based', summary: 'Earlier incident summary' });

    expect(component.summary()).toEqual(latestSummary);
  });

  it('stops refreshing when the incident stream remains unauthorized after one refresh', async () => {
    const organization: Organization = { id: 'org-1', name: 'Acme' };
    const project: Project = {
      id: 'project-1',
      name: 'Web',
      status: 'active',
      organizationId: organization.id,
    };
    const session = TestBed.inject(AuthSessionService);
    const router = TestBed.inject(Router);
    const refreshSession = vi.spyOn(session, 'refreshSession').mockImplementation(() => {
      session.storeSession({ accessToken: 'new-access', refreshToken: 'new-refresh' });
      return of({ accessToken: 'new-access', refreshToken: 'new-refresh' });
    });
    const navigateByUrl = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    localStorage.setItem('opspulse_access', 'expired-access');
    localStorage.setItem('opspulse_refresh', 'current-refresh');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 401,
        ok: false,
        headers: { get: () => null },
      }),
    );
    vi.spyOn(api, 'organizations').mockReturnValue(of([organization]));
    vi.spyOn(api, 'projects').mockReturnValue(of([project]));
    vi.spyOn(api, 'webhooks').mockReturnValue(of([]));
    vi.spyOn(api, 'deliveries').mockReturnValue(of([]));
    vi.spyOn(api, 'incidents').mockReturnValue(of([]));

    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(session.accessToken).toBeNull();
    expect(session.refreshToken).toBeNull();
    expect(navigateByUrl).toHaveBeenCalledWith('/auth/login');
  });

  it('loads the selected organization and its dashboard data', () => {
    const organization: Organization = { id: 'org-1', name: 'Acme' };
    const project: Project = {
      id: 'project-1',
      name: 'Web',
      status: 'active',
      organizationId: organization.id,
    };

    localStorage.setItem('opspulse_access', 'test-token');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_url, options: RequestInit) =>
        Promise.resolve({
          ok: true,
          headers: { get: () => 'text/event-stream' },
          body: {
            getReader: () => ({
              read: () =>
                new Promise((resolve) =>
                  options.signal?.addEventListener('abort', () => resolve({ done: true }), {
                    once: true,
                  }),
                ),
            }),
          },
        }),
      ),
    );
    vi.spyOn(api, 'organizations').mockReturnValue(of([organization]));
    vi.spyOn(api, 'projects').mockReturnValue(of([project]));
    vi.spyOn(api, 'webhooks').mockReturnValue(of([]));
    vi.spyOn(api, 'deliveries').mockReturnValue(of([]));
    vi.spyOn(api, 'incidents').mockReturnValue(of([]));

    fixture.detectChanges();

    expect(fixture.componentInstance.organizationId()).toBe(organization.id);
    expect(fixture.componentInstance.projectId()).toBe(project.id);
    expect(api.projects).toHaveBeenCalledWith(organization.id);
    expect(api.webhooks).toHaveBeenCalledWith(organization.id, project.id);
    expect(api.deliveries).toHaveBeenCalledWith(organization.id, project.id);
    expect(api.incidents).toHaveBeenCalledWith(organization.id);
    expect(fetch).toHaveBeenCalledWith(
      `/organizations/${organization.id}/notifications/stream`,
      expect.objectContaining({
        headers: {
          Accept: 'text/event-stream',
          Authorization: 'Bearer test-token',
        },
      }),
    );
  });
});
