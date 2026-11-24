import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { ApiEnvelope, AuthSession } from '../../../core/models/api.models';

@Injectable({ providedIn: 'root' })
export class AuthApiService {
  //#region Private properties

  private readonly _http: HttpClient;

  //#endregion

  /** Creates the authentication API client. */
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
    return this._http
      .post<ApiEnvelope<AuthSession>>('/auth/login', { email, password }, { withCredentials: true })
      .pipe(map((response) => response.data));
  }

  /**
   * Registers a user and creates their first organization.
   * @param name User display name.
   * @param email User email.
   * @param password User password.
   */
  public register(name: string, email: string, password: string): Observable<AuthSession> {
    return this._http
      .post<ApiEnvelope<AuthSession>>(
        '/auth/register',
        { name, email, password },
        { withCredentials: true },
      )
      .pipe(map((response) => response.data));
  }

  //#endregion
}
