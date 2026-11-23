import { ChangeDetectionStrategy, Component, signal, WritableSignal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthSession } from '../../../../core/models/api.models';
import { ApiService } from '../../../../core/services/api.service';
import { BrandMarkComponent } from '../../../../shared/components/brand-mark/brand-mark.component';

interface LoginFormControls {
  name: FormControl<string>;
  email: FormControl<string>;
  password: FormControl<string>;
}

type LoginField = keyof LoginFormControls;
type LoginFieldError = 'required' | 'email' | 'minlength';

@Component({
  standalone: true,
  imports: [BrandMarkComponent, ReactiveFormsModule],
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

  //#endregion

  /**
   * Creates the login component.
   * @param api API service.
   * @param router Application router.
   */
  constructor(api: ApiService, router: Router) {
    this._api = api;
    this._router = router;
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

  private _storeSession(session: AuthSession): void {
    localStorage.setItem('opspulse_access', session.accessToken);
    localStorage.setItem('opspulse_refresh', session.refreshToken);
    void this._router.navigateByUrl('/app/dashboard');
  }

  //#endregion
}
