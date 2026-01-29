import { Component, OnDestroy, PLATFORM_ID, computed, effect, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import type { EdgeTrip, GraphEdge, GraphNode, GraphSnapshot, NodeDetail, TransportType } from '@ptt-kurskarten/shared';
import { MapStageComponent } from './map-stage.component';

const DEFAULT_YEAR = 1871;
const UNDO_LIMIT = 20;

type Mode = 'select' | 'add-node' | 'add-edge';

type MoveUndo = {
  type: 'MOVE_NODE';
  id: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
};

type NodeDraft = {
  id: string;
  name: string;
  x: number;
  y: number;
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
  imports: [MapStageComponent],
  templateUrl: './admin.component.html',
  styleUrl: './admin.component.css'
})
export class AdminComponent implements OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  mode = signal<Mode>('select');
  year = signal<number>(DEFAULT_YEAR);
  graph = signal<GraphSnapshot | null>(null);
  availableYears = signal<number[]>([]);
  selectedNodeId = signal<string | null>(null);

  draftNode = signal<NodeDraft | null>(null);
  draftEdge = signal<EdgeDraft | null>(null);

  undoStack = signal<MoveUndo[]>([]);

  private graphFetchHandle: ReturnType<typeof setTimeout> | null = null;
  private dragState:
    | {
        id: string;
        from: { x: number; y: number };
        moved: boolean;
      }
    | null = null;

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
      this.fetchYears();
      this.bindUndoShortcut();
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
  }

  ngOnDestroy(): void {
    if (this.graphFetchHandle) {
      clearTimeout(this.graphFetchHandle);
    }
    if (this.isBrowser) {
      window.removeEventListener('keydown', this.onKeyDown);
    }
  }

  setMode(next: Mode): void {
    this.mode.set(next);
    this.selectedNodeId.set(null);
    this.draftNode.set(null);
    this.draftEdge.set(null);
    this.dragState = null;
  }

  onYearInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const nextYear = Number(input.value);
    if (!Number.isNaN(nextYear)) {
      this.year.set(nextYear);
      this.selectedNodeId.set(null);
      this.draftNode.set(null);
      this.draftEdge.set(null);
      this.dragState = null;
    }
  }

  onMapPointer(event: { type: 'down' | 'move' | 'up'; world: { x: number; y: number }; hitNodeId: string | null }): void {
    if (!this.isBrowser) {
      return;
    }

    const mode = this.mode();

    if (mode === 'select') {
      this.handleSelectPointer(event);
      return;
    }

    if (mode === 'add-node') {
      if (event.type === 'up' && !event.hitNodeId) {
        this.createDraftNode(event.world);
      }
      return;
    }

    if (mode === 'add-edge') {
      if (event.type === 'up' && event.hitNodeId) {
        this.pickEdgeNode(event.hitNodeId);
      }
    }
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

    this.http
      .put<GraphNode>(`/api/v1/nodes/${nodeId}`, {
        name: node.name,
        validFrom: node.validFrom,
        validTo: node.validTo,
        x: node.x,
        y: node.y
      })
      .subscribe({
        next: (updated) => this.replaceNode(updated),
        error: () => null
      });
  }

  updateSelectedName(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    const nodeId = this.selectedNodeId();
    if (!nodeId) {
      return;
    }
    this.updateNodeLocal(nodeId, { name: value });
  }

  updateSelectedValidFrom(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    const nodeId = this.selectedNodeId();
    if (!nodeId || Number.isNaN(value)) {
      return;
    }
    this.updateNodeLocal(nodeId, { validFrom: value });
  }

  updateSelectedValidTo(event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    const value = raw === '' ? undefined : Number(raw);
    const nodeId = this.selectedNodeId();
    if (!nodeId || (value !== undefined && Number.isNaN(value))) {
      return;
    }
    this.updateNodeLocal(nodeId, { validTo: value });
  }

  saveDraftNode(): void {
    const draft = this.draftNode();
    if (!draft) {
      return;
    }

    this.http
      .post<GraphNode>('/api/v1/nodes', draft)
      .subscribe({
        next: (created) => {
          this.draftNode.set(null);
          this.addNode(created);
          this.mode.set('select');
          this.selectedNodeId.set(created.id);
        },
        error: () => null
      });
  }

  updateDraftName(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    const draft = this.draftNode();
    if (!draft) {
      return;
    }
    this.draftNode.set({ ...draft, name: value });
  }

  updateDraftValidFrom(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    const draft = this.draftNode();
    if (!draft || Number.isNaN(value)) {
      return;
    }
    this.draftNode.set({ ...draft, validFrom: value });
  }

  updateDraftValidTo(event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    const value = raw === '' ? undefined : Number(raw);
    const draft = this.draftNode();
    if (!draft || (value !== undefined && Number.isNaN(value))) {
      return;
    }
    this.draftNode.set({ ...draft, validTo: value });
  }

  saveDraftEdge(): void {
    const draft = this.draftEdge();
    if (!draft || !draft.from || !draft.to || !this.tripsValid(draft.trips)) {
      return;
    }

    this.http
      .post<GraphEdge>('/api/v1/edges', draft)
      .subscribe({
        next: (created) => {
          this.draftEdge.set(null);
          this.addEdge(created);
          this.mode.set('select');
        },
        error: () => null
      });
  }

  updateDraftEdgeTransport(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as TransportType;
    const draft = this.draftEdge();
    if (!draft) {
      return;
    }
    this.draftEdge.set({ ...draft, transport: value });
  }

  updateDraftEdgeValidFrom(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    const draft = this.draftEdge();
    if (!draft || Number.isNaN(value)) {
      return;
    }
    this.draftEdge.set({ ...draft, validFrom: value });
  }

  updateDraftEdgeValidTo(event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    const value = raw === '' ? undefined : Number(raw);
    const draft = this.draftEdge();
    if (!draft || (value !== undefined && Number.isNaN(value))) {
      return;
    }
    this.draftEdge.set({ ...draft, validTo: value });
  }

  updateDraftEdgeDuration(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    const draft = this.draftEdge();
    if (!draft || Number.isNaN(value)) {
      return;
    }
    this.draftEdge.set({ ...draft, durationMinutes: value });
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
  }

  removeTrip(tripId: string): void {
    const draft = this.draftEdge();
    if (!draft) {
      return;
    }
    this.draftEdge.set({ ...draft, trips: draft.trips.filter((trip) => trip.id !== tripId) });
  }

  updateTripField(tripId: string, field: keyof EdgeTrip, value: string | number | undefined): void {
    const draft = this.draftEdge();
    if (!draft) {
      return;
    }
    const trips = draft.trips.map((trip) =>
      trip.id === tripId
        ? {
            ...trip,
            [field]: value
          }
        : trip
    );
    this.draftEdge.set({ ...draft, trips });
  }

  undoMove(): void {
    const stack = this.undoStack();
    const last = stack[stack.length - 1];
    if (!last) {
      return;
    }

    this.undoStack.set(stack.slice(0, -1));
    this.updateNodeLocal(last.id, { x: last.from.x, y: last.from.y });
    this.http
      .put<GraphNode>(`/api/v1/nodes/${last.id}`, {
        x: last.from.x,
        y: last.from.y
      })
      .subscribe({
        next: (updated) => this.replaceNode(updated),
        error: () => null
      });
  }

  private handleSelectPointer(event: { type: 'down' | 'move' | 'up'; world: { x: number; y: number }; hitNodeId: string | null }): void {
    if (event.type === 'down') {
      if (event.hitNodeId) {
        const node = this.findNode(event.hitNodeId);
        if (!node) {
          return;
        }
        this.dragState = {
          id: node.id,
          from: { x: node.x, y: node.y },
          moved: false
        };
        this.selectedNodeId.set(node.id);
      } else {
        this.selectedNodeId.set(null);
      }
      return;
    }

    if (event.type === 'move') {
      if (!this.dragState) {
        return;
      }
      this.dragState.moved = true;
      this.updateNodeLocal(this.dragState.id, { x: event.world.x, y: event.world.y });
      return;
    }

    if (event.type === 'up') {
      if (!this.dragState) {
        return;
      }
      const node = this.findNode(this.dragState.id);
      const from = this.dragState.from;
      const moved = this.dragState.moved && node && (node.x !== from.x || node.y !== from.y);

      if (moved && node) {
        const to = { x: node.x, y: node.y };
        this.pushUndo({ type: 'MOVE_NODE', id: node.id, from, to });
        this.http
          .put<GraphNode>(`/api/v1/nodes/${node.id}`, { x: node.x, y: node.y })
          .subscribe({
            next: (updated) => this.replaceNode(updated),
            error: () => null
          });
      }

      this.dragState = null;
    }
  }

  private pushUndo(action: MoveUndo): void {
    const stack = [...this.undoStack(), action];
    if (stack.length > UNDO_LIMIT) {
      stack.shift();
    }
    this.undoStack.set(stack);
  }

  private createDraftNode(point: { x: number; y: number }): void {
    const id = `draft-node-${Date.now()}`;
    this.draftNode.set({
      id,
      name: 'New node',
      x: point.x,
      y: point.y,
      validFrom: this.year()
    });
  }

  private pickEdgeNode(nodeId: string): void {
    const draft = this.draftEdge();
    if (!draft) {
      this.draftEdge.set({
        id: `draft-edge-${Date.now()}`,
        from: nodeId,
        to: null,
        transport: 'coach',
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
    const nodes = snapshot.nodes.map((node) => (node.id === id ? { ...node, ...patch } : node));
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

  private bindUndoShortcut(): void {
    if (!this.isBrowser) {
      return;
    }
    window.addEventListener('keydown', this.onKeyDown);
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      this.undoMove();
    }
  };

  tripsValid(trips: EdgeTrip[]): boolean {
    if (!trips.length) {
      return true;
    }
    return trips.every((trip) => this.isTimeValid(trip.departs) && this.isTimeValid(trip.arrives));
  }

  private isTimeValid(value: string): boolean {
    console.log('Validating time:', value, /^\\d{2}:\\d{2}$/.test(value));
    return true;
   // return /^d{2}:d{2}$/.test(value?.trim());
  }
}
