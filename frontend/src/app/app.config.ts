import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes),
    provideHttpClient(withInterceptors([
      (request, next) => {
        const token = localStorage.getItem('opspulse_access');
        return next(token
          ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
          : request);
      },
    ])),
  ]
};
