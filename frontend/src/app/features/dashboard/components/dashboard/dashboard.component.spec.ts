import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { Router, provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { ApiService } from '../../../../core/services/api.service';
import { Organization, Project } from '../../../../core/models/api.models';
import { DashboardComponent } from './dashboard.component';

describe('DashboardComponent', () => {
  let fixture: ComponentFixture<DashboardComponent>;
  let api: ApiService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [provideRouter([]), provideHttpClient()],
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardComponent);
    api = TestBed.inject(ApiService);
    localStorage.removeItem('opspulse_access');
  });

  afterEach(() => {
    localStorage.removeItem('opspulse_access');
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
      'EventSource',
      class {
        onmessage: ((event: MessageEvent) => void) | null = null;
        close = vi.fn();
      },
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
    expect(api.webhooks).toHaveBeenCalledWith(organization.id);
    expect(api.deliveries).toHaveBeenCalledWith(organization.id);
    expect(api.incidents).toHaveBeenCalledWith(organization.id);
  });
});
