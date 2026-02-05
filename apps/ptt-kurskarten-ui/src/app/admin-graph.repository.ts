import { InjectionToken, inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import type { GraphEdge, GraphNode, GraphSnapshot } from '@ptt-kurskarten/shared';

export type AdminGraphRepository = {
  loadYears(): Observable<number[]>;
  loadGraph(year: number): Observable<GraphSnapshot>;
  createNode(node: GraphNode): Observable<GraphNode>;
  updateNode(id: string, patch: Partial<GraphNode>): Observable<GraphNode>;
  deleteNode(id: string): Observable<{ deleted: boolean }>;
  createEdge(edge: GraphEdge): Observable<GraphEdge>;
  updateEdge(id: string, edge: GraphEdge): Observable<GraphEdge>;
  deleteEdge(id: string): Observable<{ deleted: boolean }>;
  reset(): Observable<void>;
  isDemo: boolean;
};

export const ADMIN_GRAPH_REPOSITORY = new InjectionToken<AdminGraphRepository>('ADMIN_GRAPH_REPOSITORY');

@Injectable()
export class HttpGraphRepository implements AdminGraphRepository {
  private readonly http = inject(HttpClient);
  readonly isDemo = false;

  loadYears(): Observable<number[]> {
    return this.http.get<number[]>('/api/v1/years');
  }

  loadGraph(year: number): Observable<GraphSnapshot> {
    return this.http.get<GraphSnapshot>(`/api/v1/graph?year=${year}`);
  }

  createNode(node: GraphNode): Observable<GraphNode> {
    return this.http.post<GraphNode>('/api/v1/nodes', node);
  }

  updateNode(id: string, patch: Partial<GraphNode>): Observable<GraphNode> {
    return this.http.put<GraphNode>(`/api/v1/nodes/${id}`, patch);
  }

  deleteNode(id: string): Observable<{ deleted: boolean }> {
    return this.http.delete<{ deleted: boolean }>(`/api/v1/nodes/${id}`);
  }

  createEdge(edge: GraphEdge): Observable<GraphEdge> {
    return this.http.post<GraphEdge>('/api/v1/edges', edge);
  }

  updateEdge(id: string, edge: GraphEdge): Observable<GraphEdge> {
    return this.http.put<GraphEdge>(`/api/v1/edges/${id}`, edge);
  }

  deleteEdge(id: string): Observable<{ deleted: boolean }> {
    return this.http.delete<{ deleted: boolean }>(`/api/v1/edges/${id}`);
  }

  reset(): Observable<void> {
    return of(undefined);
  }
}

@Injectable()
export class DemoGraphRepository implements AdminGraphRepository {
  readonly isDemo = true;
  private readonly years = [1871];
  private snapshot: GraphSnapshot = buildDemoSnapshot(1871);

  loadYears(): Observable<number[]> {
    return of([...this.years]);
  }

  loadGraph(year: number): Observable<GraphSnapshot> {
    if (this.snapshot.year !== year) {
      this.snapshot = buildDemoSnapshot(year);
    }
    return of(cloneSnapshot(this.snapshot));
  }

  createNode(node: GraphNode): Observable<GraphNode> {
    this.snapshot = {
      ...this.snapshot,
      nodes: [...this.snapshot.nodes, node]
    };
    return of(node);
  }

  updateNode(id: string, patch: Partial<GraphNode>): Observable<GraphNode> {
    const updated = this.snapshot.nodes.find((node) => node.id === id);
    if (!updated) {
      return of(patch as GraphNode);
    }
    const merged = { ...updated, ...patch };
    this.snapshot = {
      ...this.snapshot,
      nodes: this.snapshot.nodes.map((node) => (node.id === id ? merged : node))
    };
    return of(merged);
  }

  deleteNode(id: string): Observable<{ deleted: boolean }> {
    const node = this.snapshot.nodes.find((candidate) => candidate.id === id);
    if (!node) {
      return of({ deleted: false });
    }
    const removedEdgeIds = new Set(
      this.snapshot.edges.filter((edge) => edge.from === id || edge.to === id).map((edge) => edge.id)
    );
    this.snapshot = {
      ...this.snapshot,
      nodes: this.snapshot.nodes.filter((candidate) => candidate.id !== id),
      edges: this.snapshot.edges.filter((edge) => !removedEdgeIds.has(edge.id))
    };
    return of({ deleted: true });
  }

  createEdge(edge: GraphEdge): Observable<GraphEdge> {
    this.snapshot = {
      ...this.snapshot,
      edges: [...this.snapshot.edges, edge]
    };
    return of(edge);
  }

  updateEdge(id: string, edge: GraphEdge): Observable<GraphEdge> {
    this.snapshot = {
      ...this.snapshot,
      edges: this.snapshot.edges.map((existing) => (existing.id === id ? edge : existing))
    };
    return of(edge);
  }

  deleteEdge(id: string): Observable<{ deleted: boolean }> {
    this.snapshot = {
      ...this.snapshot,
      edges: this.snapshot.edges.filter((edge) => edge.id !== id)
    };
    return of({ deleted: true });
  }

  reset(): Observable<void> {
    this.snapshot = buildDemoSnapshot(this.snapshot.year);
    return of(undefined);
  }
}

function buildDemoSnapshot(year: number): GraphSnapshot {
  return {
    year,
    nodes: [
      { id: 'bern', name: 'Bern', x: 440, y: 280, validFrom: year },
      { id: 'zurich', name: 'Zürich', x: 520, y: 210, validFrom: year },
      { id: 'geneve', name: 'Genève', x: 300, y: 300, validFrom: year }
    ],
    edges: [
      {
        id: 'edge-bern-zurich',
        from: 'bern',
        to: 'zurich',
        transport: 'rail',
        validFrom: year,
        validTo: undefined,
        durationMinutes: 70,
        trips: [
          {
            id: 'trip-1',
            departs: '08:00',
            arrives: '09:10',
            arrivalDayOffset: 0
          }
        ]
      }
    ]
  };
}

function cloneSnapshot(snapshot: GraphSnapshot): GraphSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as GraphSnapshot;
}
