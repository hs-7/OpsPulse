import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/pages/login/login.component')
      .then((module) => module.LoginComponent),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./features/dashboard/pages/dashboard/dashboard.component')
      .then((module) => module.DashboardComponent),
  },
  { path: '**', redirectTo: '' },
];
