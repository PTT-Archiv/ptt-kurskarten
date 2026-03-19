import { Component, ElementRef, OnDestroy, PLATFORM_ID, ViewChild, computed, effect, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import type {
  EditionEntry,
  EdgeTrip,
  GraphAssertion,
  GraphEdge,
  GraphNode,
  GraphSnapshot,
  LocalizedText,
  NodeDetail,
  TransportType
} from '@ptt-kurskarten/shared';
import { MapStageComponent } from '../../shared/map/map-stage.component';
import { TranslocoPipe } from '@jsverse/transloco';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { faArrowsLeftRight, faMinus, faPlus, faXmark } from '@fortawesome/free-solid-svg-icons';
import { ToastService } from '../../shared/toast/toast.service';
import { AdminSelectionState } from './admin-selection.service';
import { ADMIN_GRAPH_REPOSITORY, type AdminGraphRepository } from './admin-graph.repository';
import { TourService } from './tour.service';
import { TourOverlayComponent } from './tour-overlay.component';
import { ADMIN_TUTORIAL_STEPS } from './admin-tutorial.steps';
import { ArchiveSnippetViewerComponent } from '../../shared/archive/archive-snippet-viewer.component';
import {
  buildArchiveIiifInfoUrl,
  ARCHIVE_DEFAULT_REGION,
  ARCHIVE_IIIF_BASE,
  buildArchiveSnippetUrlForNode,
  buildArchiveSnippetUrlFromRegionWithBase,
  computeArchiveTransform,
  normalizeIiifRoute
} from '../../shared/archive/archive-snippet.util';

const DEFAULT_YEAR = 1852;
const UNDO_LIMIT = 20;
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

type MoveUndo = {
  type: 'MOVE_NODE';
  id: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
};

type DeleteNodeUndo = {
  type: 'DELETE_NODE';
  node: GraphNode;
  edges: GraphEdge[];
};

type NodeDraft = {
  id: string;
  name: string;
  x: number;
  y: number;
  foreign?: boolean;
  iiifCenterX?: number;
  iiifCenterY?: number;
  validFrom: number;
  validTo?: number;
};

type EdgeDraft = {
  id: string;
  from: string | null;
  to: string | null;
  distance?: number;
  validFrom: number;
  validTo?: number;
  notes?: LocalizedText;
  trips: EdgeTrip[];
};

type GeoAdminResult = {
  id: string;
  label: string;
  x: number;
  y: number;
};

type ExistingPlaceResult = {
  id: string;
  name: string;
  x: number;
  y: number;
  active: boolean;
  hidden: boolean;
};

type QuickPlaceSuggestion =
  | { id: string; kind: 'existing'; label: string; x: number; y: number; value: ExistingPlaceResult }
  | { id: string; kind: 'geo'; label: string; x: number; y: number; value: GeoAdminResult };

type QuickEntityMode = 'place' | 'link' | 'service' | 'trip' | 'fact';
type InspectorTab = 'core' | 'facts' | 'anchors' | 'source';
type DeleteConfirmAnchor = 'inline' | 'sticky';
type ServiceNodeFilter =
  | 'all'
  | 'onlyOutgoing'
  | 'onlyIncoming'
  | 'both'
  | 'none'
  | 'needsOutgoingPair'
  | 'needsIncomingPair'
  | 'fullyPaired';
type ServiceNodeState = Exclude<ServiceNodeFilter, 'all'>;
type ServiceNodeMetrics = {
  state: 'onlyOutgoing' | 'onlyIncoming' | 'both' | 'none';
  hasTrips: boolean;
  needsOutgoingPair: boolean;
  needsIncomingPair: boolean;
  fullyPaired: boolean;
};

type InspectorFact = {
  id: string;
  targetType: 'place';
  targetId: string;
  schemaKey: string;
  valueType: 'string' | 'number' | 'boolean' | 'json';
  value: string;
  editable: boolean;
  removable: boolean;
};

type FactLink = {
  label: string;
  url: string | null;
};

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [MapStageComponent, TranslocoPipe, TourOverlayComponent, ArchiveSnippetViewerComponent, FaIconComponent],
  templateUrl: './admin.component.html',
  styleUrl: './admin.component.css'
})
export class AdminComponent implements OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly toastService = inject(ToastService);
  readonly selection = inject(AdminSelectionState);
  private readonly hostRef = inject(ElementRef<HTMLElement>);
  private readonly repo = inject<AdminGraphRepository>(ADMIN_GRAPH_REPOSITORY);
  private readonly tour = inject(TourService);
  readonly plusIcon = faPlus;
  readonly minusIcon = faMinus;
  readonly xmarkIcon = faXmark;
  readonly swapIcon = faArrowsLeftRight;

  year = signal<number>(DEFAULT_YEAR);
  graph = signal<GraphSnapshot | null>(null);
  availableYears = signal<number[]>([]);
  editions = signal<EditionEntry[]>([]);
  iiifRouteDraft = signal<string>(ARCHIVE_IIIF_BASE);
  newEditionYearDraft = signal<string>('');
  selectedNodeId = this.selection.selectedNodeId;
  selectedEdgeId = this.selection.selectedEdgeId;
  selectedType = this.selection.selectedType;
  highlightedEdgeIds = computed<Set<string> | null>(() => {
    const id = this.selectedEdgeId();
    return id ? new Set([id]) : null;
  });

  draftNode = signal<NodeDraft | null>(null);
  draftEdge = signal<EdgeDraft | null>(null);

  undoStack = signal<Array<MoveUndo | DeleteNodeUndo>>([]);
  dirty = signal<boolean>(false);
  isDemo = signal<boolean>(this.repo.isDemo);
  shortcutsCollapsed = signal<boolean>(false);
  confirmDeleteNode = signal<boolean>(false);
  deleteConfirmAnchor = signal<DeleteConfirmAnchor | null>(null);
  isDragging = signal<boolean>(false);
  quickFromQuery = signal<string>('');
  quickToQuery = signal<string>('');
  quickFromId = signal<string | null>(null);
  quickToId = signal<string | null>(null);
  quickFromOpen = signal<boolean>(false);
  quickToOpen = signal<boolean>(false);
  quickFromActiveIndex = signal<number>(0);
  quickToActiveIndex = signal<number>(0);
  quickDistance = signal<string>('');
  quickTrips = signal<EdgeTrip[]>([
    { id: `quick-trip-${Date.now()}`, transport: 'postkutsche', departs: '08:00', arrives: '09:00', arrivalDayOffset: 0 }
  ]);
  quickEntityMode = signal<QuickEntityMode>('service');
  quickFromNodeFilter = signal<ServiceNodeFilter>('all');
  quickToNodeFilter = signal<ServiceNodeFilter>('all');
  inspectorTab = signal<InspectorTab>('core');
  quickPlaceName = signal<string>('');
  quickPlaceExistingResults = signal<ExistingPlaceResult[]>([]);
  quickPlaceSelectedExistingId = signal<string | null>(null);
  quickPlaceGeoResults = signal<GeoAdminResult[]>([]);
  quickPlaceGeoOpen = signal<boolean>(false);
  quickPlaceGeoActiveIndex = signal<number>(0);
  quickPlaceGeoPoint = signal<{ x: number; y: number } | null>(null);
  quickServiceNoteDe = signal<string>('');
  quickServiceNoteFr = signal<string>('');
  quickFactSchemaKey = signal<string>('identifier.wikidata');
  quickFactValue = signal<string>('');
  quickFactValueType = signal<'string' | 'number' | 'boolean'>('string');
  editingFactId = signal<string | null>(null);
  persistedFacts = signal<GraphAssertion[]>([]);
  quickAnchorX = signal<string>('');
  quickAnchorY = signal<string>('');
  quickTripPasteText = signal<string>('');
  geoSearchEnabled = signal<boolean>(true);
  geoResults = signal<GeoAdminResult[]>([]);
  geoLoading = signal<boolean>(false);
  geoActiveIndex = signal<number>(0);
  private geoSearchHandle: ReturnType<typeof setTimeout> | null = null;
  private quickPlaceExistingSearchHandle: ReturnType<typeof setTimeout> | null = null;
  private quickPlaceExistingRequestSeq = 0;
  private quickPlaceGeoSearchHandle: ReturnType<typeof setTimeout> | null = null;
  private archiveSaveHandle: ReturnType<typeof setTimeout> | null = null;
  private pendingIiifUpdate: { nodeId: string; iiifCenterX: number; iiifCenterY: number; anchorYear: number } | null = null;
  readonly transportOptions: TransportType[] = [
    'postkutsche',
    'dampfschiff',
    'segelboot',
    'courier',
    'messagerie',
    'mallepost',
    'diligence'
  ];
  readonly quickEntityModes: Array<{ id: QuickEntityMode; label: string; shortcut: string }> = [
    { id: 'place', label: 'Place', shortcut: 'P' },
    { id: 'link', label: 'Link', shortcut: 'L' },
    { id: 'service', label: 'Service', shortcut: 'S' },
    { id: 'trip', label: 'Trip', shortcut: 'T' },
    { id: 'fact', label: 'Fact', shortcut: 'F' }
  ];
  readonly inspectorTabs: Array<{ id: InspectorTab; label: string }> = [
    { id: 'core', label: 'Core' },
    { id: 'facts', label: 'Facts' },
    { id: 'anchors', label: 'Anchors' },
    { id: 'source', label: 'Source' }
  ];
  readonly serviceNodeFilterOptions: Array<{ id: ServiceNodeFilter; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'onlyOutgoing', label: 'Only outgoing' },
    { id: 'onlyIncoming', label: 'Only incoming' },
    { id: 'both', label: 'Both' },
    { id: 'none', label: 'None' },
    { id: 'needsOutgoingPair', label: 'Needs outgoing pair' },
    { id: 'needsIncomingPair', label: 'Needs incoming pair' },
    { id: 'fullyPaired', label: 'Fully paired' }
  ];

  private graphFetchHandle: ReturnType<typeof setTimeout> | null = null;
  private graphRequestSeq = 0;
  private pendingNodeSelectionAfterGraphLoad: string | null = null;
  private dragState:
    | {
      id: string;
      from: { x: number; y: number };
      moved: boolean;
    }
    | null = null;
  @ViewChild('edgeEditor') private edgeEditorRef?: ElementRef<HTMLElement>;
  @ViewChild('nodePanel') private nodePanelRef?: ElementRef<HTMLElement>;
  @ViewChild('archivePanel') private archivePanelRef?: ElementRef<HTMLElement>;
  @ViewChild(ArchiveSnippetViewerComponent) private archiveViewer?: ArchiveSnippetViewerComponent;
  @ViewChild('nodeNameInput') private nodeNameInput?: ElementRef<HTMLInputElement>;
  @ViewChild('quickFromInput') private quickFromInput?: ElementRef<HTMLInputElement>;
  @ViewChild('quickToInput') private quickToInput?: ElementRef<HTMLInputElement>;

  nodeDetail = computed<NodeDetail | null>(() => {
    const snapshot = this.graph();
    const nodeId = this.selectedNodeId();
    if (!snapshot || !nodeId) {
      return null;
    }
    const node = snapshot.nodes.find((candidate) => candidate.id === nodeId) ?? null;
    if (!node) {
      return null;
    }
    const edges = snapshot.edges.filter((edge) => edge.from === nodeId || edge.to === nodeId);
    const neighborIds = new Set(edges.flatMap((edge) => [edge.from, edge.to]));
    neighborIds.delete(nodeId);
    const neighbors = snapshot.nodes.filter((candidate) => neighborIds.has(candidate.id));

    return {
      year: snapshot.year,
      node,
      neighbors,
      edges
    };
  });
  archiveIiifRoute = computed(() => {
    const year = this.year();
    const edition = this.editions().find((item) => item.year === year);
    return normalizeIiifRoute(edition?.iiifRoute);
  });
  archiveIiifInfoUrl = computed(() => buildArchiveIiifInfoUrl(this.archiveIiifRoute()));

  archiveSnippetUrl = computed(() => {
    const transform = computeArchiveTransform();
    const iiifRoute = this.archiveIiifRoute();
    const draft = this.draftNode();
    if (draft) {
      if (transform) {
        return buildArchiveSnippetUrlForNode(draft, transform, iiifRoute);
      }
      return buildArchiveSnippetUrlFromRegionWithBase(ARCHIVE_DEFAULT_REGION, iiifRoute);
    }
    const detail = this.nodeDetail();
    if (detail?.node) {
      if (transform) {
        return buildArchiveSnippetUrlForNode(detail.node, transform, iiifRoute);
      }
      return buildArchiveSnippetUrlFromRegionWithBase(ARCHIVE_DEFAULT_REGION, iiifRoute);
    }
    return buildArchiveSnippetUrlFromRegionWithBase(ARCHIVE_DEFAULT_REGION, iiifRoute);
  });

  outgoingEdges = computed(() => {
    const snapshot = this.graph();
    const nodeId = this.selectedNodeId();
    if (!snapshot || !nodeId) {
      return [];
    }
    return snapshot.edges
      .filter((edge) => edge.from === nodeId)
      .map((edge) => {
        const toNode = snapshot.nodes.find((node) => node.id === edge.to);
        const uniqueTransports = Array.from(new Set((edge.trips ?? []).map((trip) => this.toTransportType(trip?.transport))));
        const transports: TransportType[] = uniqueTransports.length ? uniqueTransports : ['postkutsche'];
        return {
          id: edge.id,
          toName: toNode?.name ?? '—',
          transports: this.sortTransportTypes(transports),
          tripsCount: edge.trips?.length ?? 0,
          validFrom: edge.validFrom
        };
      });
  });

  nodeOptions = computed(() => {
    const snapshot = this.displayGraph() ?? this.graph();
    if (!snapshot) {
      return [];
    }
    const options = new Map<string, { id: string; name: string }>();
    snapshot.nodes.forEach((node) => options.set(node.id, { id: node.id, name: node.name }));

    const ensure = (id: string | null | undefined) => {
      if (!id || options.has(id)) {
        return;
      }
      options.set(id, { id, name: id });
    };

    const selected = this.selectedEdgeDraft();
    ensure(selected?.from);
    ensure(selected?.to);

    const draft = this.draftEdge();
    ensure(draft?.from);
    ensure(draft?.to);

    return [...options.values()].sort((a, b) => a.name.localeCompare(b.name));
  });

  quickPlaceSuggestions = computed<QuickPlaceSuggestion[]>(() => {
    const existing = this.quickPlaceExistingResults().map((result) => ({
      id: `existing-${result.id}`,
      kind: 'existing' as const,
      label: result.name,
      x: result.x,
      y: result.y,
      value: result
    }));
    const geo = this.quickPlaceGeoResults().map((result) => ({
      id: `geo-${result.id}`,
      kind: 'geo' as const,
      label: result.label,
      x: result.x,
      y: result.y,
      value: result
    }));
    return [...existing, ...geo];
  });

  selectedQuickPlaceExisting = computed<ExistingPlaceResult | null>(() => {
    const selectedId = this.quickPlaceSelectedExistingId();
    if (!selectedId) {
      return null;
    }
    return this.quickPlaceExistingResults().find((result) => result.id === selectedId) ?? null;
  });

  nodeServiceMetrics = computed(() => {
    const snapshot = this.displayGraph() ?? this.graph();
    const metrics = new Map<string, ServiceNodeMetrics>();
    if (!snapshot) {
      return metrics;
    }

    const counts = new Map<string, { outgoing: number; incoming: number }>();
    snapshot.nodes.forEach((node) => {
      counts.set(node.id, { outgoing: 0, incoming: 0 });
      metrics.set(node.id, {
        state: 'none',
        hasTrips: false,
        needsOutgoingPair: false,
        needsIncomingPair: false,
        fullyPaired: false
      });
    });

    const directedPairKeys = new Set<string>();

    snapshot.edges.forEach((edge) => {
      const tripCount = edge.trips?.length ?? 0;
      if (tripCount <= 0) {
        return;
      }
      directedPairKeys.add(`${edge.from}→${edge.to}`);
      const fromCounts = counts.get(edge.from);
      if (fromCounts) {
        fromCounts.outgoing += tripCount;
      }
      const toCounts = counts.get(edge.to);
      if (toCounts) {
        toCounts.incoming += tripCount;
      }
    });

    snapshot.nodes.forEach((node) => {
      const stats = counts.get(node.id) ?? { outgoing: 0, incoming: 0 };
      let state: ServiceNodeMetrics['state'] = 'none';
      if (stats.outgoing > 0 && stats.incoming > 0) {
        state = 'both';
      } else if (stats.outgoing > 0) {
        state = 'onlyOutgoing';
      } else if (stats.incoming > 0) {
        state = 'onlyIncoming';
      }
      metrics.set(node.id, {
        ...(metrics.get(node.id) ?? {
          state: 'none',
          hasTrips: false,
          needsOutgoingPair: false,
          needsIncomingPair: false,
          fullyPaired: false
        }),
        state,
        hasTrips: stats.outgoing > 0 || stats.incoming > 0
      });
    });

    snapshot.edges.forEach((edge) => {
      const tripCount = edge.trips?.length ?? 0;
      if (tripCount <= 0) {
        return;
      }
      if (directedPairKeys.has(`${edge.to}→${edge.from}`)) {
        return;
      }

      const fromMetric = metrics.get(edge.from);
      if (fromMetric) {
        fromMetric.needsIncomingPair = true;
      }
      const toMetric = metrics.get(edge.to);
      if (toMetric) {
        toMetric.needsOutgoingPair = true;
      }
    });

    metrics.forEach((metric) => {
      metric.fullyPaired = metric.hasTrips && !metric.needsOutgoingPair && !metric.needsIncomingPair;
    });

    return metrics;
  });

  quickFromNodes = computed(() => this.getQuickNodesForTarget('from'));
  quickToNodes = computed(() => this.getQuickNodesForTarget('to'));

  quickFromSuggestions = computed(() => {
    const query = this.quickFromQuery().trim().toLowerCase();
    return this.quickFromNodes()
      .filter((node) => !query || node.name.toLowerCase().includes(query))
      .slice(0, 12);
  });

  quickToSuggestions = computed(() => {
    const query = this.quickToQuery().trim().toLowerCase();
    return this.quickToNodes()
      .filter((node) => !query || node.name.toLowerCase().includes(query))
      .slice(0, 12);
  });

  quickServicePairHint = computed(() => {
    const from = this.quickFromId();
    const to = this.quickToId();
    if (!from || !to || this.quickEntityMode() !== 'service') {
      return null;
    }
    return this.buildDirectionalPairHint(from, to, this.quickTrips().length > 0);
  });

  selectedEdgeDraft = computed<EdgeDraft | null>(() => {
    const snapshot = this.graph();
    const edgeId = this.selectedEdgeId();
    if (!snapshot || !edgeId) {
      return null;
    }
    const edge = snapshot.edges.find((candidate) => candidate.id === edgeId);
    if (!edge) {
      return null;
    }
    return {
      id: edge.id,
      from: edge.from,
      to: edge.to,
      distance: edge.distance,
      validFrom: edge.validFrom,
      validTo: undefined,
      notes: edge.notes,
      trips: this.normalizeTrips(edge.trips ?? [])
    };
  });

  selectedNodeFacts = computed<InspectorFact[]>(() => {
    const nodeId = this.selectedNodeId();
    if (!nodeId) {
      return [];
    }
    const persisted = this.persistedFacts()
      .filter((fact) => fact.targetType === 'place' && fact.targetId === nodeId)
      .map((fact) => this.toInspectorFact(fact))
      .filter((fact): fact is InspectorFact => fact !== null);
    const facts = [...persisted];
    const node = this.getNodeById(nodeId);
    const hasForeignFact = facts.some(
      (fact) => fact.schemaKey === 'place.is_foreign' && fact.value.trim().toLowerCase() === 'true'
    );
    if (node?.foreign && !hasForeignFact) {
      facts.unshift({
        id: `derived-${node.id}-foreign`,
        targetType: 'place',
        targetId: node.id,
        schemaKey: 'place.is_foreign',
        valueType: 'boolean',
        value: 'true',
        editable: false,
        removable: false
      });
    }
    return facts;
  });

  selectedEntitySourceJson = computed(() => {
    const draftNode = this.draftNode();
    if (draftNode) {
      return JSON.stringify({ entity: 'place-draft', payload: draftNode }, null, 2);
    }
    const node = this.getNodeById(this.selectedNodeId());
    if (node) {
      return JSON.stringify({ entity: 'place', payload: node, facts: this.selectedNodeFacts() }, null, 2);
    }
    const draftEdge = this.draftEdge();
    if (draftEdge) {
      return JSON.stringify({ entity: 'service-draft', payload: draftEdge }, null, 2);
    }
    const edge = this.selectedEdgeDraft();
    if (edge) {
      return JSON.stringify({ entity: 'service', payload: edge }, null, 2);
    }
    return JSON.stringify({ entity: null }, null, 2);
  });

  displayGraph = computed<GraphSnapshot | null>(() => {
    const snapshot = this.graph();
    if (!snapshot) {
      return null;
    }

    const draftNode = this.draftNode();
    const draftEdge = this.draftEdge();

    let nodes = snapshot.nodes;
    let edges = snapshot.edges;

    if (draftNode) {
      const existing = nodes.find((node) => node.id === draftNode.id);
      if (!existing) {
        nodes = [...nodes, draftNode];
      } else {
        nodes = nodes.map((node) => (node.id === draftNode.id ? draftNode : node));
      }
    }

    if (draftEdge?.from && draftEdge.to) {
      const tempEdge: GraphEdge = {
        id: draftEdge.id,
        from: draftEdge.from,
        to: draftEdge.to,
        distance: draftEdge.distance,
        validFrom: draftEdge.validFrom,
        validTo: undefined,
        trips: this.normalizeTrips(draftEdge.trips)
      };
      edges = [...edges, tempEdge];
    }

    return { ...snapshot, nodes, edges };
  });

  mapGraph = computed<GraphSnapshot | null>(() => {
    const snapshot = this.displayGraph();
    if (!snapshot || this.quickEntityMode() !== 'service') {
      return snapshot;
    }

    const visibleNodeIds = new Set<string>();
    const fromFilter = this.quickFromNodeFilter();
    const toFilter = this.quickToNodeFilter();

    snapshot.nodes.forEach((node) => {
      if (this.matchesServiceNodeFilter(node.id, fromFilter) || this.matchesServiceNodeFilter(node.id, toFilter)) {
        visibleNodeIds.add(node.id);
      }
    });

    const fromId = this.quickFromId();
    const toId = this.quickToId();
    if (fromId) {
      visibleNodeIds.add(fromId);
    }
    if (toId) {
      visibleNodeIds.add(toId);
    }

    if (visibleNodeIds.size >= snapshot.nodes.length) {
      return snapshot;
    }

    return {
      ...snapshot,
      nodes: snapshot.nodes.filter((node) => visibleNodeIds.has(node.id)),
      edges: snapshot.edges.filter((edge) => visibleNodeIds.has(edge.from) && visibleNodeIds.has(edge.to))
    };
  });

  minYear = computed(() => {
    const years = this.availableYears();
    return years.length > 0 ? Math.min(...years) : DEFAULT_YEAR - 20;
  });

  maxYear = computed(() => {
    const years = this.availableYears();
    return years.length > 0 ? Math.max(...years) : DEFAULT_YEAR + 20;
  });
  canAddNewEdition = computed(() => {
    const value = Number(this.newEditionYearDraft().trim());
    if (!Number.isInteger(value) || value < 0) {
      return false;
    }
    return !this.availableYears().includes(value);
  });

  constructor() {
    if (this.isBrowser) {
      const stored = window.localStorage.getItem('admin.shortcutsCollapsed');
      this.shortcutsCollapsed.set(stored === 'true');
      this.fetchYears();
      this.fetchEditions();
      this.bindUndoShortcut();
      if (this.repo.isDemo && !this.tour.isCompleted()) {
        this.tour.start(ADMIN_TUTORIAL_STEPS);
      }
    }

    effect(() => {
      const targetYear = this.year();
      if (!this.isBrowser) {
        return;
      }

      if (this.graphFetchHandle) {
        clearTimeout(this.graphFetchHandle);
      }

      this.graphFetchHandle = setTimeout(() => {
        this.fetchGraph(targetYear);
      }, 200);
    });

    effect(() => {
      const year = this.year();
      const editions = this.editions();
      const edition = editions.find((entry) => entry.year === year);
      this.iiifRouteDraft.set(normalizeIiifRoute(edition?.iiifRoute));
    });

    effect(() => {
      const edgeId = this.selectedEdgeId();
      const draft = this.draftEdge();
      if (!this.isBrowser) {
        return;
      }
      if (edgeId || draft) {
        requestAnimationFrame(() => {
          this.edgeEditorRef?.nativeElement?.scrollIntoView({ block: 'start', behavior: 'smooth' });
        });
      }
    });

    effect(() => {
      const draft = this.draftEdge();
      const snapshot = this.displayGraph() ?? this.graph();
      if (!draft || !snapshot) {
        return;
      }
      const nodes = snapshot.nodes;
      if (!nodes.length) {
        return;
      }
      let from = draft.from;
      let to = draft.to;
      if (!from) {
        from = nodes[0]?.id ?? null;
      }
      if (!to || to === from) {
        to = nodes.find((node) => node.id !== from)?.id ?? null;
      }
      if (from !== draft.from || to !== draft.to) {
        this.draftEdge.set({ ...draft, from, to });
      }
    });

    effect(() => {
      const nodeId = this.selectedNodeId();
      const node = this.getNodeById(nodeId);
      if (!node) {
        return;
      }
      this.quickAnchorX.set(String(Math.round(node.x * 10) / 10));
      this.quickAnchorY.set(String(Math.round(node.y * 10) / 10));
      if (!this.quickFromId()) {
        this.quickFromId.set(node.id);
        this.quickFromQuery.set(node.name);
      }
    });
  }

  toggleShortcuts(): void {
    const next = !this.shortcutsCollapsed();
    this.shortcutsCollapsed.set(next);
    if (this.isBrowser) {
      window.localStorage.setItem('admin.shortcutsCollapsed', String(next));
    }
  }

  ngOnDestroy(): void {
    if (this.graphFetchHandle) {
      clearTimeout(this.graphFetchHandle);
    }
    if (this.geoSearchHandle) {
      clearTimeout(this.geoSearchHandle);
      this.geoSearchHandle = null;
    }
    if (this.quickPlaceExistingSearchHandle) {
      clearTimeout(this.quickPlaceExistingSearchHandle);
      this.quickPlaceExistingSearchHandle = null;
    }
    if (this.quickPlaceGeoSearchHandle) {
      clearTimeout(this.quickPlaceGeoSearchHandle);
      this.quickPlaceGeoSearchHandle = null;
    }
    if (this.isBrowser) {
      window.removeEventListener('keydown', this.onKeyDown);
    }
  }

  onYearInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const nextYear = Number(input.value);
    if (!Number.isNaN(nextYear)) {
      this.applyYearSelection(nextYear);
    }
  }

  onEditionYearSelect(event: Event): void {
    const nextYear = Number((event.target as HTMLSelectElement).value);
    if (!Number.isNaN(nextYear)) {
      this.applyYearSelection(nextYear);
    }
  }

  onNewEditionYearInput(event: Event): void {
    this.newEditionYearDraft.set((event.target as HTMLInputElement).value);
  }

  onNewEditionYearKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter') {
      return;
    }
    event.preventDefault();
    this.addNewEdition();
  }

  addNewEdition(): void {
    const year = Number(this.newEditionYearDraft().trim());
    if (!Number.isInteger(year) || year < 0) {
      this.toastService.addToast({
        type: 'error',
        title: 'Ungültiges Jahr',
        message: 'Bitte ein ganzzahliges Jahr >= 0 eingeben.',
        key: 'edition-add-invalid'
      });
      return;
    }
    if (this.availableYears().includes(year)) {
      this.applyYearSelection(year);
      this.toastService.addToast({
        type: 'info',
        title: 'Edition existiert bereits',
        key: 'edition-add-existing'
      });
      return;
    }

    this.repo
      .updateEdition(year, {
        title: `Kurskarte ${year}`
      })
      .subscribe({
        next: (edition) => {
          this.upsertEditionLocal(edition);
          this.upsertAvailableYearLocal(year);
          this.newEditionYearDraft.set(String(year + 1));
          this.applyYearSelection(year);
          this.toastService.addToast({
            type: 'success',
            title: 'Edition erstellt',
            key: `edition-add-${year}`
          });
        },
        error: (error) => {
          this.toastService.addToast({
            type: 'error',
            title: 'Fehler',
            message: this.extractErrorMessage(error),
            key: 'edition-add-error'
          });
        }
      });
  }

  onIiifRouteInput(event: Event): void {
    this.iiifRouteDraft.set((event.target as HTMLInputElement).value);
  }

  onIiifRouteBlur(): void {
    this.saveIiifRouteForYear();
  }

  onIiifRouteKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter') {
      return;
    }
    event.preventDefault();
    this.saveIiifRouteForYear();
  }

  setQuickEntityMode(mode: QuickEntityMode): void {
    this.quickEntityMode.set(mode);
    if (mode !== 'place') {
      this.quickPlaceExistingRequestSeq++;
      this.quickPlaceExistingResults.set([]);
      this.quickPlaceSelectedExistingId.set(null);
      this.quickPlaceGeoOpen.set(false);
      this.quickPlaceGeoResults.set([]);
      this.quickPlaceGeoActiveIndex.set(0);
      this.quickPlaceGeoPoint.set(null);
      if (this.quickPlaceExistingSearchHandle) {
        clearTimeout(this.quickPlaceExistingSearchHandle);
        this.quickPlaceExistingSearchHandle = null;
      }
      if (this.quickPlaceGeoSearchHandle) {
        clearTimeout(this.quickPlaceGeoSearchHandle);
        this.quickPlaceGeoSearchHandle = null;
      }
    }
    if (mode !== 'fact' && this.editingFactId()) {
      this.clearQuickFactEditor();
    }
    if (mode === 'fact') {
      this.inspectorTab.set('facts');
      return;
    }
    this.inspectorTab.set('core');
  }

  setInspectorTab(tab: InspectorTab): void {
    this.inspectorTab.set(tab);
  }

  onMapPointer(event: {
    type: 'down' | 'move' | 'up';
    world: { x: number; y: number };
    hitNodeId: string | null;
    hitEdgeId: string | null;
  }): void {
    if (!this.isBrowser) {
      return;
    }

    this.selection.lastMapPointerPosition.set(event.world);
    this.handleSelectPointer(event);
  }

  selectEdge(edgeId: string): void {
    this.draftEdge.set(null);
    this.selection.selectEdge(edgeId);
    this.closeDeleteConfirm();
  }

  clearEdgeSelection(): void {
    this.selection.clearSelection();
    this.closeDeleteConfirm();
  }

  addNodeAtCursor(): void {
    const point = this.selection.lastMapPointerPosition() ?? { x: 0, y: 0 };
    this.createDraftNode(point);
  }

  startEdgeFromSelected(): void {
    const nodeId = this.selectedNodeId();
    if (!nodeId) {
      return;
    }
    const snapshot = this.graph();
    const nodes = snapshot?.nodes ?? [];
    const fallbackTo = nodes.find((node) => node.id !== nodeId)?.id ?? null;
    if (fallbackTo) {
      this.createDraftEdgeBetween(nodeId, fallbackTo);
      return;
    }
    this.selection.startEdgeFrom(nodeId);
  }

  onQuickPlaceInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.quickPlaceName.set(value);
    this.quickPlaceSelectedExistingId.set(null);
    this.quickPlaceGeoPoint.set(null);
    this.quickPlaceGeoOpen.set(true);
    this.quickPlaceGeoActiveIndex.set(0);
    this.queueQuickPlaceExistingSearch(value);
    this.queueQuickPlaceGeoSearch(value);
  }

  onQuickPlaceKeydown(event: KeyboardEvent): void {
    const isArrowDown = event.key === 'ArrowDown' || event.key === 'Down';
    const isArrowUp = event.key === 'ArrowUp' || event.key === 'Up';
    const isEnter = event.key === 'Enter';
    const isEscape = event.key === 'Escape';
    const suggestions = this.quickPlaceSuggestions();
    if (isArrowDown) {
      if (!suggestions.length) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      this.quickPlaceGeoOpen.set(true);
      this.quickPlaceGeoActiveIndex.set((this.quickPlaceGeoActiveIndex() + 1) % suggestions.length);
      return;
    }
    if (isArrowUp) {
      if (!suggestions.length) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      this.quickPlaceGeoOpen.set(true);
      this.quickPlaceGeoActiveIndex.set((this.quickPlaceGeoActiveIndex() - 1 + suggestions.length) % suggestions.length);
      return;
    }
    if (isEnter && suggestions.length) {
      event.preventDefault();
      event.stopPropagation();
      const picked = suggestions[this.quickPlaceGeoActiveIndex()] ?? suggestions[0];
      if (picked) {
        this.selectQuickPlaceSuggestion(picked);
      }
      return;
    }
    if (isEnter && this.quickPlaceName().trim()) {
      event.preventDefault();
      event.stopPropagation();
      this.saveQuickPlace();
      return;
    }
    if (isEscape) {
      event.stopPropagation();
      this.quickPlaceGeoOpen.set(false);
      this.quickPlaceExistingResults.set([]);
      this.quickPlaceSelectedExistingId.set(null);
      this.quickPlaceGeoResults.set([]);
      this.quickPlaceGeoActiveIndex.set(0);
    }
  }

  closeQuickPlaceList(): void {
    setTimeout(() => {
      this.quickPlaceGeoOpen.set(false);
      this.quickPlaceGeoActiveIndex.set(0);
    }, 80);
  }

  selectQuickPlaceSuggestion(suggestion: QuickPlaceSuggestion): void {
    if (suggestion.kind === 'existing') {
      this.selectQuickPlaceExistingResult(suggestion.value);
      return;
    }
    this.selectQuickPlaceGeoResult(suggestion.value);
  }

  selectQuickPlaceExistingResult(result: ExistingPlaceResult): void {
    this.quickPlaceName.set(result.name);
    this.quickPlaceSelectedExistingId.set(result.id);
    this.quickPlaceGeoPoint.set({ x: result.x, y: result.y });
    this.quickPlaceGeoOpen.set(false);
    this.quickPlaceGeoActiveIndex.set(0);
    this.quickPlaceGeoResults.set([]);
    this.quickPlaceExistingResults.set([]);
  }

  selectQuickPlaceGeoResult(result: GeoAdminResult): void {
    const mapped = this.mapGeoAdminToLocal(result.x, result.y);
    this.quickPlaceName.set(result.label || this.quickPlaceName());
    this.quickPlaceSelectedExistingId.set(null);
    this.quickPlaceGeoPoint.set(mapped);
    this.quickPlaceGeoOpen.set(false);
    this.quickPlaceExistingResults.set([]);
    this.quickPlaceGeoResults.set([]);
    this.quickPlaceGeoActiveIndex.set(0);
  }

  activateSelectedQuickPlace(): void {
    const selected = this.selectedQuickPlaceExisting();
    if (!selected) {
      return;
    }
    if (!selected.active) {
      this.toastService.addToast({
        type: 'info',
        title: 'Place in diesem Jahr nicht aktiv',
        message: 'Wähle ein passendes Jahr oder erstelle einen neuen Place.',
        key: 'place-existing-inactive'
      });
      return;
    }
    if (selected.hidden) {
      this.unhideExistingPlaceForYear(selected);
      return;
    }
    this.activateExistingPlaceSuggestion(selected);
  }

  onQuickFromInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.quickFromQuery.set(value);
    this.quickFromId.set(null);
    this.quickFromOpen.set(true);
    this.quickFromActiveIndex.set(0);
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return;
    }
    const exact = this.quickFromNodes().find((node) => node.name.toLowerCase() === normalized);
    if (exact) {
      this.quickFromId.set(exact.id);
      this.applyQuickDistancePrefill();
    }
  }

  onQuickToInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.quickToQuery.set(value);
    this.quickToId.set(null);
    this.quickToOpen.set(true);
    this.quickToActiveIndex.set(0);
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return;
    }
    const exact = this.quickToNodes().find((node) => node.name.toLowerCase() === normalized);
    if (exact) {
      this.quickToId.set(exact.id);
      this.applyQuickDistancePrefill();
    }
  }

  onQuickFromKeydown(event: KeyboardEvent): void {
    const isArrowDown = event.key === 'ArrowDown' || event.key === 'Down';
    const isArrowUp = event.key === 'ArrowUp' || event.key === 'Up';
    const isEnter = event.key === 'Enter';
    const isEscape = event.key === 'Escape';
    const suggestions = this.quickFromSuggestions();
    if (isArrowDown) {
      if (!suggestions.length) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      this.quickFromOpen.set(true);
      this.quickFromActiveIndex.set((this.quickFromActiveIndex() + 1) % suggestions.length);
      return;
    }
    if (isArrowUp) {
      if (!suggestions.length) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      this.quickFromOpen.set(true);
      this.quickFromActiveIndex.set((this.quickFromActiveIndex() - 1 + suggestions.length) % suggestions.length);
      return;
    }
    if (isEnter && suggestions.length) {
      event.preventDefault();
      event.stopPropagation();
      const picked = suggestions[this.quickFromActiveIndex()] ?? suggestions[0];
      if (picked) {
        this.selectQuickFrom(picked.id);
      }
      return;
    }
    if (isEnter && this.quickFromId()) {
      event.preventDefault();
      event.stopPropagation();
      this.focusQuickToInput();
      return;
    }
    if (isEscape) {
      event.stopPropagation();
      this.quickFromOpen.set(false);
    }
  }

  onQuickToKeydown(event: KeyboardEvent): void {
    const isArrowDown = event.key === 'ArrowDown' || event.key === 'Down';
    const isArrowUp = event.key === 'ArrowUp' || event.key === 'Up';
    const isEnter = event.key === 'Enter';
    const isEscape = event.key === 'Escape';
    const suggestions = this.quickToSuggestions();
    if (isArrowDown) {
      if (!suggestions.length) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      this.quickToOpen.set(true);
      this.quickToActiveIndex.set((this.quickToActiveIndex() + 1) % suggestions.length);
      return;
    }
    if (isArrowUp) {
      if (!suggestions.length) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      this.quickToOpen.set(true);
      this.quickToActiveIndex.set((this.quickToActiveIndex() - 1 + suggestions.length) % suggestions.length);
      return;
    }
    if (isEnter && suggestions.length) {
      event.preventDefault();
      event.stopPropagation();
      const picked = suggestions[this.quickToActiveIndex()] ?? suggestions[0];
      if (picked) {
        this.selectQuickTo(picked.id);
      }
      return;
    }
    if (isEnter && this.quickToId()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (isEscape) {
      event.stopPropagation();
      this.quickToOpen.set(false);
    }
  }

  closeQuickFromList(): void {
    setTimeout(() => this.quickFromOpen.set(false), 80);
  }

  closeQuickToList(): void {
    setTimeout(() => this.quickToOpen.set(false), 80);
  }

  selectQuickFrom(nodeId: string): void {
    const node = this.nodeOptions().find((candidate) => candidate.id === nodeId);
    if (!node) {
      return;
    }
    this.quickFromId.set(node.id);
    this.quickFromQuery.set(node.name);
    this.quickFromOpen.set(false);
    this.quickFromActiveIndex.set(0);
    if (this.quickToId() === node.id) {
      this.quickToId.set(null);
      this.quickToQuery.set('');
    }
    this.applyQuickDistancePrefill();
  }

  selectQuickTo(nodeId: string): void {
    const node = this.nodeOptions().find((candidate) => candidate.id === nodeId);
    if (!node) {
      return;
    }
    this.quickToId.set(node.id);
    this.quickToQuery.set(node.name);
    this.quickToOpen.set(false);
    this.quickToActiveIndex.set(0);
    if (this.quickFromId() === node.id) {
      this.quickFromId.set(null);
      this.quickFromQuery.set('');
    }
    this.applyQuickDistancePrefill();
  }

  updateQuickDistance(event: Event): void {
    this.quickDistance.set((event.target as HTMLInputElement).value);
  }

  setQuickNodeFilter(target: 'from' | 'to', value: string): void {
    if (!this.isServiceNodeFilter(value)) {
      return;
    }
    if (target === 'from') {
      this.quickFromNodeFilter.set(value);
      this.quickFromActiveIndex.set(0);
      return;
    }
    this.quickToNodeFilter.set(value);
    this.quickToActiveIndex.set(0);
  }

  addQuickTrip(copyLast = false): void {
    const trips = this.quickTrips();
    const next: EdgeTrip = copyLast && trips.length > 0
      ? { ...trips[trips.length - 1], id: `quick-trip-${Date.now()}` }
      : { id: `quick-trip-${Date.now()}`, transport: 'postkutsche', departs: '08:00', arrives: '09:00', arrivalDayOffset: 0 };
    this.quickTrips.set([...trips, next]);
  }

  removeQuickTrip(tripId: string): void {
    const trips = this.quickTrips();
    if (trips.length <= 1) {
      return;
    }
    this.quickTrips.set(trips.filter((trip) => trip.id !== tripId));
  }

  updateQuickTripField(tripId: string, field: keyof EdgeTrip, value: string | number | undefined): void {
    const trips = this.quickTrips().map((trip) => (trip.id === tripId ? { ...trip, [field]: value } : trip));
    this.quickTrips.set(trips);
  }

  onQuickTripKeydown(event: KeyboardEvent, index: number, field: 'departs' | 'arrives'): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      if (field === 'departs') {
        this.focusQuickTripField(index, 'arrives');
        return;
      }
      const nextIndex = index + 1;
      if (nextIndex < this.quickTrips().length) {
        this.focusQuickTripField(nextIndex, 'departs');
        return;
      }
      this.addQuickTrip(true);
      requestAnimationFrame(() => this.focusQuickTripField(nextIndex, 'departs'));
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      event.stopPropagation();
      const nextIndex = Math.min(index + 1, this.quickTrips().length - 1);
      this.focusQuickTripField(nextIndex, field);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      const prevIndex = Math.max(index - 1, 0);
      this.focusQuickTripField(prevIndex, field);
    }
  }

  saveQuickEdge(): void {
    const from = this.quickFromId();
    const to = this.quickToId();
    if (!from || !to || from === to) {
      return;
    }

    const distanceRaw = this.quickDistance().trim();
    const distance = distanceRaw === '' ? undefined : Number(distanceRaw);
    if (distance !== undefined && Number.isNaN(distance)) {
      return;
    }

    const trips = this.quickTrips().map((trip) => ({
      ...trip,
      id: trip.id || `trip-${Date.now()}`,
      transport: trip.transport ?? 'postkutsche'
    }));
    if (!this.tripsValid(trips)) {
      return;
    }

    const noteDe = this.quickServiceNoteDe().trim();
    const noteFr = this.quickServiceNoteFr().trim();
    const notes: LocalizedText | undefined = noteDe || noteFr
      ? { de: noteDe || undefined, fr: noteFr || undefined }
      : undefined;

    const edge: GraphEdge = {
      id: `edge-${Date.now()}`,
      from,
      to,
      distance,
      validFrom: this.year(),
      notes,
      trips
    };

    this.repo.createEdge(edge).subscribe({
      next: (created) => {
        this.addEdge(created);
        this.selection.selectEdge(created.id);
        this.dirty.set(false);
        this.toastService.addToast({
          type: 'success',
          title: 'Strecke erstellt',
          key: 'edge-save'
        });
        if (trips.length) {
          this.toastService.addToast({
            type: 'success',
            title: 'Fahrten gespeichert',
            key: 'trip-save'
          });
        }
        this.quickFromOpen.set(false);
        this.quickToOpen.set(false);
        this.quickToId.set(null);
        this.quickToQuery.set('');
        this.quickDistance.set('');
        this.quickTrips.set([{ id: `quick-trip-${Date.now()}`, transport: 'postkutsche', departs: '08:00', arrives: '09:00', arrivalDayOffset: 0 }]);
        this.quickServiceNoteDe.set('');
        this.quickServiceNoteFr.set('');
      },
      error: (error) => {
        this.toastService.addToast({
          type: 'error',
          title: 'Fehler',
          message: this.extractErrorMessage(error),
          key: 'edge-save'
        });
      }
    });
  }

  saveQuickLink(): void {
    const from = this.quickFromId();
    const to = this.quickToId();
    if (!from || !to || from === to) {
      return;
    }

    const distanceRaw = this.quickDistance().trim();
    const distance = distanceRaw === '' ? undefined : Number(distanceRaw);
    if (distance !== undefined && Number.isNaN(distance)) {
      return;
    }

    this.draftEdge.set({
      id: `edge-${Date.now()}`,
      from,
      to,
      distance,
      validFrom: this.year(),
      notes: undefined,
      trips: []
    });
    this.selection.clearSelection();
    this.setQuickEntityMode('service');
    this.toastService.addToast({
      type: 'info',
      title: 'Link vorbereitet',
      message: 'Service-Richtung, Notizen und Fahrten jetzt ergänzen.',
      key: 'link-draft'
    });
  }

  saveQuickPlace(): void {
    const name = this.quickPlaceName().trim();
    if (!name) {
      return;
    }
    const selected = this.selectedQuickPlaceExisting() ?? this.resolveExistingPlaceByName(name);
    if (selected) {
      this.quickPlaceSelectedExistingId.set(selected.id);
      this.activateSelectedQuickPlace();
      return;
    }
    const visibleMatch = this.findVisibleExistingPlaceByName(name);
    if (visibleMatch) {
      this.activateExistingPlaceSuggestion(visibleMatch);
      return;
    }
    this.repo.searchPlaces(name, this.year()).subscribe({
      next: (results) => {
        const exact = this.pickExactExistingPlace(results, name);
        if (exact) {
          this.quickPlaceSelectedExistingId.set(exact.id);
          if (!exact.active) {
            this.toastService.addToast({
              type: 'info',
              title: 'Place in diesem Jahr nicht aktiv',
              message: 'Wähle ein passendes Jahr oder erstelle bewusst einen neuen Place.',
              key: 'place-existing-inactive'
            });
            return;
          }
          if (exact.hidden) {
            this.unhideExistingPlaceForYear(exact);
            return;
          }
          this.activateExistingPlaceSuggestion(exact);
          return;
        }
        this.createQuickPlace(name);
      },
      error: () => {
        this.createQuickPlace(name);
      }
    });
  }

  private createQuickPlace(name: string): void {
    const point = this.quickPlaceGeoPoint() ?? this.selection.lastMapPointerPosition() ?? { x: 0, y: 0 };
    const node: NodeDraft = {
      id: `node-${Date.now()}`,
      name,
      x: point.x,
      y: point.y,
      validFrom: this.year()
    };
    this.repo.createNode(node).subscribe({
      next: (created) => {
        this.addNode(created);
        this.selection.selectNode(created.id);
        this.clearQuickPlaceInput();
        this.quickFromId.set(created.id);
        this.quickFromQuery.set(created.name);
        this.quickAnchorX.set(String(Math.round(created.x * 10) / 10));
        this.quickAnchorY.set(String(Math.round(created.y * 10) / 10));
        this.toastService.addToast({
          type: 'success',
          title: 'Place erstellt',
          key: 'node-save'
        });
      },
      error: (error) => {
        this.toastService.addToast({
          type: 'error',
          title: 'Fehler',
          message: this.extractErrorMessage(error),
          key: 'node-save'
        });
      }
    });
  }

  private findVisibleExistingPlaceByName(name: string): ExistingPlaceResult | null {
    const normalized = name.trim().toLowerCase();
    if (!normalized) {
      return null;
    }
    const snapshot = this.displayGraph() ?? this.graph();
    const node = snapshot?.nodes.find((candidate) => candidate.name.trim().toLowerCase() === normalized);
    if (!node) {
      return null;
    }
    return {
      id: node.id,
      name: node.name,
      x: node.x,
      y: node.y,
      active: true,
      hidden: false
    };
  }

  private pickExactExistingPlace(results: ExistingPlaceResult[], name: string): ExistingPlaceResult | null {
    const normalized = name.trim().toLowerCase();
    const matches = results.filter((result) => result.name.trim().toLowerCase() === normalized);
    if (!matches.length) {
      return null;
    }
    matches.sort((a, b) => {
      if (a.hidden !== b.hidden) {
        return Number(a.hidden) - Number(b.hidden);
      }
      if (a.active !== b.active) {
        return Number(b.active) - Number(a.active);
      }
      return a.name.localeCompare(b.name);
    });
    return matches[0] ?? null;
  }

  private resolveExistingPlaceByName(name: string): ExistingPlaceResult | null {
    const normalized = name.trim().toLowerCase();
    if (!normalized) {
      return null;
    }
    return this.quickPlaceExistingResults().find((result) => result.name.trim().toLowerCase() === normalized) ?? null;
  }

  private activateExistingPlaceSuggestion(result: ExistingPlaceResult): void {
    if (result.hidden || !result.active) {
      return;
    }
    this.selection.selectNode(result.id);
    this.quickFromId.set(result.id);
    this.quickFromQuery.set(result.name);
    this.quickAnchorX.set(String(Math.round(result.x * 10) / 10));
    this.quickAnchorY.set(String(Math.round(result.y * 10) / 10));
    this.clearQuickPlaceInput();
    this.toastService.addToast({
      type: 'success',
      title: 'Bestehender Place gewählt',
      key: 'place-existing'
    });
  }

  private unhideExistingPlaceForYear(result: ExistingPlaceResult): void {
    const targetYear = this.year();
    this.repo.setNodeVisibility(result.id, targetYear, false).subscribe({
      next: (response) => {
        if (!response.updated) {
          this.toastService.addToast({
            type: 'error',
            title: 'Unhide fehlgeschlagen',
            key: 'place-unhide'
          });
          return;
        }
        this.pendingNodeSelectionAfterGraphLoad = result.id;
        this.fetchGraph(targetYear);
        this.quickFromId.set(result.id);
        this.quickFromQuery.set(result.name);
        this.clearQuickPlaceInput();
        this.toastService.addToast({
          type: 'success',
          title: `Place in ${targetYear} wieder sichtbar`,
          key: 'place-unhide'
        });
      },
      error: (error) => {
        this.toastService.addToast({
          type: 'error',
          title: 'Fehler',
          message: this.extractErrorMessage(error),
          key: 'place-unhide'
        });
      }
    });
  }

  private clearQuickPlaceInput(): void {
    this.quickPlaceExistingRequestSeq++;
    this.quickPlaceName.set('');
    this.quickPlaceSelectedExistingId.set(null);
    this.quickPlaceGeoPoint.set(null);
    this.quickPlaceGeoOpen.set(false);
    this.quickPlaceExistingResults.set([]);
    this.quickPlaceGeoResults.set([]);
    this.quickPlaceGeoActiveIndex.set(0);
  }

  useSelectedPlaceAsQuickTarget(): void {
    const nodeId = this.selectedNodeId();
    if (!nodeId) {
      return;
    }
    const node = this.getNodeById(nodeId);
    if (!node) {
      return;
    }
    this.quickFromId.set(node.id);
    this.quickFromQuery.set(node.name);
  }

  addQuickFact(): void {
    const schemaKey = this.quickFactSchemaKey().trim();
    const valueRaw = this.quickFactValue().trim();
    if (!schemaKey || !valueRaw) {
      return;
    }
    const valuePayload = this.buildQuickFactValuePayload(this.quickFactValueType(), valueRaw);
    if (!valuePayload) {
      return;
    }

    const editingId = this.editingFactId();
    if (editingId) {
      this.repo.updateAssertion(editingId, {
        schemaKey,
        ...valuePayload
      }).subscribe({
        next: (updated) => {
          this.persistedFacts.set(this.persistedFacts().map((fact) => (fact.id === updated.id ? updated : fact)));
          this.clearQuickFactEditor();
          this.inspectorTab.set('facts');
          this.toastService.addToast({
            type: 'success',
            title: 'Fact aktualisiert',
            key: 'fact-update'
          });
        },
        error: (error) => {
          this.toastService.addToast({
            type: 'error',
            title: 'Fehler',
            message: this.extractErrorMessage(error),
            key: 'fact-update'
          });
        }
      });
      return;
    }

    const target = this.resolveQuickTargetPlaceId();
    if (!target) {
      return;
    }

    const draft: GraphAssertion = {
      id: '',
      targetType: 'place',
      targetId: target,
      schemaKey,
      validFrom: this.year(),
      validTo: null,
      ...valuePayload
    };
    this.repo.createAssertion(draft).subscribe({
      next: (created) => {
        this.persistedFacts.set([...this.persistedFacts(), created]);
        this.quickFactValue.set('');
        this.inspectorTab.set('facts');
        this.toastService.addToast({
          type: 'success',
          title: 'Fact gespeichert',
          key: 'fact-add'
        });
      },
      error: (error) => {
        this.toastService.addToast({
          type: 'error',
          title: 'Fehler',
          message: this.extractErrorMessage(error),
          key: 'fact-add'
        });
      }
    });
  }

  startEditFact(fact: InspectorFact): void {
    if (!fact.editable) {
      return;
    }
    this.editingFactId.set(fact.id);
    this.quickFactSchemaKey.set(fact.schemaKey);
    this.quickFactValueType.set(fact.valueType === 'number' || fact.valueType === 'boolean' ? fact.valueType : 'string');
    this.quickFactValue.set(fact.value);
    const node = this.getNodeById(fact.targetId);
    if (node) {
      this.quickFromId.set(node.id);
      this.quickFromQuery.set(node.name);
    }
    this.setQuickEntityMode('fact');
  }

  cancelFactEdit(): void {
    this.clearQuickFactEditor();
  }

  removeFact(factId: string): void {
    this.repo.deleteAssertion(factId).subscribe({
      next: (result) => {
        if (!result.deleted) {
          this.toastService.addToast({
            type: 'error',
            title: 'Fact konnte nicht gelöscht werden',
            key: 'fact-remove'
          });
          return;
        }
        this.persistedFacts.set(this.persistedFacts().filter((fact) => fact.id !== factId));
        if (this.editingFactId() === factId) {
          this.clearQuickFactEditor();
        }
        this.toastService.addToast({
          type: 'success',
          title: 'Fact gelöscht',
          key: 'fact-remove'
        });
      },
      error: (error) => {
        this.toastService.addToast({
          type: 'error',
          title: 'Fehler',
          message: this.extractErrorMessage(error),
          key: 'fact-remove'
        });
      }
    });
  }

  setQuickAnchorFromPointer(): void {
    const point = this.selection.lastMapPointerPosition();
    if (!point) {
      return;
    }
    this.quickAnchorX.set(String(Math.round(point.x * 10) / 10));
    this.quickAnchorY.set(String(Math.round(point.y * 10) / 10));
  }

  applyQuickAnchor(): void {
    const target = this.resolveQuickTargetPlaceId();
    if (!target) {
      return;
    }
    const x = Number(this.quickAnchorX().trim());
    const y = Number(this.quickAnchorY().trim());
    if (Number.isNaN(x) || Number.isNaN(y)) {
      return;
    }
    this.updateNodeLocal(target, { x, y, iiifCenterX: undefined, iiifCenterY: undefined });
    this.dirty.set(true);
    this.repo.updateNode(target, { x, y, iiifCenterX: undefined, iiifCenterY: undefined }).subscribe({
      next: () => {
        this.toastService.addToast({
          type: 'success',
          title: 'Anchor aktualisiert',
          key: 'anchor-save'
        });
      },
      error: (error) => {
        this.toastService.addToast({
          type: 'error',
          title: 'Fehler',
          message: this.extractErrorMessage(error),
          key: 'anchor-save'
        });
      }
    });
  }

  onQuickTripPasteInput(event: Event): void {
    this.quickTripPasteText.set((event.target as HTMLTextAreaElement).value);
  }

  applyQuickTripPaste(): void {
    const parsed = this.parseTripLines(this.quickTripPasteText());
    if (!parsed.length) {
      return;
    }
    this.quickTrips.set([...this.quickTrips(), ...parsed]);
    this.quickTripPasteText.set('');
  }

  appendQuickTripsToCurrentService(): void {
    const trips = this.normalizeTrips(this.quickTrips()).filter((trip) => this.isTimeValid(trip.departs ?? '') && this.isTimeValid(trip.arrives ?? ''));
    if (!trips.length) {
      return;
    }
    const selected = this.selectedEdgeDraft();
    if (selected) {
      this.updateEdgeLocal(selected.id, { trips: [...selected.trips, ...trips] });
      this.dirty.set(true);
      this.toastService.addToast({
        type: 'success',
        title: 'Trips ergänzt',
        key: 'trip-append'
      });
      return;
    }
    const draft = this.draftEdge();
    if (draft) {
      this.draftEdge.set({ ...draft, trips: [...draft.trips, ...trips] });
      this.dirty.set(true);
      this.toastService.addToast({
        type: 'success',
        title: 'Trips ergänzt',
        key: 'trip-append'
      });
      return;
    }
    this.toastService.addToast({
      type: 'info',
      title: 'Kein Service ausgewählt',
      message: 'Wähle zuerst einen Service oder erstelle einen Link/Service.',
      key: 'trip-append'
    });
  }

  swapQuickDirection(): void {
    const fromId = this.quickFromId();
    const toId = this.quickToId();
    const fromQuery = this.quickFromQuery();
    const toQuery = this.quickToQuery();
    this.quickFromId.set(toId);
    this.quickToId.set(fromId);
    this.quickFromQuery.set(toQuery);
    this.quickToQuery.set(fromQuery);
    this.applyQuickDistancePrefill();
  }

  cancelPendingEdge(): void {
    this.selection.clearPendingEdge();
  }

  requestDeleteNode(anchor: DeleteConfirmAnchor = 'sticky'): void {
    if (!this.selectedNodeId()) {
      return;
    }
    if (this.confirmDeleteNode() && this.deleteConfirmAnchor() === anchor) {
      this.closeDeleteConfirm();
      return;
    }
    this.deleteConfirmAnchor.set(anchor);
    this.confirmDeleteNode.set(true);
  }

  cancelDeleteNode(): void {
    this.closeDeleteConfirm();
  }

  deleteSelectedNode(): void {
    const nodeId = this.selectedNodeId();
    const snapshot = this.graph();
    const deleteYear = this.year();
    if (!nodeId || !snapshot) {
      return;
    }
    const node = snapshot.nodes.find((candidate) => candidate.id === nodeId);
    if (!node) {
      return;
    }
    this.repo.deleteNode(nodeId, deleteYear).subscribe({
      next: (result) => {
        if (!result.deleted) {
          return;
        }
        if (this.year() === deleteYear) {
          this.removeNodeCascadeLocal(nodeId);
        } else {
          this.fetchGraph(this.year());
        }
        this.selection.clearSelection();
        this.closeDeleteConfirm();
        this.dirty.set(true);
        this.toastService.addToast({
          type: 'success',
          title: `Place im Jahr ${deleteYear} gelöscht`,
          key: 'node-delete'
        });
      },
      error: (error) => {
        this.toastService.addToast({
          type: 'error',
          title: 'Fehler',
          message: this.extractErrorMessage(error),
          key: 'node-delete'
        });
      }
    });
  }

  duplicateSelectedNode(): void {
    const nodeId = this.selectedNodeId();
    const snapshot = this.graph();
    if (!nodeId || !snapshot) {
      return;
    }
    const node = snapshot.nodes.find((candidate) => candidate.id === nodeId);
    if (!node) {
      return;
    }
    const id = `node-${Date.now()}`;
    this.draftNode.set({
      id,
      name: `${node.name} Copy`,
      x: node.x + 10,
      y: node.y + 10,
      validFrom: node.validFrom,
      validTo: node.validTo
    });
    this.dirty.set(true);
  }

  resetDemo(): void {
    if (!this.repo.isDemo) {
      return;
    }
    this.repo.reset().subscribe({
      next: () => {
        this.fetchGraph(this.year());
        this.dirty.set(false);
        this.toastService.addToast({
          type: 'info',
          title: 'Demo zurückgesetzt',
          key: 'demo-reset'
        });
      }
    });
  }

  restartTutorial(): void {
    if (!this.repo.isDemo) {
      return;
    }
    this.tour.restart(ADMIN_TUTORIAL_STEPS);
  }

  saveSelectedNode(): void {
    const snapshot = this.graph();
    const nodeId = this.selectedNodeId();
    if (!snapshot || !nodeId) {
      return;
    }
    const node = snapshot.nodes.find((candidate) => candidate.id === nodeId);
    if (!node) {
      return;
    }

    this.repo
      .updateNode(nodeId, {
        name: node.name,
        foreign: node.foreign,
        validFrom: node.validFrom,
        validTo: node.validTo,
        x: node.x,
        y: node.y
      })
      .subscribe({
        next: (updated) => {
          this.replaceNode(updated);
          this.dirty.set(false);
          this.toastService.addToast({
            type: 'success',
            title: 'Knoten gespeichert',
            key: 'node-save'
          });
        },
        error: (error) => {
          this.toastService.addToast({
            type: 'error',
            title: 'Fehler',
            message: this.extractErrorMessage(error),
            key: 'node-save'
          });
        }
      });
  }

  updateSelectedName(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    const nodeId = this.selectedNodeId();
    if (!nodeId) {
      return;
    }
    this.updateNodeLocal(nodeId, { name: value });
    this.dirty.set(true);
    this.queueGeoSearch(value);
  }

  updateSelectedValidFrom(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    const nodeId = this.selectedNodeId();
    if (!nodeId || Number.isNaN(value)) {
      return;
    }
    this.updateNodeLocal(nodeId, { validFrom: value });
    this.dirty.set(true);
  }

  updateSelectedValidTo(event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    const value = raw === '' ? undefined : Number(raw);
    const nodeId = this.selectedNodeId();
    if (!nodeId || (value !== undefined && Number.isNaN(value))) {
      return;
    }
    this.updateNodeLocal(nodeId, { validTo: value });
    this.dirty.set(true);
  }

  updateSelectedForeign(event: Event): void {
    const value = (event.target as HTMLInputElement).checked;
    const nodeId = this.selectedNodeId();
    if (!nodeId) {
      return;
    }
    this.updateNodeLocal(nodeId, { foreign: value });
    this.dirty.set(true);
  }

  onArchiveRegionChange(event: { iiifCenterX: number; iiifCenterY: number }): void {
    console.info('[archive-snippet] regionChange', event);
    if (this.isDragging()) {
      return;
    }
    const draft = this.draftNode();
    if (draft) {
      this.draftNode.set({ ...draft, iiifCenterX: event.iiifCenterX, iiifCenterY: event.iiifCenterY });
      this.dirty.set(true);
      return;
    }

    const nodeId = this.selectedNodeId();
    if (!nodeId) {
      return;
    }
    this.updateNodeLocal(nodeId, { iiifCenterX: event.iiifCenterX, iiifCenterY: event.iiifCenterY });
    this.pendingIiifUpdate = { nodeId, iiifCenterX: event.iiifCenterX, iiifCenterY: event.iiifCenterY, anchorYear: this.year() };
    if (this.archiveSaveHandle) {
      clearTimeout(this.archiveSaveHandle);
    }
    this.archiveSaveHandle = setTimeout(() => {
      const pending = this.pendingIiifUpdate;
      if (!pending) {
        return;
      }
      this.repo
        .updateNode(pending.nodeId, {
          iiifCenterX: pending.iiifCenterX,
          iiifCenterY: pending.iiifCenterY,
          anchorYear: pending.anchorYear
        })
        .subscribe({
          next: (updated) => {
            console.info('[archive-snippet] saved', updated.id, updated.iiifCenterX, updated.iiifCenterY);
            //this.replaceNode(updated);
            this.toastService.addToast({
              type: 'success',
              title: 'Archiv-Ausschnitt aktualisiert',
              key: 'archive-snippet'
            });
          },
          error: () => {
            console.warn('[archive-snippet] save failed');
            this.toastService.addToast({
              type: 'error',
              title: 'Fehler',
              message: 'Archiv-Ausschnitt konnte nicht gespeichert werden.',
              key: 'archive-snippet'
            });
          }
        });
    }, 250);
  }

  saveDraftNode(): void {
    const draft = this.draftNode();
    if (!draft) {
      return;
    }

    this.repo
      .createNode(draft)
      .subscribe({
        next: (created) => {
          this.draftNode.set(null);
          this.addNode(created);
          this.selection.selectNode(created.id);
          this.dirty.set(false);
          this.toastService.addToast({
            type: 'success',
            title: 'Knoten erstellt',
            key: 'node-save'
          });
        },
        error: (error) => {
          this.toastService.addToast({
            type: 'error',
            title: 'Fehler',
            message: this.extractErrorMessage(error),
            key: 'node-save'
          });
        }
      });
  }

  updateDraftName(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    const draft = this.draftNode();
    if (!draft) {
      return;
    }
    this.draftNode.set({ ...draft, name: value });
    this.dirty.set(true);
    this.queueGeoSearch(value);
  }

  onNodeNameKeydown(event: KeyboardEvent, mode: 'draft' | 'selected'): void {
    if (!this.geoSearchEnabled()) {
      if (event.key === 'Enter' && mode === 'draft') {
        event.preventDefault();
        this.saveDraftNodeAndContinue();
      }
      return;
    }
    const results = this.geoResults();
    if (event.key === 'ArrowDown' && results.length) {
      event.preventDefault();
      this.geoActiveIndex.set((this.geoActiveIndex() + 1) % results.length);
      return;
    }
    if (event.key === 'ArrowUp' && results.length) {
      event.preventDefault();
      this.geoActiveIndex.set((this.geoActiveIndex() - 1 + results.length) % results.length);
      return;
    }
    if (event.key === 'Escape') {
      this.geoResults.set([]);
      this.geoActiveIndex.set(0);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (results.length) {
        const picked = results[this.geoActiveIndex()] ?? results[0];
        if (picked) {
          this.applyGeoResult(picked);
        }
      }
      if (mode === 'draft') {
        this.saveDraftNodeAndContinue();
      }
    }
  }

  toggleGeoSearch(event: Event): void {
    const value = (event.target as HTMLInputElement).checked;
    this.geoSearchEnabled.set(value);
    if (!value) {
      this.geoResults.set([]);
      this.geoActiveIndex.set(0);
      this.quickPlaceGeoResults.set([]);
      this.quickPlaceGeoOpen.set(false);
      this.quickPlaceGeoActiveIndex.set(0);
      if (this.geoSearchHandle) {
        clearTimeout(this.geoSearchHandle);
        this.geoSearchHandle = null;
      }
      if (this.quickPlaceGeoSearchHandle) {
        clearTimeout(this.quickPlaceGeoSearchHandle);
        this.quickPlaceGeoSearchHandle = null;
      }
    }
  }

  applyGeoResult(result: GeoAdminResult): void {
    const mapped = this.mapGeoAdminToLocal(result.x, result.y);
    if (!mapped) {
      return;
    }
    const draft = this.draftNode();
    if (draft) {
      this.draftNode.set({
        ...draft,
        name: result.label || draft.name,
        x: mapped.x,
        y: mapped.y,
        iiifCenterX: undefined,
        iiifCenterY: undefined
      });
      this.dirty.set(true);
      this.geoResults.set([]);
      this.geoActiveIndex.set(0);
      return;
    }
    const nodeId = this.selectedNodeId();
    if (!nodeId) {
      return;
    }
    this.updateNodeLocal(nodeId, {
      name: result.label || this.findNode(nodeId)?.name,
      x: mapped.x,
      y: mapped.y,
      iiifCenterX: undefined,
      iiifCenterY: undefined
    });
    this.dirty.set(true);
    this.geoResults.set([]);
    this.geoActiveIndex.set(0);
  }

  updateDraftValidFrom(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    const draft = this.draftNode();
    if (!draft || Number.isNaN(value)) {
      return;
    }
    this.draftNode.set({ ...draft, validFrom: value });
    this.dirty.set(true);
  }

  updateDraftValidTo(event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    const value = raw === '' ? undefined : Number(raw);
    const draft = this.draftNode();
    if (!draft || (value !== undefined && Number.isNaN(value))) {
      return;
    }
    this.draftNode.set({ ...draft, validTo: value });
    this.dirty.set(true);
  }

  updateDraftForeign(event: Event): void {
    const value = (event.target as HTMLInputElement).checked;
    const draft = this.draftNode();
    if (!draft) {
      return;
    }
    this.draftNode.set({ ...draft, foreign: value });
    this.dirty.set(true);
  }

  saveDraftEdge(): void {
    const draft = this.draftEdge();
    if (!draft || !draft.from || !draft.to || !this.tripsValid(draft.trips)) {
      return;
    }
    const trips = this.normalizeTrips(draft.trips);
    const payload: GraphEdge = {
      id: draft.id,
      from: draft.from,
      to: draft.to,
      distance: draft.distance,
      validFrom: this.year(),
      validTo: undefined,
      notes: draft.notes,
      trips
    };

    this.repo
      .createEdge(payload)
      .subscribe({
        next: (created) => {
          this.draftEdge.set(null);
          this.addEdge(created);
          this.dirty.set(false);
          this.toastService.addToast({
            type: 'success',
            title: 'Strecke erstellt',
            key: 'edge-save'
          });
          if (trips.length) {
            this.toastService.addToast({
              type: 'success',
              title: 'Fahrten gespeichert',
              key: 'trip-save'
            });
          }
        },
        error: (error) => {
          this.toastService.addToast({
            type: 'error',
            title: 'Fehler',
            message: this.extractErrorMessage(error),
            key: 'edge-save'
          });
        }
      });
  }

  updateDraftEdgeFrom(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    const draft = this.ensureDraftEdge();
    if (!draft) {
      return;
    }
    const next = this.prefillDraftDistance({ ...draft, from: value || null });
    this.draftEdge.set(next);
    this.dirty.set(true);
  }

  updateDraftEdgeTo(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    const draft = this.ensureDraftEdge();
    if (!draft) {
      return;
    }
    const next = this.prefillDraftDistance({ ...draft, to: value || null });
    this.draftEdge.set(next);
    this.dirty.set(true);
  }

  updateDraftEdgeDistance(event: Event): void {
    const raw = (event.target as HTMLInputElement).value.trim();
    const value = raw === '' ? undefined : Number(raw);
    const draft = this.draftEdge();
    if (!draft || (value !== undefined && Number.isNaN(value))) {
      return;
    }
    this.draftEdge.set({ ...draft, distance: value });
    this.dirty.set(true);
  }

  updateDraftEdgeValidFrom(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    const draft = this.draftEdge();
    if (!draft || Number.isNaN(value)) {
      return;
    }
    this.draftEdge.set({ ...draft, validFrom: value });
    this.dirty.set(true);
  }

  updateDraftEdgeValidTo(event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    const value = raw === '' ? undefined : Number(raw);
    const draft = this.draftEdge();
    if (!draft || (value !== undefined && Number.isNaN(value))) {
      return;
    }
    this.draftEdge.set({ ...draft, validTo: value });
    this.dirty.set(true);
  }

  updateDraftEdgeNotes(lang: keyof LocalizedText, event: Event): void {
    const value = (event.target as HTMLTextAreaElement).value;
    const draft = this.draftEdge();
    if (!draft) {
      return;
    }
    const next = value.trim();
    const notes = { ...(draft.notes ?? {}) } satisfies LocalizedText;
    notes[lang] = next ? value : undefined;
    if (!notes.de && !notes.fr) {
      this.draftEdge.set({ ...draft, notes: undefined });
    } else {
      this.draftEdge.set({ ...draft, notes });
    }
    this.dirty.set(true);
  }

  updateSelectedEdgeFrom(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    const draft = this.selectedEdgeDraft();
    if (!draft) {
      return;
    }
    const nextFrom = value || draft.from;
    if (!nextFrom) {
      return;
    }
    const distance = this.findExistingDistance(nextFrom, draft.to, draft.id) ?? draft.distance;
    this.updateEdgeLocal(draft.id, { from: nextFrom, distance });
    this.dirty.set(true);
  }

  updateSelectedEdgeTo(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    const draft = this.selectedEdgeDraft();
    if (!draft) {
      return;
    }
    const nextTo = value || draft.to;
    if (!nextTo) {
      return;
    }
    const distance = this.findExistingDistance(draft.from, nextTo, draft.id) ?? draft.distance;
    this.updateEdgeLocal(draft.id, { to: nextTo, distance });
    this.dirty.set(true);
  }

  updateSelectedEdgeDistance(event: Event): void {
    const raw = (event.target as HTMLInputElement).value.trim();
    const value = raw === '' ? undefined : Number(raw);
    const draft = this.selectedEdgeDraft();
    if (!draft || (value !== undefined && Number.isNaN(value))) {
      return;
    }
    this.updateEdgeLocal(draft.id, { distance: value });
    this.dirty.set(true);
  }

  updateSelectedEdgeValidFrom(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    const draft = this.selectedEdgeDraft();
    if (!draft || Number.isNaN(value)) {
      return;
    }
    this.updateEdgeLocal(draft.id, { validFrom: value });
    this.dirty.set(true);
  }

  updateSelectedEdgeValidTo(event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    const value = raw === '' ? undefined : Number(raw);
    const draft = this.selectedEdgeDraft();
    if (!draft || (value !== undefined && Number.isNaN(value))) {
      return;
    }
    this.updateEdgeLocal(draft.id, { validTo: value });
    this.dirty.set(true);
  }

  updateSelectedEdgeNotes(lang: keyof LocalizedText, event: Event): void {
    const value = (event.target as HTMLTextAreaElement).value;
    const draft = this.selectedEdgeDraft();
    if (!draft) {
      return;
    }
    const next = value.trim();
    const notes = { ...(draft.notes ?? {}) } satisfies LocalizedText;
    notes[lang] = next ? value : undefined;
    if (!notes.de && !notes.fr) {
      this.updateEdgeLocal(draft.id, { notes: undefined });
    } else {
      this.updateEdgeLocal(draft.id, { notes });
    }
    this.dirty.set(true);
  }

  updateSelectedTripField(tripId: string, field: keyof EdgeTrip, value: string | number | undefined): void {
    const draft = this.selectedEdgeDraft();
    if (!draft) {
      return;
    }
    const trips = draft.trips.map((trip) => {
      if (trip.id !== tripId) {
        return trip;
      }
      const next = { ...trip, [field]: value };
      return next;
    });
    this.updateEdgeLocal(draft.id, { trips });
    this.dirty.set(true);
  }

  addSelectedTrip(): void {
    const draft = this.selectedEdgeDraft();
    if (!draft) {
      return;
    }
    const newTrip: EdgeTrip = {
      id: `trip-${Date.now()}`,
      transport: 'postkutsche',
      departs: '08:00',
      arrives: '09:00',
      arrivalDayOffset: 0
    };
    this.updateEdgeLocal(draft.id, { trips: [...draft.trips, newTrip] });
    this.tour.markEvent('tripAdded');
    this.dirty.set(true);
  }

  removeSelectedTrip(tripId: string): void {
    const draft = this.selectedEdgeDraft();
    if (!draft) {
      return;
    }
    this.updateEdgeLocal(draft.id, { trips: draft.trips.filter((trip) => trip.id !== tripId) });
    this.dirty.set(true);
  }

  saveSelectedEdge(): void {
    const draft = this.selectedEdgeDraft();
    if (!draft || !draft.from || !draft.to || !this.tripsValid(draft.trips)) {
      return;
    }
    const trips = this.normalizeTrips(draft.trips);

    this.repo
      .updateEdge(draft.id, {
        from: draft.from,
        to: draft.to,
        distance: draft.distance,
        validFrom: this.year(),
        validTo: undefined,
        notes: draft.notes,
        trips
      } as GraphEdge)
      .subscribe({
        next: (updated) => {
          this.replaceEdge(updated);
          this.dirty.set(false);
          this.toastService.addToast({
            type: 'success',
            title: 'Strecke gespeichert',
            key: 'edge-save'
          });
          if (trips.length) {
            this.toastService.addToast({
              type: 'success',
              title: 'Fahrten gespeichert',
              key: 'trip-save'
            });
          }
        },
        error: (error) => {
          this.toastService.addToast({
            type: 'error',
            title: 'Fehler',
            message: this.extractErrorMessage(error),
            key: 'edge-save'
          });
        }
      });
  }

  addTrip(): void {
    const draft = this.draftEdge();
    if (!draft) {
      return;
    }
    const newTrip: EdgeTrip = {
      id: `trip-${Date.now()}`,
      transport: 'postkutsche',
      departs: '08:00',
      arrives: '09:00',
      arrivalDayOffset: 0
    };
    this.draftEdge.set({ ...draft, trips: [...draft.trips, newTrip] });
    this.tour.markEvent('tripAdded');
    this.dirty.set(true);
  }

  removeTrip(tripId: string): void {
    const draft = this.draftEdge();
    if (!draft) {
      return;
    }
    this.draftEdge.set({ ...draft, trips: draft.trips.filter((trip) => trip.id !== tripId) });
    this.dirty.set(true);
  }

  updateTripField(tripId: string, field: keyof EdgeTrip, value: string | number | undefined): void {
    const draft = this.draftEdge();
    if (!draft) {
      return;
    }
    const trips = draft.trips.map((trip) => {
      if (trip.id !== tripId) {
        return trip;
      }
      const next = { ...trip, [field]: value };
      return next;
    });
    this.draftEdge.set({ ...draft, trips });
    this.dirty.set(true);
  }

  removeSelectedEdge(): void {
    const edgeId = this.selectedEdgeId();
    if (!edgeId) {
      return;
    }
    this.repo.deleteEdge(edgeId).subscribe({
      next: (result) => {
        if (result.deleted) {
          this.removeEdgeLocal(edgeId);
          this.selection.clearSelection();
          this.dirty.set(false);
          this.toastService.addToast({
            type: 'success',
            title: 'Strecke gelöscht',
            key: 'edge-save'
          });
        }
      },
      error: (error) => {
        this.toastService.addToast({
          type: 'error',
          title: 'Fehler',
          message: this.extractErrorMessage(error),
          key: 'edge-save'
        });
      }
    });
  }

  undoMove(): void {
    const stack = this.undoStack();
    const last = stack[stack.length - 1];
    if (!last) {
      return;
    }

    this.undoStack.set(stack.slice(0, -1));
    if (last.type === 'MOVE_NODE') {
      this.updateNodeLocal(last.id, { x: last.from.x, y: last.from.y });
      this.dirty.set(true);
      this.repo
        .updateNode(last.id, {
          x: last.from.x,
          y: last.from.y
        })
        .subscribe({
          next: (updated) => {
            this.replaceNode(updated);
            this.toastService.addToast({
              type: 'info',
              title: 'Änderung rückgängig gemacht',
              key: 'undo'
            });
          },
          error: () => null
        });
      return;
    }

    if (last.type === 'DELETE_NODE') {
      this.restoreDeletedNode(last.node, last.edges);
      this.toastService.addToast({
        type: 'info',
        title: 'Änderung rückgängig gemacht',
        key: 'undo'
      });
    }
  }

  private handleSelectPointer(event: {
    type: 'down' | 'move' | 'up';
    world: { x: number; y: number };
    hitNodeId: string | null;
    hitEdgeId: string | null;
  }): void {
    const pendingFrom = this.selection.pendingCreateEdgeFromNodeId();
    if (pendingFrom && event.type === 'down') {
      return;
    }
    if (pendingFrom && event.type === 'up' && event.hitNodeId && event.hitNodeId !== pendingFrom) {
      this.selection.clearPendingEdge();
      this.createDraftEdgeBetween(pendingFrom, event.hitNodeId);
      this.tour.markEvent('edgeCreated');
      return;
    }

    if (event.type === 'down') {
      if (event.hitNodeId) {
        const transform = computeArchiveTransform();
        const node = this.findNode(event.hitNodeId);
        if (!node) {
          return;
        }
        this.dragState = {
          id: node.id,
          from: { x: node.x, y: node.y },
          moved: false
        };
        this.isDragging.set(true);
        this.scrollArchivePanelIntoView();
        this.selection.selectNode(node.id);
        this.draftEdge.set(null);
        this.closeDeleteConfirm();
      } else if (event.hitEdgeId) {
        this.selection.selectEdge(event.hitEdgeId);
        this.draftEdge.set(null);
        this.closeDeleteConfirm();
        this.isDragging.set(false);
      } else {
        this.selection.clearSelection();
        this.closeDeleteConfirm();
        this.isDragging.set(false);
      }
      return;
    }

    if (event.type === 'move') {
      if (!this.dragState) {
        return;
      }
      this.dragState.moved = true;
      this.updateNodeLocal(this.dragState.id, {
        x: event.world.x,
        y: event.world.y,
        iiifCenterX: undefined,
        iiifCenterY: undefined
      });
      this.dirty.set(true);
      return;
    }

    if (event.type === 'up') {
      if (!this.dragState) {
        return;
      }
      const transform = computeArchiveTransform();
      const node = this.findNode(this.dragState.id);
      const from = this.dragState.from;
      const moved = this.dragState.moved && node && (node.x !== from.x || node.y !== from.y);

      if (moved && node) {
        const to = { x: node.x, y: node.y };
        this.pushUndo({ type: 'MOVE_NODE', id: node.id, from, to });
        this.repo
          .updateNode(node.id, { x: node.x, y: node.y, iiifCenterX: undefined, iiifCenterY: undefined })
          .subscribe({
            next: (updated) => {
              //this.replaceNode(updated);
              this.toastService.addToast({
                type: 'success',
                title: 'Position aktualisiert',
                key: 'node-move'
              });
            },
            error: (error) => {
              this.toastService.addToast({
                type: 'error',
                title: 'Fehler',
                message: this.extractErrorMessage(error),
                key: 'node-move'
              });
            }
          });
        this.tour.markEvent('nodeMoved');
      }

      this.dragState = null;
      this.isDragging.set(false);
      if (this.archiveViewer) {
        setTimeout(() => this.archiveViewer?.emitCurrentCenter(true), 150);
      }
    }
  }

  private pushUndo(action: MoveUndo | DeleteNodeUndo): void {
    const stack = [...this.undoStack(), action];
    if (stack.length > UNDO_LIMIT) {
      stack.shift();
    }
    this.undoStack.set(stack);
  }

  private scrollArchivePanelIntoView(): void {
    const panel = this.archivePanelRef?.nativeElement;
    if (!panel) {
      return;
    }
    requestAnimationFrame(() => {
      panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }

  private createDraftNode(point: { x: number; y: number }, name = 'New node'): void {
    const id = `node-${Date.now()}`;
    this.selection.clearSelection();
    this.draftNode.set({
      id,
      name,
      x: point.x,
      y: point.y,
      validFrom: this.year()
    });
    this.tour.markEvent('nodeCreated');
    this.dirty.set(true);
  }

  duplicateSelectedTrip(): void {
    const draft = this.selectedEdgeDraft();
    if (!draft || draft.trips.length === 0) {
      return;
    }
    const last = draft.trips[draft.trips.length - 1];
    const copy: EdgeTrip = { ...last, id: `trip-${Date.now()}` };
    this.updateEdgeLocal(draft.id, { trips: [...draft.trips, copy] });
    this.tour.markEvent('tripAdded');
    this.dirty.set(true);
    requestAnimationFrame(() => this.focusTripField(draft.trips.length, 'departs'));
  }

  duplicateDraftTrip(): void {
    const draft = this.draftEdge();
    if (!draft || draft.trips.length === 0) {
      return;
    }
    const last = draft.trips[draft.trips.length - 1];
    const copy: EdgeTrip = { ...last, id: `trip-${Date.now()}` };
    this.draftEdge.set({ ...draft, trips: [...draft.trips, copy] });
    this.tour.markEvent('tripAdded');
    this.dirty.set(true);
    requestAnimationFrame(() => this.focusTripField(draft.trips.length, 'departs'));
  }

  handleTripEnter(isSelected: boolean, index: number, field: 'departs' | 'arrives' | 'arrivalDayOffset'): void {
    const order: Array<'departs' | 'arrives' | 'arrivalDayOffset'> = ['departs', 'arrives', 'arrivalDayOffset'];
    const currentIndex = order.indexOf(field);
    if (currentIndex === -1) {
      return;
    }
    if (currentIndex < order.length - 1) {
      this.focusTripField(index, order[currentIndex + 1]);
      return;
    }

    const nextIndex = index + 1;
    const trips = isSelected ? this.selectedEdgeDraft()?.trips ?? [] : this.draftEdge()?.trips ?? [];
    if (nextIndex < trips.length) {
      this.focusTripField(nextIndex, 'departs');
      return;
    }

    if (isSelected) {
      this.addSelectedTrip();
    } else {
      this.addTrip();
    }
    requestAnimationFrame(() => this.focusTripField(nextIndex, 'departs'));
  }

  private focusTripField(index: number, field: 'departs' | 'arrives' | 'arrivalDayOffset'): void {
    const root = this.hostRef.nativeElement;
    const selector = `[data-trip-index=\"${index}\"][data-trip-field=\"${field}\"]`;
    const el = root.querySelector(selector) as HTMLInputElement | HTMLSelectElement | null;
    if (el) {
      el.focus();
      if (el instanceof HTMLInputElement) {
        el.select();
      }
    }
  }


  private saveDraftNodeAndContinue(): void {
    const draft = this.draftNode();
    if (!draft) {
      return;
    }
    this.repo
      .createNode(draft)
      .subscribe({
        next: (created) => {
          this.addNode(created);
          this.dirty.set(false);
          this.toastService.addToast({
            type: 'success',
            title: 'Knoten erstellt',
            key: 'node-save'
          });
          this.createDraftNode({ x: created.x, y: created.y }, '');
          this.focusNodeNameInput();
        },
        error: (error) => {
          this.toastService.addToast({
            type: 'error',
            title: 'Fehler',
            message: this.extractErrorMessage(error),
            key: 'node-save'
          });
        }
      });
  }

  private focusNodeNameInput(): void {
    requestAnimationFrame(() => {
      this.nodeNameInput?.nativeElement?.focus();
      this.nodeNameInput?.nativeElement?.select();
    });
  }

  private queueGeoSearch(query: string): void {
    if (!this.geoSearchEnabled() || !this.isBrowser) {
      return;
    }
    const cleaned = query.replace(/\([^)]*\)$/, '').trim();
    if (cleaned.length < 2) {
      this.geoResults.set([]);
      return;
    }
    if (this.geoSearchHandle) {
      clearTimeout(this.geoSearchHandle);
    }
    this.geoSearchHandle = setTimeout(() => this.fetchGeoAdminResults(cleaned), 250);
  }

  private queueQuickPlaceGeoSearch(query: string): void {
    if (!this.geoSearchEnabled() || !this.isBrowser) {
      this.quickPlaceGeoResults.set([]);
      this.quickPlaceGeoActiveIndex.set(0);
      return;
    }
    const cleaned = query.replace(/\([^)]*\)$/, '').trim();
    if (cleaned.length < 2) {
      this.quickPlaceGeoResults.set([]);
      this.quickPlaceGeoActiveIndex.set(0);
      return;
    }
    if (this.quickPlaceGeoSearchHandle) {
      clearTimeout(this.quickPlaceGeoSearchHandle);
    }
    this.quickPlaceGeoSearchHandle = setTimeout(() => this.fetchQuickPlaceGeoAdminResults(cleaned), 250);
  }

  private queueQuickPlaceExistingSearch(query: string): void {
    if (!this.isBrowser) {
      this.quickPlaceExistingResults.set([]);
      this.quickPlaceGeoActiveIndex.set(0);
      return;
    }
    const cleaned = query.trim();
    if (cleaned.length < 2) {
      this.quickPlaceExistingResults.set([]);
      this.quickPlaceGeoActiveIndex.set(0);
      return;
    }
    if (this.quickPlaceExistingSearchHandle) {
      clearTimeout(this.quickPlaceExistingSearchHandle);
    }
    this.quickPlaceExistingSearchHandle = setTimeout(() => this.fetchQuickPlaceExistingResults(cleaned), 180);
  }

  private fetchGeoAdminResults(query: string): void {
    if (!this.geoSearchEnabled() || !this.isBrowser) {
      return;
    }
    this.fetchGeoAdminSearch(query, (results) => {
      this.geoResults.set(results);
      this.geoActiveIndex.set(0);
    });
  }

  private fetchQuickPlaceGeoAdminResults(query: string): void {
    if (!this.geoSearchEnabled() || !this.isBrowser) {
      return;
    }
    this.fetchGeoAdminSearch(query, (results) => {
      this.quickPlaceGeoResults.set(results);
      this.quickPlaceGeoActiveIndex.set(0);
    });
  }

  private fetchQuickPlaceExistingResults(query: string): void {
    const year = this.year();
    const requestSeq = ++this.quickPlaceExistingRequestSeq;
    this.repo.searchPlaces(query, year).subscribe({
      next: (results) => {
        if (requestSeq !== this.quickPlaceExistingRequestSeq) {
          return;
        }
        this.quickPlaceExistingResults.set(results);
        this.quickPlaceGeoActiveIndex.set(0);
      },
      error: () => {
        if (requestSeq !== this.quickPlaceExistingRequestSeq) {
          return;
        }
        this.quickPlaceExistingResults.set([]);
      }
    });
  }

  private fetchGeoAdminSearch(query: string, applyResults: (results: GeoAdminResult[]) => void): void {
    this.geoLoading.set(true);
    const url =
      'https://api3.geo.admin.ch/rest/services/api/SearchServer' +
      `?type=locations&origins=gg25&searchText=${encodeURIComponent(query)}&limit=10`;
    this.http.get<{ results?: Array<{ id?: string; attrs?: { label?: string; x?: number; y?: number } }> }>(url).subscribe({
      next: (response) => {
        const results =
          response.results
            ?.map((entry) => {
              const attrs = entry.attrs ?? {};
              const x = typeof attrs.x === 'number' ? attrs.x : Number(attrs.x);
              const y = typeof attrs.y === 'number' ? attrs.y : Number(attrs.y);
              if (!Number.isFinite(x) || !Number.isFinite(y)) {
                return null;
              }
              const label = attrs.label?.replaceAll('<b>', '').replaceAll('</b>', '')?.replace(/\([^)]*\)$/, '').trim() ?? '';
              return {
                id: entry.id ?? `${label}-${x}-${y}`,
                label: label || query,
                x,
                y
              } satisfies GeoAdminResult;
            })
            .filter((entry): entry is GeoAdminResult => Boolean(entry)) ?? [];
        applyResults(results);
        this.geoLoading.set(false);
      },
      error: () => {
        applyResults([]);
        this.geoLoading.set(false);
      }
    });
  }

  private mapGeoAdminToLocal(geoX: number, geoY: number): { x: number; y: number } | null {
    const anchors = [
      { geo: { x: 117839, y: 499959 }, local: { x: 21, y: 414 } }, // Geneva
      { geo: { x: 200386, y: 598633 }, local: { x: 275, y: 233 } }, // Bern
      { geo: { x: 211883, y: 665512 }, local: { x: 417, y: 185 } }, // Lucerne
      { geo: { x: 118851, y: 719163 }, local: { x: 550, y: 426 } }, // Bellinzona
      { geo: { x: 188899, y: 758513 }, local: { x: 629.32328308207, y: 254.42546063651594 } }, // Chur
      { geo: { x: 286052, y: 690159 }, local: { x: 475.73199329983254, y: 8.509212730318259 } } // Schaffhausen
    ];

    const result = this.computeAffineLeastSquares(anchors);
    if (!result) {
      return null;
    }
    const { a, b, c, d, e, f } = result;
    return { x: a * geoX + b * geoY + c, y: d * geoX + e * geoY + f };
  }

  private computeAffineLeastSquares(anchors: Array<{ geo: { x: number; y: number }; local: { x: number; y: number } }>): {
    a: number;
    b: number;
    c: number;
    d: number;
    e: number;
    f: number;
  } | null {
    if (anchors.length < 3) {
      return null;
    }

    // Solve for x: [X Y 1] * [a b c]^T = x'
    // Solve for y: [X Y 1] * [d e f]^T = y'
    const solve3 = (coords: Array<{ X: number; Y: number; v: number }>) => {
      let sXX = 0;
      let sXY = 0;
      let sX1 = 0;
      let sYY = 0;
      let sY1 = 0;
      let s11 = coords.length;
      let sXv = 0;
      let sYv = 0;
      let s1v = 0;

      for (const row of coords) {
        sXX += row.X * row.X;
        sXY += row.X * row.Y;
        sX1 += row.X;
        sYY += row.Y * row.Y;
        sY1 += row.Y;
        sXv += row.X * row.v;
        sYv += row.Y * row.v;
        s1v += row.v;
      }

      const A = [
        [sXX, sXY, sX1],
        [sXY, sYY, sY1],
        [sX1, sY1, s11]
      ];
      const B = [sXv, sYv, s1v];

      const det =
        A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1]) -
        A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0]) +
        A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0]);
      if (det === 0) {
        return null;
      }

      const inv = [
        [
          (A[1][1] * A[2][2] - A[1][2] * A[2][1]) / det,
          (A[0][2] * A[2][1] - A[0][1] * A[2][2]) / det,
          (A[0][1] * A[1][2] - A[0][2] * A[1][1]) / det
        ],
        [
          (A[1][2] * A[2][0] - A[1][0] * A[2][2]) / det,
          (A[0][0] * A[2][2] - A[0][2] * A[2][0]) / det,
          (A[0][2] * A[1][0] - A[0][0] * A[1][2]) / det
        ],
        [
          (A[1][0] * A[2][1] - A[1][1] * A[2][0]) / det,
          (A[0][1] * A[2][0] - A[0][0] * A[2][1]) / det,
          (A[0][0] * A[1][1] - A[0][1] * A[1][0]) / det
        ]
      ];

      const x = inv[0][0] * B[0] + inv[0][1] * B[1] + inv[0][2] * B[2];
      const y = inv[1][0] * B[0] + inv[1][1] * B[1] + inv[1][2] * B[2];
      const z = inv[2][0] * B[0] + inv[2][1] * B[1] + inv[2][2] * B[2];
      return [x, y, z] as const;
    };

    const xRows = anchors.map((a) => ({ X: a.geo.x, Y: a.geo.y, v: a.local.x }));
    const yRows = anchors.map((a) => ({ X: a.geo.x, Y: a.geo.y, v: a.local.y }));
    const solX = solve3(xRows);
    const solY = solve3(yRows);
    if (!solX || !solY) {
      return null;
    }
    return { a: solX[0], b: solX[1], c: solX[2], d: solY[0], e: solY[1], f: solY[2] };
  }

  private ensureDraftEdge(): EdgeDraft | null {
    const draft = this.draftEdge();
    if (draft) {
      return draft;
    }
    const snapshot = this.displayGraph() ?? this.graph();
    const nodes = snapshot?.nodes ?? [];
    const selected = this.selectedNodeId();
    const from = selected ?? nodes[0]?.id ?? null;
    const to = nodes.find((node) => node.id !== from)?.id ?? null;
    const created: EdgeDraft = {
      id: `edge-${Date.now()}`,
      from,
      to,
      distance: this.findExistingDistance(from, to),
      validFrom: this.year(),
      notes: undefined,
      trips: []
    };
    this.draftEdge.set(created);
    return created;
  }

  private createDraftEdgeBetween(from: string, to: string): void {
    const draftId = `edge-${Date.now()}`;
    this.draftEdge.set({
      id: draftId,
      from,
      to,
      distance: this.findExistingDistance(from, to),
      validFrom: this.year(),
      notes: undefined,
      trips: []
    });
    this.selection.selectEdge(draftId);
    this.closeDeleteConfirm();
    this.dirty.set(true);
  }

  private closeDeleteConfirm(): void {
    this.confirmDeleteNode.set(false);
    this.deleteConfirmAnchor.set(null);
  }

  private applyQuickDistancePrefill(): void {
    const from = this.quickFromId();
    const to = this.quickToId();
    if (!from || !to) {
      this.quickDistance.set('');
      return;
    }
    const found = this.findExistingDistance(from, to);
    this.quickDistance.set(found !== undefined ? String(found) : '');
  }

  private focusQuickTripField(index: number, field: 'departs' | 'arrives'): void {
    const root = this.hostRef.nativeElement;
    const selector = `[data-quick-trip-index=\"${index}\"][data-quick-trip-field=\"${field}\"]`;
    const el = root.querySelector(selector) as HTMLInputElement | null;
    if (el) {
      el.focus();
      el.select();
    }
  }

  private focusQuickToInput(): void {
    requestAnimationFrame(() => {
      const input = this.quickToInput?.nativeElement;
      if (input) {
        input.focus();
        input.select();
      }
    });
  }

  private pickEdgeNode(nodeId: string): void {
    const draft = this.draftEdge();
    if (!draft) {
      this.draftEdge.set({
        id: `edge-${Date.now()}`,
        from: nodeId,
        to: null,
        distance: undefined,
        validFrom: this.year(),
        trips: []
      });
      return;
    }

    if (!draft.from) {
      const next = this.prefillDraftDistance({ ...draft, from: nodeId });
      this.draftEdge.set(next);
      return;
    }

    if (!draft.to && nodeId !== draft.from) {
      const next = this.prefillDraftDistance({ ...draft, to: nodeId });
      this.draftEdge.set(next);
    }
  }

  private prefillDraftDistance(draft: EdgeDraft): EdgeDraft {
    if (!draft.from || !draft.to || draft.distance !== undefined) {
      return draft;
    }
    const distance = this.findExistingDistance(draft.from, draft.to);
    if (distance === undefined) {
      return draft;
    }
    return { ...draft, distance };
  }

  private findExistingDistance(from: string | null, to: string | null, excludeEdgeId?: string): number | undefined {
    if (!from || !to) {
      return undefined;
    }
    const snapshot = this.graph();
    if (!snapshot) {
      return undefined;
    }
    const [a, b] = from <= to ? [from, to] : [to, from];
    const match = snapshot.edges.find((edge) => {
      if (excludeEdgeId && edge.id === excludeEdgeId) {
        return false;
      }
      const [edgeA, edgeB] = edge.from <= edge.to ? [edge.from, edge.to] : [edge.to, edge.from];
      return edgeA === a && edgeB === b && edge.distance !== undefined;
    });
    return match?.distance;
  }

  private fetchYears(): void {
    this.repo.loadYears().subscribe({
      next: (years) => {
        const sorted = [...years].sort((a, b) => a - b);
        this.availableYears.set(sorted);
        if (!this.newEditionYearDraft().trim()) {
          const next = sorted.length ? sorted[sorted.length - 1] + 1 : DEFAULT_YEAR + 1;
          this.newEditionYearDraft.set(String(next));
        }
      },
      error: () => this.availableYears.set([])
    });
  }

  private fetchEditions(): void {
    this.repo.loadEditions().subscribe({
      next: (editions) => this.editions.set([...editions].sort((a, b) => a.year - b.year)),
      error: () => this.editions.set([])
    });
  }

  private saveIiifRouteForYear(): void {
    const year = this.year();
    const normalized = normalizeIiifRoute(this.iiifRouteDraft());
    const current = normalizeIiifRoute(this.editions().find((entry) => entry.year === year)?.iiifRoute);
    if (normalized === current) {
      this.iiifRouteDraft.set(normalized);
      return;
    }
    this.repo
      .updateEdition(year, {
        iiifRoute: normalized === ARCHIVE_IIIF_BASE ? undefined : normalized
      })
      .subscribe({
        next: (edition) => {
          this.upsertEditionLocal(edition);
          this.iiifRouteDraft.set(normalizeIiifRoute(edition.iiifRoute));
          this.toastService.addToast({
            type: 'success',
            title: 'IIIF-Route gespeichert',
            key: `iiif-route-${year}`
          });
        },
        error: (error) => {
          this.iiifRouteDraft.set(current);
          this.toastService.addToast({
            type: 'error',
            title: 'Fehler',
            message: this.extractErrorMessage(error),
            key: `iiif-route-${year}`
          });
        }
      });
  }

  private upsertEditionLocal(edition: EditionEntry): void {
    const current = this.editions();
    const index = current.findIndex((item) => item.year === edition.year);
    const next =
      index === -1 ? [...current, edition] : [...current.slice(0, index), edition, ...current.slice(index + 1)];
    this.editions.set(next.sort((a, b) => a.year - b.year));
  }

  private upsertAvailableYearLocal(year: number): void {
    const years = this.availableYears();
    if (years.includes(year)) {
      return;
    }
    this.availableYears.set([...years, year].sort((a, b) => a - b));
  }

  private applyYearSelection(nextYear: number): void {
    this.year.set(nextYear);
    this.quickFromNodeFilter.set('all');
    this.quickToNodeFilter.set('all');
    this.quickPlaceExistingRequestSeq++;
    this.selection.clearSelection();
    this.selection.clearPendingEdge();
    this.draftNode.set(null);
    this.draftEdge.set(null);
    this.dragState = null;
    this.quickPlaceExistingResults.set([]);
    this.quickPlaceSelectedExistingId.set(null);
    this.quickPlaceGeoResults.set([]);
    this.quickPlaceGeoActiveIndex.set(0);
    this.clearQuickFactEditor();
  }

  private getQuickNodesForTarget(target: 'from' | 'to'): Array<{ id: string; name: string }> {
    const selectedOtherId = target === 'from' ? this.quickToId() : this.quickFromId();
    const selectedCurrentId = target === 'from' ? this.quickFromId() : this.quickToId();
    const filter = target === 'from' ? this.quickFromNodeFilter() : this.quickToNodeFilter();

    return this.nodeOptions()
      .filter((node) => node.id !== selectedOtherId)
      .filter((node) => node.id === selectedCurrentId || this.matchesServiceNodeFilter(node.id, filter));
  }

  private matchesServiceNodeFilter(nodeId: string, filter: ServiceNodeFilter): boolean {
    if (filter === 'all') {
      return true;
    }
    const metric = this.nodeServiceMetrics().get(nodeId);
    if (!metric) {
      return false;
    }
    if (filter === 'needsOutgoingPair') {
      return metric.needsOutgoingPair;
    }
    if (filter === 'needsIncomingPair') {
      return metric.needsIncomingPair;
    }
    if (filter === 'fullyPaired') {
      return metric.fullyPaired;
    }
    return metric.state === filter;
  }

  private isServiceNodeFilter(value: string): value is ServiceNodeFilter {
    return (
      value === 'all' ||
      value === 'onlyOutgoing' ||
      value === 'onlyIncoming' ||
      value === 'both' ||
      value === 'none' ||
      value === 'needsOutgoingPair' ||
      value === 'needsIncomingPair' ||
      value === 'fullyPaired'
    );
  }

  private buildDirectionalPairHint(fromId: string, toId: string, assumeForwardExists = false): string | null {
    const snapshot = this.displayGraph() ?? this.graph();
    const fromName = this.getNodeName(fromId);
    const toName = this.getNodeName(toId);
    const forwardExists = assumeForwardExists || this.hasTripEdge(snapshot, fromId, toId);
    const reverseExists = this.hasTripEdge(snapshot, toId, fromId);

    if (forwardExists && !reverseExists) {
      return `Missing reverse pair: ${toName} -> ${fromName}.`;
    }
    if (!forwardExists && reverseExists) {
      return `Only the reverse pair exists so far: ${toName} -> ${fromName}.`;
    }
    return null;
  }

  private hasTripEdge(snapshot: GraphSnapshot | null, fromId: string, toId: string): boolean {
    if (!snapshot) {
      return false;
    }
    return snapshot.edges.some((edge) => edge.from === fromId && edge.to === toId && (edge.trips?.length ?? 0) > 0);
  }

  private fetchGraph(year: number): void {
    const requestSeq = ++this.graphRequestSeq;
    this.fetchAssertions(year, requestSeq);
    this.repo.loadGraph(year).subscribe({
      next: (graph) => {
        if (requestSeq !== this.graphRequestSeq || this.year() !== year) {
          return;
        }
        this.graph.set({
          ...graph,
          edges: graph.edges.map((edge) => this.normalizeEdge(edge))
        });
        this.selection.clearSelection();
        this.draftNode.set(null);
        this.draftEdge.set(null);
        if (this.pendingNodeSelectionAfterGraphLoad) {
          const pendingId = this.pendingNodeSelectionAfterGraphLoad;
          this.pendingNodeSelectionAfterGraphLoad = null;
          if (graph.nodes.some((node) => node.id === pendingId)) {
            this.selection.selectNode(pendingId);
          }
        }
      },
      error: () => {
        if (requestSeq !== this.graphRequestSeq || this.year() !== year) {
          return;
        }
        this.graph.set(null);
        this.persistedFacts.set([]);
        this.pendingNodeSelectionAfterGraphLoad = null;
      }
    });
  }

  private fetchAssertions(year: number, requestSeq: number): void {
    this.repo.loadAssertions({ year, targetType: 'place' }).subscribe({
      next: (assertions) => {
        if (requestSeq !== this.graphRequestSeq || this.year() !== year) {
          return;
        }
        this.persistedFacts.set(assertions);
      },
      error: () => {
        if (requestSeq !== this.graphRequestSeq || this.year() !== year) {
          return;
        }
        this.persistedFacts.set([]);
      }
    });
  }

  private updateNodeLocal(id: string, patch: Partial<GraphNode>): void {
    const snapshot = this.graph();
    if (!snapshot) {
      return;
    }
    const shouldClearIiif = patch.x !== undefined || patch.y !== undefined;
    const nodes = snapshot.nodes.map((node) => {
      if (node.id !== id) {
        return node;
      }
      const next = { ...node, ...patch };
      if (shouldClearIiif) {
        next.iiifCenterX = undefined;
        next.iiifCenterY = undefined;
      }
      return next;
    });
    this.graph.set({ ...snapshot, nodes });
  }

  private addNode(node: GraphNode): void {
    const snapshot = this.graph();
    if (!snapshot) {
      return;
    }
    this.graph.set({ ...snapshot, nodes: [...snapshot.nodes, node] });
  }

  private addEdge(edge: GraphEdge): void {
    const snapshot = this.graph();
    if (!snapshot) {
      return;
    }
    this.graph.set({ ...snapshot, edges: [...snapshot.edges, this.normalizeEdge(edge)] });
  }

  private removeNodeCascadeLocal(id: string): void {
    const snapshot = this.graph();
    if (!snapshot) {
      return;
    }
    const removedEdgeIds = new Set(
      snapshot.edges.filter((edge) => edge.from === id || edge.to === id).map((edge) => edge.id)
    );
    const nodes = snapshot.nodes.filter((node) => node.id !== id);
    const edges = snapshot.edges.filter((edge) => !removedEdgeIds.has(edge.id));
    this.graph.set({ ...snapshot, nodes, edges });
  }

  private restoreDeletedNode(node: GraphNode, edges: GraphEdge[]): void {
    const snapshot = this.graph();
    if (!snapshot) {
      return;
    }
    const nodes = snapshot.nodes.some((candidate) => candidate.id === node.id)
      ? snapshot.nodes
      : [...snapshot.nodes, node];
    const existingEdgeIds = new Set(snapshot.edges.map((edge) => edge.id));
    const restoredEdges = edges.filter((edge) => !existingEdgeIds.has(edge.id));
    this.graph.set({ ...snapshot, nodes, edges: [...snapshot.edges, ...restoredEdges] });
    this.repo.createNode(node).subscribe({
      next: () => null,
      error: () => null
    });
    restoredEdges.forEach((edge) => {
      this.repo.createEdge(edge).subscribe({
        next: () => null,
        error: () => null
      });
    });
    this.selection.selectNode(node.id);
  }

  private replaceEdge(edge: GraphEdge): void {
    const snapshot = this.graph();
    if (!snapshot) {
      return;
    }
    const nextEdge = this.normalizeEdge(edge);
    const edges = snapshot.edges.map((candidate) => (candidate.id === edge.id ? nextEdge : candidate));
    this.graph.set({ ...snapshot, edges });
  }

  private updateEdgeLocal(id: string, patch: Partial<GraphEdge>): void {
    const snapshot = this.graph();
    if (!snapshot) {
      return;
    }
    const edges = snapshot.edges.map((edge) => {
      if (edge.id !== id) {
        return edge;
      }
      const next = { ...edge, ...patch };
      return this.normalizeEdge(next);
    });
    this.graph.set({ ...snapshot, edges });
  }

  private normalizeTrip(trip: EdgeTrip): EdgeTrip {
    return {
      ...trip,
      transport: this.toTransportType(trip.transport)
    };
  }

  private normalizeTrips(trips: EdgeTrip[]): EdgeTrip[] {
    return trips.map((trip) => this.normalizeTrip(trip));
  }

  private normalizeEdge(edge: GraphEdge): GraphEdge {
    return {
      ...edge,
      trips: this.normalizeTrips(edge.trips ?? [])
    };
  }

  private sortTransportTypes(types: TransportType[]): TransportType[] {
    const order = this.transportOptions;
    return [...types].sort((a, b) => {
      const aIndex = order.indexOf(a);
      const bIndex = order.indexOf(b);
      if (aIndex === -1 || bIndex === -1) {
        return a.localeCompare(b);
      }
      return aIndex - bIndex;
    });
  }

  private toTransportType(value: unknown): TransportType {
    const candidate = typeof value === 'string' ? value : '';
    return this.transportOptions.includes(candidate as TransportType)
      ? (candidate as TransportType)
      : 'postkutsche';
  }

  private removeEdgeLocal(id: string): void {
    const snapshot = this.graph();
    if (!snapshot) {
      return;
    }
    const edges = snapshot.edges.filter((edge) => edge.id !== id);
    this.graph.set({ ...snapshot, edges });
  }

  private replaceNode(node: GraphNode): void {
    const snapshot = this.graph();
    if (!snapshot) {
      return;
    }
    const nodes = snapshot.nodes.map((candidate) => (candidate.id === node.id ? node : candidate));
    this.graph.set({ ...snapshot, nodes });
  }

  private findNode(id: string): GraphNode | undefined {
    return this.graph()?.nodes.find((candidate) => candidate.id === id);
  }

  getNodeName(id: string | null | undefined): string {
    if (!id) {
      return '—';
    }
    return this.graph()?.nodes.find((node) => node.id === id)?.name ?? '—';
  }

  getNodeById(id: string | null): GraphNode | null {
    if (!id) {
      return null;
    }
    return this.graph()?.nodes.find((node) => node.id === id) ?? null;
  }

  private bindUndoShortcut(): void {
    if (!this.isBrowser) {
      return;
    }
    window.addEventListener('keydown', this.onKeyDown);
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    const target = event.target as HTMLElement | null;
    const tag = target?.tagName?.toLowerCase();
    const isEditable =
      tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable;
    if (isEditable) {
      return;
    }

    const key = event.key.toLowerCase();
    if ((event.metaKey || event.ctrlKey) && key === 'z') {
      event.preventDefault();
      this.undoMove();
      return;
    }

    if ((event.metaKey || event.ctrlKey) && key === 's') {
      event.preventDefault();
      if (this.draftEdge()) {
        this.saveDraftEdge();
        return;
      }
      if (this.selectedEdgeDraft()) {
        this.saveSelectedEdge();
        return;
      }
      if (this.draftNode()) {
        this.saveDraftNode();
        return;
      }
      if (this.selectedNodeId()) {
        this.saveSelectedNode();
      }
      return;
    }

    if (key === 'escape') {
      this.selection.clearPendingEdge();
      this.selection.clearSelection();
      return;
    }

    if (key === 'n') {
      const point = this.selection.lastMapPointerPosition() ?? { x: 0, y: 0 };
      this.createDraftNode(point);
      return;
    }

    if (key === 'e') {
      const nodeId = this.selectedNodeId();
      if (nodeId) {
        this.selection.startEdgeFrom(nodeId);
      }
      return;
    }

    if (key === 'p') {
      event.preventDefault();
      this.setQuickEntityMode('place');
      return;
    }

    if (key === 'l') {
      event.preventDefault();
      this.setQuickEntityMode('link');
      return;
    }

    if (key === 's') {
      event.preventDefault();
      this.setQuickEntityMode('service');
      return;
    }

    if (key === 't') {
      event.preventDefault();
      this.setQuickEntityMode('trip');
      return;
    }

    if (key === 'f') {
      event.preventDefault();
      this.setQuickEntityMode('fact');
      return;
    }

  };

  tripsValid(trips: EdgeTrip[]): boolean {
    if (!trips.length) {
      return true;
    }
    return trips.every(
      (trip) => this.isTimeValid(trip.departs ?? '') && this.isTimeValid(trip.arrives ?? '')
    );
  }

  private isTimeValid(value: string): boolean {
    return /^\d{2}:\d{2}$/.test(value?.trim());
  }

  private resolveQuickTargetPlaceId(): string | null {
    if (this.quickFromId()) {
      return this.quickFromId();
    }
    if (this.selectedNodeId()) {
      return this.selectedNodeId();
    }
    const draft = this.draftNode();
    if (draft) {
      return draft.id;
    }
    return null;
  }

  private clearQuickFactEditor(): void {
    this.editingFactId.set(null);
    this.quickFactSchemaKey.set('identifier.wikidata');
    this.quickFactValueType.set('string');
    this.quickFactValue.set('');
  }

  private buildQuickFactValuePayload(
    valueType: 'string' | 'number' | 'boolean',
    rawValue: string
  ): Pick<GraphAssertion, 'valueType' | 'valueText' | 'valueNumber' | 'valueBoolean' | 'valueJson'> | null {
    if (valueType === 'string') {
      return {
        valueType,
        valueText: rawValue,
        valueNumber: null,
        valueBoolean: null,
        valueJson: null
      };
    }

    if (valueType === 'number') {
      const parsed = Number(rawValue);
      if (!Number.isFinite(parsed)) {
        this.toastService.addToast({
          type: 'error',
          title: 'Ungültiger Zahlenwert',
          key: 'fact-value'
        });
        return null;
      }
      return {
        valueType,
        valueText: null,
        valueNumber: parsed,
        valueBoolean: null,
        valueJson: null
      };
    }

    const normalized = rawValue.trim().toLowerCase();
    let parsedBoolean: boolean | null = null;
    if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'ja') {
      parsedBoolean = true;
    }
    if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'nein') {
      parsedBoolean = false;
    }
    if (parsedBoolean === null) {
      this.toastService.addToast({
        type: 'error',
        title: 'Ungültiger Boolean-Wert',
        message: 'Erlaubt: true/false, 1/0, yes/no.',
        key: 'fact-value'
      });
      return null;
    }
    return {
      valueType: 'boolean',
      valueText: null,
      valueNumber: null,
      valueBoolean: parsedBoolean,
      valueJson: null
    };
  }

  factLink(fact: InspectorFact): FactLink {
    const raw = fact.value.trim();
    if (!raw) {
      return { label: '', url: null };
    }

    const [rawLabel, rawLinkToken] = raw.split(';', 2);
    const label = rawLabel?.trim() || raw;
    const linkToken = rawLinkToken?.trim() || null;
    const providerFromSchema = this.resolveFactProviderFromSchemaKey(fact.schemaKey);

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

  private toInspectorFact(assertion: GraphAssertion): InspectorFact | null {
    const value = this.assertionValueToString(assertion);
    if (value === null) {
      return null;
    }
    const valueType = this.normalizeAssertionValueType(assertion);
    return {
      id: assertion.id,
      targetType: 'place',
      targetId: assertion.targetId,
      schemaKey: assertion.schemaKey,
      valueType,
      value,
      editable: valueType !== 'json',
      removable: true
    };
  }

  private normalizeAssertionValueType(assertion: GraphAssertion): InspectorFact['valueType'] {
    if (
      assertion.valueType === 'string' ||
      assertion.valueType === 'number' ||
      assertion.valueType === 'boolean' ||
      assertion.valueType === 'json'
    ) {
      return assertion.valueType;
    }
    if (assertion.valueText !== null && assertion.valueText !== undefined) {
      return 'string';
    }
    if (assertion.valueNumber !== null && assertion.valueNumber !== undefined) {
      return 'number';
    }
    if (assertion.valueBoolean !== null && assertion.valueBoolean !== undefined) {
      return 'boolean';
    }
    if (assertion.valueJson !== null && assertion.valueJson !== undefined) {
      return 'json';
    }
    return 'string';
  }

  private assertionValueToString(assertion: GraphAssertion): string | null {
    const valueType = this.normalizeAssertionValueType(assertion);
    if (valueType === 'string') {
      const value = assertion.valueText;
      return value === null || value === undefined ? null : String(value);
    }
    if (valueType === 'number') {
      const value = assertion.valueNumber;
      return value === null || value === undefined ? null : String(value);
    }
    if (valueType === 'boolean') {
      const value = assertion.valueBoolean;
      return value === null || value === undefined ? null : String(value);
    }
    if (assertion.valueJson === null || assertion.valueJson === undefined) {
      return null;
    }
    try {
      return JSON.stringify(assertion.valueJson);
    } catch {
      return String(assertion.valueJson);
    }
  }

  private parseTripLines(raw: string): EdgeTrip[] {
    const lines = raw
      .split(/\r?\n/g)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const rows: EdgeTrip[] = [];
    for (const line of lines) {
      const parts = line.split(/[;\t,]/).map((part) => part.trim()).filter((part) => part.length > 0);
      let transport: TransportType = 'postkutsche';
      let departs = '';
      let arrives = '';

      if (parts.length >= 3) {
        const maybeTransport = this.toTransportType(parts[0]);
        const maybeTimeStart = this.isTimeValid(parts[0]);
        if (!maybeTimeStart) {
          transport = maybeTransport;
          departs = parts[1] ?? '';
          arrives = parts[2] ?? '';
        } else {
          departs = parts[0] ?? '';
          arrives = parts[1] ?? '';
          transport = this.toTransportType(parts[2]);
        }
      } else if (parts.length === 2) {
        departs = parts[0];
        arrives = parts[1];
      } else {
        continue;
      }

      if (!this.isTimeValid(departs) || !this.isTimeValid(arrives)) {
        continue;
      }

      rows.push({
        id: `trip-${Date.now()}-${rows.length}`,
        transport,
        departs: departs as EdgeTrip['departs'],
        arrives: arrives as EdgeTrip['arrives'],
        arrivalDayOffset: 0
      });
    }
    return rows;
  }

  private extractErrorMessage(error: any): string {
    return error?.error?.message || error?.message || 'Unerwarteter Fehler';
  }

}
