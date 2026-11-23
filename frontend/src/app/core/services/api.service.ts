import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { from, map, Observable, switchMap } from 'rxjs';
import {
  ApiEnvelope,
  AuthSession,
  Delivery,
  Incident,
  IncidentSummary,
  Organization,
  Project,
  WebhookEndpoint,
} from '../models/api.models';

@Injectable({ providedIn: 'root' })
export class ApiService {
  //#region Private properties

  private readonly _http: HttpClient;

  //#endregion

  /**
   * Creates the API client.
   * @param http Angular HTTP client.
   */
  constructor(http: HttpClient) {
    this._http = http;
  }

  //#region Public methods

  /**
   * Logs in with an email and password.
   * @param email User email.
   * @param password User password.
   */
  public login(email: string, password: string): Observable<AuthSession> {
    return this.unwrap(
      this._http.post<ApiEnvelope<AuthSession>>('/auth/login', { email, password }),
    );
  }

  /**
   * Registers a user and creates their first organization.
   * @param name User display name.
   * @param email User email.
   * @param password User password.
   */
  public register(name: string, email: string, password: string): Observable<AuthSession> {
    return this.unwrap(
      this._http.post<ApiEnvelope<AuthSession>>('/auth/register', { name, email, password }),
    );
  }

  public organizations(): Observable<Organization[]> {
    return this.unwrap(this._http.get<ApiEnvelope<Organization[]>>('/organizations'));
  }

  public projects(organizationId: string): Observable<Project[]> {
    return this.unwrap(
      this._http.get<ApiEnvelope<Project[]>>(`/organizations/${organizationId}/projects`),
    );
  }

  public webhooks(organizationId: string): Observable<WebhookEndpoint[]> {
    return this.unwrap(
      this._http.get<ApiEnvelope<WebhookEndpoint[]>>(`/organizations/${organizationId}/webhooks`),
    );
  }

  public createWebhook(
    organizationId: string,
    projectId: string,
    endpointUrl: string,
  ): Observable<WebhookEndpoint> {
    return this.unwrap(
      this._http.post<ApiEnvelope<WebhookEndpoint>>(`/organizations/${organizationId}/webhooks`, {
        projectId,
        endpointUrl,
      }),
    );
  }

  public deliveries(organizationId: string): Observable<Delivery[]> {
    return this.unwrap(
      this._http.get<ApiEnvelope<Delivery[]>>(
        `/organizations/${organizationId}/webhooks/deliveries`,
      ),
    );
  }

  public replay(
    organizationId: string,
    deliveryId: string,
  ): Observable<{ replayed: boolean; deliveryId: string }> {
    return this.unwrap(
      this._http.post<ApiEnvelope<{ replayed: boolean; deliveryId: string }>>(
        `/organizations/${organizationId}/webhooks/deliveries/${deliveryId}/replay`,
        {},
      ),
    );
  }

  public incidents(organizationId: string): Observable<Incident[]> {
    return this.unwrap(
      this._http.get<ApiEnvelope<Incident[]>>(`/organizations/${organizationId}/incidents`),
    );
  }

  public summarize(organizationId: string, incidentId: string): Observable<IncidentSummary> {
    return this.unwrap(
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
        this.unwrap(
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

  private unwrap<T>(request: Observable<ApiEnvelope<T>>): Observable<T> {
    return request.pipe(map((response) => response.data));
  }

  //#endregion
}
