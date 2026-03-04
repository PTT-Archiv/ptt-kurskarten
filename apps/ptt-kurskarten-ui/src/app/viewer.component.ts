import { AfterViewInit, Component, HostListener, OnDestroy, PLATFORM_ID, computed, effect, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import type { ConnectionLeg, ConnectionOption, GraphNode, GraphSnapshot, LocalizedText, TimeHHMM, TransportType } from '@ptt-kurskarten/shared';
import { MapStageComponent } from './map-stage.component';
import { ArchiveSnippetViewerComponent } from './archive-snippet-viewer.component';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { faFlag, faGear, faLocationDot, faMagnifyingGlass, faRoute, faXmark } from '@fortawesome/free-solid-svg-icons';
import { buildWaitSegments, type WaitSegment } from './connection-details.util';
import { ViewerRoutePlannerOverlayComponent } from './viewer-route-planner-overlay.component';
import { ViewerDataService } from './viewer-data.service';
import { environment } from '../environments/environment';
import { Subscription } from 'rxjs';
import {
  ARCHIVE_DEFAULT_REGION,
  buildArchiveSnippetUrlForNode,
  buildArchiveSnippetUrlFromRegion,
  computeArchiveTransform,
  type ArchiveTransform
} from './archive-snippet.util';

const DEFAULT_YEAR = 1852;
type SidebarNodeTrip = {
  edgeId: string;
  tripId: string;
  nodeId: string;
  nodeName: string;
  transport: TransportType;
  departs?: TimeHHMM;
  arrives?: TimeHHMM;
  arrivalDayOffset?: number;
};

type WikidataLabelSet = Partial<Record<'de' | 'fr' | 'it' | 'en', string | null>>;
type WikidataEntry = {
  name: string;
  qNumber: string | null;
  qNumbers: string[];
  translations?: WikidataLabelSet | null;
  translationsByQNumber?: Record<string, WikidataLabelSet | null>;
};

@Component({
  selector: 'app-viewer',
  standalone: true,
  imports: [MapStageComponent, TranslocoPipe, ViewerRoutePlannerOverlayComponent, ArchiveSnippetViewerComponent, FaIconComponent, RouterLink],
  templateUrl: './viewer.component.html',
  styleUrl: './viewer.component.css'
})
export class ViewerComponent implements AfterViewInit, OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly viewerData = inject(ViewerDataService);
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
  draftDepartTime = signal<TimeHHMM>('08:00');
  hasSearched = signal(false);
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
  helpOpen = signal(false);
  settingsOpen = signal(false);
  activeLang = signal<'de' | 'fr'>(this.transloco.getActiveLang() === 'fr' ? 'fr' : 'de');
  readonly readonlyViewer = environment.readonlyViewer;
  resetViewportToken = signal(0);
  private transientPulseIds = signal<Set<string>>(new Set());
  private fromPreviewId = signal<string>('');
  private toPreviewId = signal<string>('');
  private plannerBlurHandle: ReturnType<typeof setTimeout> | null = null;
  private placeSearchBlurHandle: ReturnType<typeof setTimeout> | null = null;
  private pulseTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
  private langSub?: Subscription;
  private pendingMapPickTarget: 'from' | 'to' | null = null;
  pickTarget = signal<'from' | 'to' | null>(null);
  private archiveTransform = signal<ArchiveTransform>(computeArchiveTransform());
  hoveredNodeId = signal<string | null>(null);
  hoveredNodeScreen = signal<{ x: number; y: number } | null>(null);
  routePlannerOpen = signal(false);
  placeSearchQuery = signal('');
  placeSearchOpen = signal(false);
  placeSearchActiveIndex = signal(0);
  private placeSearchPreviewId = signal<string>('');
  private wikidataByName = signal<Map<string, string[]>>(new Map());

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
    const placePreview = this.placeSearchPreviewId();
    if (placePreview) {
      ids.add(placePreview);
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
      return buildArchiveSnippetUrlForNode(node, transform);
    }
    return buildArchiveSnippetUrlFromRegion(ARCHIVE_DEFAULT_REGION);
  });

  hoveredSnippetUrl = computed(() => {
    const hoveredId = this.hoveredNodeId();
    const screen = this.hoveredNodeScreen();
    if (!hoveredId || !screen) {
      return null;
    }
    const node = this.getNodeByIdFull(hoveredId);
    if (!node) {
      return null;
    }
    return buildArchiveSnippetUrlForNode(node, this.archiveTransform());
  });

  hoveredSnippetLoading = signal(false);
  readonly xmarkIcon = faXmark;
  readonly gearIcon = faGear;
  readonly startIcon = faFlag;
  readonly endIcon = faLocationDot;
  readonly searchIcon = faMagnifyingGlass;
  readonly routeIcon = faRoute;

  sidebarPlaceNode = computed(() => this.getArchiveSnippetNode());
  routeResultsVisible = computed(() => this.routingState() === 'results' && this.connectionResults().length > 0);
  routeSidebarTitle = computed(() => {
    const selected = this.selectedConnection();
    const from = selected?.from ?? this.fromId();
    const to = selected?.to ?? this.toId();
    if (!from || !to) {
      return this.transloco.translate('viewer.details');
    }
    return `${this.getNodeLabel(from)} → ${this.getNodeLabel(to)}`;
  });
  routeNodePanelNode = computed(() => this.getNodeById(this.selectedNodeId()));
  routeNodePanelSnippetUrl = computed(() => {
    const nodeId = this.selectedNodeId();
    if (!nodeId) {
      return null;
    }
    const node = this.getNodeByIdFull(nodeId);
    if (!node) {
      return null;
    }
    return buildArchiveSnippetUrlForNode(node, this.archiveTransform());
  });
  showRouteNodePanel = computed(() => this.routeResultsVisible() && this.sidebarOpen() && !!this.selectedNodeId());
  placeSearchResults = computed(() => {
    const q = this.normalizeSearch(this.placeSearchQuery());
    if (!q) {
      return this.nodes().slice(0, 12);
    }
    return this.nodes().filter((node) => this.nodeSearchTerms(node).some((term) => term.includes(q))).slice(0, 12);
  });

  nodeAliasesById = computed<Record<string, string[]>>(() => {
    const byName = this.wikidataByName();
    const aliases: Record<string, string[]> = {};
    for (const node of this.nodes()) {
      aliases[node.id] = byName.get(this.normalizeSearch(node.name)) ?? [];
    }
    return aliases;
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
      this.fetchWikidata();
    }
    this.langSub = this.transloco.langChanges$.subscribe((lang) => {
      this.activeLang.set(lang === 'fr' ? 'fr' : 'de');
    });

    effect(() => {
      if (!this.isBrowser) {
        return;
      }

      if (this.searchHandle) {
        clearTimeout(this.searchHandle);
      }

      const from = this.fromId();
      const to = this.toId();
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

    effect(() => {
      const url = this.hoveredSnippetUrl();
      this.hoveredSnippetLoading.set(!!url);
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
    if (this.placeSearchBlurHandle) {
      clearTimeout(this.placeSearchBlurHandle);
    }
    this.langSub?.unsubscribe();
  }

  setLang(lang: 'de' | 'fr'): void {
    this.activeLang.set(lang);
    this.transloco.setActiveLang(lang);
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
    const routeResultsVisible = this.routeResultsVisible();
    const pick = this.pickTarget() ?? this.pendingMapPickTarget;
    if (pick && nodeId) {
      if (pick === 'from') {
        this.onFromIdChange(nodeId);
      } else {
        this.onToIdChange(nodeId);
      }
      this.pendingMapPickTarget = null;
      this.pickTarget.set(null);
      return;
    }
    this.pendingMapPickTarget = null;
    if (!nodeId) {
      this.selectedNodeId.set(null);
      if (!routeResultsVisible) {
        this.sidebarOpen.set(false);
      }
      return;
    }

    if (!routeResultsVisible) {
      this.selectedConnectionId.set(null);
      this.uiState.set('details');
    }
    this.selectedNodeId.set(nodeId);
    this.sidebarOpen.set(true);
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
    this.hasSearched.set(true);
    this.routingState.set('searching');
    this.uiState.set('landing');
    this.lastSearchParams.set({ from, to, time: depart, year });
    this.viewerData
      .getConnections({
        year,
        from,
        to,
        depart,
        k: 10,
        allowForeignStartFallback: true
      })
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
    const current = this.draftDepartTime();
    const total = this.parseTimeMinutes(current) + minutes;
    const normalized = ((total % 1440) + 1440) % 1440;
    const next = this.formatTimeMinutes(normalized);
    this.draftDepartTime.set(next);
    this.departTime.set(next);
    this.onSearchConnections();
  }

  selectConnection(option: ConnectionOption): void {
    this.selectedConnectionId.set(option.id ?? null);
    this.uiState.set('details');
    this.sidebarOpen.set(true);
  }

  closeSidebar(): void {
    this.sidebarOpen.set(false);
    this.selectedNodeId.set(null);
  }

  closeRouteNodePanel(): void {
    this.selectedNodeId.set(null);
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

  onPlaceSearchFocus(): void {
    if (this.placeSearchBlurHandle) {
      clearTimeout(this.placeSearchBlurHandle);
      this.placeSearchBlurHandle = null;
    }
    this.placeSearchOpen.set(true);
    this.syncPlaceSearchPreview();
  }

  onPlaceSearchBlur(): void {
    this.placeSearchBlurHandle = setTimeout(() => {
      this.placeSearchOpen.set(false);
      this.placeSearchPreviewId.set('');
    }, 120);
  }

  onPlaceSearchInput(value: string): void {
    this.placeSearchQuery.set(value);
    this.placeSearchOpen.set(true);
    this.placeSearchActiveIndex.set(0);
    this.syncPlaceSearchPreview();
  }

  onPlaceSearchKeydown(event: KeyboardEvent): void {
    const results = this.placeSearchResults();
    if (!results.length) {
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.placeSearchOpen.set(true);
      this.placeSearchActiveIndex.set((this.placeSearchActiveIndex() + 1) % results.length);
      this.syncPlaceSearchPreview();
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.placeSearchOpen.set(true);
      this.placeSearchActiveIndex.set((this.placeSearchActiveIndex() - 1 + results.length) % results.length);
      this.syncPlaceSearchPreview();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const pick = results[this.placeSearchActiveIndex()] ?? results[0];
      if (pick) {
        this.selectPlaceResult(pick.id);
      }
      return;
    }
    if (event.key === 'Escape') {
      this.placeSearchOpen.set(false);
      this.placeSearchPreviewId.set('');
    }
  }

  selectPlaceResult(nodeId: string): void {
    const node = this.getNodeById(nodeId);
    if (!node) {
      return;
    }
    this.placeSearchQuery.set(node.name);
    this.placeSearchOpen.set(false);
    this.placeSearchPreviewId.set('');
    this.onNodeSelected(node.id);
    this.triggerPulse(node.id);
  }

  previewPlaceSearchResult(nodeId: string, index: number): void {
    this.placeSearchActiveIndex.set(index);
    this.placeSearchPreviewId.set(nodeId);
  }

  openRoutePlanner(): void {
    this.routePlannerOpen.set(true);
  }

  closeRoutePlanner(): void {
    this.routePlannerOpen.set(false);
    this.pendingMapPickTarget = null;
    this.pickTarget.set(null);
  }

  onRoutePlannerPickTargetChange(target: 'from' | 'to' | null): void {
    this.pickTarget.set(target);
  }

  onMapPointer(payload: {
    type: 'down' | 'move' | 'up';
    screen: { x: number; y: number };
    world: { x: number; y: number };
    hitNodeId: string | null;
    hitEdgeId: string | null;
  }): void {
    if (payload.type === 'down') {
      this.pendingMapPickTarget = this.pickTarget();
    }
    if (payload.type === 'move') {
      this.hoveredNodeId.set(payload.hitNodeId);
      this.hoveredNodeScreen.set(payload.hitNodeId ? payload.screen : null);
    }
    if (payload.type === 'up' && !payload.hitNodeId) {
      this.pendingMapPickTarget = null;
    }
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.pickTarget()) {
      this.pendingMapPickTarget = null;
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

  setNodeAsStart(nodeId: string): void {
    this.onFromIdChange(nodeId);
    this.pickTarget.set(null);
    this.routePlannerOpen.set(true);
  }

  setNodeAsEnd(nodeId: string): void {
    this.onToIdChange(nodeId);
    this.pickTarget.set(null);
    this.routePlannerOpen.set(true);
  }

  onDepartTimeDraftChange(time: TimeHHMM): void {
    this.draftDepartTime.set(time);
  }

  applyDepartTime(): void {
    const next = this.draftDepartTime();
    if (next === this.departTime()) {
      return;
    }
    this.departTime.set(next);
    this.onSearchConnections();
  }

  resetSearch(): void {
    this.pickTarget.set(null);
    this.pendingMapPickTarget = null;
    this.fromPreviewId.set('');
    this.toPreviewId.set('');
    this.fromId.set('');
    this.toId.set('');
    this.departTime.set('08:00');
    this.draftDepartTime.set('08:00');
    this.hasSearched.set(false);
    this.connectionResults.set([]);
    this.selectedConnectionId.set(null);
    this.routingState.set('idle');
    this.uiState.set('landing');
    this.lastSearchParams.set(null);
    this.lastResultParams.set(null);
    this.selectedNodeId.set(null);
    this.sidebarOpen.set(false);
  }

  onFromPreview(id: string): void {
    this.fromPreviewId.set(id);
  }

  onToPreview(id: string): void {
    this.toPreviewId.set(id);
  }

  resetMapView(): void {
    this.resetViewportToken.set(this.resetViewportToken() + 1);
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
  endpointNodeIds = computed(() => {
    const ids = new Set<string>();
    const from = this.fromId();
    const to = this.toId();
    if (from) {
      ids.add(from);
    }
    if (to) {
      ids.add(to);
    }
    return ids.size > 0 ? ids : null;
  });

  selectedWaitSegments = computed<WaitSegment[]>(() => {
    const selected = this.selectedConnection();
    if (!selected) {
      return [];
    }
    return buildWaitSegments(selected);
  });

  outgoingNodeTrips = computed<SidebarNodeTrip[]>(() => {
    const snapshot = this.graph();
    const place = this.sidebarPlaceNode();
    if (!snapshot || !place) {
      return [];
    }
    const rows: SidebarNodeTrip[] = [];
    snapshot.edges
      .filter((edge) => edge.from === place.id)
      .forEach((edge) => {
        const toNode = snapshot.nodes.find((node) => node.id === edge.to);
        edge.trips.forEach((trip) => {
          rows.push({
            edgeId: edge.id,
            tripId: trip.id,
            nodeId: edge.to,
            nodeName: toNode?.name ?? edge.to,
            transport: trip.transport,
            departs: trip.departs,
            arrives: trip.arrives,
            arrivalDayOffset: trip.arrivalDayOffset
          });
        });
      });
    return rows.sort((a, b) => this.tripSortValue(a) - this.tripSortValue(b));
  });

  incomingNodeTrips = computed<SidebarNodeTrip[]>(() => {
    const snapshot = this.graph();
    const place = this.sidebarPlaceNode();
    if (!snapshot || !place) {
      return [];
    }
    const rows: SidebarNodeTrip[] = [];
    snapshot.edges
      .filter((edge) => edge.to === place.id)
      .forEach((edge) => {
        const fromNode = snapshot.nodes.find((node) => node.id === edge.from);
        edge.trips.forEach((trip) => {
          rows.push({
            edgeId: edge.id,
            tripId: trip.id,
            nodeId: edge.from,
            nodeName: fromNode?.name ?? edge.from,
            transport: trip.transport,
            departs: trip.departs,
            arrives: trip.arrives,
            arrivalDayOffset: trip.arrivalDayOffset
          });
        });
      });
    return rows.sort((a, b) => this.tripSortValue(a) - this.tripSortValue(b));
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
    this.viewerData.getYears().subscribe({
      next: (years) => this.availableYears.set(years),
      error: () => this.availableYears.set([])
    });
  }

  private fetchGraph(year: number): void {
    this.viewerData.getGraph(year).subscribe({
      next: (graph) => {
        this.graph.set(graph);
        this.selectedNodeId.set(null);
      },
      error: () => {
        this.graph.set(null);
      }
    });
  }

  private fetchWikidata(): void {
    this.http.get<WikidataEntry[]>(environment.staticWikidataPath).subscribe({
      next: (entries) => {
        const byName = new Map<string, Set<string>>();
        for (const entry of entries ?? []) {
          const key = this.normalizeSearch(entry.name);
          if (!key) {
            continue;
          }
          const labels = new Set<string>();
          const addLabels = (set?: WikidataLabelSet | null): void => {
            if (!set) {
              return;
            }
            Object.values(set).forEach((value) => {
              const normalized = this.normalizeSearch(value ?? '');
              if (normalized && normalized !== key) {
                labels.add(normalized);
              }
            });
          };
          addLabels(entry.translations);
          Object.values(entry.translationsByQNumber ?? {}).forEach((set) => addLabels(set));
          const existing = byName.get(key) ?? new Set<string>();
          labels.forEach((label) => existing.add(label));
          byName.set(key, existing);
        }
        const materialized = new Map<string, string[]>();
        byName.forEach((value, keyName) => materialized.set(keyName, [...value]));
        this.wikidataByName.set(materialized);
      },
      error: () => this.wikidataByName.set(new Map())
    });
  }

  private nodeSearchTerms(node: { name: string }): string[] {
    const canonical = this.normalizeSearch(node.name);
    const aliases = this.wikidataByName().get(canonical) ?? [];
    return [canonical, ...aliases];
  }

  private normalizeSearch(value: string | null | undefined): string {
    return (value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[’']/g, '')
      .toLowerCase()
      .trim();
  }

  private syncPlaceSearchPreview(): void {
    const results = this.placeSearchResults();
    if (!results.length) {
      this.placeSearchPreviewId.set('');
      return;
    }
    const index = Math.max(0, Math.min(this.placeSearchActiveIndex(), results.length - 1));
    this.placeSearchActiveIndex.set(index);
    this.placeSearchPreviewId.set(results[index]?.id ?? '');
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

  private getNodeByIdFull(id: string): GraphNode | null {
    const snapshot = this.graph();
    if (!snapshot) {
      return null;
    }
    return snapshot.nodes.find((node) => node.id === id) ?? null;
  }

  private getArchiveSnippetNode(): { id: string; name: string; x: number; y: number } | null {
    const snapshot = this.graph();
    if (!snapshot) {
      return null;
    }
    const preferredId = this.selectedNodeId() || this.fromId() || this.toId() || 'bern';
    return snapshot.nodes.find((node) => node.id === preferredId) ?? snapshot.nodes[0] ?? null;
  }

  getLocalizedNote(note?: LocalizedText): string | null {
    if (!note) {
      return null;
    }
    const lang = this.transloco.getActiveLang();
    const value = (note as Record<string, string | undefined>)[lang] ?? note.de ?? note.fr;
    return value?.trim() ? value : null;
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
      return this.transloco.translate('viewer.pickModeFrom');
    }
    if (target === 'to') {
      return this.transloco.translate('viewer.pickModeTo');
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

  private tripSortValue(trip: SidebarNodeTrip): number {
    if (trip.departs) {
      return this.parseTimeMinutes(trip.departs);
    }
    if (trip.arrives) {
      return this.parseTimeMinutes(trip.arrives) + 720;
    }
    return Number.MAX_SAFE_INTEGER;
  }
}
