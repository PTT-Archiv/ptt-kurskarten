import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  OnChanges,
  OnDestroy,
  QueryList,
  SimpleChanges,
  ViewChild,
  ViewChildren,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { faXmark } from '@fortawesome/free-solid-svg-icons';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  CLEAR_BUTTON_BASE_PADDING_PX,
  CLEAR_BUTTON_MAX_LEFT_PX,
  CLEAR_BUTTON_MIN_LEFT_PX,
  CLEAR_BUTTON_TEXT_OFFSET_PX,
  COMPACT_VARIANT_INPUT_FONT_SIZE_PX,
  DEFAULT_VISIBLE_NODE_LIMIT,
  FIELD_ACTIVE_OPTION_SCROLL_DELAY_MS,
  FIELD_BLUR_CLOSE_DELAY_MS,
  FULL_VARIANT_INPUT_FONT_SIZE_PX,
  TEXT_WIDTH_FALLBACK_RATIO,
} from './viewer-route-planner.constants';
import type {
  ViewerRoutePlannerNodeOption,
  ViewerRoutePlannerVariant,
} from './viewer-route-planner.models';

@Component({
  selector: 'app-viewer-route-planner-field',
  imports: [TranslocoPipe, FaIconComponent],
  templateUrl: './viewer-route-planner-field.component.html',
  styleUrl: './viewer-route-planner-field.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ViewerRoutePlannerFieldComponent implements AfterViewInit, OnChanges, OnDestroy {
  private readonly changeDetectorRef = inject(ChangeDetectorRef);

  readonly labelKey = input.required<string>();
  readonly selectedNodeId = input('');
  readonly nodes = input.required<ViewerRoutePlannerNodeOption[]>();
  readonly nodeAliases = input<Record<string, string[]>>({});
  readonly variant = input<ViewerRoutePlannerVariant>('full');
  readonly autoFocusToken = input(0);

  readonly selectedNodeIdChange = output<string>();
  readonly previewNodeIdChange = output<string>();
  readonly pickStateChange = output<boolean>();

  @ViewChildren('option', { read: ElementRef }) options!: QueryList<ElementRef<HTMLElement>>;
  @ViewChild('input', { read: ElementRef }) inputRef?: ElementRef<HTMLInputElement>;

  readonly clearIcon = faXmark;
  readonly query = signal('');
  readonly open = signal(false);
  readonly activeIndex = signal(0);
  readonly clearButtonLeft = computed(() => {
    const textWidth = this.measureTextWidth(this.query(), this.inputFontSizePx());
    const left = CLEAR_BUTTON_BASE_PADDING_PX + textWidth + CLEAR_BUTTON_TEXT_OFFSET_PX;

    return Math.max(CLEAR_BUTTON_MIN_LEFT_PX, Math.min(left, CLEAR_BUTTON_MAX_LEFT_PX));
  });
  readonly filteredNodes = computed(() => {
    const normalizedQuery = this.normalizeSearch(this.query());
    const allNodes = this.nodes();

    if (!normalizedQuery) {
      return allNodes.slice(0, DEFAULT_VISIBLE_NODE_LIMIT);
    }

    return allNodes
      .filter((node) => this.getSearchTerms(node).some((term) => term.includes(normalizedQuery)))
      .slice(0, DEFAULT_VISIBLE_NODE_LIMIT);
  });

  private readonly pickActive = signal(false);
  private blurCloseTimeout: ReturnType<typeof setTimeout> | null = null;
  private scrollActiveTimeout: ReturnType<typeof setTimeout> | null = null;

  ngAfterViewInit(): void {
    if (this.autoFocusToken() > 0) {
      this.focusInput();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    const selectedNodeIdChanged = !!changes['selectedNodeId'];
    const nodesChanged = !!changes['nodes'];

    if ((selectedNodeIdChanged || nodesChanged) && (!this.open() || this.pickActive())) {
      this.query.set(this.nameForId(this.selectedNodeId()));
    }

    if (changes['autoFocusToken'] && !changes['autoFocusToken'].firstChange) {
      this.focusInput();
    }
  }

  ngOnDestroy(): void {
    this.clearBlurCloseTimeout();
    this.clearScrollActiveTimeout();
  }

  onInput(event: Event): void {
    const value = this.getInputValue(event);

    this.query.set(value);
    this.open.set(true);
    this.activeIndex.set(0);
    this.emitPreview();

    const match = this.matchByName(value);
    this.selectedNodeIdChange.emit(match?.id ?? '');
  }

  onFocus(): void {
    this.clearBlurCloseTimeout();
    this.open.set(true);
    this.activeIndex.set(0);
    this.pickActive.set(true);
    this.pickStateChange.emit(true);
    this.scrollActiveOption();
    this.emitPreview();
  }

  onBlur(): void {
    this.clearBlurCloseTimeout();
    this.blurCloseTimeout = setTimeout(() => {
      const resolved = this.resolveNodeFromQuery(this.query());

      if (resolved && this.selectedNodeId() !== resolved.id) {
        this.query.set(resolved.name);
        this.selectedNodeIdChange.emit(resolved.id);
      }

      this.open.set(false);
      this.previewNodeIdChange.emit('');

      if (this.pickActive()) {
        this.pickActive.set(false);
        this.pickStateChange.emit(false);
      }

      this.changeDetectorRef.markForCheck();
    }, FIELD_BLUR_CLOSE_DELAY_MS);
  }

  onKeydown(event: KeyboardEvent): void {
    if (!this.open()) {
      this.open.set(true);
    }

    const list = this.filteredNodes();
    if (!list.length) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      event.stopPropagation();
      this.activeIndex.set((this.activeIndex() + 1) % list.length);
      this.scrollActiveOption();
      this.emitPreview();
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      this.activeIndex.set((this.activeIndex() - 1 + list.length) % list.length);
      this.scrollActiveOption();
      this.emitPreview();
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const node = list[this.activeIndex()];
      if (node) {
        this.selectNode(node);
      }
    }
  }

  selectNode(node: ViewerRoutePlannerNodeOption): void {
    this.query.set(node.name);
    this.selectedNodeIdChange.emit(node.id);
    this.open.set(false);

    if (this.pickActive()) {
      this.pickActive.set(false);
      this.pickStateChange.emit(false);
    }
  }

  clear(event: MouseEvent): void {
    event.preventDefault();
    this.clearBlurCloseTimeout();
    this.query.set('');
    this.selectedNodeIdChange.emit('');
    this.open.set(false);
    this.focusInput();
  }

  setActiveIndex(index: number): void {
    this.activeIndex.set(index);
    this.emitPreview();
  }

  private inputFontSizePx(): number {
    return this.variant() === 'compact'
      ? COMPACT_VARIANT_INPUT_FONT_SIZE_PX
      : FULL_VARIANT_INPUT_FONT_SIZE_PX;
  }

  private getInputValue(event: Event): string {
    return (event.target as HTMLInputElement | null)?.value ?? '';
  }

  private matchByName(value: string): ViewerRoutePlannerNodeOption | null {
    const normalizedValue = this.normalizeSearch(value);

    if (!normalizedValue) {
      return null;
    }

    return (
      this.nodes().find((node) =>
        this.getSearchTerms(node).some((term) => term === normalizedValue),
      ) ?? null
    );
  }

  private resolveNodeFromQuery(query: string): ViewerRoutePlannerNodeOption | null {
    const exact = this.matchByName(query);
    if (exact) {
      return exact;
    }

    const normalizedQuery = this.normalizeSearch(query);
    if (!normalizedQuery) {
      return null;
    }

    const candidates = this.filteredNodes();
    return candidates.length === 1 ? (candidates[0] ?? null) : null;
  }

  private getSearchTerms(node: ViewerRoutePlannerNodeOption): string[] {
    const canonical = this.normalizeSearch(node.name);
    const aliases = (this.nodeAliases()[node.id] ?? [])
      .map((alias) => this.normalizeSearch(alias))
      .filter(Boolean);

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
      return sample.length * fontSize * TEXT_WIDTH_FALLBACK_RATIO;
    }

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) {
      return sample.length * fontSize * TEXT_WIDTH_FALLBACK_RATIO;
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

  private scrollActiveOption(): void {
    this.clearScrollActiveTimeout();
    this.scrollActiveTimeout = setTimeout(() => {
      const element = this.options?.get(this.activeIndex())?.nativeElement;
      element?.scrollIntoView({ block: 'nearest' });
    }, FIELD_ACTIVE_OPTION_SCROLL_DELAY_MS);
  }

  private emitPreview(): void {
    const node = this.filteredNodes()[this.activeIndex()];
    this.previewNodeIdChange.emit(node?.id ?? '');
  }

  private focusInput(): void {
    setTimeout(() => {
      this.inputRef?.nativeElement.focus();
      this.inputRef?.nativeElement.select();
    }, FIELD_ACTIVE_OPTION_SCROLL_DELAY_MS);
  }

  private clearBlurCloseTimeout(): void {
    if (this.blurCloseTimeout) {
      clearTimeout(this.blurCloseTimeout);
      this.blurCloseTimeout = null;
    }
  }

  private clearScrollActiveTimeout(): void {
    if (this.scrollActiveTimeout) {
      clearTimeout(this.scrollActiveTimeout);
      this.scrollActiveTimeout = null;
    }
  }
}
