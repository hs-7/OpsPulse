import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
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

  readonly isLoading = inject(LoadingService).isLoading;

  //#endregion
}
