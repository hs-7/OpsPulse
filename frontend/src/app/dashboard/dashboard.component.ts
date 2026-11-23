import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../api.service';

@Component({
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand"><span class="brand-mark">O</span><strong>OpsPulse</strong></div>
        <nav>
          <button class="nav-item active">▦ Overview</button>
          <button class="nav-item">⌁ Webhooks</button>
          <button class="nav-item">≡ Deliveries</button>
          <button class="nav-item">⚠ Incidents</button>
        </nav>
        <button class="logout" (click)="logout()">↪ Sign out</button>
      </aside>

      <main class="main">
        <header class="topbar">
          <div>
            <p class="eyebrow">OPERATIONS</p>
            <h1>Overview</h1>
          </div>
          <div class="selectors">
            <select [(ngModel)]="organizationId" (ngModelChange)="loadTenant()">
              @for (organization of organizations; track organization.id) {
                <option [value]="organization.id">{{ organization.name }}</option>
              }
            </select>
            <select [(ngModel)]="projectId" (ngModelChange)="loadAll()">
              @for (project of projects; track project.id) {
                <option [value]="project.id">{{ project.name }}</option>
              }
            </select>
          </div>
        </header>

        <section class="actions">
          <button class="healthy" (click)="simulate('healthy')">✓ Simulate Healthy Webhook</button>
          <button class="failing" (click)="simulate('failing')">⚠ Simulate Failing Webhook</button>
        </section>

        <section class="grid">
          <article class="card endpoints">
            <div class="card-head"><div><p class="eyebrow">CONFIGURATION</p><h2>Webhook Endpoints</h2></div><button class="small" (click)="createEndpoint()">+ Create</button></div>
            @for (endpoint of endpoints; track endpoint.id) {
              <div class="endpoint-row">
                <div class="status-dot" [class.off]="!endpoint.active"></div>
                <div class="endpoint-info">
                  <strong>{{ endpoint.endpointUrl }}</strong>
                  <code>/api/webhooks/ingest/{{ endpoint.id }}</code>
                </div>
                <button class="icon" title="Copy ingestion URL" (click)="copy('/api/webhooks/ingest/' + endpoint.id)">⧉</button>
              </div>
            }
            @if (!endpoints.length) { <p class="empty">No webhook endpoints configured.</p> }
          </article>

          <article class="card incidents">
            <div class="card-head"><div><p class="eyebrow">LIVE FEED</p><h2>Incident Feed</h2></div><span class="live">● LIVE</span></div>
            @for (incident of liveIncidents; track incident.id) {
              <button class="incident-row" (click)="selectIncident(incident)">
                <span class="severity" [class]="incident.severity">{{ incident.severity }}</span>
                <div><strong>{{ incident.title }}</strong><small>{{ incident.status }}</small></div>
              </button>
            }
            @if (!liveIncidents.length) { <p class="empty">No incidents reported.</p> }
          </article>
        </section>

        <section class="grid second">
          <article class="card deliveries">
            <div class="card-head"><div><p class="eyebrow">QUEUE</p><h2>Delivery Logs</h2></div></div>
            <div class="table">
              <div class="table-head"><span>Event</span><span>Status</span><span>Attempts</span><span>Response</span><span></span></div>
              @for (delivery of deliveries; track delivery.id) {
                <div class="table-row">
                  <span>{{ delivery.eventType }}</span>
                  <span class="delivery-status" [class.failed]="delivery.status === 'dead_letter'">{{ delivery.status }}</span>
                  <span>{{ delivery.attemptCount }}</span>
                  <span>{{ delivery.responseStatus || '—' }}</span>
                  <button class="icon" title="Replay delivery" (click)="replay(delivery)">↻</button>
                </div>
              }
              @if (!deliveries.length) { <p class="empty">No deliveries yet.</p> }
            </div>
          </article>

          <article class="card ai">
            <div class="card-head"><div><p class="eyebrow">OPS PULSE AI</p><h2>Incident Summary</h2></div></div>
            @if (summary) {
              <p class="summary">{{ summary.summary }}</p>
              <span class="mode">{{ summary.mode }}</span>
            } @else {
              <p class="empty">Select an incident to generate a root-cause summary.</p>
            }
          </article>
        </section>
      </main>
    </div>
  `,
  styles: [`
    :host { font-family:Inter,Segoe UI,sans-serif; color:#202636; }
    .app-shell { min-height:100vh; display:grid; grid-template-columns:220px 1fr; background:#f5f7fb; }
    .sidebar { background:#111827; color:#cbd5e1; padding:24px 18px; display:flex; flex-direction:column; }
    .brand { display:flex; align-items:center; gap:10px; color:white; margin:0 8px 28px; }
    .brand-mark { display:grid; place-items:center; width:34px; height:34px; border-radius:10px; background:#315efb; }
    nav { display:flex; flex-direction:column; gap:6px; } .nav-item,.logout { border:0; background:none; color:#aab3c2; text-align:left; padding:11px 12px; border-radius:8px; font:inherit; cursor:pointer; }
    .nav-item.active { background:#1f2937; color:white; } .logout { margin-top:auto; }
    .main { min-width:0; padding:28px 34px 40px; } .topbar { display:flex; justify-content:space-between; align-items:flex-end; }
    .eyebrow { margin:0 0 4px; font-size:10px; letter-spacing:.12em; color:#8b95a6; font-weight:800; } h1,h2 { margin:0; } h1 { font-size:26px; } h2 { font-size:16px; }
    .selectors { display:flex; gap:8px; } select { border:1px solid #dfe4ec; border-radius:8px; background:white; padding:9px 32px 9px 10px; color:#3d4655; }
    .actions { display:flex; gap:10px; margin:24px 0 16px; } .actions button,.small { border:0; border-radius:8px; padding:10px 14px; font-weight:700; cursor:pointer; }
    .healthy { background:#dff6ea; color:#17724d; } .failing { background:#ffe7e9; color:#a83240; } .small { background:#edf2ff; color:#315efb; }
    .grid { display:grid; grid-template-columns:1.35fr 1fr; gap:16px; } .second { margin-top:16px; grid-template-columns:1.35fr 1fr; }
    .card { background:white; border:1px solid #e7eaf0; border-radius:12px; padding:18px; box-shadow:0 3px 12px rgba(31,42,68,.03); }
    .card-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; }
    .endpoint-row,.incident-row { width:100%; display:flex; align-items:center; gap:12px; padding:12px 0; border:0; border-top:1px solid #eef1f5; background:white; text-align:left; }
    .status-dot { width:9px; height:9px; border-radius:50%; background:#24b47e; } .status-dot.off { background:#aab2bf; }
    .endpoint-info { flex:1; min-width:0; display:flex; flex-direction:column; } .endpoint-info strong { overflow:hidden; text-overflow:ellipsis; } code { color:#7b8494; margin-top:3px; }
    .icon { border:0; background:#f2f4f8; border-radius:6px; width:32px; height:32px; cursor:pointer; } .live { color:#25a86b; font-size:11px; font-weight:800; }
    .severity { width:62px; text-align:center; text-transform:uppercase; border-radius:20px; padding:5px 7px; background:#edf2ff; color:#315efb; font-size:10px; font-weight:800; }
    .severity.critical { background:#ffe7e9; color:#bc3745; } .incident-row div { display:flex; flex-direction:column; }
    .incident-row small { color:#9098a6; margin-top:3px; } .table { font-size:12px; } .table-head,.table-row { display:grid; grid-template-columns:1.5fr 1fr .6fr .6fr 32px; align-items:center; gap:8px; }
    .table-head { color:#929bab; border-bottom:1px solid #edf0f4; padding-bottom:8px; } .table-row { min-height:44px; border-bottom:1px solid #f1f3f6; }
    .delivery-status { color:#17724d; } .delivery-status.failed { color:#bc3745; } .summary { line-height:1.65; color:#4c5667; } .mode { display:inline-block; background:#edf2ff; color:#315efb; padding:5px 8px; border-radius:20px; font-size:11px; }
    .empty { color:#929bab; font-size:13px; }
  `],
})
export class DashboardComponent implements OnInit, OnDestroy {
  organizations: any[] = [];
  projects: any[] = [];
  endpoints: any[] = [];
  deliveries: any[] = [];
  liveIncidents: any[] = [];
  organizationId = '';
  projectId = '';
  summary: any = null;
  private eventSource?: EventSource;

  constructor(private api: ApiService, private router: Router) {}

  ngOnInit(): void {
    if (!localStorage.getItem('opspulse_access')) {
      this.router.navigateByUrl('/login');
      return;
    }
    this.api.organizations().subscribe((organizations) => {
      this.organizations = organizations;
      this.organizationId = organizations[0]?.id || '';
      if (this.organizationId) this.loadTenant();
    });
  }

  ngOnDestroy(): void {
    this.eventSource?.close();
  }

  loadTenant(): void {
    localStorage.setItem('opspulse_organization', this.organizationId);
    this.api.projects(this.organizationId).subscribe((projects) => {
      this.projects = projects;
      this.projectId = projects[0]?.id || '';
      this.loadAll();
    });
  }

  loadAll(): void {
    if (!this.organizationId) return;
    this.api.webhooks(this.organizationId).subscribe((endpoints) => this.endpoints = endpoints);
    this.api.deliveries(this.organizationId).subscribe((deliveries) => this.deliveries = deliveries);
    this.api.incidents(this.organizationId).subscribe((incidents) => this.liveIncidents = incidents);
    this.eventSource?.close();
    const token = encodeURIComponent(localStorage.getItem('opspulse_access') || '');
    this.eventSource = new EventSource(`/organizations/${this.organizationId}/notifications/stream?access_token=${token}`);
  }

  createEndpoint(): void {
    if (!this.projectId) return;
    const endpointUrl = prompt('Destination URL', 'http://127.0.0.1:65534/destination');
    if (!endpointUrl) return;
    this.api.createWebhook(this.organizationId, this.projectId, endpointUrl).subscribe((endpoint) => {
      this.endpoints = [endpoint, ...this.endpoints];
      sessionStorage.setItem(`endpoint_secret_${endpoint.id}`, endpoint.secret);
    });
  }

  simulate(type: 'healthy' | 'failing'): void {
    if (!this.projectId) return;
    const endpointUrl = type === 'healthy'
      ? 'https://httpbin.org/status/200'
      : 'http://127.0.0.1:65534/destination';
    this.api.createWebhook(this.organizationId, this.projectId, endpointUrl).subscribe((endpoint) => {
      const secret = endpoint.secret;
      const payload = type === 'healthy'
        ? { status: 'healthy', service: 'checkout', timestamp: new Date().toISOString() }
        : { status: 'failing', service: 'payments', error: 'Connection refused', timestamp: new Date().toISOString() };
      this.api.ingest(
        endpoint.id,
        secret,
        type === 'healthy' ? 'demo.health.check' : 'demo.failure.check',
        payload,
        `${type}-${Date.now()}-${crypto.randomUUID()}`,
      ).subscribe(() => {
        this.loadAll();
      });
    });
  }

  replay(delivery: any): void {
    this.api.replay(this.organizationId, delivery.id).subscribe(() => this.loadAll());
  }

  selectIncident(incident: any): void {
    this.api.summarize(this.organizationId, incident.id).subscribe((summary) => this.summary = summary);
  }

  copy(value: string): void {
    void navigator.clipboard?.writeText(value);
  }

  logout(): void {
    localStorage.removeItem('opspulse_access');
    localStorage.removeItem('opspulse_refresh');
    this.router.navigateByUrl('/login');
  }
}
