import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { AuthSession } from '../../../../core/models/api.models';
import { LoginComponent } from './login.component';
import { AuthApiService } from '../../data-access/auth-api.service';

describe('LoginComponent', () => {
  let fixture: ComponentFixture<LoginComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [provideRouter([]), provideHttpClient()],
    }).compileComponents();

    fixture = TestBed.createComponent(LoginComponent);
  });

  afterEach(() => {
    localStorage.removeItem('opspulse_access');
    localStorage.removeItem('opspulse_refresh');
    vi.restoreAllMocks();
  });

  it('creates the login view', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('submits credentials, stores the session, and navigates to the dashboard', () => {
    const session: AuthSession = {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    };
    const api = TestBed.inject(AuthApiService);
    const router = TestBed.inject(Router);
    const login = vi.spyOn(api, 'login').mockReturnValue(of(session));
    const navigateByUrl = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    fixture.componentInstance.form.controls.email.setValue('operator@example.com');
    fixture.componentInstance.form.controls.password.setValue('SecurePass123!');
    fixture.componentInstance.submit();

    expect(login).toHaveBeenCalledWith('operator@example.com', 'SecurePass123!');
    expect(localStorage.getItem('opspulse_access')).toBe(session.accessToken);
    expect(localStorage.getItem('opspulse_refresh')).toBe(session.refreshToken);
    expect(navigateByUrl).toHaveBeenCalledWith('/app/dashboard');
    expect(fixture.componentInstance.loading()).toBe(false);
  });

  it('requires a name only in registration mode', () => {
    const component = fixture.componentInstance;

    expect(component.form.controls.name.valid).toBe(true);
    expect(component.form.controls.password.valid).toBe(true);

    component.toggleMode();

    expect(component.form.controls.name.hasError('required')).toBe(true);
    expect(component.form.controls.password.hasError('minlength')).toBe(true);

    component.form.controls.name.setValue('Demo Operator');
    component.form.controls.password.setValue('SecurePass123!');
    expect(component.form.controls.name.valid).toBe(true);
    expect(component.form.controls.password.valid).toBe(true);

    component.toggleMode();
    expect(component.form.controls.name.valid).toBe(true);
    expect(component.form.controls.password.valid).toBe(true);
  });

  it('does not call the API with invalid credentials', () => {
    const api = TestBed.inject(AuthApiService);
    const login = vi.spyOn(api, 'login');
    const component = fixture.componentInstance;

    component.form.controls.email.setValue('not-an-email');
    component.submit();

    expect(login).not.toHaveBeenCalled();
    expect(component.form.controls.email.touched).toBe(true);
    expect(component.hasFieldError('email')).toBe(true);
    expect(component.hasFieldError('email', 'email')).toBe(true);
  });
});
