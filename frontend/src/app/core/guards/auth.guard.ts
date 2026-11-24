import { inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of, throwError } from 'rxjs';
import { AuthSessionService } from '../services/auth-session.service';

/** Protects application routes from unauthenticated visitors. */
export const authGuard: CanActivateFn = () => {
  const router = inject(Router);
  const session = inject(AuthSessionService);
  if (session.accessToken) return true;

  return session.refreshSession().pipe(
    map(() => true),
    catchError((error: unknown) => {
      if (
        error instanceof HttpErrorResponse &&
        (error.status === 401 || error.status === 403)
      ) {
        session.clearSession();
        return of(router.createUrlTree(['/auth/login']));
      }
      return throwError(() => error);
    }),
  );
};
