import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  Delivery,
  Incident,
  IncidentSummary,
  Organization,
  Project,
  WebhookEndpoint,
} from '../../../../core/models/api.models';
import { ApiService } from '../../../../core/services/api.service';
import { BrandMarkComponent } from '../../../../shared/components/brand-mark/brand-mark.component';

@Component({
  standalone: true,
  imports: [BrandMarkComponent, FormsModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent implements OnInit, OnDestroy {
  //#region Public properties

  readonly organizations = signal<Organization[]>([]);
  readonly projects = signal<Project[]>([]);
  readonly endpoints = signal<WebhookEndpoint[]>([]);
  readonly deliveries = signal<Delivery[]>([]);
  readonly liveIncidents = signal<Incident[]>([]);
  readonly organizationId = signal('');
  readonly projectId = signal('');
  readonly summary = signal<IncidentSummary | null>(null);

  //#endregion

  //#region Private properties

  private readonly _api: ApiService;
  private readonly _router: Router;
  private _eventSource?: EventSource;

  //#endregion

  /**
   * Creates the operations dashboard.
   * @param api API service.
   * @param router Application router.
   */
  constructor(api: ApiService, router: Router) {
    this._api = api;
    this._router = router;
  }

  //#region Public methods

  /** Loads organizations after component initialization. */
  public ngOnInit(): void {
    if (!localStorage.getItem('opspulse_access')) {
      void this._router.navigateByUrl('/auth/login');
      return;
    }

    this._api.organizations().subscribe((organizations: Organization[]) => {
      this.organizations.set(organizations);
      this.organizationId.set(organizations[0]?.id || '');
      if (this.organizationId()) this.loadTenant();
    });
  }

  /** Closes the live incident stream. */
  public ngOnDestroy(): void {
    this._eventSource?.close();
  }

  /** Loads projects and dashboard data for the selected organization. */
  public loadTenant(): void {
    const organizationId = this.organizationId();
    if (!organizationId) return;

    localStorage.setItem('opspulse_organization', organizationId);
    this._api.projects(organizationId).subscribe((projects: Project[]) => {
      this.projects.set(projects);
      this.projectId.set(projects[0]?.id || '');
      this.loadAll();
    });
  }

  /** Refreshes dashboard resources for the active tenant and project. */
  public loadAll(): void {
    const organizationId = this.organizationId();
    if (!organizationId) return;

    this._api.webhooks(organizationId).subscribe((endpoints) => this.endpoints.set(endpoints));
    this._api.deliveries(organizationId).subscribe((deliveries) => this.deliveries.set(deliveries));
    this._loadIncidents(organizationId);
    this._connectIncidentStream();
  }

  /** Opens a prompt and creates a webhook endpoint. */
  public createEndpoint(): void {
    const projectId = this.projectId();
    const organizationId = this.organizationId();
    if (!projectId || !organizationId) return;
    const endpointUrl = prompt('Destination URL', 'http://127.0.0.1:65534/destination');
    if (!endpointUrl) return;

    this._api.createWebhook(organizationId, projectId, endpointUrl).subscribe((endpoint) => {
      this.endpoints.update((endpoints) => [endpoint, ...endpoints]);
      if (endpoint.secret) {
        sessionStorage.setItem(`endpoint_secret_${endpoint.id}`, endpoint.secret);
      }
    });
  }

  /**
   * Creates a simulated endpoint and sends a healthy or failing event.
   * @param type Simulation mode.
   */
  public simulate(type: 'healthy' | 'failing'): void {
    const projectId = this.projectId();
    const organizationId = this.organizationId();
    if (!projectId || !organizationId) return;
    const endpointUrl =
      type === 'healthy' ? 'https://httpbin.org/status/200' : 'http://127.0.0.1:65534/destination';

    this._api.createWebhook(organizationId, projectId, endpointUrl).subscribe((endpoint) => {
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
        .subscribe(() => this.loadAll());
    });
  }

  /**
   * Replays a failed or delivered webhook.
   * @param delivery Delivery row to replay.
   */
  public replay(delivery: Delivery): void {
    this._api.replay(this.organizationId(), delivery.id).subscribe(() => this.loadAll());
  }

  /**
   * Generates an AI summary for an incident.
   * @param incident Incident to summarize.
   */
  public selectIncident(incident: Incident): void {
    this._api
      .summarize(this.organizationId(), incident.id)
      .subscribe((summary) => this.summary.set(summary));
  }

  /**
   * Copies an ingestion URL to the clipboard.
   * @param value Text to copy.
   */
  public copy(value: string): void {
    void navigator.clipboard?.writeText(value);
  }

  /** Signs out and returns to login. */
  public logout(): void {
    localStorage.removeItem('opspulse_access');
    localStorage.removeItem('opspulse_refresh');
    void this._router.navigateByUrl('/auth/login');
  }

  //#endregion

  //#region Private methods

  private _connectIncidentStream(): void {
    this._eventSource?.close();
    const token = encodeURIComponent(localStorage.getItem('opspulse_access') || '');
    this._eventSource = new EventSource(
      `/organizations/${this.organizationId()}/notifications/stream?access_token=${token}`,
    );
    this._eventSource.onmessage = () => this._loadIncidents(this.organizationId());
  }

  private _loadIncidents(organizationId: string): void {
    this._api.incidents(organizationId).subscribe((incidents) => this.liveIncidents.set(incidents));
  }

  //#endregion
}
