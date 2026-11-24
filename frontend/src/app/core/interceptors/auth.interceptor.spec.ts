import {
  HttpClient,
  provideHttpClient,
  withInterceptors,
  withXsrfConfiguration,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiEnvelope } from '../models/api.models';
import { AuthSessionService } from '../services/auth-session.service';
import { authInterceptor } from './auth.interceptor';

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpTestingController: HttpTestingController;
  let session: AuthSessionService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(
          withXsrfConfiguration({
            cookieName: 'XSRF-TOKEN',
            headerName: 'X-XSRF-TOKEN',
          }),
          withInterceptors([authInterceptor]),
        ),
        provideHttpClientTesting(),
      ],
    });
    document.cookie = 'XSRF-TOKEN=test-csrf-token; path=/';

    http = TestBed.inject(HttpClient);
    httpTestingController = TestBed.inject(HttpTestingController);
    session = TestBed.inject(AuthSessionService);
    session.storeSession({ accessToken: 'expired-access' });
  });

  afterEach(() => {
    httpTestingController.verify();
    session.clearSession();
    document.cookie = 'XSRF-TOKEN=; Max-Age=0; path=/';
  });

  it('shares refresh rotation across concurrent 401 responses and retries with the new token', () => {
    const results: string[] = [];
    http.get<ApiEnvelope<string>>('/organizations/org-1/projects').subscribe(({ data }) => {
      results.push(data);
    });
    http.get<ApiEnvelope<string>>('/organizations/org-1/projects').subscribe(({ data }) => {
      results.push(data);
    });

    const initialRequests = httpTestingController.match('/organizations/org-1/projects');
    expect(initialRequests).toHaveLength(2);
    for (const request of initialRequests) {
      expect(request.request.headers.get('Authorization')).toBe('Bearer expired-access');
      request.flush({ success: false, data: '' }, { status: 401, statusText: 'Unauthorized' });
    }

    const refreshRequest = httpTestingController.expectOne('/auth/refresh');
    expect(refreshRequest.request.body).toBeNull();
    expect(refreshRequest.request.withCredentials).toBe(true);
    expect(refreshRequest.request.headers.has('Authorization')).toBe(false);
    expect(refreshRequest.request.headers.get('X-XSRF-TOKEN')).toBe('test-csrf-token');
    refreshRequest.flush({
      success: true,
      data: { accessToken: 'new-access' },
    });

    const retriedRequests = httpTestingController.match('/organizations/org-1/projects');
    expect(retriedRequests).toHaveLength(2);
    for (const request of retriedRequests) {
      expect(request.request.headers.get('Authorization')).toBe('Bearer new-access');
      request.flush({ success: true, data: 'loaded' });
    }

    expect(results).toEqual(['loaded', 'loaded']);
    expect(session.accessToken).toBe('new-access');
  });

  it('keeps the session when a retried request fails for a non-auth reason', () => {
    const router = TestBed.inject(Router);
    const navigateByUrl = vi.spyOn(router, 'navigateByUrl');
    const errors: unknown[] = [];

    http.get('/organizations/org-1/projects').subscribe({
      error: (error: unknown) => errors.push(error),
    });

    httpTestingController
      .expectOne('/organizations/org-1/projects')
      .flush({ success: false, data: '' }, { status: 401, statusText: 'Unauthorized' });
    httpTestingController.expectOne('/auth/refresh').flush({
      success: true,
      data: { accessToken: 'new-access' },
    });
    httpTestingController
      .expectOne('/organizations/org-1/projects')
      .flush({ success: false, data: '' }, { status: 500, statusText: 'Server Error' });

    expect(errors[0]).toMatchObject({ status: 500 });
    expect(session.accessToken).toBe('new-access');
    expect(navigateByUrl).not.toHaveBeenCalled();
  });

  it('clears the session when the retried request is still unauthorized', () => {
    const router = TestBed.inject(Router);
    const navigateByUrl = vi.spyOn(router, 'navigateByUrl');
    const errors: unknown[] = [];

    http.get('/organizations/org-1/projects').subscribe({
      error: (error: unknown) => errors.push(error),
    });

    httpTestingController
      .expectOne('/organizations/org-1/projects')
      .flush({ success: false, data: '' }, { status: 401, statusText: 'Unauthorized' });
    httpTestingController.expectOne('/auth/refresh').flush({
      success: true,
      data: { accessToken: 'new-access' },
    });
    httpTestingController
      .expectOne('/organizations/org-1/projects')
      .flush({ success: false, data: '' }, { status: 401, statusText: 'Unauthorized' });

    expect(errors[0]).toMatchObject({ status: 401 });
    expect(session.accessToken).toBeNull();
    expect(navigateByUrl).toHaveBeenCalledWith('/auth/login');
  });
});
