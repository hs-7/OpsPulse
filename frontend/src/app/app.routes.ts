import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { AUTH_ROUTES } from './features/auth/auth.routes';
import { DASHBOARD_ROUTES } from './features/dashboard/dashboard.routes';

export const routes: Routes = [
  {
    path: 'auth',
    loadComponent: () =>
      import('./ui/layouts/auth-layout/auth-layout.component').then(
        (module) => module.AuthLayoutComponent,
      ),
    children: AUTH_ROUTES,
  },
  {
    path: 'app',
    canActivateChild: [authGuard],
    loadComponent: () =>
      import('./ui/layouts/app-layout/app-layout.component').then(
        (module) => module.AppLayoutComponent,
      ),
    children: DASHBOARD_ROUTES,
  },
  { path: '', pathMatch: 'full', redirectTo: 'app/dashboard' },
  { path: '**', redirectTo: 'app/dashboard' },
];
