import { ChangeDetectionStrategy, Component, signal, WritableSignal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthSession } from '../../../../core/models/api.models';
import { ApiService } from '../../../../core/services/api.service';
import { AuthSessionService } from '../../../../core/services/auth-session.service';
import { SvgIconComponent } from '../../../../shared/components/svg-icon/svg-icon.component';

interface LoginFormControls {
  name: FormControl<string>;
  email: FormControl<string>;
  password: FormControl<string>;
}

type LoginField = keyof LoginFormControls;
type LoginFieldError = 'required' | 'email' | 'minlength';

@Component({
  standalone: true,
  imports: [ReactiveFormsModule, SvgIconComponent],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent {
  //#region Public properties

  readonly form: FormGroup<LoginFormControls>;
  readonly registerMode: WritableSignal<boolean>;
  readonly loading: WritableSignal<boolean>;
  readonly error: WritableSignal<string>;

  //#endregion

  //#region Private properties

  private readonly _api: ApiService;
  private readonly _router: Router;
  private readonly _session: AuthSessionService;

  //#endregion

  /**
   * Creates the login component.
   * @param api API service.
   * @param router Application router.
   * @param session Authentication session service.
   */
  constructor(api: ApiService, router: Router, session: AuthSessionService) {
    this._api = api;
    this._router = router;
    this._session = session;
    this.form = this._buildLoginForm();
    this.registerMode = signal(false);
    this.loading = signal(false);
    this.error = signal('');
  }

  //#region Public methods

  /** Indicates whether a touched field should display validation feedback. */
  public hasFieldError(field: LoginField, error?: LoginFieldError): boolean {
    const control = this.form.controls[field];
    return control.touched && (error ? control.hasError(error) : control.invalid);
  }

  /** Submits login or registration credentials. */
  public submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.error.set('');
    const { name, email, password } = this.form.getRawValue();
    const result = this.registerMode()
      ? this._api.register(name, email, password)
      : this._api.login(email, password);

    result.subscribe({
      next: (session: AuthSession) => this._storeSession(session),
      error: (error: { error?: { message?: string } }) => {
        this.loading.set(false);
        this.error.set(error.error?.message || 'Authentication failed');
      },
      complete: () => this.loading.set(false),
    });
  }

  /** Toggles between sign-in and account-registration modes. */
  public toggleMode(): void {
    const registerMode = !this.registerMode();
    const nameControl = this.form.controls.name;
    const passwordControl = this.form.controls.password;
    if (registerMode) {
      nameControl.setValidators(Validators.required);
      passwordControl.setValidators([Validators.required, Validators.minLength(10)]);
    } else {
      nameControl.clearValidators();
      passwordControl.setValidators(Validators.required);
    }
    nameControl.updateValueAndValidity();
    passwordControl.updateValueAndValidity();
    this.registerMode.set(registerMode);
  }

  //#endregion

  //#region Private methods

  /** Builds the typed form shared by sign-in and registration modes. */
  private _buildLoginForm(): FormGroup<LoginFormControls> {
    return new FormGroup<LoginFormControls>({
      name: new FormControl('', { nonNullable: true }),
      email: new FormControl('demo@opspulse.dev', {
        nonNullable: true,
        validators: [Validators.required, Validators.email],
      }),
      password: new FormControl('Demo1234!', {
        nonNullable: true,
        validators: [Validators.required],
      }),
    });
  }

  /**
   * Stores the authenticated session and opens the dashboard.
   * @param session Authenticated session.
   */
  private _storeSession(session: AuthSession): void {
    this._session.storeSession(session);
    void this._router.navigateByUrl('/app/dashboard');
  }

  //#endregion
}
