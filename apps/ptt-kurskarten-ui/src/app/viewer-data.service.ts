import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import type { ConnectionOption, EdgeTrip, GraphEdge, GraphNode, GraphSnapshot, TimeHHMM } from '@ptt-kurskarten/shared';
import { Observable, forkJoin, map, shareReplay } from 'rxjs';
import { computeConnections } from './routing-client';
import { environment } from '../environments/environment';

type StoredNode = Omit<GraphNode, 'validTo'> & { validTo: number | null };
type StoredEdge = Omit<GraphEdge, 'validTo' | 'trips' | 'leuge'> & { validTo: number | null };
type StoredSegment = { id: string; a: string; b: string; leuge: number | null };
type StoredTrip = EdgeTrip & { edgeId: string };

type ConnectionsRequest = {
  year: number;
  from: string;
  to: string;
  depart: TimeHHMM;
  k?: number;
  allowForeignStartFallback?: boolean;
};

type StaticGraphData = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  availableYears: number[];
};

@Injectable({ providedIn: 'root' })
export class ViewerDataService {
  private readonly http = inject(HttpClient);
  private staticData$: Observable<StaticGraphData> | null = null;

  getYears(): Observable<number[]> {
    if (!environment.useStaticGraphData) {
      return this.http.get<number[]>(`${environment.apiBaseUrl}/years`);
    }
    return this.loadStaticData().pipe(map((data) => data.availableYears));
  }

  getGraph(year: number): Observable<GraphSnapshot> {
    if (!environment.useStaticGraphData) {
      return this.http.get<GraphSnapshot>(`${environment.apiBaseUrl}/graph?year=${year}`);
    }
    return this.loadStaticData().pipe(
      map((data) => {
        const y = coerceYear(year);
        const activeNodes = data.nodes.filter((node) => isNodeActive(node, y));
        const activeNodeIds = new Set(activeNodes.map((node) => node.id));
        const activeEdges = data.edges.filter(
          (edge) => isEdgeActive(edge, y) && activeNodeIds.has(edge.from) && activeNodeIds.has(edge.to)
        );
        return { year: y, nodes: activeNodes, edges: activeEdges };
      })
    );
  }

  getConnections(request: ConnectionsRequest): Observable<ConnectionOption[]> {
    if (!environment.useStaticGraphData) {
      const params = new HttpParams()
        .set('year', String(request.year))
        .set('from', request.from)
        .set('to', request.to)
        .set('depart', request.depart)
        .set('k', String(request.k ?? 10))
        .set('allowForeignStartFallback', String(request.allowForeignStartFallback ?? true));
      return this.http.get<ConnectionOption[]>(`${environment.apiBaseUrl}/connections`, { params });
    }

    return this.getGraph(request.year).pipe(
      map((snapshot) =>
        computeConnections(snapshot, {
          year: request.year,
          from: request.from,
          to: request.to,
          depart: request.depart,
          k: request.k,
          allowForeignStartFallback: request.allowForeignStartFallback
        })
      )
    );
  }

  private loadStaticData(): Observable<StaticGraphData> {
    if (!this.staticData$) {
      const base = environment.staticGraphDataPath.replace(/\/$/, '');
      this.staticData$ = forkJoin({
        nodes: this.http.get<StoredNode[]>(`${base}/nodes.json`),
        edges: this.http.get<StoredEdge[]>(`${base}/edges.json`),
        segments: this.http.get<StoredSegment[]>(`${base}/segments.json`),
        trips: this.http.get<StoredTrip[]>(`${base}/trips.json`)
      }).pipe(
        map(({ nodes, edges, segments, trips }) => toStaticGraphData(nodes ?? [], edges ?? [], segments ?? [], trips ?? [])),
        shareReplay(1)
      );
    }
    return this.staticData$;
  }
}

function toStaticGraphData(
  storedNodes: StoredNode[],
  storedEdges: StoredEdge[],
  storedSegments: StoredSegment[],
  storedTrips: StoredTrip[]
): StaticGraphData {
  const nodes = storedNodes.map((node) => ({
    ...node,
    validTo: node.validTo ?? undefined
  }));

  const tripsByEdge = new Map<string, EdgeTrip[]>();
  for (const trip of storedTrips) {
    const { edgeId, ...rest } = trip;
    const list = tripsByEdge.get(edgeId) ?? [];
    const transport = rest.transport ?? 'postkutsche';
    list.push({
      ...rest,
      transport
    });
    tripsByEdge.set(edgeId, list);
  }

  const segmentLeugeById = new Map(storedSegments.map((segment) => [segment.id, segment.leuge ?? undefined]));
  const edges = storedEdges.map((edge) => ({
    ...edge,
    validTo: edge.validTo ?? undefined,
    leuge: segmentLeugeById.get(segmentIdFor(edge.from, edge.to)),
    trips: tripsByEdge.get(edge.id) ?? []
  }));

  const availableYears = collectAvailableYears(nodes, edges);
  return { nodes, edges, availableYears };
}

function coerceYear(year: number): number {
  return Number.isFinite(year) ? year : 1852;
}

function isNodeActive(node: GraphNode, year: number): boolean {
  return node.validFrom <= year && (node.validTo === undefined || year <= node.validTo);
}

function isEdgeActive(edge: GraphEdge, year: number): boolean {
  return edge.validFrom <= year && (edge.validTo === undefined || year <= edge.validTo);
}

function collectAvailableYears(nodes: GraphNode[], edges: GraphEdge[]): number[] {
  const years = new Set<number>();
  for (const node of nodes) {
    years.add(node.validFrom);
    if (node.validTo !== undefined) {
      years.add(node.validTo);
    }
  }
  for (const edge of edges) {
    years.add(edge.validFrom);
    if (edge.validTo !== undefined) {
      years.add(edge.validTo);
    }
  }
  if (!years.size) {
    return [1852];
  }
  return [...years].sort((a, b) => a - b);
}

function segmentIdFor(from: string, to: string): string {
  const [a, b] = from <= to ? [from, to] : [to, from];
  return `${a}__${b}`;
}
