import { AfterViewInit, Component, HostListener, OnDestroy, PLATFORM_ID, computed, effect, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import type { ConnectionLeg, ConnectionOption, GraphSnapshot, TimeHHMM } from '@ptt-kurskarten/shared';
import { MapStageComponent } from './map-stage.component';
import { ArchiveSnippetViewerComponent } from './archive-snippet-viewer.component';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { buildWaitSegments, type WaitSegment } from './connection-details.util';
import { ViewerRoutePlannerOverlayComponent } from './viewer-route-planner-overlay.component';
import {
  ARCHIVE_DEFAULT_REGION,
  buildArchiveSnippetUrl,
  buildArchiveSnippetUrlFromRegion,
  computeArchiveTransform,
  type ArchiveTransform
} from './archive-snippet.util';

const DEFAULT_YEAR = 1871;

@Component({
  selector: 'app-viewer',
  standalone: true,
  imports: [MapStageComponent, TranslocoPipe, ViewerRoutePlannerOverlayComponent, ArchiveSnippetViewerComponent],
  templateUrl: './viewer.component.html',
  styleUrl: './viewer.component.css'
})
export class ViewerComponent implements AfterViewInit, OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly transloco = inject(TranslocoService);

  year = signal<number>(DEFAULT_YEAR);
  yearDraft = signal<number>(DEFAULT_YEAR);
  graph = signal<GraphSnapshot | null>(null);
  selectedNodeId = signal<string | null>(null);
  availableYears = signal<number[]>([]);
  fromId = signal<string>('');
  toId = signal<string>('');
  departTime = signal<TimeHHMM>('08:00');
  connectionResults = signal<ConnectionOption[]>([]);
  selectedConnectionId = signal<string | null>(null);
  showConnectionDetailsOnMap = signal(true);
  routingState = signal<'idle' | 'searching' | 'results' | 'no_results' | 'error'>('idle');
  uiState = signal<'landing' | 'results' | 'details'>('landing');
  sidebarOpen = signal(false);
  plannerHovered = signal(false);
  plannerFocused = signal(false);
  lastSearchParams = signal<{ from: string; to: string; time: TimeHHMM; year: number } | null>(null);
  lastResultParams = signal<{ from: string; to: string; year: number } | null>(null);
  plannerActive = signal(false);
  mapSettled = signal(false);
  private transientPulseIds = signal<Set<string>>(new Set());
  private fromPreviewId = signal<string>('');
  private toPreviewId = signal<string>('');
  private plannerBlurHandle: ReturnType<typeof setTimeout> | null = null;
  private pulseTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
  pickTarget = signal<'from' | 'to' | null>(null);
  private archiveTransform = signal<ArchiveTransform>(computeArchiveTransform());

  pulseNodeIds = computed(() => {
    const ids = new Set(this.transientPulseIds());
    const from = this.fromPreviewId();
    const to = this.toPreviewId();
    if (from) {
      ids.add(from);
    }
    if (to) {
      ids.add(to);
    }
    return ids;
  });

  nodes = computed(() => {
    const snapshot = this.graph();
    if (!snapshot) {
      return [];
    }
    return [...snapshot.nodes].sort((a, b) => a.name.localeCompare(b.name));
  });

  archiveSnippetUrl = computed(() => {
    const node = this.getArchiveSnippetNode();
    const transform = this.archiveTransform();
    if (node) {
      return buildArchiveSnippetUrl(node.x, node.y, transform);
    }
    return buildArchiveSnippetUrlFromRegion(ARCHIVE_DEFAULT_REGION);
  });

  minYear = computed(() => {
    const years = this.availableYears();
    return years.length > 0 ? Math.min(...years) : DEFAULT_YEAR - 20;
  });

  maxYear = computed(() => {
    const years = this.availableYears();
    return years.length > 0 ? Math.max(...years) : DEFAULT_YEAR + 20;
  });

  private searchHandle: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    if (this.isBrowser) {
      this.fetchYears();
      this.fetchGraph(this.year());
    }

    effect(() => {
      if (!this.isBrowser) {
        return;
      }

      if (this.searchHandle) {
        clearTimeout(this.searchHandle);
      }

      const from = this.fromId();
      const to = this.toId();
      const depart = this.departTime();

      if (!from || !to || from === to) {
        this.routingState.set('idle');
        this.connectionResults.set([]);
        this.selectedConnectionId.set(null);
        return;
      }

      this.searchHandle = setTimeout(() => {
        this.onSearchConnections();
      }, 300);
    });

    // Transform is derived from fixed anchors; no need to recompute on graph changes.
  }

  ngAfterViewInit(): void {
    if (!this.isBrowser) {
      return;
    }
    requestAnimationFrame(() => {
      this.mapSettled.set(true);
    });
  }

  ngOnDestroy(): void {
    if (this.searchHandle) {
      clearTimeout(this.searchHandle);
    }
    if (this.plannerBlurHandle) {
      clearTimeout(this.plannerBlurHandle);
    }
  }

  onYearInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const nextYear = Number(input.value);
    if (!Number.isNaN(nextYear)) {
      this.yearDraft.set(nextYear);
    }
  }

  onYearCommit(event: Event): void {
    const input = event.target as HTMLInputElement;
    const nextYear = Number(input.value);
    if (!Number.isNaN(nextYear)) {
      this.year.set(nextYear);
      this.yearDraft.set(nextYear);
      this.fetchGraph(nextYear);
    }
  }

  onNodeSelected(nodeId: string | null): void {
    const pick = this.pickTarget();
    if (pick && nodeId) {
      if (pick === 'from') {
        this.onFromIdChange(nodeId);
      } else {
        this.onToIdChange(nodeId);
      }
      this.pickTarget.set(null);
      return;
    }
    this.selectedConnectionId.set(null);
    if (!nodeId) {
      this.selectedNodeId.set(null);
      return;
    }

    this.selectedNodeId.set(nodeId);
    this.sidebarOpen.set(true);
    this.uiState.set('details');
  }

  onSearchConnections(): void {
    const from = this.fromId();
    const to = this.toId();
    if (!from || !to || from === to) {
      this.connectionResults.set([]);
      this.selectedConnectionId.set(null);
      this.routingState.set('idle');
      return;
    }

    const year = this.year();
    const depart = this.departTime();
    this.routingState.set('searching');
    this.uiState.set('landing');
    this.lastSearchParams.set({ from, to, time: depart, year });
    this.http
      .get<ConnectionOption[]>(
        `/api/v1/connections?year=${year}&from=${from}&to=${to}&depart=${depart}&k=10&allowForeignStartFallback=true`
      )
      .subscribe({
        next: (options) => {
          const normalized = (options ?? []).map((option, index) => this.ensureConnectionId(option, index));
          this.connectionResults.set(normalized);
          this.selectedConnectionId.set(normalized[0]?.id ?? null);
          const hasResults = normalized.length > 0;
          this.routingState.set(hasResults ? 'results' : 'no_results');
          this.uiState.set(hasResults ? 'results' : 'landing');
          if (hasResults) {
            this.sidebarOpen.set(true);
          }
          if (normalized.length) {
            this.lastResultParams.set({ from, to, year });
          }
        },
        error: () => {
          this.connectionResults.set([]);
          this.selectedConnectionId.set(null);
          this.routingState.set('error');
          this.uiState.set('landing');
        }
      });
  }


  swapConnections(): void {
    const from = this.fromId();
    const to = this.toId();
    this.fromId.set(to);
    this.toId.set(from);
    this.triggerPulse(to);
    this.triggerPulse(from);
  }

  shiftTime(minutes: number): void {
    const current = this.departTime();
    const total = this.parseTimeMinutes(current) + minutes;
    const normalized = ((total % 1440) + 1440) % 1440;
    this.departTime.set(this.formatTimeMinutes(normalized));
  }

  selectConnection(option: ConnectionOption): void {
    this.selectedConnectionId.set(option.id ?? null);
    this.uiState.set('details');
    this.sidebarOpen.set(true);
  }

  toggleSidebar(): void {
    this.sidebarOpen.set(!this.sidebarOpen());
  }

  closeSidebar(): void {
    this.sidebarOpen.set(false);
  }

  onPlannerFocus(active: boolean): void {
    if (this.plannerBlurHandle) {
      clearTimeout(this.plannerBlurHandle);
      this.plannerBlurHandle = null;
    }
    if (active) {
      this.plannerActive.set(true);
      this.plannerFocused.set(true);
      return;
    }
    this.plannerBlurHandle = setTimeout(() => {
      this.plannerActive.set(false);
      this.plannerFocused.set(false);
    }, 120);
  }

  onPlannerHover(active: boolean): void {
    this.plannerHovered.set(active);
  }

  startMapPick(target: 'from' | 'to'): void {
    this.pickTarget.set(target);
  }

  onMapPointer(payload: {
    type: 'down' | 'move' | 'up';
    screen: { x: number; y: number };
    world: { x: number; y: number };
    hitNodeId: string | null;
    hitEdgeId: string | null;
  }): void {
    if (this.pickTarget() && payload.type === 'up' && !payload.hitNodeId) {
      this.pickTarget.set(null);
    }
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.pickTarget()) {
      this.pickTarget.set(null);
    }
  }

  onFromIdChange(id: string): void {
    this.fromId.set(id);
    this.triggerPulse(id);
  }

  onToIdChange(id: string): void {
    this.toId.set(id);
    this.triggerPulse(id);
  }

  onFromPreview(id: string): void {
    this.fromPreviewId.set(id);
  }

  onToPreview(id: string): void {
    this.toPreviewId.set(id);
  }

  plannerAutoMinimize = computed(() => !this.sidebarOpen() && !this.plannerHovered() && !this.plannerFocused());

  selectedConnection = computed(() => {
    const id = this.selectedConnectionId();
    if (!id) {
      return null;
    }
    return this.connectionResults().find((option) => option.id === id) ?? null;
  });

  routingActive = computed(() => this.routingState() === 'results' && this.selectedConnectionId() !== null);

  selectedWaitSegments = computed<WaitSegment[]>(() => {
    const selected = this.selectedConnection();
    if (!selected) {
      return [];
    }
    return buildWaitSegments(selected);
  });

  highlightedEdgeIds = computed(() => {
    const selected = this.selectedConnection();
    if (selected) {
      return new Set(selected.legs.map((leg) => leg.edgeId));
    }
    const nodeId = this.selectedNodeId();
    const snapshot = this.graph();
    if (!nodeId || !snapshot) {
      return null;
    }
    const edges = snapshot.edges.filter((edge) => edge.from === nodeId || edge.to === nodeId);
    return new Set(edges.map((edge) => edge.id));
  });

  highlightedNodeIds = computed(() => {
    const selected = this.selectedConnection();
    if (selected) {
      const ids = new Set<string>();
      selected.legs.forEach((leg) => {
        ids.add(leg.from);
        ids.add(leg.to);
      });
      return ids;
    }
    const nodeId = this.selectedNodeId();
    if (!nodeId) {
      return null;
    }
    return new Set([nodeId]);
  });

  private fetchYears(): void {
    this.http.get<number[]>('/api/v1/years').subscribe({
      next: (years) => this.availableYears.set(years),
      error: () => this.availableYears.set([])
    });
  }

  private fetchGraph(year: number): void {
    this.http.get<GraphSnapshot>(`/api/v1/graph?year=${year}`).subscribe({
      next: (graph) => {
        this.graph.set(graph);
        this.selectedNodeId.set(null);
      },
      error: () => {
        this.graph.set(null);
      }
    });
  }

  getNodeName(id: string): string {
    const match = this.nodes().find((node) => node.id === id);
    return match?.name ?? '—';
  }

  getNodeLabel(id: string): string {
    const match = this.nodes().find((node) => node.id === id);
    return match?.name ?? id;
  }

  getNodeById(id: string | null): { id: string; name: string } | null {
    if (!id) {
      return null;
    }
    const match = this.nodes().find((node) => node.id === id);
    return match ? { id: match.id, name: match.name } : null;
  }

  private getArchiveSnippetNode(): { id: string; name: string; x: number; y: number } | null {
    const snapshot = this.graph();
    if (!snapshot) {
      return null;
    }
    const preferredId = this.selectedNodeId() || this.fromId() || this.toId() || 'bern';
    return snapshot.nodes.find((node) => node.id === preferredId) ?? snapshot.nodes[0] ?? null;
  }


  private ensureConnectionId(option: ConnectionOption, index: number): ConnectionOption {
    const id = option.id || `${option.from}-${option.to}-${index}`;
    const transfers = option.transfers ?? option.legs.length - 1;
    const legs = option.legs.map((leg) => this.ensureLegDuration(leg));
    const kind = option.kind ?? 'COMPLETE_JOURNEY';
    return { ...option, id, transfers, legs, kind };
  }

  private ensureLegDuration(leg: ConnectionLeg): ConnectionLeg {
    if (leg.durationMinutes !== undefined) {
      return leg;
    }
    if (!leg.departs || !leg.arrives) {
      return leg;
    }
    const durationMinutes = this.computeLegDurationMinutes(leg.departs, leg.arrives, leg.arrivalDayOffset);
    return { ...leg, durationMinutes };
  }

  private computeLegDurationMinutes(departs: TimeHHMM, arrives: TimeHHMM, dayOffset?: number): number {
    const [dh, dm] = departs.split(':').map((val) => Number(val));
    const [ah, am] = arrives.split(':').map((val) => Number(val));
    const dep = dh * 60 + dm;
    const arr = ah * 60 + am + (dayOffset ?? 0) * 1440;
    const normalized = arr < dep ? arr + 1440 : arr;
    return normalized - dep;
  }

  formatDuration(totalMinutes?: number): string {
    if (totalMinutes === undefined) {
      return '—';
    }
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours <= 0) {
      return `${minutes} min`;
    }
    return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
  }

  getNoResultsMessage(): string {
    const from = this.fromId();
    const to = this.toId();
    if (!from || !to || from === to) {
      return this.transloco.translate('viewer.noInput');
    }
    const nodes = this.graph()?.nodes ?? [];
    const fromExists = nodes.some((node) => node.id === from);
    const toExists = nodes.some((node) => node.id === to);
    if (!fromExists || !toExists) {
      return this.transloco.translate('viewer.noRouteYear');
    }
    const lastResult = this.lastResultParams();
    if (lastResult && lastResult.from === from && lastResult.to === to && lastResult.year !== this.year()) {
      return this.transloco.translate('viewer.noRouteNotYet', { year: this.year() });
    }
    return this.transloco.translate('viewer.noRouteTime');
  }

  getPickModeLabel(): string {
    const target = this.pickTarget();
    if (target === 'from') {
      return 'Auswahlmodus: Startpunkt auf der Karte wählen';
    }
    if (target === 'to') {
      return 'Auswahlmodus: Zielpunkt auf der Karte wählen';
    }
    return '';
  }

  private parseTimeMinutes(time: TimeHHMM): number {
    const [h, m] = time.split(':').map((val) => Number(val));
    return h * 60 + m;
  }

  private formatTimeMinutes(totalMinutes: number): TimeHHMM {
    const hours = Math.floor(totalMinutes / 60)
      .toString()
      .padStart(2, '0');
    const minutes = Math.floor(totalMinutes % 60)
      .toString()
      .padStart(2, '0');
    return `${hours}:${minutes}` as TimeHHMM;
  }

  private triggerPulse(nodeId: string): void {
    if (!nodeId) {
      return;
    }
    const next = new Set(this.transientPulseIds());
    next.add(nodeId);
    this.transientPulseIds.set(next);
    const existing = this.pulseTimeouts.get(nodeId);
    if (existing) {
      clearTimeout(existing);
    }
    const handle = setTimeout(() => {
      const updated = new Set(this.transientPulseIds());
      updated.delete(nodeId);
      this.transientPulseIds.set(updated);
      this.pulseTimeouts.delete(nodeId);
    }, 1400);
    this.pulseTimeouts.set(nodeId, handle);
  }
}
