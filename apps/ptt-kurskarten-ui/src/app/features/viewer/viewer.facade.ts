import { computed, effect, inject, Injectable } from '@angular/core';
import type {
  ConnectionOption,
  GraphAssertion,
  LocalizedText,
  TimeHHMM
} from '@ptt-kurskarten/shared';
import { TranslocoService } from '@jsverse/transloco';
import {
  assertionValueToString,
  resolveFactLink
} from './utils/viewer-facts.util';
import {
  buildArchiveSnippetUrlForNode
} from '../../shared/archive/archive-snippet.util';
import {
  formatDuration
} from './utils/viewer-routing.util';
import type {
  SidebarFact,
  SidebarNodeTrip,
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
import { tripSortValue } from './utils/viewer-node-selectors.util';
import { ViewerArchiveStore } from './stores/viewer-archive.store';
import { ViewerCoreStore } from './stores/viewer-core.store';
import { ViewerLayoutStore } from './stores/viewer-layout.store';
import { ViewerRoutingStore } from './stores/viewer-routing.store';
import { ViewerSearchStore } from './stores/viewer-search.store';
import { ViewerSimulationStore } from './stores/viewer-simulation.store';

const PLACE_HIDDEN_SCHEMA_KEY = 'place.hidden';
const PLACE_FOREIGN_SCHEMA_KEY = 'place.is_foreign';
const PICK_TARGET_FROM = 'from';
const PICK_TARGET_TO = 'to';
const MOBILE_SHEET_MODE_CLOSED = 'closed';
const MOBILE_SHEET_MODE_PLANNER = 'planner';
const MOBILE_SHEET_MODE_RESULTS = 'results';
const MOBILE_SHEET_MODE_DETAILS = 'details';
const MOBILE_SHEET_SNAP_HALF = 'half';
const MOBILE_SHEET_SNAP_FULL = 'full';
const PLACE_SEARCH_NEXT_STEP = 1;
const PLACE_SEARCH_PREVIOUS_STEP = -1;
const PLACE_SEARCH_DEBOUNCE_MS = 300;
const KEY_ARROW_DOWN = 'ArrowDown';
const KEY_ARROW_UP = 'ArrowUp';
const KEY_ENTER = 'Enter';
const KEY_ESCAPE = 'Escape';
const ROUTE_PLANNER_TITLE = 'Routing';
const EMPTY_TEXT = '';
const SCHEMA_KEY_NORMALIZE_PATTERN = /[^a-z0-9]+/g;
const SCHEMA_KEY_TRIM_PATTERN = /^_+|_+$/g;

@Injectable()
export class ViewerFacade {
  private readonly transloco = inject(TranslocoService);
  private readonly core = inject(ViewerCoreStore);
  private readonly routing = inject(ViewerRoutingStore);
  private readonly search = inject(ViewerSearchStore);
  private readonly layout = inject(ViewerLayoutStore);
  private readonly archive = inject(ViewerArchiveStore);
  private readonly simulation = inject(ViewerSimulationStore);

  private searchHandle: ReturnType<typeof setTimeout> | null = null;

  readonly readonlyViewer = this.core.readonlyViewer;
  readonly archiveModeEnabled = this.core.archiveModeEnabled;
  readonly mapLayerPreviewUrl = this.core.mapLayerPreviewUrl;

  readonly year = this.core.year;
  readonly graph = this.core.graph;
  readonly selectedNodeId = this.core.selectedNodeId;
  readonly availableYears = this.core.availableYears;
  readonly editions = this.core.editions;
  readonly nodeFacts = this.core.nodeFacts;
  readonly nodeAliasesById = this.core.nodeAliasesById;
  readonly mapSettled = this.core.mapSettled;
  readonly activeLang = this.core.activeLang;
  readonly viewportWidth = this.core.viewportWidth;
  readonly viewportHeight = this.core.viewportHeight;
  readonly resetViewportToken = this.core.resetViewportToken;
  readonly hoveredNodeId = this.core.hoveredNodeId;
  readonly hoveredNodeScreen = this.core.hoveredNodeScreen;
  readonly publicEditionOptions = this.core.publicEditionOptions;
  readonly selectedEditionLabel = this.core.selectedEditionLabel;
  readonly nodes = this.core.nodes;

  readonly fromId = this.routing.fromId;
  readonly toId = this.routing.toId;
  readonly departTime = this.routing.departTime;
  readonly draftDepartTime = this.routing.draftDepartTime;
  readonly hasSearched = this.routing.hasSearched;
  readonly connectionResults = this.routing.connectionResults;
  readonly selectedConnectionId = this.routing.selectedConnectionId;
  readonly showConnectionDetailsOnMap = this.routing.showConnectionDetailsOnMap;
  readonly routingState = this.routing.routingState;
  readonly selectedConnection = this.routing.selectedConnection;
  readonly routeResultsVisible = this.routing.routeResultsVisible;
  readonly routingActive = this.routing.routingActive;
  readonly endpointNodeIds = this.routing.endpointNodeIds;
  readonly selectedWaitSegments = this.routing.selectedWaitSegments;
  readonly selectedRouteEdgeIds = this.routing.selectedRouteEdgeIds;
  readonly activeHoveredRouteEdgeId = this.routing.activeHoveredRouteEdgeId;
  readonly highlightedEdgeIds = this.routing.highlightedEdgeIds;
  readonly highlightedNodeIds = this.routing.highlightedNodeIds;
  readonly hoveredRouteEdgeId = this.routing.hoveredRouteEdgeId;

  readonly placeSearchQuery = this.search.placeSearchQuery;
  readonly placeSearchOpen = this.search.placeSearchOpen;
  readonly placeSearchActiveIndex = this.search.placeSearchActiveIndex;
  readonly placeSearchResults = this.search.placeSearchResults;

  readonly sidebarOpen = this.layout.sidebarOpen;
  readonly helpOpen = this.layout.helpOpen;
  readonly settingsOpen = this.layout.settingsOpen;
  readonly mobileSheetMode = this.layout.mobileSheetMode;
  readonly mobileSheetSnap = this.layout.mobileSheetSnap;
  readonly routePlannerOpen = this.layout.routePlannerOpen;
  readonly routePlannerFocusToken = this.layout.routePlannerFocusToken;
  readonly pickTarget = this.layout.pickTarget;
  readonly smallScreenLayout = this.layout.smallScreenLayout;
  readonly mobileLayout = this.layout.mobileLayout;
  readonly mobileSheetVisible = this.layout.mobileSheetVisible;
  readonly mobileSheetHeight = this.layout.mobileSheetHeight;
  readonly sidePanelVisible = this.layout.sidePanelVisible;
  readonly actionStackBottomOffset = this.layout.actionStackBottomOffset;
  readonly routeFitTopInset = this.layout.routeFitTopInset;
  readonly viewportFocusTopInset = this.layout.viewportFocusTopInset;
  readonly viewportFocusBottomInset = this.layout.viewportFocusBottomInset;

  readonly viewerSurfaceMode = this.archive.viewerSurfaceMode;
  readonly archiveIiifRoute = this.archive.archiveIiifRoute;
  readonly archiveIiifInfoUrl = this.archive.archiveIiifInfoUrl;
  readonly archiveTransform = this.archive.archiveTransform;
  readonly archiveSnippetUrl = this.archive.archiveSnippetUrl;
  readonly archiveModeActive = this.archive.archiveModeActive;
  readonly inactiveSurfaceMode = this.archive.inactiveSurfaceMode;
  readonly inactiveSurfacePreviewImageUrl = this.archive.inactiveSurfacePreviewImageUrl;
  readonly archiveStageInitialCenter = this.archive.archiveStageInitialCenter;
  readonly archiveStageImageUrl = this.archive.archiveStageImageUrl;

  readonly tripFlowNodeMode = this.simulation.tripFlowNodeMode;
  readonly tripFlowEdgeMode = this.simulation.tripFlowEdgeMode;
  readonly simulationPlaying = this.simulation.simulationPlaying;
  readonly simulationMinute = this.simulation.simulationMinute;
  readonly animationAllowed = this.simulation.animationAllowed;
  readonly orbitVisible = this.simulation.orbitVisible;
  readonly simulationMinuteForMap = this.simulation.simulationMinuteForMap;

  readonly pulseNodeIds = computed(() => {
    const ids = new Set(this.core.transientPulseIds());
    const from = this.routing.fromPreviewId();
    const to = this.routing.toPreviewId();
    if (from) {
      ids.add(from);
    }
    if (to) {
      ids.add(to);
    }
    const placePreview = this.search.placeSearchPreviewId();
    if (placePreview) {
      ids.add(placePreview);
    }
    return ids;
  });

  readonly sidebarPlaceNode = this.archive.archiveSnippetNode;

  readonly sidebarFacts = computed<SidebarFact[]>(() => {
    this.core.activeLang();
    const place = this.sidebarPlaceNode();
    if (!place) {
      return [];
    }
    return this.nodeFacts()
      .filter((assertion) => assertion.targetType === 'place' && assertion.targetId === place.id)
      .filter(
        (assertion) =>
          assertion.schemaKey !== PLACE_HIDDEN_SCHEMA_KEY && assertion.schemaKey !== PLACE_FOREIGN_SCHEMA_KEY
      )
      .map((assertion) => this.mapSidebarFact(assertion))
      .filter((fact): fact is SidebarFact => fact !== null);
  });

  readonly routeSidebarTitle = computed(() => {
    const selected = this.selectedConnection();
    const from = selected?.from ?? this.fromId();
    const to = selected?.to ?? this.toId();
    if (!from || !to) {
      return this.transloco.translate('viewer.details');
    }
    return `${this.getNodeLabel(from)} → ${this.getNodeLabel(to)}`;
  });

  readonly routeNodePanelNode = computed(() => this.core.getNodeById(this.selectedNodeId()));

  readonly routeNodePanelSnippetUrl = computed(() => {
    const nodeId = this.selectedNodeId();
    if (!nodeId) {
      return null;
    }
    const node = this.core.getNodeByIdFull(nodeId);
    if (!node) {
      return null;
    }
    return buildArchiveSnippetUrlForNode(node, this.archiveTransform(), this.archiveIiifRoute());
  });

  readonly showRouteNodePanel = computed(
    () => this.routeResultsVisible() && this.sidebarOpen() && !!this.selectedNodeId()
  );

  readonly mobileSheetTitle = computed(() => {
    const mode = this.mobileSheetMode();
    if (mode === MOBILE_SHEET_MODE_DETAILS) {
      return this.routeNodePanelNode()?.name ?? this.sidebarPlaceNode()?.name ?? this.transloco.translate('viewer.details');
    }
    if (mode === MOBILE_SHEET_MODE_RESULTS) {
      return this.transloco.translate('viewer.results');
    }
    if (mode === MOBILE_SHEET_MODE_PLANNER) {
      return ROUTE_PLANNER_TITLE;
    }
    return EMPTY_TEXT;
  });

  readonly mobileShowResultsBack = computed(
    () => this.mobileSheetMode() === MOBILE_SHEET_MODE_DETAILS && this.routeResultsVisible()
  );

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
    return rows.sort((a, b) => tripSortValue(a) - tripSortValue(b));
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
    return rows.sort((a, b) => tripSortValue(a) - tripSortValue(b));
  });

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
    tripFlowNodeModeOptions: this.simulation.tripFlowNodeModeOptions,
    tripFlowEdgeModeOptions: this.simulation.tripFlowEdgeModeOptions
  }));

  constructor() {
    this.core.init();
    this.setupRoutingSearchEffect();
    this.setupNodeFactsEffect();
    this.setupSimulationEffects();
    this.setupArchiveModeEffect();
    this.setupMobileSheetModeEffect();
    this.setupEditionFallbackEffect();
  }

  afterViewInit(): void {
    this.core.afterViewInit();
  }

  destroy(): void {
    if (this.searchHandle) {
      clearTimeout(this.searchHandle);
    }
    this.core.destroy();
    this.search.destroy();
    this.layout.destroy();
    this.simulation.destroy();
  }

  toggleHelp(): void {
    this.layout.toggleHelp();
  }

  toggleSettings(): void {
    this.layout.toggleSettings();
  }

  closeHelp(): void {
    this.layout.closeHelp();
  }

  closeSettings(): void {
    this.layout.closeSettings();
  }

  setLang(lang: 'de' | 'fr'): void {
    this.core.setLang(lang);
  }

  onTripFlowNodeModeChange(value: string): void {
    this.simulation.onTripFlowNodeModeChange(value);
  }

  onTripFlowEdgeModeChange(value: string): void {
    this.simulation.onTripFlowEdgeModeChange(value);
  }

  selectEdition(year: number): void {
    if (Number.isFinite(year) && year !== this.year()) {
      this.core.applyYearChange(year);
    }
  }

  onNodeSelected(nodeId: string | null): void {
    const routeResultsVisible = this.routeResultsVisible();
    const pick = this.layout.effectivePickTarget();
    if (pick && nodeId) {
      if (pick === PICK_TARGET_FROM) {
        this.onFromIdChange(nodeId);
      } else {
        this.onToIdChange(nodeId);
      }
      this.layout.clearPendingMapPick();
      this.layout.pickTarget.set(null);
      return;
    }
    this.layout.clearPendingMapPick();
    if (!nodeId) {
      this.selectedNodeId.set(null);
      if (!routeResultsVisible) {
        this.sidebarOpen.set(false);
      }
      if (this.smallScreenLayout()) {
        this.mobileSheetMode.set(routeResultsVisible ? MOBILE_SHEET_MODE_RESULTS : MOBILE_SHEET_MODE_CLOSED);
      }
      return;
    }
    if (!routeResultsVisible) {
      this.selectedConnectionId.set(null);
    }
    this.selectedNodeId.set(nodeId);
    if (this.smallScreenLayout()) {
      this.sidebarOpen.set(false);
      this.mobileSheetMode.set(MOBILE_SHEET_MODE_DETAILS);
      this.mobileSheetSnap.set(routeResultsVisible ? MOBILE_SHEET_SNAP_FULL : MOBILE_SHEET_SNAP_HALF);
      return;
    }
    this.sidebarOpen.set(true);
  }

  onSearchConnections(): void {
    this.routing.searchConnections({
      onSuccess: (options) => {
        const hasResults = options.length > 0;
        if (hasResults) {
          if (this.smallScreenLayout()) {
            this.routePlannerOpen.set(false);
            this.mobileSheetMode.set(MOBILE_SHEET_MODE_RESULTS);
            this.mobileSheetSnap.set(MOBILE_SHEET_SNAP_HALF);
            this.sidebarOpen.set(false);
          } else {
            this.sidebarOpen.set(true);
          }
        } else if (this.smallScreenLayout()) {
          this.routePlannerOpen.set(true);
          this.mobileSheetMode.set(MOBILE_SHEET_MODE_PLANNER);
          this.mobileSheetSnap.set(MOBILE_SHEET_SNAP_FULL);
        }
      },
      onError: () => {
        if (this.smallScreenLayout()) {
          this.routePlannerOpen.set(true);
          this.mobileSheetMode.set(MOBILE_SHEET_MODE_PLANNER);
          this.mobileSheetSnap.set(MOBILE_SHEET_SNAP_FULL);
        }
      }
    });
  }

  swapConnections(): void {
    const { from, to } = this.routing.swapConnections();
    this.core.triggerPulse(to);
    this.core.triggerPulse(from);
  }

  shiftTime(minutes: number): void {
    this.routing.shiftTime(minutes);
    this.onSearchConnections();
  }

  selectConnection(option: ConnectionOption): void {
    this.routing.selectConnection(option);
    if (this.smallScreenLayout()) {
      this.mobileSheetMode.set(MOBILE_SHEET_MODE_RESULTS);
      this.mobileSheetSnap.set(MOBILE_SHEET_SNAP_FULL);
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
    this.layout.onPlannerFocus(active);
  }

  onPlannerHover(active: boolean): void {
    this.layout.onPlannerHover(active);
  }

  onPlaceSearchFocus(): void {
    this.search.focus();
  }

  onPlaceSearchBlur(): void {
    this.search.blur();
  }

  onPlaceSearchInput(value: string): void {
    this.search.input(value);
  }

  onPlaceSearchKeydown(event: KeyboardEvent): void {
    const results = this.placeSearchResults();
    if (!results.length) {
      return;
    }
    if (event.key === KEY_ARROW_DOWN) {
      event.preventDefault();
      this.search.moveActive(PLACE_SEARCH_NEXT_STEP);
      return;
    }
    if (event.key === KEY_ARROW_UP) {
      event.preventDefault();
      this.search.moveActive(PLACE_SEARCH_PREVIOUS_STEP);
      return;
    }
    if (event.key === KEY_ENTER) {
      event.preventDefault();
      const pick = this.search.activeResult();
      if (pick) {
        this.selectPlaceResult(pick.id);
      }
      return;
    }
    if (event.key === KEY_ESCAPE) {
      this.search.close();
    }
  }

  selectPlaceResult(nodeId: string): void {
    const node = this.core.getNodeById(nodeId);
    if (!node) {
      return;
    }
    this.search.completeSelection(node.name);
    if (this.archiveModeActive()) {
      this.archive.setArchiveFocusNode(node.id);
      return;
    }
    this.onNodeSelected(node.id);
    this.core.triggerPulse(node.id);
  }

  previewPlaceSearchResult(nodeId: string, index: number): void {
    this.search.previewResult(nodeId, index);
  }

  openRoutePlanner(): void {
    this.layout.openRoutePlanner();
  }

  closeRoutePlanner(): void {
    this.layout.closeRoutePlanner();
  }

  onRoutePlannerPickTargetChange(target: 'from' | 'to' | null): void {
    this.layout.setPickTarget(target);
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
      this.layout.rememberPendingMapPick();
    }
    if (payload.type === 'move') {
      this.hoveredNodeId.set(payload.hitNodeId);
      this.hoveredNodeScreen.set(payload.hitNodeId ? payload.screen : null);
      this.routing.onMapHoveredEdge(payload.hitEdgeId);
    }
    if (payload.type === 'up' && !payload.hitNodeId) {
      this.layout.clearPendingMapPick();
    }
  }

  onRouteLegHover(edgeId: string | null): void {
    this.routing.onRouteLegHover(edgeId);
  }

  onKeydown(event: KeyboardEvent): void {
    this.layout.onKeydown(event);
  }

  onWindowResize(): void {
    this.core.onWindowResize();
  }

  onFromIdChange(id: string): void {
    this.routing.setFromId(id);
    this.core.triggerPulse(id);
  }

  onToIdChange(id: string): void {
    this.routing.setToId(id);
    this.core.triggerPulse(id);
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
    this.routing.setDraftDepartTime(time);
  }

  applyDepartTime(): void {
    if (this.routing.applyDepartTime()) {
      this.onSearchConnections();
    }
  }

  resetSearch(): void {
    this.pickTarget.set(null);
    this.layout.clearPendingMapPick();
    this.routing.resetSearch();
    this.selectedNodeId.set(null);
    this.sidebarOpen.set(false);
    if (this.smallScreenLayout()) {
      this.mobileSheetMode.set(this.routePlannerOpen() ? MOBILE_SHEET_MODE_PLANNER : MOBILE_SHEET_MODE_CLOSED);
      this.mobileSheetSnap.set(MOBILE_SHEET_SNAP_HALF);
    }
  }

  setMobileSheetSnap(snap: 'peek' | 'half' | 'full'): void {
    this.layout.setMobileSheetSnap(snap);
  }

  cycleMobileSheetSnap(): void {
    this.layout.cycleMobileSheetSnap();
  }

  openMobileResults(): void {
    this.layout.openMobileResults();
  }

  closeMobileSheet(): void {
    this.layout.closeMobileSheet(() => this.resetSearch());
  }

  onFromPreview(id: string): void {
    this.routing.setFromPreview(id);
  }

  onToPreview(id: string): void {
    this.routing.setToPreview(id);
  }

  resetMapView(): void {
    this.core.resetMapView();
  }

  setViewerSurfaceMode(mode: ViewerSurfaceMode): void {
    this.archive.setViewerSurfaceMode(mode);
  }

  toggleViewerSurfaceMode(): void {
    this.archive.toggleViewerSurfaceMode();
  }

  getNodeName(id: string): string {
    return this.core.getNodeName(id);
  }

  getNodeLabel(id: string): string {
    return this.core.getNodeLabel(id);
  }

  getNodeById(id: string | null): { id: string; name: string } | null {
    return this.core.getNodeById(id);
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
    const lastResult = this.routing.lastResultParams();
    if (lastResult && lastResult.from === from && lastResult.to === to && lastResult.year !== this.year()) {
      return this.transloco.translate('viewer.noRouteNotYet', { year: this.year() });
    }
    return this.transloco.translate('viewer.noRouteTime');
  }

  getPickModeLabel(): string {
    const target = this.pickTarget();
    if (target === PICK_TARGET_FROM) {
      return this.transloco.translate('viewer.pickModeFrom');
    }
    if (target === PICK_TARGET_TO) {
      return this.transloco.translate('viewer.pickModeTo');
    }
    return EMPTY_TEXT;
  }

  private setupRoutingSearchEffect(): void {
    effect(() => {
      if (!this.core.isBrowser) {
        return;
      }
      if (this.searchHandle) {
        clearTimeout(this.searchHandle);
      }
      const from = this.fromId();
      const to = this.toId();
      if (!from || !to || from === to) {
        this.routing.clearToIdle();
        return;
      }
      this.searchHandle = setTimeout(() => this.onSearchConnections(), PLACE_SEARCH_DEBOUNCE_MS);
    });
  }

  private setupNodeFactsEffect(): void {
    effect(() => {
      if (!this.core.isBrowser) {
        return;
      }
      const nodeId = this.selectedNodeId();
      const year = this.year();
      if (!nodeId) {
        this.core.clearNodeFacts();
        return;
      }
      this.core.fetchNodeFacts(nodeId, year);
    });
  }

  private setupSimulationEffects(): void {
    effect(() => {
      this.simulation.syncAnimationAllowance();
    });

    effect(() => {
      this.simulation.syncPlayback();
    });
  }

  private setupArchiveModeEffect(): void {
    effect(() => {
      if (!this.archiveModeActive()) {
        return;
      }
      this.layout.handleArchiveModeActivated();
      this.hoveredRouteEdgeId.set(null);
    });
  }

  private setupMobileSheetModeEffect(): void {
    effect(() => {
      this.layout.syncMobileSheetMode();
    });
  }

  private setupEditionFallbackEffect(): void {
    effect(() => {
      const editions = this.publicEditionOptions();
      if (!editions.length) {
        return;
      }
      const currentYear = this.year();
      if (!editions.some((edition) => edition.year === currentYear)) {
        this.core.applyYearChange(editions[0].year);
      }
    });
  }

  private mapSidebarFact(assertion: GraphAssertion): SidebarFact | null {
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
    };
  }

  private schemaKeyDisplayLabel(schemaKey: string): string {
    const normalized = schemaKey
      .trim()
      .toLowerCase()
      .replace(SCHEMA_KEY_NORMALIZE_PATTERN, '_')
      .replace(SCHEMA_KEY_TRIM_PATTERN, '');
    if (!normalized) {
      return schemaKey;
    }
    const translationKey = `schemaKey.${normalized}`;
    const translated = this.transloco.translate(translationKey);
    return !translated || translated === translationKey ? schemaKey : translated;
  }
}
