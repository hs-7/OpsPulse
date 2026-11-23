import { HttpInterceptorFn } from '@angular/common/http';
import { finalize } from 'rxjs';
import { inject } from '@angular/core';
import { LoadingService } from '../../shared/services/loading.service';

export const loadingInterceptor: HttpInterceptorFn = (request, next) => {
  const loading = inject(LoadingService);
  loading.beginRequest();

  return next(request).pipe(finalize(() => loading.endRequest()));
};
