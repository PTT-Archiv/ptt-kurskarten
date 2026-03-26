import { PLATFORM_ID, computed, effect, inject, Injectable, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import type {
  ConnectionOption,
  EditionEntry,
  GraphAssertion,
  GraphNode,
  GraphSnapshot,
  LocalizedText,
  TimeHHMM
} from '@ptt-kurskarten/shared';
import { TranslocoService } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { buildWaitSegments, type WaitSegment } from '../../shared/routing/connection-details.util';
import { ViewerDataService } from './viewer-data.service';
import { environment } from '../../../environments/environment';
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
import {
  assertionValueToString,
  normalizeFactLinkValueForProvider,
  resolveFactLink,
  resolveFactProviderFromSchemaKey
} from './viewer-facts.util';
import {
  computeLegDurationMinutes,
  ensureConnectionId,
  formatDuration,
  formatTimeMinutes,
  parseTimeMinutes
} from './viewer-routing.util';
import { nodeSearchTerms, normalizeSearch } from './viewer-search.util';
import type {
  MobileSheetMode,
  MobileSheetSnap,
  SidebarFact,
  SidebarNodeTrip,
  TripFlowModeOption,
  ViewerFloatingActionsVm,
  ViewerHeaderVm,
  ViewerMobileSheetVm,
  ViewerPlaceDetailsVm,
  ViewerResultsVm,
  ViewerRouteDetailsVm,
  ViewerRouteNodePanelVm,
  ViewerSidebarVm,
  ViewerSurfaceMode
} from './viewer.models';

const DEFAULT_YEAR = 1852;
const MINUTES_PER_DAY = 1440;
const SIMULATION_DAY_MS = 60_000;
const TABLET_BREAKPOINT_PX = 1024;
const MOBILE_BREAKPOINT_PX = 768;

@Injectable()
export class ViewerFacade {
  private readonly viewerData = inject(ViewerDataService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly transloco = inject(TranslocoService);

  readonly readonlyViewer = environment.readonlyViewer;
  readonly archiveModeEnabled = environment.enableArchiveMode;
  readonly mapLayerPreviewUrl = 'assets/maps/switzerland.svg';

  readonly year = signal<number>(DEFAULT_YEAR);
  readonly graph = signal<GraphSnapshot | null>(null);
  readonly selectedNodeId = signal<string | null>(null);
  readonly availableYears = signal<number[]>([]);
  readonly editions = signal<EditionEntry[]>([]);
  readonly fromId = signal<string>('');
  readonly toId = signal<string>('');
  readonly departTime = signal<TimeHHMM>('08:00');
  readonly draftDepartTime = signal<TimeHHMM>('08:00');
  readonly hasSearched = signal(false);
  readonly connectionResults = signal<ConnectionOption[]>([]);
  readonly selectedConnectionId = signal<string | null>(null);
  readonly showConnectionDetailsOnMap = signal(true);
  readonly routingState = signal<'idle' | 'searching' | 'results' | 'no_results' | 'error'>('idle');
  readonly sidebarOpen = signal(false);
  readonly plannerHovered = signal(false);
  readonly plannerFocused = signal(false);
  readonly lastSearchParams = signal<{ from: string; to: string; time: TimeHHMM; year: number } | null>(null);
  readonly lastResultParams = signal<{ from: string; to: string; year: number } | null>(null);
  readonly mapSettled = signal(false);
  readonly helpOpen = signal(false);
  readonly settingsOpen = signal(false);
  readonly viewportWidth = signal<number>(this.getViewportWidth());
  readonly viewportHeight = signal<number>(this.getViewportHeight());
  readonly mobileSheetMode = signal<MobileSheetMode>('closed');
  readonly mobileSheetSnap = signal<MobileSheetSnap>('half');
  readonly activeLang = signal<'de' | 'fr'>(this.transloco.getActiveLang() === 'fr' ? 'fr' : 'de');
  readonly resetViewportToken = signal(0);
  readonly viewerSurfaceMode = signal<ViewerSurfaceMode>('map');
  readonly tripFlowNodeMode = signal<TripFlowNodeMode>('always-active');
  readonly tripFlowEdgeMode = signal<TripFlowEdgeMode>('always-active');
  readonly simulationPlaying = signal(false);
  readonly simulationMinute = signal(0);
  readonly pickTarget = signal<'from' | 'to' | null>(null);
  readonly hoveredNodeId = signal<string | null>(null);
  readonly hoveredNodeScreen = signal<{ x: number; y: number } | null>(null);
  readonly routePlannerOpen = signal(false);
  readonly routePlannerFocusToken = signal(0);
  readonly placeSearchQuery = signal('');
  readonly placeSearchOpen = signal(false);
  readonly placeSearchActiveIndex = signal(0);
  readonly hoveredRouteEdgeId = signal<string | null>(null);

  private readonly transientPulseIds = signal<Set<string>>(new Set());
  private readonly fromPreviewId = signal<string>('');
  private readonly toPreviewId = signal<string>('');
  private readonly archiveTransform = signal<ArchiveTransform>(computeArchiveTransform());
  private readonly editionIiifRoutes = signal<Record<number, string>>({});
  private readonly archiveFocusNodeId = signal<string | null>(null);
  private readonly placeSearchPreviewId = signal<string>('');
  private readonly nodeAliases = signal<Record<string, string[]>>({});
  private readonly nodeFacts = signal<GraphAssertion[]>([]);
  private plannerBlurHandle: ReturnType<typeof setTimeout> | null = null;
  private placeSearchBlurHandle: ReturnType<typeof setTimeout> | null = null;
  private readonly pulseTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
  private nodeFactsRequestSeq = 0;
  private langSub?: Subscription;
  private pendingMapPickTarget: 'from' | 'to' | null = null;
  private simulationRafId: number | null = null;
  private simulationLastTs: number | null = null;
  private searchHandle: ReturnType<typeof setTimeout> | null = null;

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

  readonly pulseNodeIds = computed(() => {
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

  readonly nodes = computed(() => {
    const snapshot = this.graph();
    if (!snapshot) {
      return [];
    }
    return [...snapshot.nodes].sort((a, b) => a.name.localeCompare(b.name));
  });

  readonly nodeNameById = computed<Record<string, string>>(() => {
    const byId: Record<string, string> = {};
    for (const node of this.nodes()) {
      byId[node.id] = node.name;
    }
    return byId;
  });

  readonly archiveIiifRoute = computed(() => normalizeIiifRoute(this.editionIiifRoutes()[this.year()]));
  readonly archiveIiifInfoUrl = computed(() => buildArchiveIiifInfoUrl(this.archiveIiifRoute()));
  readonly publicEditionOptions = computed(() => {
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

  readonly selectedEditionLabel = computed(() => {
    const currentYear = this.year();
    const editions = this.publicEditionOptions();
    const selected = editions.find((edition) => edition.year === currentYear);
    if (selected) {
      return selected.title || String(selected.year);
    }
    const anyEdition = this.editions().find((edition) => edition.year === currentYear);
    return anyEdition?.title || String(currentYear);
  });

  readonly smallScreenLayout = computed(() => this.viewportWidth() < TABLET_BREAKPOINT_PX);
  readonly mobileLayout = computed(() => this.viewportWidth() < MOBILE_BREAKPOINT_PX);
  readonly mobileSheetVisible = computed(
    () => !this.archiveModeActive() && this.smallScreenLayout() && this.mobileSheetMode() !== 'closed'
  );
  readonly mobileSheetHeight = computed(() => {
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

  readonly archiveSnippetUrl = computed(() => {
    const node = this.getArchiveSnippetNode();
    const transform = this.archiveTransform();
    const iiifRoute = this.archiveIiifRoute();
    if (node) {
      return buildArchiveSnippetUrlForNode(node, transform, iiifRoute);
    }
    return buildArchiveSnippetUrlFromRegionWithBase(ARCHIVE_DEFAULT_REGION, iiifRoute);
  });

  readonly archiveModeActive = computed(() => this.archiveModeEnabled && this.viewerSurfaceMode() === 'archive');
  readonly sidePanelVisible = computed(() => {
    if (this.archiveModeActive()) {
      return false;
    }
    if (this.smallScreenLayout()) {
      const mode = this.mobileSheetMode();
      return mode === 'results' || mode === 'details';
    }
    return this.sidebarOpen();
  });
  readonly animationAllowed = computed(() => !this.archiveModeActive() && !this.sidePanelVisible());
  readonly orbitVisible = computed(() => this.animationAllowed());
  readonly actionStackBottomOffset = computed(() => {
    const baseOffset = this.mobileLayout() ? 12 : 16;
    return this.mobileSheetVisible() ? this.mobileSheetHeight() + baseOffset : baseOffset;
  });
  readonly inactiveSurfaceMode = computed<ViewerSurfaceMode>(() => (this.viewerSurfaceMode() === 'map' ? 'archive' : 'map'));
  readonly inactiveSurfacePreviewImageUrl = computed(() => {
    if (this.inactiveSurfaceMode() === 'map') {
      return this.mapLayerPreviewUrl;
    }
    return this.archiveStageImageUrl() || this.archiveSnippetUrl() || '';
  });
  readonly archiveStageInitialCenter = computed(() => {
    const node = this.getDefaultArchiveNode();
    if (!node) {
      return null;
    }
    return getArchiveIiifCenter(node, this.archiveTransform());
  });
  readonly archiveStageImageUrl = computed(() => {
    const node = this.getArchiveStageNode();
    const transform = this.archiveTransform();
    const iiifRoute = this.archiveIiifRoute();
    if (node) {
      return buildArchiveSnippetUrlForNode(node, transform, iiifRoute);
    }
    return '';
  });

  readonly sidebarPlaceNode = computed(() => this.getArchiveSnippetNode());
  readonly sidebarFacts = computed<SidebarFact[]>(() => {
    this.activeLang();
    const place = this.sidebarPlaceNode();
    if (!place) {
      return [];
    }
    return this.nodeFacts()
      .filter((assertion) => assertion.targetType === 'place' && assertion.targetId === place.id)
      .filter((assertion) => assertion.schemaKey !== 'place.hidden' && assertion.schemaKey !== 'place.is_foreign')
      .map((assertion) => {
        const rawValue = assertionValueToString(assertion);
        if (!rawValue) {
          return null;
        }
        const link = resolveFactLink(assertion.schemaKey, rawValue);
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

  readonly routeResultsVisible = computed(() => this.routingState() === 'results' && this.connectionResults().length > 0);
  readonly simulationMinuteForMap = computed<number | null>(() => (this.animationAllowed() ? this.simulationMinute() : null));
  readonly routeSidebarTitle = computed(() => {
    const selected = this.selectedConnection();
    const from = selected?.from ?? this.fromId();
    const to = selected?.to ?? this.toId();
    if (!from || !to) {
      return this.transloco.translate('viewer.details');
    }
    return `${this.getNodeLabel(from)} → ${this.getNodeLabel(to)}`;
  });
  readonly routeNodePanelNode = computed(() => this.getNodeById(this.selectedNodeId()));
  readonly routeNodePanelSnippetUrl = computed(() => {
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
  readonly showRouteNodePanel = computed(() => this.routeResultsVisible() && this.sidebarOpen() && !!this.selectedNodeId());
  readonly placeSearchResults = computed(() => {
    const q = normalizeSearch(this.placeSearchQuery());
    if (!q) {
      return this.nodes().slice(0, 12);
    }
    const aliasesById = this.nodeAliases();
    return this.nodes()
      .filter((node) => nodeSearchTerms(node, aliasesById).some((term) => term.includes(q)))
      .slice(0, 12);
  });

  readonly nodeAliasesById = computed<Record<string, string[]>>(() => {
    const aliasesById = this.nodeAliases();
    const aliases: Record<string, string[]> = {};
    for (const node of this.nodes()) {
      aliases[node.id] = aliasesById[node.id] ?? [];
    }
    return aliases;
  });

  readonly mobileSheetTitle = computed(() => {
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

  readonly mobileShowResultsBack = computed(() => this.mobileSheetMode() === 'details' && this.routeResultsVisible());
  readonly selectedConnection = computed(() => {
    const id = this.selectedConnectionId();
    if (!id) {
      return null;
    }
    return this.connectionResults().find((option) => option.id === id) ?? null;
  });
  readonly routingActive = computed(() => this.routingState() === 'results' && this.selectedConnectionId() !== null);
  readonly endpointNodeIds = computed(() => {
    const ids = new Set<string>();
    const from = this.fromId();
    const to = this.toId();
    if (from) ids.add(from);
    if (to) ids.add(to);
    return ids.size > 0 ? ids : null;
  });
  readonly selectedWaitSegments = computed<WaitSegment[]>(() => {
    const selected = this.selectedConnection();
    return selected ? buildWaitSegments(selected) : [];
  });
  readonly selectedRouteEdgeIds = computed(() => {
    const selected = this.selectedConnection();
    if (!selected) {
      return new Set<string>();
    }
    return new Set(selected.legs.map((leg) => leg.edgeId));
  });
  readonly activeHoveredRouteEdgeId = computed(() => {
    const edgeId = this.hoveredRouteEdgeId();
    return edgeId && this.selectedRouteEdgeIds().has(edgeId) ? edgeId : null;
  });
  readonly outgoingNodeTrips = computed<SidebarNodeTrip[]>(() => {
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
  readonly incomingNodeTrips = computed<SidebarNodeTrip[]>(() => {
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
  readonly highlightedEdgeIds = computed(() => {
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
    return new Set(snapshot.edges.filter((edge) => edge.from === nodeId || edge.to === nodeId).map((edge) => edge.id));
  });
  readonly highlightedNodeIds = computed(() => {
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
    return nodeId ? new Set([nodeId]) : null;
  });
  readonly routeFitTopInset = computed(() => {
    if (this.smallScreenLayout()) {
      return this.routePlannerOpen() ? 184 : 126;
    }
    return this.routePlannerOpen() ? 260 : 132;
  });
  readonly viewportFocusTopInset = computed(() => (this.smallScreenLayout() ? this.routeFitTopInset() : 0));
  readonly viewportFocusBottomInset = computed(() => (this.smallScreenLayout() ? this.mobileSheetHeight() : 0));

  readonly headerVm = computed<ViewerHeaderVm>(() => ({
    archiveModeActive: this.archiveModeActive(),
    routePlannerOpen: this.routePlannerOpen(),
    smallScreenLayout: this.smallScreenLayout(),
    orbitVisible: this.orbitVisible(),
    simulationMinute: this.simulationMinute(),
    year: this.year(),
    editionTitle: this.transloco.translate('viewer.editionTitle'),
    publicEditionOptions: this.publicEditionOptions(),
    selectedEditionLabel: this.selectedEditionLabel(),
    placeSearchQuery: this.placeSearchQuery(),
    placeSearchOpen: this.placeSearchOpen(),
    placeSearchActiveIndex: this.placeSearchActiveIndex(),
    placeSearchResults: this.placeSearchResults()
  }));

  readonly resultsVm = computed<ViewerResultsVm>(() => ({
    routingState: this.routingState(),
    connectionResults: this.connectionResults(),
    selectedConnectionId: this.selectedConnectionId(),
    noResultsMessage: this.getNoResultsMessage(),
    getNodeLabel: (id: string) => this.getNodeLabel(id),
    formatDuration
  }));

  readonly routeDetailsVm = computed<ViewerRouteDetailsVm>(() => ({
    selectedConnection: this.selectedConnection(),
    selectedWaitSegments: this.selectedWaitSegments(),
    activeHoveredRouteEdgeId: this.activeHoveredRouteEdgeId(),
    showConnectionDetailsOnMap: this.showConnectionDetailsOnMap(),
    getNodeLabel: (id: string) => this.getNodeLabel(id),
    getNodeName: (id: string) => this.getNodeName(id),
    getLocalizedNote: (note?: LocalizedText) => this.getLocalizedNote(note),
    formatDuration
  }));

  readonly placeDetailsVm = computed<ViewerPlaceDetailsVm>(() => ({
    place: this.sidebarPlaceNode() ? { id: this.sidebarPlaceNode()!.id, name: this.sidebarPlaceNode()!.name } : null,
    archiveSnippetUrl: this.archiveSnippetUrl(),
    archiveIiifInfoUrl: this.archiveIiifInfoUrl(),
    sidebarFacts: this.sidebarFacts(),
    outgoingNodeTrips: this.outgoingNodeTrips(),
    incomingNodeTrips: this.incomingNodeTrips()
  }));

  readonly sidebarVm = computed<ViewerSidebarVm>(() => ({
    isOpen: this.sidebarOpen(),
    title: this.routeResultsVisible()
      ? this.routeSidebarTitle()
      : this.sidebarPlaceNode()?.name ?? this.transloco.translate('viewer.details'),
    routeResultsVisible: this.routeResultsVisible(),
    resultsVm: this.resultsVm(),
    routeDetailsVm: this.routeDetailsVm(),
    placeDetailsVm: this.placeDetailsVm()
  }));

  readonly routeNodePanelVm = computed<ViewerRouteNodePanelVm>(() => ({
    visible: this.showRouteNodePanel(),
    node: this.routeNodePanelNode(),
    snippetUrl: this.routeNodePanelSnippetUrl(),
    archiveIiifInfoUrl: this.archiveIiifInfoUrl()
  }));

  readonly mobileSheetVm = computed<ViewerMobileSheetVm>(() => ({
    visible: this.mobileSheetVisible(),
    snap: this.mobileSheetSnap(),
    title: this.mobileSheetTitle(),
    showResultsBack: this.mobileShowResultsBack(),
    mode: this.mobileSheetMode(),
    resultsVm: this.resultsVm(),
    routeDetailsVm: this.routeDetailsVm(),
    placeDetailsVm: this.placeDetailsVm()
  }));

  readonly floatingActionsVm = computed<ViewerFloatingActionsVm>(() => ({
    helpOpen: this.helpOpen(),
    settingsOpen: this.settingsOpen(),
    actionStackBottomOffset: this.actionStackBottomOffset(),
    archiveModeEnabled: this.archiveModeEnabled,
    archiveModeActive: this.archiveModeActive(),
    inactiveSurfaceMode: this.inactiveSurfaceMode(),
    inactiveSurfacePreviewImageUrl: this.inactiveSurfacePreviewImageUrl(),
    pickModeLabel: this.getPickModeLabel(),
    pickModeVisible: !this.archiveModeActive() && !!this.pickTarget(),
    resetViewVisible: !this.archiveModeActive(),
    activeLang: this.activeLang(),
    readonlyViewer: this.readonlyViewer,
    tripFlowNodeMode: this.tripFlowNodeMode(),
    tripFlowEdgeMode: this.tripFlowEdgeMode(),
    tripFlowNodeModeOptions: this.tripFlowNodeModeOptions,
    tripFlowEdgeModeOptions: this.tripFlowEdgeModeOptions
  }));

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
      this.searchHandle = setTimeout(() => this.onSearchConnections(), 300);
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
      if (!editions.some((edition) => edition.year === currentYear)) {
        this.applyYearChange(editions[0].year);
      }
    });
  }

  afterViewInit(): void {
    if (!this.isBrowser) {
      return;
    }
    requestAnimationFrame(() => this.mapSettled.set(true));
  }

  destroy(): void {
    if (this.searchHandle) clearTimeout(this.searchHandle);
    if (this.plannerBlurHandle) clearTimeout(this.plannerBlurHandle);
    if (this.placeSearchBlurHandle) clearTimeout(this.placeSearchBlurHandle);
    this.stopSimulationPlayback();
    this.langSub?.unsubscribe();
  }

  toggleHelp(): void {
    this.helpOpen.set(!this.helpOpen());
    this.settingsOpen.set(false);
  }

  toggleSettings(): void {
    this.settingsOpen.set(!this.settingsOpen());
    this.helpOpen.set(false);
  }

  closeHelp(): void {
    this.helpOpen.set(false);
  }

  closeSettings(): void {
    this.settingsOpen.set(false);
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

  selectEdition(year: number): void {
    if (Number.isFinite(year) && year !== this.year()) {
      this.applyYearChange(year);
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
    this.lastSearchParams.set({ from, to, time: depart, year });
    this.viewerData.getConnections({
      year,
      from,
      to,
      depart,
      k: 10,
      allowForeignStartFallback: true
    }).subscribe({
      next: (options) => {
        const normalized = (options ?? []).map((option, index) => ensureConnectionId(option, index));
        this.connectionResults.set(normalized);
        this.selectedConnectionId.set(normalized[0]?.id ?? null);
        const hasResults = normalized.length > 0;
        this.routingState.set(hasResults ? 'results' : 'no_results');
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
    const total = parseTimeMinutes(current) + minutes;
    const normalized = ((total % 1440) + 1440) % 1440;
    const next = formatTimeMinutes(normalized);
    this.draftDepartTime.set(next);
    this.departTime.set(next);
    this.onSearchConnections();
  }

  selectConnection(option: ConnectionOption): void {
    this.selectedConnectionId.set(option.id ?? null);
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
      this.plannerFocused.set(true);
      return;
    }
    this.plannerBlurHandle = setTimeout(() => this.plannerFocused.set(false), 120);
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

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.pickTarget()) {
      this.pendingMapPickTarget = null;
      this.pickTarget.set(null);
    }
  }

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
    if (next !== this.departTime()) {
      this.departTime.set(next);
      this.onSearchConnections();
    }
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
    const nextBySnap: Record<MobileSheetSnap, MobileSheetSnap> = { peek: 'half', half: 'full', full: 'peek' };
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

  getNodeName(id: string): string {
    return this.nodeNameById()[id] ?? '—';
  }

  getNodeLabel(id: string): string {
    return this.nodeNameById()[id] ?? id;
  }

  getNodeById(id: string | null): { id: string; name: string } | null {
    if (!id) return null;
    const name = this.nodeNameById()[id];
    return name ? { id, name } : null;
  }

  getLocalizedNote(note?: LocalizedText): string | null {
    if (!note) {
      return null;
    }
    const lang = this.transloco.getActiveLang();
    const value = (note as Record<string, string | undefined>)[lang] ?? note.de ?? note.fr;
    return value?.trim() ? value : null;
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
      error: () => this.graph.set(null)
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
    return this.isBrowser ? window.innerWidth || TABLET_BREAKPOINT_PX : TABLET_BREAKPOINT_PX;
  }

  private getViewportHeight(): number {
    return this.isBrowser ? window.innerHeight || 900 : 900;
  }

  private fetchNodeFacts(nodeId: string, year: number): void {
    const requestSeq = ++this.nodeFactsRequestSeq;
    this.viewerData.getAssertions({ year, targetType: 'place', targetId: nodeId }).subscribe({
      next: (facts) => {
        if (requestSeq === this.nodeFactsRequestSeq) {
          this.nodeFacts.set(facts ?? []);
        }
      },
      error: () => {
        if (requestSeq === this.nodeFactsRequestSeq) {
          this.nodeFacts.set([]);
        }
      }
    });
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

  private getNodeByIdFull(id: string): GraphNode | null {
    const snapshot = this.graph();
    return snapshot?.nodes.find((node) => node.id === id) ?? null;
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
    return !translated || translated === translationKey ? schemaKey : translated;
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
      return parseTimeMinutes(trip.departs);
    }
    if (trip.arrives) {
      return parseTimeMinutes(trip.arrives) + 720;
    }
    return Number.MAX_SAFE_INTEGER;
  }
}
