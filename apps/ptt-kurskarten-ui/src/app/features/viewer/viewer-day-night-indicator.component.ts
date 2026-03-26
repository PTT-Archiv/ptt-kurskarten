import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

const MINUTES_PER_DAY = 1440;
const VIEWBOX_SIZE = 88;
const CARD_INSET = 1;
const CARD_RADIUS = 16;
const HORIZON_Y = VIEWBOX_SIZE / 2;
const SYMBOL_X = VIEWBOX_SIZE / 2;
const SYMBOL_SWING = 14;
const WAVE_REPEAT_WIDTH = 64;
const WAVE_SCROLL_CYCLES = 8;
const DAY_NIGHT_INDICATOR_COLORS = {
  cardFill: '#000',
  cardStroke: 'transparent',
  waveStroke: 'rgba(255, 255, 255, 0.24)',
  horizonStroke: 'rgba(255, 255, 255, 0.94)',
  symbolFill: '#fff',
  moonCutFill: '#000'
} as const;

let nextClipPathId = 0;

@Component({
  selector: 'app-viewer-day-night-indicator',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[style.--day-night-card-fill]': 'colors.cardFill',
    '[style.--day-night-card-stroke]': 'colors.cardStroke',
    '[style.--day-night-wave-stroke]': 'colors.waveStroke',
    '[style.--day-night-horizon-stroke]': 'colors.horizonStroke',
    '[style.--day-night-symbol-fill]': 'colors.symbolFill',
    '[style.--day-night-moon-cut-fill]': 'colors.moonCutFill'
  },
  template: `
    <svg class="day-night-svg" viewBox="0 0 88 88" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <defs>
        <clipPath [attr.id]="clipPathId">
          <rect
            [attr.x]="CARD_INSET"
            [attr.y]="CARD_INSET"
            [attr.width]="VIEWBOX_SIZE - CARD_INSET * 2"
            [attr.height]="VIEWBOX_SIZE - CARD_INSET * 2"
            [attr.rx]="CARD_RADIUS"
          />
        </clipPath>
      </defs>

      <rect
        class="day-night-card"
        [attr.x]="CARD_INSET"
        [attr.y]="CARD_INSET"
        [attr.width]="VIEWBOX_SIZE - CARD_INSET * 2"
        [attr.height]="VIEWBOX_SIZE - CARD_INSET * 2"
        [attr.rx]="CARD_RADIUS"
      />

      <g [attr.clip-path]="'url(#' + clipPathId + ')'">
        <g class="day-night-waves" [attr.transform]="waveTransform()">
          @for (row of waveRows; track row) {
            <path class="day-night-wave" [attr.d]="wavePath" [attr.transform]="'translate(0 ' + row + ')'"></path>
          }
        </g>

        <line class="day-night-horizon" x1="10" [attr.y1]="HORIZON_Y" x2="78" [attr.y2]="HORIZON_Y"></line>

        <g
          class="day-night-symbol"
          [attr.transform]="symbolTransform()"
          [attr.data-symbol-x]="formatNumber(SYMBOL_X)"
          [attr.data-symbol-y]="formatNumber(symbolY())"
        >
          <g class="day-night-sun" [attr.opacity]="formatOpacity(sunOpacity())">
            <circle class="day-night-sun-core" r="6"></circle>
            <g class="day-night-rays" [attr.opacity]="formatOpacity(rayOpacity())">
              <line x1="0" y1="-10" x2="0" y2="-15"></line>
              <line x1="0" y1="10" x2="0" y2="15"></line>
              <line x1="-10" y1="0" x2="-15" y2="0"></line>
              <line x1="10" y1="0" x2="15" y2="0"></line>
              <line x1="-7.5" y1="-7.5" x2="-11.5" y2="-11.5"></line>
              <line x1="7.5" y1="-7.5" x2="11.5" y2="-11.5"></line>
              <line x1="-7.5" y1="7.5" x2="-11.5" y2="11.5"></line>
              <line x1="7.5" y1="7.5" x2="11.5" y2="11.5"></line>
            </g>
          </g>

          <g class="day-night-moon" [attr.opacity]="formatOpacity(moonOpacity())">
            <circle class="day-night-moon-core" r="6"></circle>
            <circle class="day-night-moon-cut" cx="3.2" cy="-1.4" r="6"></circle>
          </g>
        </g>
      </g>
    </svg>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        height: 100%;
        pointer-events: none;
      }

      .day-night-svg {
        display: block;
        width: 100%;
        height: 100%;
      }

      .day-night-card {
        fill: var(--day-night-card-fill);
        stroke: var(--day-night-card-stroke);
        stroke-width: 2;
      }

      .day-night-wave {
        fill: none;
        stroke: var(--day-night-wave-stroke);
        stroke-width: 1.1;
        stroke-linecap: round;
      }

      .day-night-horizon {
        stroke: var(--day-night-horizon-stroke);
        stroke-width: 1.6;
        stroke-linecap: round;
      }

      .day-night-sun-core,
      .day-night-moon-core {
        fill: var(--day-night-symbol-fill);
      }

      .day-night-rays line {
        stroke: var(--day-night-symbol-fill);
        stroke-width: 1.4;
        stroke-linecap: round;
      }

      .day-night-moon-cut {
        fill: var(--day-night-moon-cut-fill);
      }
    `
  ]
})
export class ViewerDayNightIndicatorComponent {
  private readonly rawMinuteFallback = 0;

  @Input({ required: true }) minuteOfDay = 0;

  readonly colors = DAY_NIGHT_INDICATOR_COLORS;
  readonly VIEWBOX_SIZE = VIEWBOX_SIZE;
  readonly CARD_INSET = CARD_INSET;
  readonly CARD_RADIUS = CARD_RADIUS;
  readonly HORIZON_Y = HORIZON_Y;
  readonly SYMBOL_X = SYMBOL_X;
  readonly waveRows = [26, 34, 54, 62];
  readonly wavePath =
    'M -64 0 Q -48 -2.4 -32 0 T 0 0 T 32 0 T 64 0 T 96 0 T 128 0 T 160 0';
  readonly clipPathId = `day-night-indicator-clip-${nextClipPathId++}`;

  symbolY(): number {
    return HORIZON_Y - Math.sin(this.cycleAngle()) * SYMBOL_SWING;
  }

  symbolTransform(): string {
    return `translate(${this.formatNumber(SYMBOL_X)} ${this.formatNumber(this.symbolY())})`;
  }

  waveTransform(): string {
    const shift = (this.normalizedCycle() * WAVE_REPEAT_WIDTH * WAVE_SCROLL_CYCLES) % WAVE_REPEAT_WIDTH;
    return `translate(${-shift.toFixed(2)} 0)`;
  }

  sunOpacity(): number {
    return 1 - smoothstep(39, 46, this.symbolY());
  }

  moonOpacity(): number {
    return smoothstep(42, 49, this.symbolY());
  }

  rayOpacity(): number {
    return 1 - smoothstep(39, 46, this.symbolY());
  }

  formatOpacity(value: number): string {
    return clamp(value, 0, 1).toFixed(3);
  }

  formatNumber(value: number): string {
    return value.toFixed(2);
  }

  private normalizedCycle(): number {
    const minute = Number.isFinite(this.minuteOfDay) ? this.minuteOfDay : this.rawMinuteFallback;
    return (((minute % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY) / MINUTES_PER_DAY;
  }

  private cycleAngle(): number {
    return this.normalizedCycle() * Math.PI * 2 - Math.PI / 2;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge0 === edge1) {
    return value >= edge1 ? 1 : 0;
  }
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}
