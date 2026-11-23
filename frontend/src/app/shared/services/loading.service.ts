import { computed, Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class LoadingService {
  //#region Public properties

  readonly isLoading = computed(() => this._activeRequests() > 0);

  //#endregion

  //#region Private properties

  private readonly _activeRequests = signal(0);

  //#endregion

  //#region Public methods

  beginRequest(): void {
    this._activeRequests.update((count) => count + 1);
  }

  endRequest(): void {
    this._activeRequests.update((count) => Math.max(0, count - 1));
  }

  //#endregion
}
