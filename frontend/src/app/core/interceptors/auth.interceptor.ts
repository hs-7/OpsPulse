import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthSessionService } from '../services/auth-session.service';

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const session = inject(AuthSessionService);
  const router = inject(Router);
  const token = session.accessToken;
  const isAuthRequest = /\/auth\/(login|register|refresh|logout)(?:$|\?)/.test(request.url);
  const authenticatedRequest = token && !isAuthRequest
    ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : request;

  return next(authenticatedRequest).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401 || isAuthRequest) {
        return throwError(() => error);
      }

      if (!session.accessToken) {
        session.clearSession();
        void router.navigateByUrl('/auth/login');
        return throwError(() => error);
      }

      return session.refreshSession().pipe(
        catchError((refreshError: unknown) => {
          session.clearSession();
          void router.navigateByUrl('/auth/login');
          return throwError(() => refreshError);
        }),
        switchMap((refreshedSession) =>
          next(
            request.clone({
              setHeaders: { Authorization: `Bearer ${refreshedSession.accessToken}` },
            }),
          ).pipe(
            catchError((retryError: unknown) => {
              if (retryError instanceof HttpErrorResponse && retryError.status === 401) {
                session.clearSession();
                void router.navigateByUrl('/auth/login');
              }
              return throwError(() => retryError);
            }),
          ),
        ),
      );
    }),
  );
};
