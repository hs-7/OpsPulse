import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../api.service';

@Component({
  standalone: true,
  imports: [FormsModule],
  template: `
    <main class="auth-shell">
      <section class="auth-card">
        <div class="brand"><span class="brand-mark">O</span><strong>OpsPulse</strong></div>
        <h1>{{ registerMode ? 'Create account' : 'Welcome back' }}</h1>
        <p class="muted">{{ registerMode ? 'Start a demo operations workspace.' : 'Sign in to your operations workspace.' }}</p>
        @if (registerMode) {
          <label>Name<input [(ngModel)]="name" name="name" placeholder="Demo Operator"></label>
        }
        <label>Email<input [(ngModel)]="email" name="email" type="email" placeholder="demo@opspulse.dev"></label>
        <label>Password<input [(ngModel)]="password" name="password" type="password" placeholder="Minimum 10 characters"></label>
        @if (error) { <p class="error">{{ error }}</p> }
        <button class="primary" (click)="submit()" [disabled]="loading">{{ loading ? 'Please wait...' : (registerMode ? 'Create account' : 'Sign in') }}</button>
        <button class="text-button" (click)="registerMode = !registerMode">
          {{ registerMode ? 'Already have an account? Sign in' : 'New to OpsPulse? Create account' }}
        </button>
      </section>
    </main>
  `,
  styles: [`
    .auth-shell { min-height:100vh; display:grid; place-items:center; background:radial-gradient(circle at 20% 10%,#e7efff,#f7f9fc 45%,#eef2f7); }
    .auth-card { width:min(400px, calc(100vw - 40px)); box-sizing:border-box; background:white; border:1px solid #e6eaf0; border-radius:16px; padding:32px; box-shadow:0 20px 60px rgba(31,42,68,.12); }
    .brand { display:flex; align-items:center; gap:10px; margin-bottom:24px; }
    .brand-mark { display:grid; place-items:center; width:34px; height:34px; border-radius:10px; color:white; background:#315efb; }
    h1 { margin:0 0 6px; } .muted { color:#6d7585; margin:0 0 24px; }
    label { display:block; color:#4b5565; font-size:13px; font-weight:700; margin-top:14px; }
    input { width:100%; box-sizing:border-box; margin-top:7px; padding:12px 14px; border:1px solid #dfe4ec; border-radius:8px; font:inherit; }
    button { font:inherit; } .primary { width:100%; margin-top:20px; padding:12px; border:0; border-radius:8px; background:#315efb; color:white; font-weight:700; }
    .text-button { width:100%; margin-top:12px; border:0; background:none; color:#315efb; cursor:pointer; }
    .error { color:#c83a47; background:#fff1f2; padding:8px 10px; border-radius:6px; }
  `],
})
export class LoginComponent {
  name = '';
  email = 'demo@opspulse.dev';
  password = 'Demo1234!';
  registerMode = false;
  loading = false;
  error = '';

  constructor(private api: ApiService, private router: Router) {}

  submit(): void {
    this.loading = true;
    this.error = '';
    const result = this.registerMode
      ? this.api.register(this.name, this.email, this.password)
      : this.api.login(this.email, this.password);
    result.subscribe({
      next: (session) => {
        localStorage.setItem('opspulse_access', session.accessToken);
        localStorage.setItem('opspulse_refresh', session.refreshToken);
        this.router.navigateByUrl('/');
      },
      error: (error) => {
        this.loading = false;
        this.error = error.error?.message || 'Authentication failed';
      },
      complete: () => this.loading = false,
    });
  }
}
