import { Component, OnDestroy, OnInit } from '@angular/core';
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

@Component({
  standalone: true,
  imports: [FormsModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit, OnDestroy {
  //#region Public properties
  public organizations: Organization[] = [];
  public projects: Project[] = [];
  public endpoints: WebhookEndpoint[] = [];
  public deliveries: Delivery[] = [];
  public liveIncidents: Incident[] = [];
  public organizationId = '';
  public projectId = '';
  public summary: IncidentSummary | null = null;
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
      void this._router.navigateByUrl('/login');
      return;
    }

    this._api.organizations().subscribe((organizations: Organization[]) => {
      this.organizations = organizations;
      this.organizationId = organizations[0]?.id || '';
      if (this.organizationId) this.loadTenant();
    });
  }

  /** Closes the live incident stream. */
  public ngOnDestroy(): void {
    this._eventSource?.close();
  }

  /** Loads projects and dashboard data for the selected organization. */
  public loadTenant(): void {
    localStorage.setItem('opspulse_organization', this.organizationId);
    this._api.projects(this.organizationId).subscribe((projects: Project[]) => {
      this.projects = projects;
      this.projectId = projects[0]?.id || '';
      this.loadAll();
    });
  }

  /** Refreshes dashboard resources for the active tenant and project. */
  public loadAll(): void {
    if (!this.organizationId) return;

    this._api.webhooks(this.organizationId).subscribe((endpoints) => this.endpoints = endpoints);
    this._api.deliveries(this.organizationId).subscribe((deliveries) => this.deliveries = deliveries);
    this._api.incidents(this.organizationId).subscribe((incidents) => this.liveIncidents = incidents);
    this._connectIncidentStream();
  }

  /** Opens a prompt and creates a webhook endpoint. */
  public createEndpoint(): void {
    if (!this.projectId) return;
    const endpointUrl = prompt('Destination URL', 'http://127.0.0.1:65534/destination');
    if (!endpointUrl) return;

    this._api.createWebhook(this.organizationId, this.projectId, endpointUrl)
      .subscribe((endpoint) => {
        this.endpoints = [endpoint, ...this.endpoints];
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
    if (!this.projectId) return;
    const endpointUrl = type === 'healthy'
      ? 'https://httpbin.org/status/200'
      : 'http://127.0.0.1:65534/destination';

    this._api.createWebhook(this.organizationId, this.projectId, endpointUrl)
      .subscribe((endpoint) => {
        const payload = type === 'healthy'
          ? { status: 'healthy', service: 'checkout', timestamp: new Date().toISOString() }
          : { status: 'failing', service: 'payments', error: 'Connection refused', timestamp: new Date().toISOString() };
        this._api.ingest(
          endpoint.id,
          endpoint.secret || '',
          type === 'healthy' ? 'demo.health.check' : 'demo.failure.check',
          payload,
          `${type}-${Date.now()}-${crypto.randomUUID()}`,
        ).subscribe(() => this.loadAll());
      });
  }

  /**
   * Replays a failed or delivered webhook.
   * @param delivery Delivery row to replay.
   */
  public replay(delivery: Delivery): void {
    this._api.replay(this.organizationId, delivery.id).subscribe(() => this.loadAll());
  }

  /**
   * Generates an AI summary for an incident.
   * @param incident Incident to summarize.
   */
  public selectIncident(incident: Incident): void {
    this._api.summarize(this.organizationId, incident.id)
      .subscribe((summary) => this.summary = summary);
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
    void this._router.navigateByUrl('/login');
  }
  //#endregion

  //#region Private methods
  private _connectIncidentStream(): void {
    this._eventSource?.close();
    const token = encodeURIComponent(localStorage.getItem('opspulse_access') || '');
    this._eventSource = new EventSource(
      `/organizations/${this.organizationId}/notifications/stream?access_token=${token}`,
    );
  }
  //#endregion
}
