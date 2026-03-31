import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import type { TimeHHMM } from '@ptt-kurskarten/shared';
import {
  DEFAULT_DEPART_TIME,
  HOURS_PER_DAY,
  MAX_HOUR_VALUE,
  MAX_MINUTE_VALUE,
  MINUTES_PER_HOUR,
  TIME_SEGMENT_LENGTH,
} from './viewer-route-planner.constants';

const HOURS = buildTimeOptions(HOURS_PER_DAY);
const MINUTES = buildTimeOptions(MINUTES_PER_HOUR);

let nextTimePickerId = 0;

@Component({
  selector: 'app-viewer-route-planner-time-controls',
  imports: [TranslocoPipe],
  templateUrl: './viewer-route-planner-time-controls.component.html',
  styleUrl: './viewer-route-planner-time-controls.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ViewerRoutePlannerTimeControlsComponent {
  readonly departTime = input<TimeHHMM>(DEFAULT_DEPART_TIME);
  readonly canApplyTime = input(false);
  readonly compact = input(false);

  readonly departTimeChange = output<TimeHHMM>();
  readonly applyTime = output<void>();
  readonly resetSearch = output<void>();

  readonly hours = HOURS;
  readonly minutes = MINUTES;
  readonly hourOptionsId = `planner-hour-options-${nextTimePickerId}`;
  readonly minuteOptionsId = `planner-minute-options-${nextTimePickerId++}`;

  readonly hourValue = computed(() => this.departTime().split(':')[0] ?? '00');
  readonly minuteValue = computed(() => this.departTime().split(':')[1] ?? '00');
  readonly hourDisplayValue = computed(() =>
    this.editingHour() ? this.hourDraft() : this.hourValue(),
  );
  readonly minuteDisplayValue = computed(() =>
    this.editingMinute() ? this.minuteDraft() : this.minuteValue(),
  );

  private readonly hourDraft = signal('');
  private readonly minuteDraft = signal('');
  private readonly editingHour = signal(false);
  private readonly editingMinute = signal(false);

  onHourFocus(): void {
    this.editingHour.set(true);
    this.hourDraft.set(this.hourValue());
  }

  onHourInput(event: Event): void {
    this.hourDraft.set(this.normalizeDraft(this.getInputValue(event)));
    if (this.hourDraft().length === TIME_SEGMENT_LENGTH) {
      this.commitHour();
    }
  }

  onHourBlur(): void {
    this.commitHour();
    this.editingHour.set(false);
  }

  onHourEnter(event: Event): void {
    event.preventDefault();
    this.commitHour();
    this.editingHour.set(false);
    if (this.canApplyTime()) {
      this.applyTime.emit();
    }
  }

  onMinuteFocus(): void {
    this.editingMinute.set(true);
    this.minuteDraft.set(this.minuteValue());
  }

  onMinuteInput(event: Event): void {
    this.minuteDraft.set(this.normalizeDraft(this.getInputValue(event)));
    if (this.minuteDraft().length === TIME_SEGMENT_LENGTH) {
      this.commitMinute();
    }
  }

  onMinuteBlur(): void {
    this.commitMinute();
    this.editingMinute.set(false);
  }

  onMinuteEnter(event: Event): void {
    event.preventDefault();
    this.commitMinute();
    this.editingMinute.set(false);
    if (this.canApplyTime()) {
      this.applyTime.emit();
    }
  }

  private getInputValue(event: Event): string {
    return (event.target as HTMLInputElement | null)?.value ?? '';
  }

  private normalizeDraft(value: string): string {
    return value.replace(/\D/g, '').slice(0, TIME_SEGMENT_LENGTH);
  }

  private normalizeNumber(value: string, max: number): string {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return '00';
    }

    const clamped = Math.max(0, Math.min(max, Math.floor(parsed)));
    return clamped.toString().padStart(TIME_SEGMENT_LENGTH, '0');
  }

  private commitHour(): void {
    const hour = this.normalizeNumber(this.hourDraft() || this.hourValue(), MAX_HOUR_VALUE);
    this.hourDraft.set(hour);
    this.departTimeChange.emit(`${hour}:${this.minuteValue()}` as TimeHHMM);
  }

  private commitMinute(): void {
    const minute = this.normalizeNumber(this.minuteDraft() || this.minuteValue(), MAX_MINUTE_VALUE);
    this.minuteDraft.set(minute);
    this.departTimeChange.emit(`${this.hourValue()}:${minute}` as TimeHHMM);
  }
}

function buildTimeOptions(count: number): string[] {
  return Array.from({ length: count }, (_, index) =>
    index.toString().padStart(TIME_SEGMENT_LENGTH, '0'),
  );
}
