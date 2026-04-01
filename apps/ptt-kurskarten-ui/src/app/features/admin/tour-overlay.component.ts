import { AfterViewInit, ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { TourService } from './tour.service';

type Rect = { x: number; y: number; width: number; height: number };

@Component({
  selector: 'app-tour-overlay',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(window:resize)': 'onResize()',
    '(window:scroll)': 'onScroll()'
  },
  template: `
    @if (tour.active() && step(); as current) {
      <div class="tour-overlay">
        <div
          class="spotlight"
          [style.display]="spotlightDisplay()"
          [style.top]="spotlightTop()"
          [style.left]="spotlightLeft()"
          [style.width]="spotlightWidth()"
          [style.height]="spotlightHeight()"
        ></div>
        <div
          class="tooltip"
          [style.display]="tooltipDisplay()"
          [style.top]="tooltipTop()"
          [style.left]="tooltipLeft()"
        >
          <div class="progress">Schritt {{ index() + 1 }} / {{ total() }}</div>
          <div class="title">{{ current.title }}</div>
          <div class="body">{{ current.body }}</div>
          <div class="actions">
            <button class="button button--secondary button--compact admin-tour-overlay__ghost-button" type="button" (click)="tour.back()" [disabled]="index() === 0">
              Zurück
            </button>
            <button class="button button--secondary button--compact admin-tour-overlay__ghost-button" type="button" (click)="tour.skipRequirement()" [disabled]="tour.canNext()">
              Überspringen
            </button>
            <button class="button button--primary button--compact admin-tour-overlay__primary-button" type="button" (click)="tour.next()" [disabled]="!tour.canNext()">
              Weiter
            </button>
            <button class="button button--secondary button--compact admin-tour-overlay__ghost-button" type="button" (click)="tour.exit()">Beenden</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [
    `
      :host {
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 100;
      }

      .tour-overlay {
        position: fixed;
        inset: 0;
        pointer-events: none;
      }

      .spotlight {
        position: fixed;
        border-radius: 10px;
        box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.45);
        border: 2px solid #ffff00;
        pointer-events: none;
      }

      .tooltip {
        position: fixed;
        max-width: 320px;
        background: #ffffff;
        border: 1px solid #141414;
        border-radius: 10px;
        padding: 12px;
        font-size: 13px;
        color: #141414;
        pointer-events: auto;
      }

      .progress {
        font-size: 11px;
        color: #3a3a3a;
        margin-bottom: 6px;
      }

      .title {
        font-weight: 700;
        margin-bottom: 6px;
      }

      .body {
        line-height: 1.4;
        margin-bottom: 10px;
      }

      .actions {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
      }

      .admin-tour-overlay__ghost-button,
      .admin-tour-overlay__primary-button {
        box-shadow: none;
      }
    `
  ]
})
export class TourOverlayComponent implements AfterViewInit {
  private static readonly HIDDEN_DISPLAY = 'none';
  private static readonly TOOLTIP_WIDTH_PX = 340;
  private static readonly TOOLTIP_HEIGHT_PX = 160;
  private static readonly TOOLTIP_GAP_PX = 12;
  readonly tour = inject(TourService);
  readonly step = this.tour.currentStep;
  readonly index = this.tour.index;
  readonly total = this.tour.total;
  private readonly targetRect = signal<Rect | null>(null);
  private readonly ready = signal(false);
  private readonly _sync = effect(() => {
    if (!this.ready()) {
      return;
    }
    this.step();
    this.updateTarget();
  });

  ngAfterViewInit(): void {
    this.ready.set(true);
    this.updateTarget();
  }

  onResize(): void {
    this.updateTarget();
  }

  onScroll(): void {
    this.updateTarget();
  }

  spotlightDisplay(): string {
    return this.targetRect() ? '' : TourOverlayComponent.HIDDEN_DISPLAY;
  }

  spotlightTop(): string {
    return this.targetRectCssValue((rect) => rect.y);
  }

  spotlightLeft(): string {
    return this.targetRectCssValue((rect) => rect.x);
  }

  spotlightWidth(): string {
    return this.targetRectCssValue((rect) => rect.width);
  }

  spotlightHeight(): string {
    return this.targetRectCssValue((rect) => rect.height);
  }

  tooltipDisplay(): string {
    return this.resolveTooltipPosition() ? '' : TourOverlayComponent.HIDDEN_DISPLAY;
  }

  tooltipTop(): string {
    const position = this.resolveTooltipPosition();
    return position ? `${position.top}px` : '';
  }

  tooltipLeft(): string {
    const position = this.resolveTooltipPosition();
    return position ? `${position.left}px` : '';
  }

  private targetRectCssValue(project: (rect: Rect) => number): string {
    const rect = this.targetRect();
    return rect ? `${project(rect)}px` : '';
  }

  private resolveTooltipPosition(): { top: number; left: number } | null {
    if (typeof window === 'undefined') {
      return null;
    }
    const rect = this.targetRect();
    if (!rect) {
      return null;
    }
    const placement = this.step()?.placement ?? 'bottom';
    const gap = TourOverlayComponent.TOOLTIP_GAP_PX;
    let top = rect.y + rect.height + gap;
    let left = rect.x;

    if (placement === 'top') {
      top = rect.y - gap - TourOverlayComponent.TOOLTIP_HEIGHT_PX;
    } else if (placement === 'left') {
      top = rect.y;
      left = rect.x - TourOverlayComponent.TOOLTIP_WIDTH_PX;
    } else if (placement === 'right') {
      top = rect.y;
      left = rect.x + rect.width + gap;
    }

    top = Math.max(gap, Math.min(window.innerHeight - TourOverlayComponent.TOOLTIP_HEIGHT_PX, top));
    left = Math.max(gap, Math.min(window.innerWidth - TourOverlayComponent.TOOLTIP_WIDTH_PX, left));

    return { top, left };
  }

  private updateTarget(): void {
    if (typeof document === 'undefined') {
      return;
    }
    const step = this.step();
    if (!step) {
      return;
    }
    const target = document.querySelector(step.targetSelector) as HTMLElement | null;
    if (!target) {
      requestAnimationFrame(() => this.updateTarget());
      return;
    }
    target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const rect = target.getBoundingClientRect();
    const padded: Rect = {
      x: rect.left - 6,
      y: rect.top - 6,
      width: rect.width + 12,
      height: rect.height + 12
    };
    this.targetRect.set(padded);
  }
}
