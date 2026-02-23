import { Component, ElementRef, OnDestroy, PLATFORM_ID, ViewChild, computed, effect, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import type {
  EdgeTrip,
  GraphEdge,
  GraphNode,
  GraphSnapshot,
  LocalizedText,
  NodeDetail,
  TransportType
} from '@ptt-kurskarten/shared';
import { MapStageComponent } from './map-stage.component';
import { TranslocoPipe } from '@jsverse/transloco';
import { ToastService } from './shared/toast/toast.service';
import { AdminSelectionState } from './admin-selection.service';
import { ADMIN_GRAPH_REPOSITORY, type AdminGraphRepository } from './admin-graph.repository';
import { TourService } from './tour.service';
import { TourOverlayComponent } from './tour-overlay.component';
import { ADMIN_TUTORIAL_STEPS } from './admin-tutorial.steps';
import { ArchiveSnippetViewerComponent } from './archive-snippet-viewer.component';
import {
  ARCHIVE_DEFAULT_REGION,
  buildArchiveSnippetUrlForNode,
  buildArchiveSnippetUrlFromRegion,
  computeArchiveTransform
} from './archive-snippet.util';

const DEFAULT_YEAR = 1852;
const UNDO_LIMIT = 20;

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
  transport: TransportType;
  leuge?: number;
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

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [MapStageComponent, TranslocoPipe, TourOverlayComponent, ArchiveSnippetViewerComponent],
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

  year = signal<number>(DEFAULT_YEAR);
  graph = signal<GraphSnapshot | null>(null);
  availableYears = signal<number[]>([]);
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
  isDragging = signal<boolean>(false);
  quickFromQuery = signal<string>('');
  quickToQuery = signal<string>('');
  quickFromId = signal<string | null>(null);
  quickToId = signal<string | null>(null);
  quickFromOpen = signal<boolean>(false);
  quickToOpen = signal<boolean>(false);
  quickFromActiveIndex = signal<number>(0);
  quickToActiveIndex = signal<number>(0);
  quickLeuge = signal<string>('');
  quickLeugeDirty = signal<boolean>(false);
  quickTrips = signal<EdgeTrip[]>([
    { id: `quick-trip-${Date.now()}`, departs: '08:00', arrives: '09:00', arrivalDayOffset: 0 }
  ]);
  geoSearchEnabled = signal<boolean>(true);
  geoResults = signal<GeoAdminResult[]>([]);
  geoLoading = signal<boolean>(false);
  geoActiveIndex = signal<number>(0);
  private geoSearchHandle: ReturnType<typeof setTimeout> | null = null;
  private archiveSaveHandle: ReturnType<typeof setTimeout> | null = null;
  private pendingIiifUpdate: { nodeId: string; iiifCenterX: number; iiifCenterY: number } | null = null;
  readonly transportOptions: TransportType[] = [
    'postkutsche',
    'dampfschiff',
    'segelboot',
    'courier',
    'messagerie',
    'mallepost',
    'diligence'
  ];

  private graphFetchHandle: ReturnType<typeof setTimeout> | null = null;
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
  @ViewChild('quickLeugeInput') private quickLeugeInput?: ElementRef<HTMLInputElement>;

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

  archiveSnippetUrl = computed(() => {
    const transform = computeArchiveTransform();
    const draft = this.draftNode();
    if (draft) {
      if (transform) {
        return buildArchiveSnippetUrlForNode(draft, transform);
      }
      return buildArchiveSnippetUrlFromRegion(ARCHIVE_DEFAULT_REGION);
    }
    const detail = this.nodeDetail();
    if (detail?.node) {
      if (transform) {
        return buildArchiveSnippetUrlForNode(detail.node, transform);
      }
      return buildArchiveSnippetUrlFromRegion(ARCHIVE_DEFAULT_REGION);
    }
    return buildArchiveSnippetUrlFromRegion(ARCHIVE_DEFAULT_REGION);
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
        return {
          id: edge.id,
          toName: toNode?.name ?? '—',
          transport: edge.transport,
          tripsCount: edge.trips?.length ?? 0,
          validFrom: edge.validFrom,
          validTo: edge.validTo
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

  quickFromSuggestions = computed(() => {
    const query = this.quickFromQuery().trim().toLowerCase();
    const selectedToId = this.quickToId();
    return this.nodeOptions()
      .filter((node) => node.id !== selectedToId)
      .filter((node) => !query || node.name.toLowerCase().includes(query))
      .slice(0, 12);
  });

  quickToSuggestions = computed(() => {
    const query = this.quickToQuery().trim().toLowerCase();
    const selectedFromId = this.quickFromId();
    return this.nodeOptions()
      .filter((node) => node.id !== selectedFromId)
      .filter((node) => !query || node.name.toLowerCase().includes(query))
      .slice(0, 12);
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
      transport: edge.transport,
      leuge: edge.leuge,
      validFrom: edge.validFrom,
      validTo: edge.validTo,
      notes: edge.notes,
      trips: edge.trips ?? []
    };
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
        transport: draftEdge.transport,
        leuge: draftEdge.leuge,
        validFrom: draftEdge.validFrom,
        validTo: draftEdge.validTo,
        trips: draftEdge.trips
      };
      edges = [...edges, tempEdge];
    }

    return { ...snapshot, nodes, edges };
  });

  minYear = computed(() => {
    const years = this.availableYears();
    return years.length > 0 ? Math.min(...years) : DEFAULT_YEAR - 20;
  });

  maxYear = computed(() => {
    const years = this.availableYears();
    return years.length > 0 ? Math.max(...years) : DEFAULT_YEAR + 20;
  });

  constructor() {
    if (this.isBrowser) {
      const stored = window.localStorage.getItem('admin.shortcutsCollapsed');
      this.shortcutsCollapsed.set(stored === 'true');
      this.fetchYears();
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
    if (this.isBrowser) {
      window.removeEventListener('keydown', this.onKeyDown);
    }
  }

  onYearInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const nextYear = Number(input.value);
    if (!Number.isNaN(nextYear)) {
      this.year.set(nextYear);
      this.selection.clearSelection();
      this.selection.clearPendingEdge();
      this.draftNode.set(null);
      this.draftEdge.set(null);
      this.dragState = null;
    }
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
    this.confirmDeleteNode.set(false);
  }

  clearEdgeSelection(): void {
    this.selection.clearSelection();
    this.confirmDeleteNode.set(false);
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
    const exact = this.nodeOptions().find((node) => node.name.toLowerCase() === normalized && node.id !== this.quickToId());
    if (exact) {
      this.quickFromId.set(exact.id);
      this.applyQuickLeugePrefill();
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
    const exact = this.nodeOptions().find((node) => node.name.toLowerCase() === normalized && node.id !== this.quickFromId());
    if (exact) {
      this.quickToId.set(exact.id);
      this.applyQuickLeugePrefill();
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
      this.focusQuickLeugeInput();
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
    this.applyQuickLeugePrefill();
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
    this.applyQuickLeugePrefill();
  }

  updateQuickLeuge(event: Event): void {
    this.quickLeuge.set((event.target as HTMLInputElement).value);
    this.quickLeugeDirty.set(true);
  }

  addQuickTrip(copyLast = false): void {
    const trips = this.quickTrips();
    const next: EdgeTrip = copyLast && trips.length > 0
      ? { ...trips[trips.length - 1], id: `quick-trip-${Date.now()}` }
      : { id: `quick-trip-${Date.now()}`, departs: '08:00', arrives: '09:00', arrivalDayOffset: 0 };
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

    const leugeRaw = this.quickLeuge().trim();
    const leuge = leugeRaw === '' ? undefined : Number(leugeRaw);
    if (leuge !== undefined && Number.isNaN(leuge)) {
      return;
    }

    const trips = this.quickTrips().map((trip) => ({ ...trip, id: trip.id || `trip-${Date.now()}` }));
    if (!this.tripsValid(trips)) {
      return;
    }

    const edge: GraphEdge = {
      id: `edge-${Date.now()}`,
      from,
      to,
      transport: 'postkutsche',
      leuge,
      validFrom: this.year(),
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
        this.quickLeuge.set('');
        this.quickLeugeDirty.set(false);
        this.quickTrips.set([{ id: `quick-trip-${Date.now()}`, departs: '08:00', arrives: '09:00', arrivalDayOffset: 0 }]);
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

  swapQuickDirection(): void {
    const fromId = this.quickFromId();
    const toId = this.quickToId();
    const fromQuery = this.quickFromQuery();
    const toQuery = this.quickToQuery();
    this.quickFromId.set(toId);
    this.quickToId.set(fromId);
    this.quickFromQuery.set(toQuery);
    this.quickToQuery.set(fromQuery);
    this.applyQuickLeugePrefill();
  }

  cancelPendingEdge(): void {
    this.selection.clearPendingEdge();
  }

  requestDeleteNode(): void {
    if (!this.selectedNodeId()) {
      return;
    }
    this.confirmDeleteNode.set(true);
    requestAnimationFrame(() => {
      this.nodePanelRef?.nativeElement?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  }

  cancelDeleteNode(): void {
    this.confirmDeleteNode.set(false);
  }

  deleteSelectedNode(): void {
    const nodeId = this.selectedNodeId();
    const snapshot = this.graph();
    if (!nodeId || !snapshot) {
      return;
    }
    const node = snapshot.nodes.find((candidate) => candidate.id === nodeId);
    if (!node) {
      return;
    }
    const edges = snapshot.edges.filter((edge) => edge.from === nodeId || edge.to === nodeId);
    this.repo.deleteNode(nodeId).subscribe({
      next: (result) => {
        if (!result.deleted) {
          return;
        }
        this.removeNodeCascadeLocal(nodeId);
        this.pushUndo({ type: 'DELETE_NODE', node, edges });
        this.selection.clearSelection();
        this.confirmDeleteNode.set(false);
        this.dirty.set(true);
        this.toastService.addToast({
          type: 'success',
          title: 'Knoten gelöscht',
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
    this.pendingIiifUpdate = { nodeId, iiifCenterX: event.iiifCenterX, iiifCenterY: event.iiifCenterY };
    if (this.archiveSaveHandle) {
      clearTimeout(this.archiveSaveHandle);
    }
    this.archiveSaveHandle = setTimeout(() => {
      const pending = this.pendingIiifUpdate;
      if (!pending) {
        return;
      }
      this.repo
        .updateNode(pending.nodeId, { iiifCenterX: pending.iiifCenterX, iiifCenterY: pending.iiifCenterY })
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
      if (this.geoSearchHandle) {
        clearTimeout(this.geoSearchHandle);
        this.geoSearchHandle = null;
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

    this.repo
      .createEdge(draft as GraphEdge)
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
          if (draft.trips.length) {
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

  updateDraftEdgeTransport(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as TransportType;
    const draft = this.draftEdge();
    if (!draft) {
      return;
    }
      this.draftEdge.set({ ...draft, transport: value });
    this.dirty.set(true);
  }

  updateDraftEdgeFrom(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    const draft = this.ensureDraftEdge();
    if (!draft) {
      return;
    }
    const next = this.prefillDraftLeuge({ ...draft, from: value || null });
    this.draftEdge.set(next);
    this.dirty.set(true);
  }

  updateDraftEdgeTo(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    const draft = this.ensureDraftEdge();
    if (!draft) {
      return;
    }
    const next = this.prefillDraftLeuge({ ...draft, to: value || null });
    this.draftEdge.set(next);
    this.dirty.set(true);
  }

  updateDraftEdgeLeuge(event: Event): void {
    const raw = (event.target as HTMLInputElement).value.trim();
    const value = raw === '' ? undefined : Number(raw);
    const draft = this.draftEdge();
    if (!draft || (value !== undefined && Number.isNaN(value))) {
      return;
    }
    this.draftEdge.set({ ...draft, leuge: value });
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

  updateSelectedEdgeTransport(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as TransportType;
    const draft = this.selectedEdgeDraft();
    if (!draft) {
      return;
    }
    this.updateEdgeLocal(draft.id, { transport: value });
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
    const leuge = this.findExistingLeuge(nextFrom, draft.to, draft.id) ?? draft.leuge;
    this.updateEdgeLocal(draft.id, { from: nextFrom, leuge });
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
    const leuge = this.findExistingLeuge(draft.from, nextTo, draft.id) ?? draft.leuge;
    this.updateEdgeLocal(draft.id, { to: nextTo, leuge });
    this.dirty.set(true);
  }

  updateSelectedEdgeLeuge(event: Event): void {
    const raw = (event.target as HTMLInputElement).value.trim();
    const value = raw === '' ? undefined : Number(raw);
    const draft = this.selectedEdgeDraft();
    if (!draft || (value !== undefined && Number.isNaN(value))) {
      return;
    }
    this.updateEdgeLocal(draft.id, { leuge: value });
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

    this.repo
      .updateEdge(draft.id, {
        from: draft.from,
        to: draft.to,
        transport: draft.transport,
        leuge: draft.leuge,
        validFrom: draft.validFrom,
        validTo: draft.validTo,
        notes: draft.notes,
        trips: draft.trips
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
          if (draft.trips.length) {
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
        this.confirmDeleteNode.set(false);
      } else if (event.hitEdgeId) {
        this.selection.selectEdge(event.hitEdgeId);
        this.draftEdge.set(null);
        this.confirmDeleteNode.set(false);
        this.isDragging.set(false);
      } else {
        this.selection.clearSelection();
        this.confirmDeleteNode.set(false);
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

  private fetchGeoAdminResults(query: string): void {
    if (!this.geoSearchEnabled() || !this.isBrowser) {
      return;
    }
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
        this.geoResults.set(results);
        this.geoActiveIndex.set(0);
        this.geoLoading.set(false);
      },
      error: () => {
        this.geoResults.set([]);
        this.geoActiveIndex.set(0);
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
      transport: 'postkutsche',
      leuge: this.findExistingLeuge(from, to),
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
      transport: 'postkutsche',
      leuge: this.findExistingLeuge(from, to),
      validFrom: this.year(),
      notes: undefined,
      trips: []
    });
    this.selection.selectEdge(draftId);
    this.confirmDeleteNode.set(false);
    this.dirty.set(true);
  }

  private applyQuickLeugePrefill(): void {
    if (this.quickLeugeDirty()) {
      return;
    }
    const from = this.quickFromId();
    const to = this.quickToId();
    if (!from || !to) {
      this.quickLeuge.set('');
      return;
    }
    const found = this.findExistingLeuge(from, to);
    this.quickLeuge.set(found !== undefined ? String(found) : '');
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

  private focusQuickLeugeInput(): void {
    requestAnimationFrame(() => {
      const input = this.quickLeugeInput?.nativeElement;
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
        transport: 'postkutsche',
        leuge: undefined,
        validFrom: this.year(),
        trips: []
      });
      return;
    }

    if (!draft.from) {
      const next = this.prefillDraftLeuge({ ...draft, from: nodeId });
      this.draftEdge.set(next);
      return;
    }

    if (!draft.to && nodeId !== draft.from) {
      const next = this.prefillDraftLeuge({ ...draft, to: nodeId });
      this.draftEdge.set(next);
    }
  }

  private prefillDraftLeuge(draft: EdgeDraft): EdgeDraft {
    if (!draft.from || !draft.to || draft.leuge !== undefined) {
      return draft;
    }
    const leuge = this.findExistingLeuge(draft.from, draft.to);
    if (leuge === undefined) {
      return draft;
    }
    return { ...draft, leuge };
  }

  private findExistingLeuge(from: string | null, to: string | null, excludeEdgeId?: string): number | undefined {
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
      return edgeA === a && edgeB === b && edge.leuge !== undefined;
    });
    return match?.leuge;
  }

  private fetchYears(): void {
    this.repo.loadYears().subscribe({
      next: (years) => this.availableYears.set(years),
      error: () => this.availableYears.set([])
    });
  }

  private fetchGraph(year: number): void {
    this.repo.loadGraph(year).subscribe({
      next: (graph) => {
        this.graph.set(graph);
        this.selection.clearSelection();
        this.draftNode.set(null);
        this.draftEdge.set(null);
      },
      error: () => this.graph.set(null)
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
    this.graph.set({ ...snapshot, edges: [...snapshot.edges, edge] });
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
    const edges = snapshot.edges.map((candidate) => (candidate.id === edge.id ? edge : candidate));
    this.graph.set({ ...snapshot, edges });
  }

  private updateEdgeLocal(id: string, patch: Partial<GraphEdge>): void {
    const snapshot = this.graph();
    if (!snapshot) {
      return;
    }
    const edges = snapshot.edges.map((edge) => (edge.id === id ? { ...edge, ...patch } : edge));
    this.graph.set({ ...snapshot, edges });
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
    console.log('Validating time:', value, /^\\d{2}:\\d{2}$/.test(value));
    return true;
    // return /^d{2}:d{2}$/.test(value?.trim());
  }

  private extractErrorMessage(error: any): string {
    return error?.error?.message || error?.message || 'Unerwarteter Fehler';
  }

}
