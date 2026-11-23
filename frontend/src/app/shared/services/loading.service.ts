import { computed, Injectable, Signal, signal, WritableSignal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class LoadingService {
  //#region Public properties

  readonly isLoading: Signal<boolean>;

  //#endregion

  //#region Private properties

  private readonly _activeRequests: WritableSignal<number>;

  //#endregion

  /** Creates the shared request counter. */
  constructor() {
    this._activeRequests = signal(0);
    this.isLoading = computed(() => this._activeRequests() > 0);
  }

  //#region Public methods

  /** Marks an HTTP request as active. */
  beginRequest(): void {
    this._activeRequests.update((count) => count + 1);
  }

  /** Marks an HTTP request as complete without allowing the counter to underflow. */
  endRequest(): void {
    this._activeRequests.update((count) => Math.max(0, count - 1));
  }

  //#endregion
}
