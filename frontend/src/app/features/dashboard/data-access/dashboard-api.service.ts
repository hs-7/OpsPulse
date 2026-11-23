import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { from, map, Observable, switchMap } from 'rxjs';
import {
  ApiEnvelope,
  Delivery,
  Incident,
  IncidentSummary,
  Organization,
  Project,
  WebhookEndpoint,
} from '../../../core/models/api.models';

@Injectable({ providedIn: 'root' })
export class DashboardApiService {
  //#region Private properties

  private readonly _http: HttpClient;

  //#endregion

  /** Creates the dashboard API client. */
  constructor(http: HttpClient) {
    this._http = http;
  }

  //#region Public methods

  /** Returns organizations accessible to the current user. */
  public organizations(): Observable<Organization[]> {
    return this._unwrap(this._http.get<ApiEnvelope<Organization[]>>('/organizations'));
  }

  /**
   * Lists projects in an organization.
   * @param organizationId Organization identifier.
   */
  public projects(organizationId: string): Observable<Project[]> {
    return this._unwrap(
      this._http.get<ApiEnvelope<Project[]>>(`/organizations/${organizationId}/projects`),
    );
  }

  /**
   * Lists organization webhooks, optionally limited to a project.
   * @param organizationId Organization identifier.
   * @param projectId Optional project filter.
   */
  public webhooks(organizationId: string, projectId?: string): Observable<WebhookEndpoint[]> {
    const params = projectId ? new HttpParams().set('projectId', projectId) : new HttpParams();
    return this._unwrap(
      this._http.get<ApiEnvelope<WebhookEndpoint[]>>(`/organizations/${organizationId}/webhooks`, {
        params,
      }),
    );
  }

  /**
   * Creates a webhook endpoint in a project.
   * @param organizationId Organization identifier.
   * @param projectId Project identifier.
   * @param endpointUrl Destination URL.
   */
  public createWebhook(
    organizationId: string,
    projectId: string,
    endpointUrl: string,
  ): Observable<WebhookEndpoint> {
    return this._unwrap(
      this._http.post<ApiEnvelope<WebhookEndpoint>>(`/organizations/${organizationId}/webhooks`, {
        projectId,
        endpointUrl,
      }),
    );
  }

  /**
   * Lists organization deliveries, optionally limited to a project.
   * @param organizationId Organization identifier.
   * @param projectId Optional project filter.
   */
  public deliveries(organizationId: string, projectId?: string): Observable<Delivery[]> {
    const params = projectId ? new HttpParams().set('projectId', projectId) : new HttpParams();
    return this._unwrap(
      this._http.get<ApiEnvelope<Delivery[]>>(
        `/organizations/${organizationId}/webhooks/deliveries`,
        { params },
      ),
    );
  }

  /**
   * Requeues a webhook delivery.
   * @param organizationId Organization identifier.
   * @param deliveryId Delivery identifier.
   */
  public replay(
    organizationId: string,
    deliveryId: string,
  ): Observable<{ replayed: boolean; deliveryId: string }> {
    return this._unwrap(
      this._http.post<ApiEnvelope<{ replayed: boolean; deliveryId: string }>>(
        `/organizations/${organizationId}/webhooks/deliveries/${deliveryId}/replay`,
        {},
      ),
    );
  }

  /**
   * Lists incidents in an organization.
   * @param organizationId Organization identifier.
   */
  public incidents(organizationId: string): Observable<Incident[]> {
    return this._unwrap(
      this._http.get<ApiEnvelope<Incident[]>>(`/organizations/${organizationId}/incidents`),
    );
  }

  /**
   * Generates a summary for an incident.
   * @param organizationId Organization identifier.
   * @param incidentId Incident identifier.
   */
  public summarize(organizationId: string, incidentId: string): Observable<IncidentSummary> {
    return this._unwrap(
      this._http.post<ApiEnvelope<IncidentSummary>>(
        `/organizations/${organizationId}/incidents/${incidentId}/summarize`,
        {},
      ),
    );
  }

  /**
   * Sends a signed webhook payload.
   * @param endpointId Target endpoint identifier.
   * @param secret HMAC secret.
   * @param eventType Event type header.
   * @param payload JSON payload.
   * @param idempotencyKey Unique idempotency key.
   */
  public ingest(
    endpointId: string,
    secret: string,
    eventType: string,
    payload: unknown,
    idempotencyKey: string,
  ): Observable<{ accepted: boolean; duplicate: boolean; eventId: string }> {
    const encoder = new TextEncoder();
    const rawPayload = JSON.stringify(payload);
    const importedKey = crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );

    return from(importedKey).pipe(
      switchMap(async (hmacKey) => {
        const bytes = await crypto.subtle.sign('HMAC', hmacKey, encoder.encode(rawPayload));
        return Array.from(new Uint8Array(bytes))
          .map((byte) => byte.toString(16).padStart(2, '0'))
          .join('');
      }),
      switchMap((signature) =>
        this._unwrap(
          this._http.post<ApiEnvelope<{ accepted: boolean; duplicate: boolean; eventId: string }>>(
            `/api/webhooks/ingest/${endpointId}`,
            payload,
            {
              headers: {
                'X-Webhook-Signature': `sha256=${signature}`,
                'X-Idempotency-Key': idempotencyKey,
                'X-Webhook-Event-Type': eventType,
              },
            },
          ),
        ),
      ),
    );
  }

  //#endregion

  //#region Private methods

  /** Extracts response data from the standard API envelope. */
  private _unwrap<T>(request: Observable<ApiEnvelope<T>>): Observable<T> {
    return request.pipe(map((response) => response.data));
  }

  //#endregion
}
