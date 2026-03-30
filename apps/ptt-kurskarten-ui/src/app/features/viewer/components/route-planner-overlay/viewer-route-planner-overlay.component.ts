import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  OnChanges,
  QueryList,
  SimpleChanges,
  ViewChild,
  ViewChildren,
  inject,
  input,
  output
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { faArrowsLeftRight, faXmark } from '@fortawesome/free-solid-svg-icons';
import type { TimeHHMM } from '@ptt-kurskarten/shared';
import { ViewerRoutePlannerTimeControlsComponent } from './viewer-route-planner-time-controls.component';

@Component({
  selector: 'app-viewer-route-planner-overlay',
  imports: [TranslocoPipe, FaIconComponent, ViewerRoutePlannerTimeControlsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="planner-card surface-card surface-card--inverse surface-card--interactive"
      [class.compact]="variant() === 'compact'"
      (focusin)="plannerFocus.emit(true)"
      (focusout)="plannerFocus.emit(false)"
      (mouseenter)="plannerHover.emit(true)"
      (mouseleave)="plannerHover.emit(false)"
    >
      <div class="route-core">
        <label class="form-field field minimal typeahead">
          <span>{{ 'label.from' | transloco }}</span>
          <div class="typeahead-input">
            <div class="input-shell" [style.--clear-left.px]="clearButtonLeft(fromQuery)">
              <input
                #fromInput
                type="text"
                [value]="fromQuery"
                (input)="onFromInput($any($event.target).value)"
                (focus)="onFromFocus()"
                (blur)="onFromBlur()"
                (keydown)="onFromKeydown($event)"
                placeholder=" "
              />
              @if (fromQuery) {
                <button type="button" class="button button--ghost button--pill planner-card__clear-button clear-btn" (mousedown)="clearFrom($event)">
                  <fa-icon [icon]="xmarkIcon"></fa-icon>
                </button>
              }
            </div>
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
        <button class="button button--ghost button--pill planner-card__swap-button swap-btn" type="button" (click)="swap.emit()">
          <fa-icon class="swap-icon" [icon]="swapIcon"></fa-icon>
        </button>
        <label class="form-field field minimal typeahead">
          <span>{{ 'label.to' | transloco }}</span>
          <div class="typeahead-input">
            <div class="input-shell" [style.--clear-left.px]="clearButtonLeft(toQuery)">
              <input
                #toInput
                type="text"
                [value]="toQuery"
                (input)="onToInput($any($event.target).value)"
                (focus)="onToFocus()"
                (blur)="onToBlur()"
                (keydown)="onToKeydown($event)"
                placeholder=" "
              />
              @if (toQuery) {
                <button type="button" class="button button--ghost button--pill planner-card__clear-button clear-btn" (mousedown)="clearTo($event)">
                  <fa-icon [icon]="xmarkIcon"></fa-icon>
                </button>
              }
            </div>
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

      @if (showTime()) {
        <app-viewer-route-planner-time-controls
          [departTime]="departTime()"
          [canApplyTime]="canApplyTime()"
          [compact]="variant() === 'compact'"
          (departTimeChange)="departTimeChange.emit($event)"
          (applyTime)="applyTime.emit()"
          (resetSearch)="resetSearch.emit()"
        ></app-viewer-route-planner-time-controls>
      }
    </div>
  `,
  styles: [
    `
      .planner-card {
        padding: 12px 14px;
        display: grid;
        gap: 10px;
      }

      .route-core {
        position: relative;
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
        gap: 16px;
        align-items: end;
      }

      .field select,
      .field input {
        padding: 8px 10px;
        border-color: var(--color-border-inverse);
        background: var(--color-surface-inverse);
        color: var(--color-text-inverse);
        box-shadow: 4px 4px 0 rgba(0, 0, 0, 0.25);
      }

      .field input:focus,
      .field select:focus,
      .typeahead-input input:focus,
      .swap-btn:focus,
      .swap-btn:focus-visible,
      .clear-btn:focus,
      .clear-btn:focus-visible {
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

      .swap-btn {
        position: relative;
        height: 56px;
        width: 56px;
        padding: 0;
        font-size: 22px;
        line-height: 1;
        display: grid;
        place-items: center;
        box-shadow: none;
      }

      .swap-icon {
        display: block;
        line-height: 1;
        transform: translateY(-1px);
      }

      .planner-card.compact {
        padding: 10px 12px;
      }

      .planner-card.compact .route-core {
        gap: 8px;
      }

      .planner-card.compact .field select,
      .planner-card.compact .field input {
        padding: 6px 8px;
      }

      .planner-card.compact .field.minimal select {
        font-size: 16px;
      }

      .planner-card.compact .swap-btn {
        height: 36px;
      }

      .typeahead {
        position: relative;
      }

      .typeahead-input {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
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
        padding: 0;
        min-height: 20px;
        min-width: 20px;
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

        .swap-btn {
          position: static;
          width: 100%;
          height: 44px;
        }
      }

      @media (max-width: 767px) {
        .planner-card,
        .planner-card.compact {
          width: 100%;
          padding: 10px 12px;
          gap: 10px;
        }

        .planner-card.compact .route-core {
          gap: 10px;
        }

        .field.minimal span {
          font-size: 11px;
        }

        .typeahead-input input,
        .planner-card.compact .typeahead-input input {
          font-size: 17px;
          padding-right: 30px;
        }

        .swap-btn,
        .planner-card.compact .swap-btn {
          width: 100%;
          height: 40px;
        }
      }
    `
  ]
})
export class ViewerRoutePlannerOverlayComponent implements AfterViewInit, OnChanges {
  private readonly changeDetectorRef = inject(ChangeDetectorRef);

  readonly xmarkIcon = faXmark;
  readonly swapIcon = faArrowsLeftRight;

  readonly variant = input<'full' | 'compact'>('full');
  readonly nodes = input.required<Array<{ id: string; name: string }>>();
  readonly nodeAliases = input<Record<string, string[]>>({});
  readonly fromId = input('');
  readonly toId = input('');
  readonly departTime = input<TimeHHMM>('08:00');
  readonly showTime = input(false);
  readonly canApplyTime = input(false);
  readonly searching = input(false);
  readonly autoFocusFromToken = input(0);

  readonly fromIdChange = output<string>();
  readonly toIdChange = output<string>();
  readonly departTimeChange = output<TimeHHMM>();
  readonly applyTime = output<void>();
  readonly swap = output<void>();
  readonly plannerFocus = output<boolean>();
  readonly plannerHover = output<boolean>();
  readonly fromPreviewChange = output<string>();
  readonly toPreviewChange = output<string>();
  readonly pickTargetChange = output<'from' | 'to' | null>();
  readonly resetSearch = output<void>();

  @ViewChildren('fromOption', { read: ElementRef }) fromOptions!: QueryList<ElementRef<HTMLElement>>;
  @ViewChildren('toOption', { read: ElementRef }) toOptions!: QueryList<ElementRef<HTMLElement>>;
  @ViewChild('fromInput', { read: ElementRef }) fromInput?: ElementRef<HTMLInputElement>;
  @ViewChild('toInput', { read: ElementRef }) toInput?: ElementRef<HTMLInputElement>;

  fromQuery = '';
  toQuery = '';
  fromOpen = false;
  toOpen = false;
  fromActiveIndex = 0;
  toActiveIndex = 0;
  private activePickTarget: 'from' | 'to' | null = null;

  ngAfterViewInit(): void {
    if (this.autoFocusFromToken() > 0) {
      this.focusFromInput();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    const fromIdChanged = !!changes['fromId'];
    const toIdChanged = !!changes['toId'];
    const fromMapPickActive = fromIdChanged && !!this.fromId() && this.activePickTarget === 'from';
    const toMapPickActive = toIdChanged && !!this.toId() && this.activePickTarget === 'to';

    if ((fromIdChanged || changes['nodes']) && (!this.fromOpen || fromMapPickActive)) {
      this.fromQuery = this.nameForId(this.fromId());
    }
    if ((toIdChanged || changes['nodes']) && (!this.toOpen || toMapPickActive)) {
      this.toQuery = this.nameForId(this.toId());
    }
    if (changes['autoFocusFromToken'] && !changes['autoFocusFromToken'].firstChange) {
      this.focusFromInput();
    }
  }

  onFromInput(value: string): void {
    this.fromQuery = value;
    this.fromOpen = true;
    this.fromActiveIndex = 0;
    this.emitFromPreview();
    const match = this.matchByName(value);
    this.fromIdChange.emit(match?.id ?? '');
  }

  onToInput(value: string): void {
    this.toQuery = value;
    this.toOpen = true;
    this.toActiveIndex = 0;
    this.emitToPreview();
    const match = this.matchByName(value);
    this.toIdChange.emit(match?.id ?? '');
  }

  selectFrom(node: { id: string; name: string }): void {
    this.fromQuery = node.name;
    this.fromIdChange.emit(node.id);
    this.fromOpen = false;
    if (this.activePickTarget === 'from') {
      this.activePickTarget = null;
      this.pickTargetChange.emit(null);
    }
  }

  selectTo(node: { id: string; name: string }): void {
    this.toQuery = node.name;
    this.toIdChange.emit(node.id);
    this.toOpen = false;
    if (this.activePickTarget === 'to') {
      this.activePickTarget = null;
      this.pickTargetChange.emit(null);
    }
  }

  clearFrom(event: MouseEvent): void {
    event.preventDefault();
    this.fromQuery = '';
    this.fromIdChange.emit('');
    this.fromOpen = false;
    this.focusFromInput();
  }

  clearTo(event: MouseEvent): void {
    event.preventDefault();
    this.toQuery = '';
    this.toIdChange.emit('');
    this.toOpen = false;
    this.focusToInput();
  }

  onFromFocus(): void {
    this.fromOpen = true;
    this.fromActiveIndex = 0;
    this.activePickTarget = 'from';
    this.pickTargetChange.emit('from');
    this.scrollFromActive();
    this.emitFromPreview();
  }

  onToFocus(): void {
    this.toOpen = true;
    this.toActiveIndex = 0;
    this.activePickTarget = 'to';
    this.pickTargetChange.emit('to');
    this.scrollToActive();
    this.emitToPreview();
  }

  onFromBlur(): void {
    setTimeout(() => {
      const resolved = this.resolveNodeFromQuery(this.fromQuery);
      if (resolved && this.fromId() !== resolved.id) {
        this.fromQuery = resolved.name;
        this.fromIdChange.emit(resolved.id);
      }
      this.fromOpen = false;
      this.fromPreviewChange.emit('');
      if (this.activePickTarget === 'from') {
        this.activePickTarget = null;
        this.pickTargetChange.emit(null);
      }
      this.changeDetectorRef.markForCheck();
    }, 120);
  }

  onToBlur(): void {
    setTimeout(() => {
      const resolved = this.resolveNodeFromQuery(this.toQuery);
      if (resolved && this.toId() !== resolved.id) {
        this.toQuery = resolved.name;
        this.toIdChange.emit(resolved.id);
      }
      this.toOpen = false;
      this.toPreviewChange.emit('');
      if (this.activePickTarget === 'to') {
        this.activePickTarget = null;
        this.pickTargetChange.emit(null);
      }
      this.changeDetectorRef.markForCheck();
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

  clearButtonLeft(value: string): number {
    const text = value ?? '';
    const fontSize = this.variant() === 'compact' ? 16 : 22;
    const textWidth = this.measureTextWidth(text, fontSize);
    const basePadding = 6;
    const left = basePadding + textWidth + 2;
    return Math.max(8, Math.min(left, 260));
  }

  private filterNodes(query: string): Array<{ id: string; name: string }> {
    const normalizedQuery = this.normalizeSearch(query);
    const list = this.nodes();
    if (!normalizedQuery) {
      return list.slice(0, 8);
    }
    return list
      .filter((node) => this.getSearchTerms(node).some((term) => term.includes(normalizedQuery)))
      .slice(0, 8);
  }

  private matchByName(value: string): { id: string; name: string } | null {
    const normalizedValue = this.normalizeSearch(value);
    if (!normalizedValue) {
      return null;
    }
    return this.nodes().find((node) => this.getSearchTerms(node).some((term) => term === normalizedValue)) ?? null;
  }

  private resolveNodeFromQuery(query: string): { id: string; name: string } | null {
    const exact = this.matchByName(query);
    if (exact) {
      return exact;
    }
    const normalizedQuery = this.normalizeSearch(query);
    if (!normalizedQuery) {
      return null;
    }
    const candidates = this.filterNodes(query);
    return candidates.length === 1 ? candidates[0] : null;
  }

  private getSearchTerms(node: { id: string; name: string }): string[] {
    const canonical = this.normalizeSearch(node.name);
    const aliases = (this.nodeAliases()[node.id] ?? []).map((alias) => this.normalizeSearch(alias)).filter(Boolean);
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

  private measureTextWidth(text: string, fontSize: number): number {
    const sample = text.length ? text : ' ';
    if (typeof document === 'undefined') {
      return sample.length * fontSize * 0.56;
    }
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) {
      return sample.length * fontSize * 0.56;
    }
    context.font = `600 ${fontSize}px system-ui`;
    return context.measureText(sample).width;
  }

  private nameForId(id: string): string {
    if (!id) {
      return '';
    }
    return this.nodes().find((node) => node.id === id)?.name ?? '';
  }

  private scrollFromActive(): void {
    setTimeout(() => {
      const element = this.fromOptions?.get(this.fromActiveIndex)?.nativeElement;
      element?.scrollIntoView({ block: 'nearest' });
    }, 0);
  }

  private scrollToActive(): void {
    setTimeout(() => {
      const element = this.toOptions?.get(this.toActiveIndex)?.nativeElement;
      element?.scrollIntoView({ block: 'nearest' });
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

  private focusFromInput(): void {
    setTimeout(() => {
      this.fromInput?.nativeElement.focus();
      this.fromInput?.nativeElement.select();
    }, 0);
  }

  private focusToInput(): void {
    setTimeout(() => {
      this.toInput?.nativeElement.focus();
      this.toInput?.nativeElement.select();
    }, 0);
  }
}
