import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import {
  Delivery,
  Incident,
  IncidentSummary,
  Organization,
  Project,
  WebhookEndpoint,
} from '../../../../core/models/api.models';
import { ApiService } from '../../../../core/services/api.service';
import { AuthSessionService } from '../../../../core/services/auth-session.service';
import { SvgIconComponent } from '../../../../shared/components/svg-icon/svg-icon.component';

@Component({
  standalone: true,
  imports: [SvgIconComponent, FormsModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent implements OnInit, OnDestroy {
  readonly organizations = signal<Organization[]>([]);
  readonly projects = signal<Project[]>([]);
  readonly endpoints = signal<WebhookEndpoint[]>([]);
  readonly deliveries = signal<Delivery[]>([]);
  readonly liveIncidents = signal<Incident[]>([]);
  readonly organizationId = signal('');
  readonly projectId = signal('');
  readonly summary = signal<IncidentSummary | null>(null);
  readonly error = signal('');

  private readonly _api: ApiService;
  private readonly _router: Router;
  private readonly _session: AuthSessionService;
  private _eventStreamController?: AbortController;

  constructor(api: ApiService, router: Router, session: AuthSessionService) {
    this._api = api;
    this._router = router;
    this._session = session;
  }

  public ngOnInit(): void {
    if (!this._session.accessToken) {
      void this._router.navigateByUrl('/auth/login');
      return;
    }

    this._loadOrganizations();
  }

  public ngOnDestroy(): void {
    this._eventStreamController?.abort();
  }

  public loadTenant(): void {
    const organizationId = this.organizationId();
    if (!organizationId) return;

    localStorage.setItem('opspulse_organization', organizationId);
    this.error.set('');
    this._api.projects(organizationId).subscribe({
      next: (projects) => {
        this.projects.set(projects);
        this.projectId.set(projects[0]?.id || '');
        this.loadAll();
      },
      error: (error: unknown) =>
        this._reportError(error, 'Could not load projects for this organization.'),
    });
  }

  public loadAll(): void {
    const organizationId = this.organizationId();
    if (!organizationId) return;

    this.error.set('');
    const projectId = this.projectId() || undefined;
    this._api.webhooks(organizationId, projectId).subscribe({
      next: (endpoints) => this.endpoints.set(endpoints),
      error: (error: unknown) => this._reportError(error, 'Could not load webhook endpoints.'),
    });
    this._api.deliveries(organizationId, projectId).subscribe({
      next: (deliveries) => this.deliveries.set(deliveries),
      error: (error: unknown) => this._reportError(error, 'Could not load delivery logs.'),
    });
    this._loadIncidents(organizationId);
    this._connectIncidentStream();
  }

  public retryLoad(): void {
    if (this.organizationId()) {
      this.loadTenant();
      return;
    }

    this._loadOrganizations();
  }

  public createEndpoint(): void {
    const projectId = this.projectId();
    const organizationId = this.organizationId();
    if (!projectId || !organizationId) return;
    const endpointUrl = prompt('Destination URL', 'http://127.0.0.1:65534/destination');
    if (!endpointUrl) return;

    this._api.createWebhook(organizationId, projectId, endpointUrl).subscribe({
      next: (endpoint) => {
        this.endpoints.update((endpoints) => [endpoint, ...endpoints]);
        if (endpoint.secret) {
          sessionStorage.setItem(`endpoint_secret_${endpoint.id}`, endpoint.secret);
        }
      },
      error: (error: unknown) => this._reportError(error, 'Could not create the webhook endpoint.'),
    });
  }

  public simulate(type: 'healthy' | 'failing'): void {
    const projectId = this.projectId();
    const organizationId = this.organizationId();
    if (!projectId || !organizationId) return;
    const endpointUrl =
      type === 'healthy' ? 'https://httpbin.org/status/200' : 'http://127.0.0.1:65534/destination';

    this._api.createWebhook(organizationId, projectId, endpointUrl).subscribe({
      next: (endpoint) => {
        const payload =
          type === 'healthy'
            ? { status: 'healthy', service: 'checkout', timestamp: new Date().toISOString() }
            : {
                status: 'failing',
                service: 'payments',
                error: 'Connection refused',
                timestamp: new Date().toISOString(),
              };
        this._api
          .ingest(
            endpoint.id,
            endpoint.secret || '',
            type === 'healthy' ? 'demo.health.check' : 'demo.failure.check',
            payload,
            `${type}-${Date.now()}-${crypto.randomUUID()}`,
          )
          .subscribe({
            next: () => this.loadAll(),
            error: (error: unknown) => this._reportError(error, 'Could not send the test event.'),
          });
      },
      error: (error: unknown) => this._reportError(error, 'Could not create a test endpoint.'),
    });
  }

  public replay(delivery: Delivery): void {
    this._api.replay(this.organizationId(), delivery.id).subscribe({
      next: () => this.loadAll(),
      error: (error: unknown) => this._reportError(error, 'Could not replay this delivery.'),
    });
  }

  public selectIncident(incident: Incident): void {
    this._api.summarize(this.organizationId(), incident.id).subscribe({
      next: (summary) => this.summary.set(summary),
      error: (error: unknown) =>
        this._reportError(error, 'Could not generate an incident summary.'),
    });
  }

  public copy(value: string): void {
    const write = navigator.clipboard?.writeText(value);
    if (!write) {
      this.error.set('Clipboard access is unavailable in this browser.');
      return;
    }

    void write.catch(() => this.error.set('Could not copy the ingestion URL.'));
  }

  public logout(): void {
    const refreshToken = this._session.refreshToken;
    this._session.clearSession();
    if (refreshToken) {
      this._api.logout(refreshToken).subscribe({
        error: (error: unknown) => console.error('Could not revoke the refresh session.', error),
      });
    }
    void this._router.navigateByUrl('/auth/login');
  }

  private _loadOrganizations(): void {
    this.error.set('');
    this._api.organizations().subscribe({
      next: (organizations) => {
        this.organizations.set(organizations);
        this.organizationId.set(organizations[0]?.id || '');
        if (this.organizationId()) this.loadTenant();
      },
      error: (error: unknown) => this._reportError(error, 'Could not load organizations.'),
    });
  }

  private _connectIncidentStream(): void {
    this._eventStreamController?.abort();
    const organizationId = this.organizationId();
    if (!this._session.accessToken || !organizationId) return;

    const controller = new AbortController();
    this._eventStreamController = controller;
    void this._readIncidentStream(organizationId, controller.signal);
  }

  private async _readIncidentStream(organizationId: string, signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      try {
        const token = this._session.accessToken;
        if (!token) {
          void this._router.navigateByUrl('/auth/login');
          return;
        }

        const response = await fetch(
          `/organizations/${encodeURIComponent(organizationId)}/notifications/stream`,
          {
            headers: {
              Accept: 'text/event-stream',
              Authorization: `Bearer ${token}`,
            },
            signal,
          },
        );
        if (response.status === 401) {
          if (!this._session.refreshToken) {
            this._session.clearSession();
            void this._router.navigateByUrl('/auth/login');
            return;
          }

          try {
            await firstValueFrom(this._session.refreshSession());
            continue;
          } catch (error: unknown) {
            this._session.clearSession();
            this._reportError(error, 'Your session expired. Please sign in again.');
            void this._router.navigateByUrl('/auth/login');
            return;
          }
        }
        if (!response.ok || !response.headers.get('content-type')?.includes('text/event-stream')) {
          throw new Error('The incident event stream is unavailable.');
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('The incident event stream has no readable body.');

        const decoder = new TextDecoder();
        let buffer = '';
        while (!signal.aborted) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split(/\r?\n\r?\n/);
          buffer = events.pop() || '';
          if (
            events.some((event) => event.split(/\r?\n/).some((line) => line.startsWith('data:')))
          ) {
            this._loadIncidents(organizationId);
          }
        }
      } catch (error: unknown) {
        if (signal.aborted) return;
        this._reportError(error, 'The live incident feed is unavailable.');
      }

      await this._waitForStreamReconnect(signal);
    }
  }

  private _waitForStreamReconnect(signal: AbortSignal): Promise<void> {
    if (signal.aborted) return Promise.resolve();

    return new Promise((resolve) => {
      let timeout: number;
      const onAbort = () => {
        window.clearTimeout(timeout);
        resolve();
      };
      timeout = window.setTimeout(() => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      }, 3000);
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  private _loadIncidents(organizationId: string): void {
    this._api.incidents(organizationId).subscribe({
      next: (incidents) => this.liveIncidents.set(incidents),
      error: (error: unknown) => this._reportError(error, 'Could not load incidents.'),
    });
  }

  private _reportError(error: unknown, fallback: string): void {
    if (error instanceof HttpErrorResponse) {
      const message: unknown = error.error?.message;
      if (typeof message === 'string') {
        this.error.set(message);
        return;
      }
      if (Array.isArray(message) && message.every((item) => typeof item === 'string')) {
        this.error.set(message.join(', '));
        return;
      }
    }

    this.error.set(fallback);
  }
}
