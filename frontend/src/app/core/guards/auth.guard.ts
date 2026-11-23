import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

/** Protects application routes from unauthenticated visitors. */
export const authGuard: CanActivateFn = () => {
  const router = inject(Router);
  const token = localStorage.getItem('opspulse_access');
  return token ? true : router.createUrlTree(['/login']);
};
