import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, finalize, map, shareReplay, tap } from 'rxjs';
import { ApiEnvelope, AuthSession } from '../models/api.models';

@Injectable({ providedIn: 'root' })
export class AuthSessionService {
  //#region Private properties

  private readonly _http: HttpClient;
  private _accessToken: string | null;
  private _refreshRequest?: Observable<AuthSession>;

  //#endregion

  /**
   * Creates the session manager.
   * @param http HTTP client used for cookie-backed session requests.
   */
  constructor(http: HttpClient) {
    this._http = http;
    this._accessToken = null;
    localStorage.removeItem('opspulse_access');
    localStorage.removeItem('opspulse_refresh');
  }

  //#region Public properties

  /** Returns the current access token held in memory. */
  get accessToken(): string | null {
    return this._accessToken;
  }

  //#endregion

  //#region Public methods

  /**
   * Stores the short-lived access token in memory.
   * @param session Session returned by the authentication API.
   */
  storeSession(session: AuthSession): void {
    this._accessToken = session.accessToken;
  }

  /** Removes the in-memory access token. */
  clearSession(): void {
    this._accessToken = null;
  }

  /** Revokes the cookie-backed refresh-token family. */
  revokeSession(): Observable<{ loggedOut: boolean }> {
    return this._http
      .post<ApiEnvelope<{ loggedOut: boolean }>>('/auth/logout', null, {
        withCredentials: true,
      })
      .pipe(map((response) => response.data));
  }

  /** Rotates the refresh token, sharing any refresh request already in flight. */
  refreshSession(): Observable<AuthSession> {
    if (!this._refreshRequest) {
      this._refreshRequest = this._http
        .post<ApiEnvelope<AuthSession>>('/auth/refresh', null, {
          withCredentials: true,
        })
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
