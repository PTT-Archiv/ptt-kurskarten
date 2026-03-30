import { AfterViewInit, Component, HostListener, effect, inject, signal } from '@angular/core';
import { NgStyle } from '@angular/common';
import { TourService } from './tour.service';

type Rect = { x: number; y: number; width: number; height: number };

@Component({
  selector: 'app-tour-overlay',
  standalone: true,
  imports: [NgStyle],
  template: `
    @if (tour.active() && step(); as current) {
      <div class="tour-overlay">
        <div class="spotlight" [ngStyle]="spotlightStyle()"></div>
        <div class="tooltip" [ngStyle]="tooltipStyle()">
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

  @HostListener('window:resize')
  onResize(): void {
    this.updateTarget();
  }

  @HostListener('window:scroll')
  onScroll(): void {
    this.updateTarget();
  }

  spotlightStyle(): Record<string, string> {
    const rect = this.targetRect();
    if (!rect) {
      return { display: 'none' };
    }
    return {
      top: `${rect.y}px`,
      left: `${rect.x}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`
    };
  }

  tooltipStyle(): Record<string, string> {
    if (typeof window === 'undefined') {
      return { display: 'none' };
    }
    const rect = this.targetRect();
    if (!rect) {
      return { display: 'none' };
    }
    const placement = this.step()?.placement ?? 'bottom';
    const gap = 12;
    let top = rect.y + rect.height + gap;
    let left = rect.x;

    if (placement === 'top') {
      top = rect.y - gap - 120;
    } else if (placement === 'left') {
      top = rect.y;
      left = rect.x - 340;
    } else if (placement === 'right') {
      top = rect.y;
      left = rect.x + rect.width + gap;
    }

    top = Math.max(12, Math.min(window.innerHeight - 160, top));
    left = Math.max(12, Math.min(window.innerWidth - 340, left));

    return {
      top: `${top}px`,
      left: `${left}px`
    };
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
