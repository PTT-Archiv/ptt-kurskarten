import { Component, OnDestroy, PLATFORM_ID, computed, effect, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import type { ConnectionLeg, ConnectionOption, GraphEdge, GraphSnapshot, NodeDetail, TimeHHMM } from '@ptt-kurskarten/shared';
import { MapStageComponent } from './map-stage.component';
import { TranslocoPipe } from '@jsverse/transloco';

const DEFAULT_YEAR = 1871;

@Component({
  selector: 'app-viewer',
  standalone: true,
  imports: [MapStageComponent, TranslocoPipe],
  templateUrl: './viewer.component.html',
  styleUrl: './viewer.component.css'
})
export class ViewerComponent implements OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  year = signal<number>(DEFAULT_YEAR);
  graph = signal<GraphSnapshot | null>(null);
  nodeDetail = signal<NodeDetail | null>(null);
  selectedNodeId = signal<string | null>(null);
  availableYears = signal<number[]>([]);
  fromId = signal<string>('');
  toId = signal<string>('');
  departTime = signal<TimeHHMM>('08:00');
  connectionResults = signal<ConnectionOption[]>([]);
  selectedConnectionId = signal<string | null>(null);
  showConnectionDetailsOnMap = signal(true);

  nodes = computed(() => {
    const snapshot = this.graph();
    if (!snapshot) {
      return [];
    }
    return [...snapshot.nodes].sort((a, b) => a.name.localeCompare(b.name));
  });


  minYear = computed(() => {
    const years = this.availableYears();
    return years.length > 0 ? Math.min(...years) : DEFAULT_YEAR - 20;
  });

  maxYear = computed(() => {
    const years = this.availableYears();
    return years.length > 0 ? Math.max(...years) : DEFAULT_YEAR + 20;
  });

  private graphFetchHandle: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    if (this.isBrowser) {
      this.fetchYears();
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
  }

  onYearInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const nextYear = Number(input.value);
    if (!Number.isNaN(nextYear)) {
      this.year.set(nextYear);
    }
  }

  onNodeSelected(nodeId: string | null): void {
    this.selectedConnectionId.set(null);
    if (!nodeId) {
      this.selectedNodeId.set(null);
      this.nodeDetail.set(null);
      return;
    }

    this.selectedNodeId.set(nodeId);
    this.fetchNodeDetail(nodeId, this.year());
  }

  onSearchConnections(): void {
    const from = this.fromId();
    const to = this.toId();
    if (!from || !to || from === to) {
      this.connectionResults.set([]);
      this.selectedConnectionId.set(null);
      return;
    }

    const year = this.year();
    const depart = this.departTime();
    this.http
      .get<ConnectionOption[]>(
        `/api/v1/connections?year=${year}&from=${from}&to=${to}&depart=${depart}&k=10`
      )
      .subscribe({
        next: (options) => {
          const normalized = (options ?? []).map((option, index) => this.ensureConnectionId(option, index));
          this.connectionResults.set(normalized);
          this.selectedConnectionId.set(normalized[0]?.id ?? null);
        },
        error: () => {
          this.connectionResults.set([]);
          this.selectedConnectionId.set(null);
        }
      });
  }


  swapConnections(): void {
    const from = this.fromId();
    const to = this.toId();
    this.fromId.set(to);
    this.toId.set(from);
  }

  selectConnection(option: ConnectionOption): void {
    this.selectedConnectionId.set(option.id ?? null);
  }

  selectedConnection = computed(() => {
    const id = this.selectedConnectionId();
    if (!id) {
      return null;
    }
    return this.connectionResults().find((option) => option.id === id) ?? null;
  });

  highlightedEdgeIds = computed(() => {
    const selected = this.selectedConnection();
    if (!selected) {
      return null;
    }
    return new Set(selected.legs.map((leg) => leg.edgeId));
  });

  highlightedNodeIds = computed(() => {
    const selected = this.selectedConnection();
    if (!selected) {
      return null;
    }
    const ids = new Set<string>();
    selected.legs.forEach((leg) => {
      ids.add(leg.from);
      ids.add(leg.to);
    });
    return ids;
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
        this.nodeDetail.set(null);
        if (!this.fromId() && graph.nodes.length) {
          const sorted = [...graph.nodes].sort((a, b) => a.name.localeCompare(b.name));
          this.fromId.set(sorted[0]?.id ?? '');
          this.toId.set(sorted[1]?.id ?? sorted[0]?.id ?? '');
        }
      },
      error: () => {
        this.graph.set(null);
      }
    });
  }

  private fetchNodeDetail(nodeId: string, year: number): void {
    this.http.get<NodeDetail>(`/api/v1/nodes/${nodeId}?year=${year}`).subscribe({
      next: (detail) => {
        this.nodeDetail.set(detail);
      },
      error: () => {
        this.nodeDetail.set(null);
      }
    });
  }

  tripSummary(edge: GraphEdge): string {
    if (!edge.trips || edge.trips.length === 0) {
      return 'No trips';
    }
    const parts = edge.trips.slice(0, 3).map((trip) => {
      const offset = trip.arrivalDayOffset ? ` (+${trip.arrivalDayOffset})` : '';
      return `${trip.departs}→${trip.arrives}${offset}`;
    });
    const suffix = edge.trips.length > 3 ? ' …' : '';
    return `${parts.join(', ')}${suffix}`;
  }

  connectionSummary(option: ConnectionOption): string {
    const transfers = option.transfers ?? option.legs.length - 1;
    return `${option.departs} → ${option.arrives} · ${this.formatDuration(option.durationMinutes)} · ${transfers} transfers`;
  }

  getNodeName(id: string): string {
    const match = this.nodes().find((node) => node.id === id);
    return match?.name ?? id;
  }

  private ensureConnectionId(option: ConnectionOption, index: number): ConnectionOption {
    const id = option.id || `${option.from}-${option.to}-${index}`;
    const transfers = option.transfers ?? option.legs.length - 1;
    const legs = option.legs.map((leg) => this.ensureLegDuration(leg));
    return { ...option, id, transfers, legs };
  }

  private ensureLegDuration(leg: ConnectionLeg): ConnectionLeg {
    if (leg.durationMinutes !== undefined) {
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

  formatDuration(totalMinutes: number): string {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours <= 0) {
      return `${minutes} min`;
    }
    return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
  }
}
