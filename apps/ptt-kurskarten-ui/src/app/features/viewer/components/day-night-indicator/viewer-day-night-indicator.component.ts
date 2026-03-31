import { ChangeDetectionStrategy, Component, input } from '@angular/core';

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
  moonCutFill: '#000',
} as const;

let nextClipPathId = 0;

@Component({
  selector: 'app-viewer-day-night-indicator',
  host: {
    '[style.--day-night-card-fill]': 'colors.cardFill',
    '[style.--day-night-card-stroke]': 'colors.cardStroke',
    '[style.--day-night-wave-stroke]': 'colors.waveStroke',
    '[style.--day-night-horizon-stroke]': 'colors.horizonStroke',
    '[style.--day-night-symbol-fill]': 'colors.symbolFill',
    '[style.--day-night-moon-cut-fill]': 'colors.moonCutFill',
  },
  templateUrl: './viewer-day-night-indicator.component.html',
  styleUrl: './viewer-day-night-indicator.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ViewerDayNightIndicatorComponent {
  private readonly rawMinuteFallback = 0;

  readonly minuteOfDayInput = input.required<number>({ alias: 'minuteOfDay' });

  readonly colors = DAY_NIGHT_INDICATOR_COLORS;
  readonly VIEWBOX_SIZE = VIEWBOX_SIZE;
  readonly CARD_INSET = CARD_INSET;
  readonly CARD_RADIUS = CARD_RADIUS;
  readonly HORIZON_Y = HORIZON_Y;
  readonly SYMBOL_X = SYMBOL_X;
  readonly waveRows = [26, 34, 54, 62];
  readonly wavePath = 'M -64 0 Q -48 -2.4 -32 0 T 0 0 T 32 0 T 64 0 T 96 0 T 128 0 T 160 0';
  readonly clipPathId = `day-night-indicator-clip-${nextClipPathId++}`;

  symbolY(): number {
    return HORIZON_Y - Math.sin(this.cycleAngle()) * SYMBOL_SWING;
  }

  symbolTransform(): string {
    return `translate(${this.formatNumber(SYMBOL_X)} ${this.formatNumber(this.symbolY())})`;
  }

  waveTransform(): string {
    const shift =
      (this.normalizedCycle() * WAVE_REPEAT_WIDTH * WAVE_SCROLL_CYCLES) % WAVE_REPEAT_WIDTH;
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
    const minuteOfDay = this.minuteOfDayInput();
    const minute = Number.isFinite(minuteOfDay) ? minuteOfDay : this.rawMinuteFallback;
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
