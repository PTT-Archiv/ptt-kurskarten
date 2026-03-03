import { Component, ElementRef, EventEmitter, Input, OnChanges, Output, QueryList, SimpleChanges, ViewChildren } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { faArrowsLeftRight, faLocationCrosshairs, faXmark } from '@fortawesome/free-solid-svg-icons';
import type { TimeHHMM } from '@ptt-kurskarten/shared';

@Component({
  selector: 'app-viewer-route-planner-overlay',
  standalone: true,
  imports: [TranslocoPipe, FaIconComponent],
  template: `
    <div
      class="planner-card"
      [class.compact]="variant === 'compact'"
      (focusin)="plannerFocus.emit(true)"
      (focusout)="plannerFocus.emit(false)"
      (mouseenter)="plannerHover.emit(true)"
      (mouseleave)="plannerHover.emit(false)"
    >
      <div class="route-core">
        <label class="field minimal typeahead">
          <span>{{ 'label.from' | transloco }}</span>
          <div class="typeahead-input">
            <div class="input-shell" [style.--clear-left.px]="clearButtonLeft(fromQuery)">
              <input
                type="text"
                [value]="fromQuery"
                (input)="onFromInput($any($event.target).value)"
                (focus)="onFromFocus()"
                (blur)="onFromBlur()"
                (keydown)="onFromKeydown($event)"
                placeholder=" "
              />
              @if (fromQuery) {
                <button type="button" class="clear-btn" (mousedown)="clearFrom()">
                  <fa-icon [icon]="xmarkIcon"></fa-icon>
                </button>
              }
            </div>
            <button
              type="button"
              class="pick-btn"
              [class.pulsing]="pickMode === 'from'"
              (click)="pickFrom.emit()"
              aria-label="Pick from map"
              data-tooltip="Auf der Karte wählen"
            >
              <fa-icon [icon]="pickIcon"></fa-icon>
            </button>
          </div>
          @if (fromOpen && filteredFrom().length) {
            <div class="typeahead-list">
              @for (node of filteredFrom(); track node.id; let i = $index) {
                <button
                  type="button"
                  [class.active]="i === fromActiveIndex"
                  (mousedown)="selectFrom(node)"
                  (mouseenter)="setFromActiveIndex(i)"
                  #fromOption
                >
                  {{ node.name }}
                </button>
              }
            </div>
          }
        </label>
        <button class="swap-btn" type="button" (click)="swap.emit()">
          <fa-icon class="swap-icon" [icon]="swapIcon"></fa-icon>
        </button>
        <label class="field minimal typeahead">
          <span>{{ 'label.to' | transloco }}</span>
          <div class="typeahead-input">
            <div class="input-shell" [style.--clear-left.px]="clearButtonLeft(toQuery)">
              <input
                type="text"
                [value]="toQuery"
                (input)="onToInput($any($event.target).value)"
                (focus)="onToFocus()"
                (blur)="onToBlur()"
                (keydown)="onToKeydown($event)"
                placeholder=" "
              />
              @if (toQuery) {
                <button type="button" class="clear-btn" (mousedown)="clearTo()">
                  <fa-icon [icon]="xmarkIcon"></fa-icon>
                </button>
              }
            </div>
            <button
              type="button"
              class="pick-btn"
              [class.pulsing]="pickMode === 'to'"
              (click)="pickTo.emit()"
              aria-label="Pick to map"
              data-tooltip="Auf der Karte wählen"
            >
              <fa-icon [icon]="pickIcon"></fa-icon>
            </button>
          </div>
          @if (toOpen && filteredTo().length) {
            <div class="typeahead-list">
              @for (node of filteredTo(); track node.id; let i = $index) {
                <button
                  type="button"
                  [class.active]="i === toActiveIndex"
                  (mousedown)="selectTo(node)"
                  (mouseenter)="setToActiveIndex(i)"
                  #toOption
                >
                  {{ node.name }}
                </button>
              }
            </div>
          }
        </label>
      </div>
      <div class="planner-row">
        @if (showTime) {
        <label class="field time-field">
          <span>{{ 'label.departure' | transloco }}</span>
          <div class="time-picker">
            <div class="time-segment">
              <span class="time-label">hr</span>
              <input
                class="time-input"
                type="text"
                inputmode="numeric"
                list="hour-options"
                maxlength="2"
                [value]="hourDisplayValue"
                (focus)="onHourFocus()"
                (input)="onHourInput($any($event.target).value)"
                (blur)="onHourBlur()"
                (keydown.enter)="onHourEnter($event)"
              />
              <datalist id="hour-options">
                @for (h of hours; track h) {
                  <option [value]="h"></option>
                }
              </datalist>
            </div>
            <div class="time-segment">
              <span class="time-label">min</span>
              <input
                class="time-input"
                type="text"
                inputmode="numeric"
                list="minute-options"
                maxlength="2"
                [value]="minuteDisplayValue"
                (focus)="onMinuteFocus()"
                (input)="onMinuteInput($any($event.target).value)"
                (blur)="onMinuteBlur()"
                (keydown.enter)="onMinuteEnter($event)"
              />
              <datalist id="minute-options">
                @for (m of minutes; track m) {
                  <option [value]="m"></option>
                }
              </datalist>
            </div>
          </div>
        </label>
        <div class="planner-actions">
          @if (canApplyTime) {
            <button type="button" class="action-btn" (click)="applyTime.emit()">
              {{ 'btn.apply' | transloco }}
            </button>
          }
          <button type="button" class="action-btn secondary" (click)="resetSearch.emit()">
            {{ 'viewer.resetSearch' | transloco }}
          </button>
        </div>
        }
      </div>
    </div>
  `,
  styles: [
    `
      .planner-card {
        background: #000000;
        border: 2px solid #ffffff;
        color: #ffffff;
        border-radius: 18px;
        padding: 12px 14px;
        box-shadow: 6px 6px 0 rgba(0, 0, 0, 0.25);
        display: grid;
        gap: 10px;
        transition: transform 160ms ease-out, box-shadow 160ms ease-out;
      }

      .planner-card:hover,
      .planner-card:focus-within {
        transform: translateY(-2px);
        box-shadow: 8px 8px 0 rgba(0, 0, 0, 0.25);
      }

      .route-core {
        position: relative;
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
        gap: 16px;
        align-items: end;
      }

      .planner-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: 10px;
        align-items: end;
      }

      .planner-row:last-child {
        grid-template-columns: minmax(0, 1fr) auto;
      }

      .planner-actions {
        display: flex;
        gap: 8px;
        align-items: center;
      }

      .field {
        display: grid;
        gap: 6px;
        font-size: 12px;
      }

      .field select,
      .field input {
        border: 2px solid #ffffff;
        border-radius: 14px;
        padding: 8px 10px;
        background: #000000;
        color: #ffffff;
        width: 100%;
        min-width: 0;
        box-sizing: border-box;
        box-shadow: 4px 4px 0 rgba(0, 0, 0, 0.25);
      }

      .field input:focus,
      .field select:focus,
      .time-input:focus,
      .typeahead-input input:focus,
      .swap-btn:focus,
      .swap-btn:focus-visible,
      .clear-btn:focus,
      .clear-btn:focus-visible,
      .pick-btn:focus,
      .pick-btn:focus-visible {
        outline: none;
        box-shadow: none;
      }

      .field.minimal select {
        display: none;
      }

      .field.minimal span {
        font-size: 12px;
        color: #cfcfcf;
      }

      .time-field {
        justify-self: center;
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
      }

      .swap-btn {
        position: relative;
        background: #141414;
        border: 2px solid #ffffff;
        color: #ffffff;
        border-radius: 999px;
        height: 56px;
        width: 56px;
        padding: 0;
        cursor: pointer;
        font-weight: 600;
        font-size: 22px;
        line-height: 1;
        display: grid;
        place-items: center;
        box-shadow: none;
      }

      .swap-btn:hover,
      .swap-btn:focus-visible {
        background: #ffffff;
        color: #141414;
      }

      .swap-icon {
        display: block;
        line-height: 1;
        transform: translateY(-1px);
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

      .action-btn[disabled] {
        opacity: 0.6;
        cursor: not-allowed;
      }

      .action-btn.secondary {
        background: #141414;
      }

      .action-btn.secondary:hover,
      .action-btn.secondary:focus-visible {
        background: #ffffff;
        color: #141414;
      }

      .planner-card.compact {
        padding: 10px 12px;
      }

      .planner-card.compact .route-core,
      .planner-card.compact .planner-row {
        gap: 8px;
      }

      .planner-card.compact .field select,
      .planner-card.compact .field input {
        padding: 6px 8px;
      }

      .planner-card.compact .field.minimal select {
        font-size: 16px;
      }

      .planner-card.compact .time-input {
        padding: 8px 6px;
        font-size: 15px;
      }

      .planner-card.compact .action-btn,
      .planner-card.compact .swap-btn {
        height: 36px;
      }

      .typeahead {
        position: relative;
      }

      .typeahead-input {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: center;
        gap: 6px;
      }

      .input-shell {
        position: relative;
        width: 100%;
      }

      .typeahead-input input {
        border: none;
        border-bottom: 2px solid #ffffff;
        border-radius: 0;
        padding: 4px 24px 6px 2px;
        background: transparent;
        font-size: 22px;
        font-weight: 600;
        box-shadow: none;
        width: 100%;
      }

      .typeahead-input input::placeholder {
        color: #c2c2c2;
      }

      .clear-btn {
        position: absolute;
        left: var(--clear-left, 8px);
        top: 45%;
        transform: translateY(-50%);
        border: none;
        background: transparent;
        color: #d0d0d0;
        font-size: 18px;
        line-height: 1;
        height: 20px;
        width: 20px;
        display: grid;
        place-items: center;
        cursor: pointer;
        padding: 0;
      }

      .pick-btn {
        position: relative;
        border: 2px solid #ffffff;
        background: #141414;
        color: #ffffff;
        font-size: 14px;
        width: 22px;
        height: 22px;
        border-radius: 50%;
        line-height: 1;
        cursor: pointer;
        display: grid;
        place-items: center;
        box-shadow: none;
      }

      .pick-btn:hover,
      .pick-btn:focus-visible {
        background: #ffffff;
        color: #141414;
      }

      .pick-btn.pulsing {
        animation: pickPulse 1.2s ease-in-out infinite;
      }

      @keyframes pickPulse {
        0% {
          transform: scale(1);
        }
        50% {
          transform: scale(1.12);
        }
        100% {
          transform: scale(1);
        }
      }

      .pick-btn::after {
        content: attr(data-tooltip);
        position: absolute;
        right: 28px;
        top: 50%;
        transform: translateY(-50%);
        background: #000000;
        border: 2px solid #ffffff;
        color: #ffffff;
        border-radius: 10px;
        padding: 4px 8px;
        font-size: 11px;
        white-space: nowrap;
        opacity: 0;
        pointer-events: none;
        box-shadow: 2px 2px 0 rgba(0, 0, 0, 0.2);
        transition: opacity 120ms ease-out;
      }

      .pick-btn:hover::after,
      .pick-btn:focus-visible::after {
        opacity: 1;
      }

      .typeahead-list {
        position: absolute;
        top: calc(100% + 6px);
        left: 0;
        right: 0;
        background: #000000;
        border: 2px solid #ffffff;
        color: #ffffff;
        border-radius: 14px;
        box-shadow: 6px 6px 0 rgba(0, 0, 0, 0.25);
        padding: 6px 0;
        display: grid;
        gap: 2px;
        max-height: 240px;
        overflow-y: auto;
        scroll-behavior: smooth;
        z-index: 10;
      }

      .typeahead-list button {
        border: none;
        background: transparent;
        text-align: left;
        padding: 8px 12px;
        font-size: 16px;
        color: #ffffff;
        cursor: pointer;
      }

      .typeahead-list button.active,
      .typeahead-list button:hover {
        background: #ffffff;
        color: #141414;
        font-weight: 600;
      }

      .planner-card.compact .typeahead-input input {
        font-size: 16px;
      }

      @media (max-width: 900px) {
        .route-core {
          grid-template-columns: minmax(0, 1fr);
        }

        .planner-row {
          grid-template-columns: minmax(0, 1fr);
        }

        .swap-btn {
          position: static;
          width: 100%;
          height: 44px;
        }

        .time-field {
          width: 100%;
        }
      }
    `
  ]
})
export class ViewerRoutePlannerOverlayComponent implements OnChanges {
  readonly xmarkIcon = faXmark;
  readonly pickIcon = faLocationCrosshairs;
  readonly swapIcon = faArrowsLeftRight;

  @Input() variant: 'full' | 'compact' = 'full';
  @Input({ required: true }) nodes: Array<{ id: string; name: string }> = [];
  @Input() nodeAliases: Record<string, string[]> = {};
  @Input() fromId = '';
  @Input() toId = '';
  @Input() departTime: TimeHHMM = '08:00';
  @Input() showTime = false;
  @Input() canApplyTime = false;
  @Input() searching = false;
  @Input() pickMode: 'from' | 'to' | null = null;
  @Output() fromIdChange = new EventEmitter<string>();
  @Output() toIdChange = new EventEmitter<string>();
  @Output() departTimeChange = new EventEmitter<TimeHHMM>();
  @Output() applyTime = new EventEmitter<void>();
  @Output() swap = new EventEmitter<void>();
  @Output() plannerFocus = new EventEmitter<boolean>();
  @Output() plannerHover = new EventEmitter<boolean>();
  @Output() fromPreviewChange = new EventEmitter<string>();
  @Output() toPreviewChange = new EventEmitter<string>();
  @Output() pickFrom = new EventEmitter<void>();
  @Output() pickTo = new EventEmitter<void>();
  @Output() resetSearch = new EventEmitter<void>();

  @ViewChildren('fromOption', { read: ElementRef }) fromOptions!: QueryList<ElementRef<HTMLElement>>;
  @ViewChildren('toOption', { read: ElementRef }) toOptions!: QueryList<ElementRef<HTMLElement>>;

  fromQuery = '';
  toQuery = '';
  fromOpen = false;
  toOpen = false;
  fromActiveIndex = 0;
  toActiveIndex = 0;
  private hourDraft = '';
  private minuteDraft = '';
  private editingHour = false;
  private editingMinute = false;

  hours = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
  minutes = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0'));

  get hourValue(): string {
    return this.departTime?.split(':')[0] ?? '00';
  }

  get minuteValue(): string {
    return this.departTime?.split(':')[1] ?? '00';
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
    if (this.canApplyTime) {
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
    if (this.canApplyTime) {
      this.applyTime.emit();
    }
  }

  private normalizeNumber(value: string, max: number): string {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return '00';
    }
    const clamped = Math.max(0, Math.min(max, Math.floor(parsed)));
    return clamped.toString().padStart(2, '0');
  }

  ngOnChanges(changes: SimpleChanges): void {
    if ((changes['fromId'] || changes['nodes']) && !this.fromOpen) {
      this.fromQuery = this.nameForId(this.fromId);
    }
    if ((changes['toId'] || changes['nodes']) && !this.toOpen) {
      this.toQuery = this.nameForId(this.toId);
    }
    if (changes['departTime']) {
      if (!this.editingHour) {
        this.hourDraft = this.hourValue;
      }
      if (!this.editingMinute) {
        this.minuteDraft = this.minuteValue;
      }
    }
  }

  onFromInput(value: string): void {
    this.fromQuery = value;
    this.fromOpen = true;
    this.fromActiveIndex = 0;
    this.emitFromPreview();
    const match = this.matchByName(value);
    if (match) {
      this.fromIdChange.emit(match.id);
    } else {
      this.fromIdChange.emit('');
    }
  }

  onToInput(value: string): void {
    this.toQuery = value;
    this.toOpen = true;
    this.toActiveIndex = 0;
    this.emitToPreview();
    const match = this.matchByName(value);
    if (match) {
      this.toIdChange.emit(match.id);
    } else {
      this.toIdChange.emit('');
    }
  }

  selectFrom(node: { id: string; name: string }): void {
    this.fromQuery = node.name;
    this.fromIdChange.emit(node.id);
    this.fromOpen = false;
  }

  selectTo(node: { id: string; name: string }): void {
    this.toQuery = node.name;
    this.toIdChange.emit(node.id);
    this.toOpen = false;
  }

  clearFrom(): void {
    this.fromQuery = '';
    this.fromIdChange.emit('');
    this.fromOpen = false;
  }

  clearTo(): void {
    this.toQuery = '';
    this.toIdChange.emit('');
    this.toOpen = false;
  }

  onFromFocus(): void {
    this.fromOpen = true;
    this.fromActiveIndex = 0;
    this.scrollFromActive();
    this.emitFromPreview();
  }

  onToFocus(): void {
    this.toOpen = true;
    this.toActiveIndex = 0;
    this.scrollToActive();
    this.emitToPreview();
  }

  onFromBlur(): void {
    setTimeout(() => {
      this.fromOpen = false;
      this.fromPreviewChange.emit('');
    }, 120);
  }

  onToBlur(): void {
    setTimeout(() => {
      this.toOpen = false;
      this.toPreviewChange.emit('');
    }, 120);
  }

  setFromActiveIndex(index: number): void {
    this.fromActiveIndex = index;
    this.emitFromPreview();
  }

  setToActiveIndex(index: number): void {
    this.toActiveIndex = index;
    this.emitToPreview();
  }

  onFromKeydown(event: KeyboardEvent): void {
    if (!this.fromOpen) {
      this.fromOpen = true;
    }
    const list = this.filteredFrom();
    if (!list.length) {
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      event.stopPropagation();
      this.fromActiveIndex = (this.fromActiveIndex + 1) % list.length;
      this.scrollFromActive();
      this.emitFromPreview();
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      this.fromActiveIndex = (this.fromActiveIndex - 1 + list.length) % list.length;
      this.scrollFromActive();
      this.emitFromPreview();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const node = list[this.fromActiveIndex];
      if (node) {
        this.selectFrom(node);
      }
    }
  }

  onToKeydown(event: KeyboardEvent): void {
    if (!this.toOpen) {
      this.toOpen = true;
    }
    const list = this.filteredTo();
    if (!list.length) {
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      event.stopPropagation();
      this.toActiveIndex = (this.toActiveIndex + 1) % list.length;
      this.scrollToActive();
      this.emitToPreview();
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      this.toActiveIndex = (this.toActiveIndex - 1 + list.length) % list.length;
      this.scrollToActive();
      this.emitToPreview();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const node = list[this.toActiveIndex];
      if (node) {
        this.selectTo(node);
      }
    }
  }

  filteredFrom(): Array<{ id: string; name: string }> {
    return this.filterNodes(this.fromQuery);
  }

  filteredTo(): Array<{ id: string; name: string }> {
    return this.filterNodes(this.toQuery);
  }

  private filterNodes(query: string): Array<{ id: string; name: string }> {
    const q = this.normalizeSearch(query);
    const list = this.nodes ?? [];
    if (!q) {
      return list.slice(0, 8);
    }
    return list
      .filter((node) => this.getSearchTerms(node).some((term) => term.includes(q)))
      .slice(0, 8);
  }

  private matchByName(value: string): { id: string; name: string } | null {
    const v = this.normalizeSearch(value);
    if (!v) {
      return null;
    }
    return this.nodes.find((node) => this.getSearchTerms(node).some((term) => term === v)) ?? null;
  }

  private getSearchTerms(node: { id: string; name: string }): string[] {
    const canonical = this.normalizeSearch(node.name);
    const aliases = (this.nodeAliases?.[node.id] ?? []).map((alias) => this.normalizeSearch(alias)).filter(Boolean);
    return [canonical, ...aliases];
  }

  private normalizeSearch(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[’']/g, '')
      .toLowerCase()
      .trim();
  }

  private normalizeDraft(value: string): string {
    return value.replace(/\D/g, '').slice(0, 2);
  }

  clearButtonLeft(value: string): number {
    const text = value ?? '';
    const fontSize = this.variant === 'compact' ? 16 : 22;
    const textWidth = this.measureTextWidth(text, fontSize);
    const basePadding = 6;
    const left = basePadding + textWidth + 2;
    return Math.max(8, Math.min(left, 260));
  }

  private measureTextWidth(text: string, fontSize: number): number {
    const sample = text.length ? text : ' ';
    if (typeof document === 'undefined') {
      return sample.length * fontSize * 0.56;
    }
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return sample.length * fontSize * 0.56;
    }
    ctx.font = `600 ${fontSize}px system-ui`;
    return ctx.measureText(sample).width;
  }

  private commitHour(): void {
    const hour = this.normalizeNumber(this.hourDraft || this.hourValue, 23);
    this.hourDraft = hour;
    const next = `${hour}:${this.minuteValue}` as TimeHHMM;
    this.departTimeChange.emit(next);
  }

  private commitMinute(): void {
    const minute = this.normalizeNumber(this.minuteDraft || this.minuteValue, 59);
    this.minuteDraft = minute;
    const next = `${this.hourValue}:${minute}` as TimeHHMM;
    this.departTimeChange.emit(next);
  }

  private nameForId(id: string): string {
    if (!id) {
      return '';
    }
    return this.nodes.find((node) => node.id === id)?.name ?? '';
  }

  private scrollFromActive(): void {
    setTimeout(() => {
      const el = this.fromOptions?.get(this.fromActiveIndex)?.nativeElement;
      el?.scrollIntoView({ block: 'nearest' });
    }, 0);
  }

  private scrollToActive(): void {
    setTimeout(() => {
      const el = this.toOptions?.get(this.toActiveIndex)?.nativeElement;
      el?.scrollIntoView({ block: 'nearest' });
    }, 0);
  }

  private emitFromPreview(): void {
    const list = this.filteredFrom();
    const node = list[this.fromActiveIndex];
    this.fromPreviewChange.emit(node?.id ?? '');
  }

  private emitToPreview(): void {
    const list = this.filteredTo();
    const node = list[this.toActiveIndex];
    this.toPreviewChange.emit(node?.id ?? '');
  }
}
