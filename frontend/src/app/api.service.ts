import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { from, map, Observable, switchMap } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ApiService {
  constructor(private http: HttpClient) {}

  private unwrap<T>(request: Observable<{ data: T }>): Observable<T> {
    return request.pipe(map((response) => response.data));
  }

  login(email: string, password: string) {
    return this.unwrap<{ accessToken: string; refreshToken: string }>(
      this.http.post<{ data: { accessToken: string; refreshToken: string } }>('/auth/login', { email, password }),
    );
  }

  register(name: string, email: string, password: string) {
    return this.unwrap<{ accessToken: string; refreshToken: string }>(
      this.http.post<{ data: { accessToken: string; refreshToken: string } }>('/auth/register', { name, email, password }),
    );
  }

  organizations() {
    return this.unwrap<any[]>(this.http.get<{ data: any[] }>('/organizations'));
  }

  projects(organizationId: string) {
    return this.unwrap<any[]>(this.http.get<{ data: any[] }>(`/organizations/${organizationId}/projects`));
  }

  webhooks(organizationId: string) {
    return this.unwrap<any[]>(this.http.get<{ data: any[] }>(`/organizations/${organizationId}/webhooks`));
  }

  createWebhook(organizationId: string, projectId: string, endpointUrl: string) {
    return this.unwrap<any>(this.http.post<{ data: any }>(
      `/organizations/${organizationId}/webhooks`,
      { projectId, endpointUrl },
    ));
  }

  ingest(endpointId: string, secret: string, eventType: string, payload: unknown, key: string) {
    const raw = JSON.stringify(payload);
    const encoder = new TextEncoder();
    const importedKey = crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    return from(importedKey).pipe(
      switchMap(async (hmacKey) => {
        const bytes = await crypto.subtle.sign('HMAC', hmacKey, encoder.encode(raw));
        const signature = Array.from(new Uint8Array(bytes))
          .map((byte) => byte.toString(16).padStart(2, '0'))
          .join('');
        return { signature };
      }),
      switchMap(({ signature }) => this.unwrap<any>(this.http.post<{ data: any }>(
        `/api/webhooks/ingest/${endpointId}`,
        payload,
        {
          headers: {
            'X-Webhook-Signature': `sha256=${signature}`,
            'X-Idempotency-Key': key,
            'X-Webhook-Event-Type': eventType,
          },
        },
      ))),
    );
  }

  deliveries(organizationId: string) {
    return this.unwrap<any[]>(this.http.get<{ data: any[] }>(`/organizations/${organizationId}/webhooks/deliveries`));
  }

  replay(organizationId: string, deliveryId: string) {
    return this.unwrap<any>(this.http.post<{ data: any }>(
      `/organizations/${organizationId}/webhooks/deliveries/${deliveryId}/replay`,
      {},
    ));
  }

  events(organizationId: string) {
    return this.unwrap<any[]>(this.http.get<{ data: any[] }>(`/organizations/${organizationId}/events`));
  }

  incidents(organizationId: string) {
    return this.unwrap<any[]>(this.http.get<{ data: any[] }>(`/organizations/${organizationId}/incidents`));
  }

  summarize(organizationId: string, incidentId: string) {
    return this.unwrap<any>(this.http.post<{ data: any }>(
      `/organizations/${organizationId}/incidents/${incidentId}/summarize`,
      {},
    ));
  }
}
