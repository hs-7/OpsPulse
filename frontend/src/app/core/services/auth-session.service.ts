import { HttpBackend, HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, finalize, map, shareReplay, tap, throwError } from 'rxjs';
import { ApiEnvelope, AuthSession } from '../models/api.models';

@Injectable({ providedIn: 'root' })
export class AuthSessionService {
  //#region Private properties

  private readonly _http: HttpClient;
  private _refreshRequest?: Observable<AuthSession>;

  //#endregion

  /**
   * Creates the session manager.
   * @param backend HTTP backend used to bypass the auth interceptor for refresh requests.
   */
  constructor(backend: HttpBackend) {
    this._http = new HttpClient(backend);
  }

  //#region Public properties

  /** Returns the current access token, if one is stored. */
  get accessToken(): string | null {
    return localStorage.getItem('opspulse_access');
  }

  /** Returns the current refresh token, if one is stored. */
  get refreshToken(): string | null {
    return localStorage.getItem('opspulse_refresh');
  }

  //#endregion

  //#region Public methods

  /**
   * Stores the access and refresh tokens for the authenticated session.
   * @param session Session returned by the authentication API.
   */
  storeSession(session: AuthSession): void {
    localStorage.setItem('opspulse_access', session.accessToken);
    localStorage.setItem('opspulse_refresh', session.refreshToken);
  }

  /** Removes locally stored authentication tokens. */
  clearSession(): void {
    localStorage.removeItem('opspulse_access');
    localStorage.removeItem('opspulse_refresh');
  }

  /** Revokes a refresh token through the interceptor-free authentication client. */
  revokeSession(refreshToken: string): Observable<{ loggedOut: boolean }> {
    return this._http
      .post<ApiEnvelope<{ loggedOut: boolean }>>('/auth/logout', { refreshToken })
      .pipe(map((response) => response.data));
  }

  /** Rotates the refresh token, sharing any refresh request already in flight. */
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

  //#endregion
}
