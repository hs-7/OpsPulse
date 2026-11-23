import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthSession } from '../../../../core/models/api.models';
import { ApiService } from '../../../../core/services/api.service';

@Component({
  standalone: true,
  imports: [FormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  //#region Public properties
  public name = '';
  public email = 'demo@opspulse.dev';
  public password = 'Demo1234!';
  public registerMode = false;
  public loading = false;
  public error = '';
  //#endregion

  //#region Private properties
  private readonly _api: ApiService;
  private readonly _router: Router;
  //#endregion

  /**
   * Creates the login component.
   * @param api API service.
   * @param router Application router.
   */
  constructor(api: ApiService, router: Router) {
    this._api = api;
    this._router = router;
  }

  //#region Public methods
  /** Submits login or registration credentials. */
  public submit(): void {
    this.loading = true;
    this.error = '';
    const result = this.registerMode
      ? this._api.register(this.name, this.email, this.password)
      : this._api.login(this.email, this.password);

    result.subscribe({
      next: (session: AuthSession) => this._storeSession(session),
      error: (error: { error?: { message?: string } }) => {
        this.loading = false;
        this.error = error.error?.message || 'Authentication failed';
      },
      complete: () => this.loading = false,
    });
  }
  //#endregion

  //#region Private methods
  private _storeSession(session: AuthSession): void {
    localStorage.setItem('opspulse_access', session.accessToken);
    localStorage.setItem('opspulse_refresh', session.refreshToken);
    void this._router.navigateByUrl('/');
  }
  //#endregion
}
