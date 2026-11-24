import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  signal,
  WritableSignal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { concatMap, firstValueFrom, from } from 'rxjs';
import {
  Delivery,
  Incident,
  IncidentSummary,
  Organization,
  Project,
  WebhookEndpoint,
} from '../../../../core/models/api.models';
import { AuthSessionService } from '../../../../core/services/auth-session.service';
import { SvgIconComponent } from '../../../../shared/components/svg-icon/svg-icon.component';
import { DashboardApiService } from '../../data-access/dashboard-api.service';

@Component({
  standalone: true,
  imports: [SvgIconComponent, FormsModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent implements OnInit, OnDestroy {
  //#region Public properties

  readonly organizations: WritableSignal<Organization[]>;
  readonly projects: WritableSignal<Project[]>;
  readonly endpoints: WritableSignal<WebhookEndpoint[]>;
  readonly deliveries: WritableSignal<Delivery[]>;
  readonly liveIncidents: WritableSignal<Incident[]>;
  readonly organizationId: WritableSignal<string>;
  readonly projectId: WritableSignal<string>;
  readonly summary: WritableSignal<IncidentSummary | null>;
  readonly error: WritableSignal<string>;

  //#endregion

  //#region Private properties

  private readonly _api: DashboardApiService;
  private readonly _router: Router;
  private readonly _session: AuthSessionService;
  private _eventStreamController?: AbortController;
  private _summaryRequestId: number;

  //#endregion

  /**
   * Creates the operations dashboard.
   * @param api API service.
   * @param router Application router.
   * @param session Authentication session service.
   */
  constructor(api: DashboardApiService, router: Router, session: AuthSessionService) {
    this._api = api;
    this._router = router;
    this._session = session;
    this._summaryRequestId = 0;
    this.organizations = signal<Organization[]>([]);
    this.projects = signal<Project[]>([]);
    this.endpoints = signal<WebhookEndpoint[]>([]);
    this.deliveries = signal<Delivery[]>([]);
    this.liveIncidents = signal<Incident[]>([]);
    this.organizationId = signal<string>('');
    this.projectId = signal<string>('');
    this.summary = signal<IncidentSummary | null>(null);
    this.error = signal<string>('');
  }

  //#region Public methods

  /** Loads the organizations available to the authenticated user. */
  public ngOnInit(): void {
    if (!this._session.accessToken) {
      void this._router.navigateByUrl('/auth/login');
      return;
    }

    this._loadOrganizations();
  }

  /** Aborts the live incident stream when the dashboard is destroyed. */
  public ngOnDestroy(): void {
    this._eventStreamController?.abort();
  }

  /** Loads projects and dashboard data for the selected organization. */
  public loadTenant(): void {
    const organizationId = this.organizationId();
    if (!organizationId) return;

    localStorage.setItem('opspulse_organization', organizationId);
    this.error.set('');
    this.projects.set([]);
    this.projectId.set('');
    this.endpoints.set([]);
    this.deliveries.set([]);
    this.liveIncidents.set([]);
    this._summaryRequestId += 1;
    this.summary.set(null);
    this._eventStreamController?.abort();
    this._api.projects(organizationId).subscribe({
      next: (projects) => {
        if (this.organizationId() !== organizationId) return;
        this.projects.set(projects);
        this.projectId.set(projects[0]?.id || '');
        this.loadAll();
      },
      error: (error: unknown) => {
        if (this.organizationId() === organizationId) {
          this._reportError(error, 'Could not load projects for this organization.');
        }
      },
    });
  }

  /** Refreshes dashboard resources for the current organization and project. */
  public loadAll(): void {
    const organizationId = this.organizationId();
    if (!organizationId) return;

    this.error.set('');
    const projectId = this.projectId() || undefined;
    this.endpoints.set([]);
    this.deliveries.set([]);
    const isCurrentSelection = () =>
      this.organizationId() === organizationId && (this.projectId() || undefined) === projectId;
    this._api.webhooks(organizationId, projectId).subscribe({
      next: (endpoints) => {
        if (isCurrentSelection()) this.endpoints.set(endpoints);
      },
      error: (error: unknown) => {
        if (isCurrentSelection()) {
          this._reportError(error, 'Could not load webhook endpoints.');
        }
      },
    });
    this._api.deliveries(organizationId, projectId).subscribe({
      next: (deliveries) => {
        if (isCurrentSelection()) this.deliveries.set(deliveries);
      },
      error: (error: unknown) => {
        if (isCurrentSelection()) this._reportError(error, 'Could not load delivery logs.');
      },
    });
    this._loadIncidents(organizationId);
    this._connectIncidentStream();
  }

  /** Retries the organization or project load that is currently failing. */
  public retryLoad(): void {
    if (this.organizationId()) {
      this.loadTenant();
      return;
    }

    this._loadOrganizations();
  }

  /** Prompts for a destination URL and creates a webhook endpoint. */
  public createEndpoint(): void {
    const projectId = this.projectId();
    const organizationId = this.organizationId();
    if (!projectId || !organizationId) return;
    const endpointUrl = prompt('Destination URL', 'http://127.0.0.1:65534/destination');
    if (!endpointUrl) return;

    this._api.createWebhook(organizationId, projectId, endpointUrl).subscribe({
      next: (endpoint) => {
        if (this.organizationId() === organizationId && this.projectId() === projectId) {
          this.endpoints.update((endpoints) => [endpoint, ...endpoints]);
        }
        if (endpoint.secret) {
          sessionStorage.setItem(`endpoint_secret_${endpoint.id}`, endpoint.secret);
        }
      },
      error: (error: unknown) => {
        if (this.organizationId() === organizationId && this.projectId() === projectId) {
          this._reportError(error, 'Could not create the webhook endpoint.');
        }
      },
    });
  }

  /**
   * Creates a demo endpoint and sends a healthy or failing event.
   * @param type Simulation mode.
   */
  public simulate(type: 'healthy' | 'failing'): void {
    const projectId = this.projectId();
    const organizationId = this.organizationId();
    if (!projectId || !organizationId) return;
    const isCurrentSelection = () =>
      this.organizationId() === organizationId && this.projectId() === projectId;
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
        const eventCount = type === 'failing' ? 3 : 1;
        from(Array.from({ length: eventCount }, (_, index) => index + 1))
          .pipe(
            concatMap((sequence) =>
              this._api.ingest(
                endpoint.id,
                endpoint.secret || '',
                type === 'healthy' ? 'demo.health.check' : 'demo.failure.check',
                { ...payload, sequence },
                `${type}-${Date.now()}-${sequence}-${crypto.randomUUID()}`,
              ),
            ),
          )
          .subscribe({
            complete: () => {
              if (isCurrentSelection()) this.loadAll();
            },
            error: (error: unknown) => {
              if (isCurrentSelection()) {
                this._reportError(error, 'Could not send the test event.');
              }
            },
          });
      },
      error: (error: unknown) => {
        if (isCurrentSelection()) {
          this._reportError(error, 'Could not create a test endpoint.');
        }
      },
    });
  }

  /**
   * Requeues a delivery for another attempt.
   * @param delivery Delivery to replay.
   */
  public replay(delivery: Delivery): void {
    const organizationId = this.organizationId();
    const projectId = this.projectId();
    const isCurrentSelection = () =>
      this.organizationId() === organizationId && this.projectId() === projectId;
    this._api.replay(organizationId, delivery.id).subscribe({
      next: () => {
        if (isCurrentSelection()) this.loadAll();
      },
      error: (error: unknown) => {
        if (isCurrentSelection()) {
          this._reportError(error, 'Could not replay this delivery.');
        }
      },
    });
  }

  /**
   * Generates an AI summary for an incident.
   * @param incident Incident to summarize.
   */
  public selectIncident(incident: Incident): void {
    const organizationId = this.organizationId();
    const requestId = ++this._summaryRequestId;
    this._api.summarize(organizationId, incident.id).subscribe({
      next: (summary) => {
        if (this.organizationId() === organizationId && this._summaryRequestId === requestId) {
          this.summary.set(summary);
        }
      },
      error: (error: unknown) => {
        if (this.organizationId() === organizationId && this._summaryRequestId === requestId) {
          this._reportError(error, 'Could not generate an incident summary.');
        }
      },
    });
  }

  /**
   * Copies an ingestion URL to the clipboard.
   * @param value Text to copy.
   */
  public copy(value: string): void {
    const write = navigator.clipboard?.writeText(value);
    if (!write) {
      this.error.set('Clipboard access is unavailable in this browser.');
      return;
    }

    void write.catch(() => this.error.set('Could not copy the ingestion URL.'));
  }

  /** Revokes the refresh session and returns to the login page. */
  public logout(): void {
    this._session.clearSession();
    this._session.revokeSession().subscribe({
      error: (error: unknown) => console.error('Could not revoke the refresh session.', error),
    });
    void this._router.navigateByUrl('/auth/login');
  }

  //#endregion

  //#region Private methods

  /** Loads organizations and selects the first available organization. */
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

  /** Starts an authenticated, reconnecting event stream for the selected organization. */
  private _connectIncidentStream(): void {
    this._eventStreamController?.abort();
    const organizationId = this.organizationId();
    if (!this._session.accessToken || !organizationId) return;

    const controller = new AbortController();
    this._eventStreamController = controller;
    void this._readIncidentStream(organizationId, controller.signal);
  }

  /**
   * Reads SSE messages and refreshes the incident list when an event arrives.
   * @param organizationId Organization whose event stream is being read.
   * @param signal Abort signal for stream cancellation.
   */
  private async _readIncidentStream(organizationId: string, signal: AbortSignal): Promise<void> {
    let hasRefreshedForUnauthorized = false;

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
          if (hasRefreshedForUnauthorized) {
            this._session.clearSession();
            void this._router.navigateByUrl('/auth/login');
            return;
          }

          try {
            await firstValueFrom(this._session.refreshSession());
            hasRefreshedForUnauthorized = true;
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

        hasRefreshedForUnauthorized = false;
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

  /**
   * Waits for the reconnect interval or an abort signal.
   * @param signal Abort signal for stream cancellation.
   */
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

  /**
   * Loads incidents if the requested organization is still selected.
   * @param organizationId Organization whose incidents are loaded.
   */
  private _loadIncidents(organizationId: string): void {
    this._api.incidents(organizationId).subscribe({
      next: (incidents) => {
        if (this.organizationId() === organizationId) this.liveIncidents.set(incidents);
      },
      error: (error: unknown) => {
        if (this.organizationId() === organizationId) {
          this._reportError(error, 'Could not load incidents.');
        }
      },
    });
  }

  /**
   * Shows an API error message or a safe fallback message.
   * @param error Error returned by the request.
   * @param fallback Message shown when the error has no API message.
   */
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

  //#endregion
}
