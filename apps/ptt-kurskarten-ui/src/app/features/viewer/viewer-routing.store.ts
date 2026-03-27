import { computed, inject, Injectable, signal } from '@angular/core';
import type { ConnectionOption, TimeHHMM } from '@ptt-kurskarten/shared';
import { buildWaitSegments, type WaitSegment } from '../../shared/routing/connection-details.util';
import { ViewerDataService } from './viewer-data.service';
import { ensureConnectionId, formatTimeMinutes, parseTimeMinutes } from './viewer-routing.util';
import { ViewerCoreStore } from './viewer-core.store';

export type RoutingState = 'idle' | 'searching' | 'results' | 'no_results' | 'error';

@Injectable()
export class ViewerRoutingStore {
  private readonly viewerData = inject(ViewerDataService);
  private readonly core = inject(ViewerCoreStore);

  readonly fromId = signal('');
  readonly toId = signal('');
  readonly departTime = signal<TimeHHMM>('08:00');
  readonly draftDepartTime = signal<TimeHHMM>('08:00');
  readonly hasSearched = signal(false);
  readonly connectionResults = signal<ConnectionOption[]>([]);
  readonly selectedConnectionId = signal<string | null>(null);
  readonly showConnectionDetailsOnMap = signal(true);
  readonly routingState = signal<RoutingState>('idle');
  readonly lastSearchParams = signal<{ from: string; to: string; time: TimeHHMM; year: number } | null>(null);
  readonly lastResultParams = signal<{ from: string; to: string; year: number } | null>(null);
  readonly hoveredRouteEdgeId = signal<string | null>(null);
  readonly fromPreviewId = signal('');
  readonly toPreviewId = signal('');

  readonly selectedConnection = computed(() => {
    const id = this.selectedConnectionId();
    if (!id) {
      return null;
    }
    return this.connectionResults().find((option) => option.id === id) ?? null;
  });

  readonly routeResultsVisible = computed(() => this.routingState() === 'results' && this.connectionResults().length > 0);
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
    const nodeId = this.core.selectedNodeId();
    const snapshot = this.core.graph();
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
    const nodeId = this.core.selectedNodeId();
    return nodeId ? new Set([nodeId]) : null;
  });

  searchConnections(callbacks: { onSuccess?: (options: ConnectionOption[]) => void; onError?: () => void } = {}): void {
    const from = this.fromId();
    const to = this.toId();
    if (!from || !to || from === to) {
      this.clearToIdle();
      return;
    }
    const year = this.core.year();
    const depart = this.departTime();
    this.hasSearched.set(true);
    this.routingState.set('searching');
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
          const normalized = (options ?? []).map((option, index) => ensureConnectionId(option, index));
          this.connectionResults.set(normalized);
          this.selectedConnectionId.set(normalized[0]?.id ?? null);
          const hasResults = normalized.length > 0;
          this.routingState.set(hasResults ? 'results' : 'no_results');
          if (hasResults) {
            this.lastResultParams.set({ from, to, year });
          }
          callbacks.onSuccess?.(normalized);
        },
        error: () => {
          this.connectionResults.set([]);
          this.selectedConnectionId.set(null);
          this.routingState.set('error');
          callbacks.onError?.();
        }
      });
  }

  clearToIdle(): void {
    this.connectionResults.set([]);
    this.selectedConnectionId.set(null);
    this.routingState.set('idle');
  }

  swapConnections(): { from: string; to: string } {
    const from = this.fromId();
    const to = this.toId();
    this.fromId.set(to);
    this.toId.set(from);
    return { from, to };
  }

  shiftTime(minutes: number): TimeHHMM {
    const current = this.draftDepartTime();
    const total = parseTimeMinutes(current) + minutes;
    const normalized = ((total % 1440) + 1440) % 1440;
    const next = formatTimeMinutes(normalized);
    this.draftDepartTime.set(next);
    this.departTime.set(next);
    return next;
  }

  selectConnection(option: ConnectionOption): void {
    this.selectedConnectionId.set(option.id ?? null);
  }

  onRouteLegHover(edgeId: string | null): void {
    if (edgeId && this.selectedRouteEdgeIds().has(edgeId)) {
      this.hoveredRouteEdgeId.set(edgeId);
      return;
    }
    this.hoveredRouteEdgeId.set(null);
  }

  onMapHoveredEdge(edgeId: string | null): void {
    if (edgeId && this.selectedRouteEdgeIds().has(edgeId)) {
      this.hoveredRouteEdgeId.set(edgeId);
    } else {
      this.hoveredRouteEdgeId.set(null);
    }
  }

  setFromId(id: string): void {
    this.fromId.set(id);
  }

  setToId(id: string): void {
    this.toId.set(id);
  }

  setDraftDepartTime(time: TimeHHMM): void {
    this.draftDepartTime.set(time);
  }

  applyDepartTime(): boolean {
    const next = this.draftDepartTime();
    if (next === this.departTime()) {
      return false;
    }
    this.departTime.set(next);
    return true;
  }

  setFromPreview(id: string): void {
    this.fromPreviewId.set(id);
  }

  setToPreview(id: string): void {
    this.toPreviewId.set(id);
  }

  resetSearch(): void {
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
    this.hoveredRouteEdgeId.set(null);
  }
}
