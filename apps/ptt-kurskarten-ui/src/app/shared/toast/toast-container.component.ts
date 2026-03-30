import { Component, inject } from '@angular/core';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { faXmark } from '@fortawesome/free-solid-svg-icons';
import { ToastService } from './toast.service';

@Component({
  selector: 'app-toast-container',
  standalone: true,
  imports: [FaIconComponent],
  template: `
    <div class="toast-container" aria-live="polite">
      @for (toast of toasts(); track toast.id) {
        <div class="toast-container__toast surface-card surface-card--inverse surface-card--status" [class]="toast.type">
          <div class="toast-container__accent"></div>
          <div class="toast-container__content">
            <div class="toast-container__title">{{ toast.title }}</div>
            @if (toast.message) {
              <div class="toast-container__message">{{ toast.message }}</div>
            }
          </div>
          <button class="button button--ghost button--pill toast-container__close-button" type="button" (click)="remove(toast.id)" aria-label="Close">
            <fa-icon [icon]="xmarkIcon"></fa-icon>
          </button>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .toast-container {
        position: fixed;
        top: 16px;
        right: 16px;
        display: grid;
        gap: 8px;
        z-index: 9999;
        pointer-events: none;
      }

      .toast-container__toast {
        display: grid;
        grid-template-columns: 6px 1fr auto;
        gap: 10px;
        align-items: center;
        padding: 10px 12px;
        min-width: 220px;
        max-width: 320px;
        pointer-events: auto;
        opacity: 0;
        transform: translateY(-6px);
        animation: toast-in 140ms ease-out forwards;
      }

      .toast-container__accent {
        width: 6px;
        height: 100%;
        background: #5f5f5f;
      }

      .toast-container__toast.success .toast-container__accent,
      .toast-container__toast.warning .toast-container__accent {
        background: #ffffff;
      }

      .toast-container__toast.error {
        border-width: 2px;
      }

      .toast-container__content {
        display: grid;
        gap: 4px;
      }

      .toast-container__title {
        font-weight: 700;
        font-size: 14px;
      }

      .toast-container__message {
        font-size: 12px;
        color: #d0d0d0;
      }

      .toast-container__close-button {
        font-size: 16px;
        line-height: 1;
        min-height: 32px;
        min-width: 32px;
        padding: 0;
        box-shadow: none;
      }

      @keyframes toast-in {
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
    `
  ]
})
export class ToastContainerComponent {
  private readonly toastService = inject(ToastService);
  readonly xmarkIcon = faXmark;

  toasts = this.toastService.toasts;

  remove(id: string): void {
    this.toastService.removeToast(id);
  }
}
