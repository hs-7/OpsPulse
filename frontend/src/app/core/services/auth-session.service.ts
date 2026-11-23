import { HttpBackend, HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, finalize, map, shareReplay, tap, throwError } from 'rxjs';
import { ApiEnvelope, AuthSession } from '../models/api.models';

@Injectable({ providedIn: 'root' })
export class AuthSessionService {
  private readonly _http: HttpClient;
  private _refreshRequest?: Observable<AuthSession>;

  constructor(backend: HttpBackend) {
    this._http = new HttpClient(backend);
  }

  get accessToken(): string | null {
    return localStorage.getItem('opspulse_access');
  }

  get refreshToken(): string | null {
    return localStorage.getItem('opspulse_refresh');
  }

  storeSession(session: AuthSession): void {
    localStorage.setItem('opspulse_access', session.accessToken);
    localStorage.setItem('opspulse_refresh', session.refreshToken);
  }

  clearSession(): void {
    localStorage.removeItem('opspulse_access');
    localStorage.removeItem('opspulse_refresh');
  }

  refreshSession(): Observable<AuthSession> {
    if (!this._refreshRequest) {
      const refreshToken = this.refreshToken;
      if (!refreshToken) {
        return throwError(() => new Error('Cannot refresh a session without a refresh token.'));
      }

      this._refreshRequest = this._http
        .post<ApiEnvelope<AuthSession>>('/auth/refresh', { refreshToken })
        .pipe(
          map((response) => response.data),
          tap((session) => this.storeSession(session)),
          finalize(() => (this._refreshRequest = undefined)),
          shareReplay({ bufferSize: 1, refCount: false }),
        );
    }

    return this._refreshRequest;
  }
}
