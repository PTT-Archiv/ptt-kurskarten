import { AfterViewInit, Component, HostListener, OnDestroy, PLATFORM_ID, computed, effect, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import type {
  ConnectionLeg,
  ConnectionOption,
  EditionEntry,
  GraphAssertion,
  GraphNode,
  GraphSnapshot,
  LocalizedText,
  TimeHHMM,
  TransportType
} from '@ptt-kurskarten/shared';
import { MapStageComponent } from '../../shared/map/map-stage.component';
import { ArchiveSnippetViewerComponent } from '../../shared/archive/archive-snippet-viewer.component';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import {
  faFlag,
  faGear,
  faLocationDot,
  faMagnifyingGlass,
  faRoute,
  faXmark
} from '@fortawesome/free-solid-svg-icons';
import { buildWaitSegments, type WaitSegment } from '../../shared/routing/connection-details.util';
import { ViewerArchiveStageComponent } from './viewer-archive-stage.component';
import { ViewerRoutePlannerOverlayComponent } from './viewer-route-planner-overlay.component';
import { ViewerDataService } from './viewer-data.service';
import { environment } from '../../../environments/environment';
import { Subscription } from 'rxjs';
import {
  isTripFlowEdgeMode,
  isTripFlowNodeMode,
  type TripFlowEdgeMode,
  type TripFlowNodeMode
} from '../../shared/map/map-stage-simulation.util';
import {
  ARCHIVE_DEFAULT_REGION,
  buildArchiveIiifInfoUrl,
  getArchiveIiifCenter,
  buildArchiveSnippetUrlForNode,
  buildArchiveSnippetUrlFromRegionWithBase,
  computeArchiveTransform,
  normalizeIiifRoute,
  type ArchiveTransform
} from '../../shared/archive/archive-snippet.util';

const DEFAULT_YEAR = 1852;
const MINUTES_PER_DAY = 1440;
const SIMULATION_DAY_MS = 60_000;
const TABLET_BREAKPOINT_PX = 1024;
const MOBILE_BREAKPOINT_PX = 768;
const FACT_LINK_TEMPLATES: Record<string, string> = {
  wikidata: 'https://www.wikidata.org/wiki/{value}',
  mfk: 'https://mfk.rechercheonline.ch/{value}'
};
const FACT_SCHEMA_LINK_PROVIDER: Record<string, string> = {
  'identifier.wikidata': 'wikidata',
  'identifier.mfk': 'mfk',
  'identifier.mfk_permalink': 'mfk',
  'identifier.rechercheonline': 'mfk'
};
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
type SidebarFact = {
  id: string;
  schemaKey: string;
  schemaLabel: string;
  label: string;
  url: string | null;
};
type ViewerSurfaceMode = 'map' | 'archive';
type MobileSheetMode = 'closed' | 'planner' | 'results' | 'details';
type MobileSheetSnap = 'peek' | 'half' | 'full';
type TripFlowModeOption<T extends string> = { value: T; labelKey: string };

@Component({
  selector: 'app-viewer',
  standalone: true,
  imports: [
    MapStageComponent,
    TranslocoPipe,
    ViewerRoutePlannerOverlayComponent,
    ViewerArchiveStageComponent,
    ArchiveSnippetViewerComponent,
    FaIconComponent,
    RouterLink
  ],
  templateUrl: './viewer.component.html',
  styleUrl: './viewer.component.css'
})
export class ViewerComponent implements AfterViewInit, OnDestroy {
  private readonly viewerData = inject(ViewerDataService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly transloco = inject(TranslocoService);

  year = signal<number>(DEFAULT_YEAR);
  graph = signal<GraphSnapshot | null>(null);
  selectedNodeId = signal<string | null>(null);
  availableYears = signal<number[]>([]);
  editions = signal<EditionEntry[]>([]);
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
  viewportWidth = signal<number>(this.getViewportWidth());
  viewportHeight = signal<number>(this.getViewportHeight());
  mobileSheetMode = signal<MobileSheetMode>('closed');
  mobileSheetSnap = signal<MobileSheetSnap>('half');
  activeLang = signal<'de' | 'fr'>(this.transloco.getActiveLang() === 'fr' ? 'fr' : 'de');
  readonly readonlyViewer = environment.readonlyViewer;
  readonly archiveModeEnabled = environment.enableArchiveMode;
  readonly mapLayerPreviewUrl = 'assets/maps/switzerland.svg';
  resetViewportToken = signal(0);
  viewerSurfaceMode = signal<ViewerSurfaceMode>('map');
  tripFlowNodeMode = signal<TripFlowNodeMode>('always-active');
  tripFlowEdgeMode = signal<TripFlowEdgeMode>('always-active');
  simulationPlaying = signal(false);
  simulationMinute = signal(0);
  private transientPulseIds = signal<Set<string>>(new Set());
  private fromPreviewId = signal<string>('');
  private toPreviewId = signal<string>('');
  private plannerBlurHandle: ReturnType<typeof setTimeout> | null = null;
  private placeSearchBlurHandle: ReturnType<typeof setTimeout> | null = null;
  private pulseTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
  private nodeFactsRequestSeq = 0;
  private langSub?: Subscription;
  private pendingMapPickTarget: 'from' | 'to' | null = null;
  pickTarget = signal<'from' | 'to' | null>(null);
  private archiveTransform = signal<ArchiveTransform>(computeArchiveTransform());
  private editionIiifRoutes = signal<Record<number, string>>({});
  hoveredNodeId = signal<string | null>(null);
  hoveredNodeScreen = signal<{ x: number; y: number } | null>(null);
  routePlannerOpen = signal(false);
  routePlannerFocusToken = signal(0);
  placeSearchQuery = signal('');
  placeSearchOpen = signal(false);
  placeSearchActiveIndex = signal(0);
  private archiveFocusNodeId = signal<string | null>(null);
  private placeSearchPreviewId = signal<string>('');
  private nodeAliases = signal<Record<string, string[]>>({});
  private nodeFacts = signal<GraphAssertion[]>([]);
  hoveredRouteEdgeId = signal<string | null>(null);
  private simulationRafId: number | null = null;
  private simulationLastTs: number | null = null;
  readonly tripFlowNodeModeOptions: TripFlowModeOption<TripFlowNodeMode>[] = [
    { value: 'always-active', labelKey: 'viewer.tripFlowModeAlwaysActive' },
    { value: 'unhighlighted', labelKey: 'viewer.tripFlowModeUnhighlighted' },
    { value: 'not-visible', labelKey: 'viewer.tripFlowModeNotVisible' },
    { value: 'active-when-relevant-muted', labelKey: 'viewer.tripFlowModeRelevantMuted' },
    { value: 'active-when-relevant-hidden', labelKey: 'viewer.tripFlowModeRelevantHidden' },
    { value: 'organic', labelKey: 'viewer.tripFlowModeOrganic' }
  ];
  readonly tripFlowEdgeModeOptions: TripFlowModeOption<TripFlowEdgeMode>[] = [
    { value: 'always-active', labelKey: 'viewer.tripFlowModeAlwaysActive' },
    { value: 'unhighlighted', labelKey: 'viewer.tripFlowModeUnhighlighted' },
    { value: 'not-visible', labelKey: 'viewer.tripFlowModeNotVisible' },
    { value: 'active-when-relevant-muted', labelKey: 'viewer.tripFlowModeRelevantMuted' },
    { value: 'active-when-relevant-hidden', labelKey: 'viewer.tripFlowModeRelevantHidden' }
  ];

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
  archiveIiifRoute = computed(() => normalizeIiifRoute(this.editionIiifRoutes()[this.year()]));
  archiveIiifInfoUrl = computed(() => buildArchiveIiifInfoUrl(this.archiveIiifRoute()));
  publicEditionOptions = computed(() => {
    const editions = this.editions();
    if (editions.length > 0) {
      return editions.filter((edition) => edition.public !== false);
    }
    return this.availableYears().map((year) => ({
      id: `year-${year}`,
      year,
      title: String(year),
      public: true
    }));
  });
  selectedEditionLabel = computed(() => {
    const currentYear = this.year();
    const editions = this.publicEditionOptions();
    const selected = editions.find((edition) => edition.year === currentYear);
    if (selected) {
      return selected.title || String(selected.year);
    }
    const anyEdition = this.editions().find((edition) => edition.year === currentYear);
    return anyEdition?.title || String(currentYear);
  });
  smallScreenLayout = computed(() => this.viewportWidth() < TABLET_BREAKPOINT_PX);
  mobileLayout = computed(() => this.viewportWidth() < MOBILE_BREAKPOINT_PX);
  mobileSheetVisible = computed(
    () => !this.archiveModeActive() && this.smallScreenLayout() && this.mobileSheetMode() !== 'closed'
  );
  mobileSheetHeight = computed(() => {
    if (!this.mobileSheetVisible()) {
      return 0;
    }
    const height = this.viewportHeight();
    if (height <= 0) {
      return 0;
    }
    const snap = this.mobileSheetSnap();
    if (snap === 'peek') {
      return 78;
    }
    if (this.mobileLayout()) {
      return snap === 'full' ? Math.min(height * 0.86, 820) : Math.min(height * 0.54, 460);
    }
    return snap === 'full' ? Math.min(height * 0.82, 760) : Math.min(height * 0.48, 420);
  });
  mobileSheetTitle = computed(() => {
    const mode = this.mobileSheetMode();
    if (mode === 'details') {
      return this.routeNodePanelNode()?.name ?? this.sidebarPlaceNode()?.name ?? this.transloco.translate('viewer.details');
    }
    if (mode === 'results') {
      return this.transloco.translate('viewer.results');
    }
    if (mode === 'planner') {
      return 'Routing';
    }
    return '';
  });
  mobileShowResultsBack = computed(() => this.mobileSheetMode() === 'details' && this.routeResultsVisible());

  archiveSnippetUrl = computed(() => {
    const node = this.getArchiveSnippetNode();
    const transform = this.archiveTransform();
    const iiifRoute = this.archiveIiifRoute();
    if (node) {
      return buildArchiveSnippetUrlForNode(node, transform, iiifRoute);
    }
    return buildArchiveSnippetUrlFromRegionWithBase(ARCHIVE_DEFAULT_REGION, iiifRoute);
  });
  archiveModeActive = computed(() => this.archiveModeEnabled && this.viewerSurfaceMode() === 'archive');
  sidePanelVisible = computed(() => {
    if (this.archiveModeActive()) {
      return false;
    }
    if (this.smallScreenLayout()) {
      const mode = this.mobileSheetMode();
      return mode === 'results' || mode === 'details';
    }
    return this.sidebarOpen();
  });
  animationAllowed = computed(() => !this.archiveModeActive() && !this.sidePanelVisible());
  orbitVisible = computed(() => this.animationAllowed());
  actionStackBottomOffset = computed(() => {
    const baseOffset = this.mobileLayout() ? 12 : 16;
    return this.mobileSheetVisible() ? this.mobileSheetHeight() + baseOffset : baseOffset;
  });
  inactiveSurfaceMode = computed<ViewerSurfaceMode>(() => (this.viewerSurfaceMode() === 'map' ? 'archive' : 'map'));
  inactiveSurfacePreviewImageUrl = computed(() => {
    if (this.inactiveSurfaceMode() === 'map') {
      return this.mapLayerPreviewUrl;
    }
    return this.archiveStageImageUrl() || this.archiveSnippetUrl() || '';
  });
  dayNightOrbit = computed(() => {
    const minute = this.normalizeMinuteOfDay(this.simulationMinute());
    const center = 44;
    const radius = 26;
    const sunAngle = ((minute - 720) / MINUTES_PER_DAY) * Math.PI * 2 - Math.PI / 2;
    const moonAngle = sunAngle + Math.PI;
    const sun = {
      x: center + radius * Math.cos(sunAngle),
      y: center + radius * Math.sin(sunAngle)
    };
    const moon = {
      x: center + radius * Math.cos(moonAngle),
      y: center + radius * Math.sin(moonAngle)
    };
    const scaleForY = (y: number) => {
      const topFactor = ((center - y) / radius + 1) / 2;
      return 0.72 + topFactor * 0.6;
    };
    return {
      sunX: sun.x,
      sunY: sun.y,
      sunScale: scaleForY(sun.y),
      moonX: moon.x,
      moonY: moon.y,
      moonScale: scaleForY(moon.y)
    };
  });
  archiveStageInitialCenter = computed(() => {
    const node = this.getDefaultArchiveNode();
    if (!node) {
      return null;
    }
    return getArchiveIiifCenter(node, this.archiveTransform());
  });
  archiveStageImageUrl = computed(() => {
    const node = this.getArchiveStageNode();
    const transform = this.archiveTransform();
    const iiifRoute = this.archiveIiifRoute();
    if (node) {
      return buildArchiveSnippetUrlForNode(node, transform, iiifRoute);
    }
    return '';
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
    return buildArchiveSnippetUrlForNode(node, this.archiveTransform(), this.archiveIiifRoute());
  });

  hoveredSnippetLoading = signal(false);
  readonly xmarkIcon = faXmark;
  readonly gearIcon = faGear;
  readonly startIcon = faFlag;
  readonly endIcon = faLocationDot;
  readonly searchIcon = faMagnifyingGlass;
  readonly routeIcon = faRoute;

  sidebarPlaceNode = computed(() => this.getArchiveSnippetNode());
  sidebarFacts = computed<SidebarFact[]>(() => {
    this.activeLang();
    const place = this.sidebarPlaceNode();
    if (!place) {
      return [];
    }
    return this.nodeFacts()
      .filter((assertion) => assertion.targetType === 'place' && assertion.targetId === place.id)
      .filter((assertion) => assertion.schemaKey !== 'place.hidden' && assertion.schemaKey !== 'place.is_foreign')
      .map((assertion) => {
        const rawValue = this.assertionValueToString(assertion);
        if (!rawValue) {
          return null;
        }
        const link = this.resolveFactLink(assertion.schemaKey, rawValue);
        return {
          id: assertion.id,
          schemaKey: assertion.schemaKey,
          schemaLabel: this.schemaKeyDisplayLabel(assertion.schemaKey),
          label: link.label,
          url: link.url
        } satisfies SidebarFact;
      })
      .filter((fact): fact is SidebarFact => fact !== null);
  });
  routeResultsVisible = computed(() => this.routingState() === 'results' && this.connectionResults().length > 0);
  simulationMinuteForMap = computed<number | null>(() => (this.animationAllowed() ? this.simulationMinute() : null));
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
    return buildArchiveSnippetUrlForNode(node, this.archiveTransform(), this.archiveIiifRoute());
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
    const aliasesById = this.nodeAliases();
    const aliases: Record<string, string[]> = {};
    for (const node of this.nodes()) {
      aliases[node.id] = aliasesById[node.id] ?? [];
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
      this.fetchEditions();
      this.fetchGraph(this.year());
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

    effect(() => {
      if (!this.isBrowser) {
        return;
      }
      const nodeId = this.selectedNodeId();
      const year = this.year();
      if (!nodeId) {
        this.nodeFacts.set([]);
        return;
      }
      this.fetchNodeFacts(nodeId, year);
    });

    effect(() => {
      if (!this.isBrowser) {
        return;
      }
      const allowed = this.animationAllowed();
      if (!allowed) {
        this.simulationPlaying.set(false);
        this.stopSimulationPlayback();
        return;
      }
      if (!this.simulationPlaying()) {
        this.simulationMinute.set(this.getCurrentMinuteOfDay());
        this.simulationPlaying.set(true);
      }
    });

    effect(() => {
      if (!this.isBrowser) {
        return;
      }
      const shouldPlay = this.animationAllowed() && this.simulationPlaying();
      if (shouldPlay) {
        this.startSimulationPlayback();
      } else {
        this.stopSimulationPlayback();
      }
    });

    effect(() => {
      if (!this.archiveModeActive()) {
        return;
      }
      this.routePlannerOpen.set(false);
      this.sidebarOpen.set(false);
      this.pickTarget.set(null);
      this.pendingMapPickTarget = null;
      this.hoveredRouteEdgeId.set(null);
    });

    effect(() => {
      const isSmall = this.smallScreenLayout();
      const archiveMode = this.archiveModeActive();
      if (!isSmall || archiveMode) {
        this.mobileSheetMode.set('closed');
        this.mobileSheetSnap.set('half');
        return;
      }
      if (this.routePlannerOpen()) {
        this.mobileSheetMode.set('planner');
        if (this.mobileSheetSnap() === 'peek') {
          this.mobileSheetSnap.set('half');
        }
        return;
      }
      if (this.selectedNodeId()) {
        this.mobileSheetMode.set('details');
        if (this.mobileSheetSnap() === 'peek') {
          this.mobileSheetSnap.set('half');
        }
        return;
      }
      if (this.routeResultsVisible()) {
        if (this.mobileSheetMode() === 'closed') {
          this.mobileSheetMode.set('results');
        }
        return;
      }
      if (!this.helpOpen() && !this.settingsOpen()) {
        this.mobileSheetMode.set('closed');
      }
    });

    effect(() => {
      const editions = this.publicEditionOptions();
      if (!editions.length) {
        return;
      }
      const currentYear = this.year();
      if (editions.some((edition) => edition.year === currentYear)) {
        return;
      }
      this.applyYearChange(editions[0].year);
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
    this.stopSimulationPlayback();
    this.langSub?.unsubscribe();
  }

  setLang(lang: 'de' | 'fr'): void {
    this.activeLang.set(lang);
    this.transloco.setActiveLang(lang);
  }

  onTripFlowNodeModeChange(value: string): void {
    if (isTripFlowNodeMode(value)) {
      this.tripFlowNodeMode.set(value);
    }
  }

  onTripFlowEdgeModeChange(value: string): void {
    if (isTripFlowEdgeMode(value)) {
      this.tripFlowEdgeMode.set(value);
    }
  }

  onEditionChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const nextYear = Number(select.value);
    if (!Number.isNaN(nextYear)) {
      this.applyYearChange(nextYear);
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
      if (this.smallScreenLayout()) {
        this.mobileSheetMode.set(routeResultsVisible ? 'results' : 'closed');
      }
      return;
    }

    if (!routeResultsVisible) {
      this.selectedConnectionId.set(null);
      this.uiState.set('details');
    }
    this.selectedNodeId.set(nodeId);
    if (this.smallScreenLayout()) {
      this.sidebarOpen.set(false);
      this.mobileSheetMode.set('details');
      this.mobileSheetSnap.set(routeResultsVisible ? 'full' : 'half');
      return;
    }
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
            if (this.smallScreenLayout()) {
              this.routePlannerOpen.set(false);
              this.mobileSheetMode.set('results');
              this.mobileSheetSnap.set('half');
              this.sidebarOpen.set(false);
            } else {
              this.sidebarOpen.set(true);
            }
          } else if (this.smallScreenLayout()) {
            this.routePlannerOpen.set(true);
            this.mobileSheetMode.set('planner');
            this.mobileSheetSnap.set('full');
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
          if (this.smallScreenLayout()) {
            this.routePlannerOpen.set(true);
            this.mobileSheetMode.set('planner');
            this.mobileSheetSnap.set('full');
          }
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
    if (this.smallScreenLayout()) {
      this.mobileSheetMode.set('results');
      this.mobileSheetSnap.set('full');
      this.sidebarOpen.set(false);
      return;
    }
    this.sidebarOpen.set(true);
  }

  closeSidebar(): void {
    if (this.routeResultsVisible()) {
      this.resetSearch();
      return;
    }
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
    if (this.archiveModeActive()) {
      this.archiveFocusNodeId.set(node.id);
      return;
    }
    this.onNodeSelected(node.id);
    this.triggerPulse(node.id);
  }

  previewPlaceSearchResult(nodeId: string, index: number): void {
    this.placeSearchActiveIndex.set(index);
    this.placeSearchPreviewId.set(nodeId);
  }

  openRoutePlanner(): void {
    this.routePlannerOpen.set(true);
    this.routePlannerFocusToken.set(this.routePlannerFocusToken() + 1);
    if (this.smallScreenLayout()) {
      this.mobileSheetMode.set('planner');
      this.mobileSheetSnap.set('full');
      this.sidebarOpen.set(false);
    }
  }

  closeRoutePlanner(): void {
    this.routePlannerOpen.set(false);
    this.pendingMapPickTarget = null;
    this.pickTarget.set(null);
    if (this.smallScreenLayout()) {
      if (this.routeResultsVisible()) {
        this.mobileSheetMode.set('results');
        this.mobileSheetSnap.set('half');
      } else if (this.selectedNodeId()) {
        this.mobileSheetMode.set('details');
        this.mobileSheetSnap.set('half');
      } else {
        this.mobileSheetMode.set('closed');
      }
    }
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
    hitSimulationTrip: unknown;
  }): void {
    if (payload.type === 'down') {
      this.pendingMapPickTarget = this.pickTarget();
    }
    if (payload.type === 'move') {
      this.hoveredNodeId.set(payload.hitNodeId);
      this.hoveredNodeScreen.set(payload.hitNodeId ? payload.screen : null);
      const hitEdgeId = payload.hitEdgeId;
      if (hitEdgeId && this.selectedRouteEdgeIds().has(hitEdgeId)) {
        this.hoveredRouteEdgeId.set(hitEdgeId);
      } else {
        this.hoveredRouteEdgeId.set(null);
      }
    }
    if (payload.type === 'up' && !payload.hitNodeId) {
      this.pendingMapPickTarget = null;
    }
  }

  onRouteLegHover(edgeId: string | null): void {
    if (edgeId && this.selectedRouteEdgeIds().has(edgeId)) {
      this.hoveredRouteEdgeId.set(edgeId);
      return;
    }
    this.hoveredRouteEdgeId.set(null);
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.pickTarget()) {
      this.pendingMapPickTarget = null;
      this.pickTarget.set(null);
    }
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    this.viewportWidth.set(this.getViewportWidth());
    this.viewportHeight.set(this.getViewportHeight());
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
    this.openRoutePlanner();
  }

  setNodeAsEnd(nodeId: string): void {
    this.onToIdChange(nodeId);
    this.pickTarget.set(null);
    this.openRoutePlanner();
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
    this.hoveredRouteEdgeId.set(null);
    this.sidebarOpen.set(false);
    if (this.smallScreenLayout()) {
      this.mobileSheetMode.set(this.routePlannerOpen() ? 'planner' : 'closed');
      this.mobileSheetSnap.set('half');
    }
  }

  setMobileSheetSnap(snap: MobileSheetSnap): void {
    this.mobileSheetSnap.set(snap);
  }

  cycleMobileSheetSnap(): void {
    const nextBySnap: Record<MobileSheetSnap, MobileSheetSnap> = {
      peek: 'half',
      half: 'full',
      full: 'peek'
    };
    this.mobileSheetSnap.set(nextBySnap[this.mobileSheetSnap()]);
  }

  openMobileResults(): void {
    if (!this.smallScreenLayout() || !this.routeResultsVisible()) {
      return;
    }
    this.selectedNodeId.set(null);
    this.mobileSheetMode.set('results');
    this.mobileSheetSnap.set('half');
  }

  closeMobileSheet(): void {
    const mode = this.mobileSheetMode();
    if (mode === 'planner') {
      this.closeRoutePlanner();
      return;
    }
    if (mode === 'details' && this.routeResultsVisible()) {
      this.selectedNodeId.set(null);
      this.mobileSheetMode.set('results');
      this.mobileSheetSnap.set('half');
      return;
    }
    if (mode === 'details') {
      this.selectedNodeId.set(null);
      this.sidebarOpen.set(false);
      this.mobileSheetMode.set('closed');
      this.mobileSheetSnap.set('half');
      return;
    }
    if (mode === 'results') {
      this.resetSearch();
      this.mobileSheetMode.set('closed');
      this.mobileSheetSnap.set('half');
    }
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

  setViewerSurfaceMode(mode: ViewerSurfaceMode): void {
    if (mode === 'archive' && !this.archiveModeEnabled) {
      return;
    }
    this.viewerSurfaceMode.set(mode);
    if (mode === 'archive' && !this.archiveFocusNodeId()) {
      this.archiveFocusNodeId.set(this.selectedNodeId() ?? this.fromId() ?? this.toId() ?? null);
    }
  }

  toggleViewerSurfaceMode(): void {
    this.setViewerSurfaceMode(this.inactiveSurfaceMode());
  }

  plannerAutoMinimize = computed(() => !this.sidebarOpen() && !this.plannerHovered() && !this.plannerFocused());
  routeFitTopInset = computed(() => {
    if (this.smallScreenLayout()) {
      return this.routePlannerOpen() ? 184 : 126;
    }
    return this.routePlannerOpen() ? 260 : 132;
  });
  viewportFocusTopInset = computed(() => (this.smallScreenLayout() ? this.routeFitTopInset() : 0));
  viewportFocusBottomInset = computed(() => (this.smallScreenLayout() ? this.mobileSheetHeight() : 0));

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

  selectedRouteEdgeIds = computed(() => {
    const selected = this.selectedConnection();
    if (!selected) {
      return new Set<string>();
    }
    return new Set(selected.legs.map((leg) => leg.edgeId));
  });

  activeHoveredRouteEdgeId = computed(() => {
    const edgeId = this.hoveredRouteEdgeId();
    if (!edgeId || !this.selectedRouteEdgeIds().has(edgeId)) {
      return null;
    }
    return edgeId;
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
      const ids = new Set(selected.legs.map((leg) => leg.edgeId));
      const hovered = this.hoveredRouteEdgeId();
      if (hovered) {
        ids.add(hovered);
      }
      return ids;
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

  private fetchEditions(): void {
    this.viewerData.getEditions().subscribe({
      next: (editions) => {
        this.editions.set(editions ?? []);
        const byYear: Record<number, string> = {};
        for (const edition of editions) {
          if (typeof edition.iiifRoute === 'string' && edition.iiifRoute.trim().length) {
            byYear[edition.year] = edition.iiifRoute.trim().replace(/\/+$/, '');
          }
        }
        this.editionIiifRoutes.set(byYear);
      },
      error: () => {
        this.editions.set([]);
        this.editionIiifRoutes.set({});
      }
    });
  }

  private fetchGraph(year: number): void {
    this.fetchNodeAliases(year);
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

  private fetchNodeAliases(year: number): void {
    this.viewerData.getNodeAliases(year).subscribe({
      next: (aliases) => this.nodeAliases.set(aliases ?? {}),
      error: () => this.nodeAliases.set({})
    });
  }

  private applyYearChange(nextYear: number): void {
    this.year.set(nextYear);
    this.fetchGraph(nextYear);
  }

  private getViewportWidth(): number {
    if (!this.isBrowser) {
      return TABLET_BREAKPOINT_PX;
    }
    return window.innerWidth || TABLET_BREAKPOINT_PX;
  }

  private getViewportHeight(): number {
    if (!this.isBrowser) {
      return 900;
    }
    return window.innerHeight || 900;
  }

  private fetchNodeFacts(nodeId: string, year: number): void {
    const requestSeq = ++this.nodeFactsRequestSeq;
    this.viewerData
      .getAssertions({
        year,
        targetType: 'place',
        targetId: nodeId
      })
      .subscribe({
        next: (facts) => {
          if (requestSeq !== this.nodeFactsRequestSeq) {
            return;
          }
          this.nodeFacts.set(facts ?? []);
        },
        error: () => {
          if (requestSeq !== this.nodeFactsRequestSeq) {
            return;
          }
          this.nodeFacts.set([]);
        }
      });
  }

  private nodeSearchTerms(node: { id: string; name: string }): string[] {
    const canonical = this.normalizeSearch(node.name);
    const aliases = (this.nodeAliases()[node.id] ?? [])
      .map((alias) => this.normalizeSearch(alias))
      .filter((alias) => alias && alias !== canonical);
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

  private getArchiveSnippetNode(): GraphNode | null {
    const snapshot = this.graph();
    if (!snapshot) {
      return null;
    }
    const preferredId = this.selectedNodeId() || this.fromId() || this.toId();
    if (preferredId) {
      return snapshot.nodes.find((node) => node.id === preferredId) ?? this.getDefaultArchiveNode();
    }
    return this.getDefaultArchiveNode();
  }

  private getArchiveStageNode(): GraphNode | null {
    const archiveFocusNodeId = this.archiveFocusNodeId();
    if (archiveFocusNodeId) {
      return this.getNodeByIdFull(archiveFocusNodeId) ?? null;
    }
    const preferredId = this.selectedNodeId() || this.fromId() || this.toId();
    return preferredId ? this.getNodeByIdFull(preferredId) : null;
  }

  private getDefaultArchiveNode(): GraphNode | null {
    const snapshot = this.graph();
    if (!snapshot) {
      return null;
    }
    return (
      snapshot.nodes.find((node) => node.name === 'Luzern') ??
      snapshot.nodes.find((node) => node.id === 'luzern') ??
      snapshot.nodes[0] ??
      null
    );
  }

  getLocalizedNote(note?: LocalizedText): string | null {
    if (!note) {
      return null;
    }
    const lang = this.transloco.getActiveLang();
    const value = (note as Record<string, string | undefined>)[lang] ?? note.de ?? note.fr;
    return value?.trim() ? value : null;
  }

  private assertionValueToString(assertion: GraphAssertion): string | null {
    if (assertion.valueType === 'string' && assertion.valueText !== null && assertion.valueText !== undefined) {
      const value = assertion.valueText.trim();
      return value.length ? value : null;
    }
    if (assertion.valueType === 'number' && assertion.valueNumber !== null && assertion.valueNumber !== undefined) {
      return String(assertion.valueNumber);
    }
    if (assertion.valueType === 'boolean' && assertion.valueBoolean !== null && assertion.valueBoolean !== undefined) {
      return assertion.valueBoolean ? 'true' : 'false';
    }
    if (assertion.valueType === 'json' && assertion.valueJson !== null && assertion.valueJson !== undefined) {
      return JSON.stringify(assertion.valueJson);
    }

    if (assertion.valueText !== null && assertion.valueText !== undefined) {
      const value = assertion.valueText.trim();
      return value.length ? value : null;
    }
    if (assertion.valueNumber !== null && assertion.valueNumber !== undefined) {
      return String(assertion.valueNumber);
    }
    if (assertion.valueBoolean !== null && assertion.valueBoolean !== undefined) {
      return assertion.valueBoolean ? 'true' : 'false';
    }
    if (assertion.valueJson !== null && assertion.valueJson !== undefined) {
      return JSON.stringify(assertion.valueJson);
    }
    return null;
  }

  private resolveFactLink(schemaKey: string, rawValue: string): { label: string; url: string | null } {
    const [rawLabel, rawLinkToken] = rawValue.split(';', 2);
    const label = rawLabel?.trim() || rawValue.trim();
    const linkToken = rawLinkToken?.trim() || null;
    const providerFromSchema = this.resolveFactProviderFromSchemaKey(schemaKey);

    if (linkToken) {
      return {
        label,
        url: this.resolveFactLinkFromToken(label, linkToken, providerFromSchema)
      };
    }

    return {
      label,
      url: this.resolveFactLinkFromToken(label, providerFromSchema ?? label, providerFromSchema)
    };
  }

  private resolveFactLinkFromToken(label: string, token: string, fallbackProvider?: string | null): string | null {
    if (/^https?:\/\//i.test(token)) {
      return token;
    }
    const provider = token.trim().toLowerCase() || (fallbackProvider?.trim().toLowerCase() ?? '');
    const template = FACT_LINK_TEMPLATES[provider];
    const normalizedValue = this.normalizeFactLinkValueForProvider(label, provider);
    if (!template) {
      if (/^https?:\/\//i.test(label)) {
        return label;
      }
      return token.includes('{value}') ? token.replace('{value}', normalizedValue ?? label) : null;
    }
    if (!normalizedValue) {
      return null;
    }
    return template.replace('{value}', normalizedValue);
  }

  private resolveFactProviderFromSchemaKey(schemaKey: string): string | null {
    const normalized = schemaKey.trim().toLowerCase();
    if (!normalized) {
      return null;
    }
    return FACT_SCHEMA_LINK_PROVIDER[normalized] ?? null;
  }

  private schemaKeyDisplayLabel(schemaKey: string): string {
    const normalized = schemaKey
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    if (!normalized) {
      return schemaKey;
    }
    const translationKey = `schemaKey.${normalized}`;
    const translated = this.transloco.translate(translationKey);
    if (!translated || translated === translationKey) {
      return schemaKey;
    }
    return translated;
  }

  private normalizeFactLinkValueForProvider(value: string, provider: string): string | null {
    const normalized = value.trim();
    if (!normalized) {
      return null;
    }
    if (provider === 'wikidata') {
      const qid = normalized.match(/Q\d+/i)?.[0];
      return qid ? qid.toUpperCase() : null;
    }
    if (provider === 'mfk') {
      const objectId = normalized.match(/mfkobject:\d+/i)?.[0];
      if (objectId) {
        return objectId.toLowerCase();
      }
      if (/^\d+$/.test(normalized)) {
        return `mfkobject:${normalized}`;
      }
      return normalized;
    }
    return normalized;
  }


  private ensureConnectionId(option: ConnectionOption, index: number): ConnectionOption {
    const id = option.id || `${option.from}-${option.to}-${index}`;
    const transfers = option.transfers ?? option.legs.length - 1;
    const legs = option.legs.map((leg) => this.ensureLegDuration(leg));
    const kind = option.kind ?? 'COMPLETE_JOURNEY';
    return { ...option, id, transfers, legs, kind };
  }

  private ensureLegDuration(leg: ConnectionLeg): ConnectionLeg {
    if (leg.durationMinutes !== undefined && leg.durationMinutes >= 0) {
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
    const normalized = Math.max(0, totalMinutes);
    const days = Math.floor(normalized / 1440);
    const hours = Math.floor((normalized % 1440) / 60);
    const minutes = normalized % 60;
    if (days > 0) {
      return `${days}d ${hours}h ${minutes.toString().padStart(2, '0')}m`;
    }
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

  private startSimulationPlayback(): void {
    if (!this.isBrowser || this.simulationRafId !== null) {
      return;
    }
    this.simulationLastTs = null;
    this.simulationRafId = requestAnimationFrame(this.onSimulationFrame);
  }

  private stopSimulationPlayback(): void {
    if (!this.isBrowser) {
      return;
    }
    if (this.simulationRafId !== null) {
      cancelAnimationFrame(this.simulationRafId);
    }
    this.simulationRafId = null;
    this.simulationLastTs = null;
  }

  private readonly onSimulationFrame = (ts: number): void => {
    if (!this.isBrowser) {
      return;
    }
    if (!this.animationAllowed() || !this.simulationPlaying()) {
      this.simulationRafId = null;
      this.simulationLastTs = null;
      return;
    }
    if (this.simulationLastTs === null) {
      this.simulationLastTs = ts;
    }
    const deltaMs = Math.max(0, ts - this.simulationLastTs);
    this.simulationLastTs = ts;
    const minuteAdvance = (deltaMs / SIMULATION_DAY_MS) * MINUTES_PER_DAY * 3;
    if (minuteAdvance > 0) {
      this.simulationMinute.set(this.normalizeMinuteOfDay(this.simulationMinute() + minuteAdvance));
    }
    this.simulationRafId = requestAnimationFrame(this.onSimulationFrame);
  };

  private getCurrentMinuteOfDay(): number {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60 + now.getMilliseconds() / 60000;
  }

  private normalizeMinuteOfDay(value: number): number {
    return ((value % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
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
