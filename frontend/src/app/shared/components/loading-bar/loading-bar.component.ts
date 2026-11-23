import { ChangeDetectionStrategy, Component, Signal } from '@angular/core';
import { LoadingService } from '../../services/loading.service';

@Component({
  selector: 'app-loading-bar',
  standalone: true,
  templateUrl: './loading-bar.component.html',
  styleUrl: './loading-bar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoadingBarComponent {
  //#region Public properties

  readonly isLoading: Signal<boolean>;

  //#endregion

  //#region Private properties

  private readonly _loading: LoadingService;

  //#endregion

  /**
   * Creates the loading indicator.
   * @param loading Shared loading state.
   */
  constructor(loading: LoadingService) {
    this._loading = loading;
    this.isLoading = this._loading.isLoading;
  }
}
