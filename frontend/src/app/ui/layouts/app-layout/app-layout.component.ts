import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { LoadingBarComponent } from '../../../shared/components/loading-bar/loading-bar.component';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [LoadingBarComponent, RouterOutlet],
  templateUrl: './app-layout.component.html',
  styleUrl: './app-layout.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppLayoutComponent {}
