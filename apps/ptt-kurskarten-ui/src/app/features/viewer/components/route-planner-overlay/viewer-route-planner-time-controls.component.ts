import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import type { TimeHHMM } from '@ptt-kurskarten/shared';

let nextTimePickerId = 0;

@Component({
  selector: 'app-viewer-route-planner-time-controls',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="time-controls" [class.compact]="compact()">
      <label class="field time-field">
        <span>{{ 'label.departure' | transloco }}</span>
        <div class="time-picker">
          <div class="time-segment">
            <span class="time-label">hr</span>
            <input
              class="time-input"
              type="text"
              inputmode="numeric"
              [attr.list]="hourOptionsId"
              maxlength="2"
              [value]="hourDisplayValue"
              (focus)="onHourFocus()"
              (input)="onHourInput($any($event.target).value)"
              (blur)="onHourBlur()"
              (keydown.enter)="onHourEnter($event)"
            />
            <datalist [id]="hourOptionsId">
              @for (hour of hours; track hour) {
                <option [value]="hour"></option>
              }
            </datalist>
          </div>
          <div class="time-segment">
            <span class="time-label">min</span>
            <input
              class="time-input"
              type="text"
              inputmode="numeric"
              [attr.list]="minuteOptionsId"
              maxlength="2"
              [value]="minuteDisplayValue"
              (focus)="onMinuteFocus()"
              (input)="onMinuteInput($any($event.target).value)"
              (blur)="onMinuteBlur()"
              (keydown.enter)="onMinuteEnter($event)"
            />
            <datalist [id]="minuteOptionsId">
              @for (minute of minutes; track minute) {
                <option [value]="minute"></option>
              }
            </datalist>
          </div>
        </div>
      </label>
      <div class="planner-actions">
        @if (canApplyTime()) {
          <button type="button" class="action-btn" (click)="applyTime.emit()">
            {{ 'btn.apply' | transloco }}
          </button>
        }
        <button type="button" class="action-btn secondary" (click)="resetSearch.emit()">
          {{ 'viewer.resetSearch' | transloco }}
        </button>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .time-controls {
        display: grid;
        grid-template-columns: 240px auto;
        gap: 10px;
        align-items: end;
        justify-content: center;
      }

      .planner-actions {
        display: flex;
        gap: 8px;
        align-items: center;
        flex-wrap: wrap;
        row-gap: 8px;
      }

      .field {
        display: grid;
        gap: 6px;
        font-size: 12px;
      }

      .time-field {
        justify-self: stretch;
        width: 240px;
        text-align: center;
      }

      .time-picker {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }

      .time-segment {
        display: grid;
        gap: 6px;
      }

      .time-label {
        font-size: 11px;
        color: #cfcfcf;
      }

      .time-input {
        border: 2px solid #ffffff;
        border-radius: 14px;
        padding: 10px 8px;
        background: #000000;
        color: #ffffff;
        box-shadow: none;
        font-size: 16px;
        font-weight: 600;
        text-align: center;
        width: 100%;
        box-sizing: border-box;
      }

      .time-input:focus {
        outline: none;
        box-shadow: none;
      }

      .action-btn {
        background: #141414;
        border: 2px solid #ffffff;
        color: #ffffff;
        padding: 8px 14px;
        border-radius: 14px;
        font-weight: 600;
        cursor: pointer;
        height: 40px;
        box-shadow: none;
      }

      .action-btn:hover,
      .action-btn:focus-visible {
        background: #ffffff;
        color: #141414;
      }

      .action-btn.secondary {
        background: #141414;
      }

      .action-btn.secondary:hover,
      .action-btn.secondary:focus-visible {
        background: #ffffff;
        color: #141414;
      }

      .compact .time-input {
        padding: 8px 6px;
        font-size: 15px;
      }

      @media (max-width: 900px) {
        .time-controls {
          grid-template-columns: minmax(0, 1fr);
          justify-content: stretch;
        }

        .time-field {
          width: 100%;
        }
      }

      @media (max-width: 767px) {
        .planner-actions {
          display: grid;
          grid-template-columns: minmax(0, 1fr);
          width: 100%;
        }

        .planner-actions .action-btn {
          width: 100%;
          justify-content: center;
          min-width: 0;
        }

        .time-picker {
          gap: 8px;
        }

        .time-label {
          font-size: 11px;
        }

        .time-input,
        .compact .time-input {
          font-size: 14px;
          padding: 8px 6px;
        }
      }
    `
  ]
})
export class ViewerRoutePlannerTimeControlsComponent {
  readonly departTime = input<TimeHHMM>('08:00');
  readonly canApplyTime = input(false);
  readonly compact = input(false);

  readonly departTimeChange = output<TimeHHMM>();
  readonly applyTime = output<void>();
  readonly resetSearch = output<void>();

  readonly hours = Array.from({ length: 24 }, (_, index) => index.toString().padStart(2, '0'));
  readonly minutes = Array.from({ length: 60 }, (_, index) => index.toString().padStart(2, '0'));
  readonly hourOptionsId = `planner-hour-options-${nextTimePickerId}`;
  readonly minuteOptionsId = `planner-minute-options-${nextTimePickerId++}`;

  private hourDraft = '';
  private minuteDraft = '';
  private editingHour = false;
  private editingMinute = false;

  get hourValue(): string {
    return this.departTime().split(':')[0] ?? '00';
  }

  get minuteValue(): string {
    return this.departTime().split(':')[1] ?? '00';
  }

  get hourDisplayValue(): string {
    return this.editingHour ? this.hourDraft : this.hourValue;
  }

  get minuteDisplayValue(): string {
    return this.editingMinute ? this.minuteDraft : this.minuteValue;
  }

  onHourFocus(): void {
    this.editingHour = true;
    this.hourDraft = this.hourValue;
  }

  onHourInput(value: string): void {
    this.hourDraft = this.normalizeDraft(value);
    if (this.hourDraft.length === 2) {
      this.commitHour();
    }
  }

  onHourBlur(): void {
    this.commitHour();
    this.editingHour = false;
  }

  onHourEnter(event: Event): void {
    event.preventDefault();
    this.commitHour();
    this.editingHour = false;
    if (this.canApplyTime()) {
      this.applyTime.emit();
    }
  }

  onMinuteFocus(): void {
    this.editingMinute = true;
    this.minuteDraft = this.minuteValue;
  }

  onMinuteInput(value: string): void {
    this.minuteDraft = this.normalizeDraft(value);
    if (this.minuteDraft.length === 2) {
      this.commitMinute();
    }
  }

  onMinuteBlur(): void {
    this.commitMinute();
    this.editingMinute = false;
  }

  onMinuteEnter(event: Event): void {
    event.preventDefault();
    this.commitMinute();
    this.editingMinute = false;
    if (this.canApplyTime()) {
      this.applyTime.emit();
    }
  }

  private normalizeDraft(value: string): string {
    return value.replace(/\D/g, '').slice(0, 2);
  }

  private normalizeNumber(value: string, max: number): string {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return '00';
    }
    const clamped = Math.max(0, Math.min(max, Math.floor(parsed)));
    return clamped.toString().padStart(2, '0');
  }

  private commitHour(): void {
    const hour = this.normalizeNumber(this.hourDraft || this.hourValue, 23);
    this.hourDraft = hour;
    this.departTimeChange.emit(`${hour}:${this.minuteValue}` as TimeHHMM);
  }

  private commitMinute(): void {
    const minute = this.normalizeNumber(this.minuteDraft || this.minuteValue, 59);
    this.minuteDraft = minute;
    this.departTimeChange.emit(`${this.hourValue}:${minute}` as TimeHHMM);
  }
}
