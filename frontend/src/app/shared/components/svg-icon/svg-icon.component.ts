import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export const APP_ICON_NAMES = [
  'add',
  'check',
  'copy',
  'delivery',
  'incident',
  'logout',
  'overview',
  'pulse',
  'replay',
  'warning',
  'webhook',
] as const;

export type AppIconName = (typeof APP_ICON_NAMES)[number];

@Component({
  selector: 'app-svg-icon',
  standalone: true,
  template: `
    <svg
      [attr.role]="label() ? 'img' : null"
      [attr.aria-label]="label() || null"
      [attr.aria-hidden]="label() ? null : 'true'"
      focusable="false"
    >
      <use [attr.href]="'/icons/sprite.svg#' + name()"></use>
    </svg>
  `,
  styleUrl: './svg-icon.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SvgIconComponent {
  readonly name = input.required<AppIconName>();
  readonly label = input('');
}
