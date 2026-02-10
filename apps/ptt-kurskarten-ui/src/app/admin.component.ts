import { Component, ElementRef, OnDestroy, PLATFORM_ID, ViewChild, computed, effect, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import type { EdgeTrip, GraphEdge, GraphNode, GraphSnapshot, NodeDetail, TransportType } from '@ptt-kurskarten/shared';
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
  validFrom: number;
  validTo?: number;
  durationMinutes: number;
  trips: EdgeTrip[];
};

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [MapStageComponent, TranslocoPipe, TourOverlayComponent, ArchiveSnippetViewerComponent],
  templateUrl: './admin.component.html',
  styleUrl: './admin.component.css'
})
export class AdminComponent implements OnDestroy {
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
  private archiveSaveHandle: ReturnType<typeof setTimeout> | null = null;
  private pendingIiifUpdate: { nodeId: string; iiifCenterX: number; iiifCenterY: number } | null = null;
  readonly transportOptions: TransportType[] = [
    'postkutsche',
    'dampfschiff',
    'segelboot',
    'courier',
    'messagerie'
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
      validFrom: edge.validFrom,
      validTo: edge.validTo,
      durationMinutes: edge.durationMinutes ?? 60,
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
        validFrom: draftEdge.validFrom,
        validTo: draftEdge.validTo,
        durationMinutes: draftEdge.durationMinutes,
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
      this.draftEdge.set({
        id: `draft-edge-${Date.now()}`,
        from: nodeId,
        to: fallbackTo,
        transport: 'postkutsche',
        validFrom: this.year(),
        durationMinutes: 60,
        trips: []
      });
      this.selection.selectEdge(this.draftEdge()!.id);
      this.dirty.set(true);
      return;
    }
    this.selection.startEdgeFrom(nodeId);
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
    this.draftEdge.set({ ...draft, from: value || null });
    this.dirty.set(true);
  }

  updateDraftEdgeTo(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    const draft = this.ensureDraftEdge();
    if (!draft) {
      return;
    }
    this.draftEdge.set({ ...draft, to: value || null });
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

  updateDraftEdgeDuration(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    const draft = this.draftEdge();
    if (!draft || Number.isNaN(value)) {
      return;
    }
    this.draftEdge.set({ ...draft, durationMinutes: value });
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
    this.updateEdgeLocal(draft.id, { from: nextFrom });
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
    this.updateEdgeLocal(draft.id, { to: nextTo });
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

  updateSelectedEdgeDuration(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    const draft = this.selectedEdgeDraft();
    if (!draft || Number.isNaN(value)) {
      return;
    }
    this.updateEdgeLocal(draft.id, { durationMinutes: value });
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
      if (field === 'departs') {
        return this.applyDurationToTrip(next, draft.durationMinutes);
      }
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
        validFrom: draft.validFrom,
        validTo: draft.validTo,
        durationMinutes: draft.durationMinutes,
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
      if (field === 'departs') {
        return this.applyDurationToTrip(next, draft.durationMinutes);
      }
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
      const draftId = `draft-edge-${Date.now()}`;
      this.draftEdge.set({
        id: draftId,
        from: pendingFrom,
        to: event.hitNodeId,
        transport: 'postkutsche',
        validFrom: this.year(),
        durationMinutes: 60,
        trips: []
      });
      this.selection.selectEdge(draftId);
      this.tour.markEvent('edgeCreated');
      this.dirty.set(true);
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

  private createDraftNode(point: { x: number; y: number }): void {
    const id = `draft-node-${Date.now()}`;
    this.selection.clearSelection();
    this.draftNode.set({
      id,
      name: 'New node',
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
      id: `draft-edge-${Date.now()}`,
      from,
      to,
      transport: 'postkutsche',
      validFrom: this.year(),
      durationMinutes: 60,
      trips: []
    };
    this.draftEdge.set(created);
    return created;
  }

  private pickEdgeNode(nodeId: string): void {
    const draft = this.draftEdge();
    if (!draft) {
      this.draftEdge.set({
        id: `draft-edge-${Date.now()}`,
        from: nodeId,
        to: null,
        transport: 'postkutsche',
        validFrom: this.year(),
        durationMinutes: 60,
        trips: []
      });
      return;
    }

    if (!draft.from) {
      this.draftEdge.set({ ...draft, from: nodeId });
      return;
    }

    if (!draft.to && nodeId !== draft.from) {
      this.draftEdge.set({ ...draft, to: nodeId });
    }
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

  private applyDurationToTrip(trip: EdgeTrip, durationMinutes: number): EdgeTrip {
    if (!trip.departs || !Number.isFinite(durationMinutes)) {
      return trip;
    }
    const departMinutes = this.parseTimeMinutes(trip.departs);
    if (departMinutes === null) {
      return trip;
    }
    const total = departMinutes + Math.max(0, Math.floor(durationMinutes));
    const arrivalDayOffset = this.toDayOffset(Math.floor(total / 1440));
    const arrives = this.formatTimeMinutes(total % 1440);
    return { ...trip, arrives: arrives as EdgeTrip['arrives'], arrivalDayOffset };
  }

  private parseTimeMinutes(value: string): number | null {
    const parts = value.split(':');
    if (parts.length !== 2) {
      return null;
    }
    const hours = Number(parts[0]);
    const minutes = Number(parts[1]);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
      return null;
    }
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      return null;
    }
    return hours * 60 + minutes;
  }

  private formatTimeMinutes(totalMinutes: number): string {
    const hours = Math.floor(totalMinutes / 60)
      .toString()
      .padStart(2, '0');
    const minutes = Math.floor(totalMinutes % 60)
      .toString()
      .padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  private toDayOffset(value: number): EdgeTrip['arrivalDayOffset'] {
    const clamped = Math.max(0, Math.min(2, Math.floor(value)));
    return clamped as 0 | 1 | 2;
  }
}
