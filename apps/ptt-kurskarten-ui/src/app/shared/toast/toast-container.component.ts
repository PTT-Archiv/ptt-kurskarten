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
        <div class="toast" [class]="toast.type">
          <div class="accent"></div>
          <div class="content">
            <div class="title">{{ toast.title }}</div>
            @if (toast.message) {
              <div class="message">{{ toast.message }}</div>
            }
          </div>
          <button class="close" type="button" (click)="remove(toast.id)" aria-label="Close">
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

      .toast {
        display: grid;
        grid-template-columns: 6px 1fr auto;
        gap: 10px;
        align-items: center;
        background: var(--ptt-white);
        border: 1px solid var(--ptt-black);
        color: var(--ptt-black);
        padding: 10px 12px;
        min-width: 220px;
        max-width: 320px;
        pointer-events: auto;
        opacity: 0;
        transform: translateY(-6px);
        animation: toast-in 140ms ease-out forwards;
      }

      .toast .accent {
        width: 6px;
        height: 100%;
        background: #dcdcdc;
      }

      .toast.success .accent,
      .toast.warning .accent {
        background: var(--ptt-yellow);
      }

      .toast.error {
        border-width: 2px;
      }

      .title {
        font-weight: 700;
        font-size: 14px;
      }

      .message {
        font-size: 12px;
        color: #3a3a3a;
      }

      .close {
        background: transparent;
        border: none;
        font-size: 16px;
        line-height: 1;
        cursor: pointer;
        color: var(--ptt-black);
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
