import { InjectionToken, inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import type {
  EditionEntry,
  GraphAssertion,
  GraphEdge,
  GraphNode,
  GraphNodePatch,
  GraphSnapshot
} from '@ptt-kurskarten/shared';

export type AdminGraphRepository = {
  loadYears(): Observable<number[]>;
  loadEditions(): Observable<EditionEntry[]>;
  loadGraph(year: number): Observable<GraphSnapshot>;
  loadAssertions(filters?: { year?: number; targetType?: string; targetId?: string }): Observable<GraphAssertion[]>;
  createAssertion(assertion: GraphAssertion): Observable<GraphAssertion>;
  updateAssertion(id: string, patch: Partial<GraphAssertion>): Observable<GraphAssertion>;
  deleteAssertion(id: string): Observable<{ deleted: boolean }>;
  searchPlaces(query: string, year: number): Observable<Array<{ id: string; name: string; x: number; y: number; active: boolean; hidden: boolean }>>;
  createNode(node: GraphNode): Observable<GraphNode>;
  updateNode(id: string, patch: GraphNodePatch): Observable<GraphNode>;
  setNodeVisibility(id: string, year: number, hidden: boolean): Observable<{ updated: boolean; id: string; year: number; hidden: boolean }>;
  deleteNode(id: string, year?: number): Observable<{ deleted: boolean }>;
  createEdge(edge: GraphEdge): Observable<GraphEdge>;
  updateEdge(id: string, edge: GraphEdge): Observable<GraphEdge>;
  deleteEdge(id: string): Observable<{ deleted: boolean }>;
  updateEdition(year: number, patch: Partial<EditionEntry>): Observable<EditionEntry>;
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

  loadEditions(): Observable<EditionEntry[]> {
    return this.http.get<EditionEntry[]>('/api/v1/editions');
  }

  loadAssertions(filters?: { year?: number; targetType?: string; targetId?: string }): Observable<GraphAssertion[]> {
    let params = new HttpParams();
    if (filters?.year !== undefined) {
      params = params.set('year', String(filters.year));
    }
    if (filters?.targetType) {
      params = params.set('targetType', filters.targetType);
    }
    if (filters?.targetId) {
      params = params.set('targetId', filters.targetId);
    }
    return this.http.get<GraphAssertion[]>('/api/v1/assertions', { params });
  }

  createAssertion(assertion: GraphAssertion): Observable<GraphAssertion> {
    return this.http.post<GraphAssertion>('/api/v1/assertions', assertion);
  }

  updateAssertion(id: string, patch: Partial<GraphAssertion>): Observable<GraphAssertion> {
    return this.http.put<GraphAssertion>(`/api/v1/assertions/${id}`, patch);
  }

  deleteAssertion(id: string): Observable<{ deleted: boolean }> {
    return this.http.delete<{ deleted: boolean }>(`/api/v1/assertions/${id}`);
  }

  searchPlaces(
    query: string,
    year: number
  ): Observable<Array<{ id: string; name: string; x: number; y: number; active: boolean; hidden: boolean }>> {
    const params = new HttpParams().set('q', query).set('year', String(year));
    return this.http.get<Array<{ id: string; name: string; x: number; y: number; active: boolean; hidden: boolean }>>(
      '/api/v1/places/search',
      { params }
    );
  }

  createNode(node: GraphNode): Observable<GraphNode> {
    return this.http.post<GraphNode>('/api/v1/nodes', node);
  }

  updateNode(id: string, patch: GraphNodePatch): Observable<GraphNode> {
    return this.http.put<GraphNode>(`/api/v1/nodes/${id}`, patch);
  }

  setNodeVisibility(id: string, year: number, hidden: boolean): Observable<{ updated: boolean; id: string; year: number; hidden: boolean }> {
    const params = new HttpParams().set('year', String(year));
    return this.http.put<{ updated: boolean; id: string; year: number; hidden: boolean }>(
      `/api/v1/nodes/${id}/visibility`,
      { hidden },
      { params }
    );
  }

  deleteNode(id: string, year?: number): Observable<{ deleted: boolean }> {
    const query = year !== undefined ? `?year=${year}` : '';
    return this.http.delete<{ deleted: boolean }>(`/api/v1/nodes/${id}${query}`);
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

  updateEdition(year: number, patch: Partial<EditionEntry>): Observable<EditionEntry> {
    return this.http.put<EditionEntry>(`/api/v1/editions/${year}`, patch);
  }

  reset(): Observable<void> {
    return of(undefined);
  }
}

@Injectable()
export class DemoGraphRepository implements AdminGraphRepository {
  readonly isDemo = true;
  private readonly years = [1852];
  private editions: EditionEntry[] = [{ id: 'edition-1852', year: 1852 }];
  private snapshot: GraphSnapshot = buildDemoSnapshot(1852);
  private assertions: GraphAssertion[] = [];

  loadYears(): Observable<number[]> {
    return of([...this.years]);
  }

  loadGraph(year: number): Observable<GraphSnapshot> {
    if (this.snapshot.year !== year) {
      this.snapshot = buildDemoSnapshot(year);
    }
    return of(cloneSnapshot(this.snapshot));
  }

  loadEditions(): Observable<EditionEntry[]> {
    return of([...this.editions]);
  }

  loadAssertions(_filters?: { year?: number; targetType?: string; targetId?: string }): Observable<GraphAssertion[]> {
    const filters = _filters ?? {};
    const list = this.assertions
      .filter((item) => (filters.targetType ? item.targetType === filters.targetType : true))
      .filter((item) => (filters.targetId ? item.targetId === filters.targetId : true));
    return of([...list]);
  }

  createAssertion(assertion: GraphAssertion): Observable<GraphAssertion> {
    const next: GraphAssertion = {
      ...assertion,
      id: assertion.id || `assertion-${Date.now()}`
    };
    this.assertions = [...this.assertions, next];
    return of(next);
  }

  updateAssertion(id: string, patch: Partial<GraphAssertion>): Observable<GraphAssertion> {
    const index = this.assertions.findIndex((item) => item.id === id);
    if (index === -1) {
      return of({ id, targetType: 'place', targetId: '', schemaKey: '', ...patch } as GraphAssertion);
    }
    const next = { ...this.assertions[index], ...patch, id };
    this.assertions = [...this.assertions.slice(0, index), next, ...this.assertions.slice(index + 1)];
    return of(next);
  }

  deleteAssertion(id: string): Observable<{ deleted: boolean }> {
    const before = this.assertions.length;
    this.assertions = this.assertions.filter((item) => item.id !== id);
    return of({ deleted: this.assertions.length < before });
  }

  searchPlaces(
    query: string,
    _year: number
  ): Observable<Array<{ id: string; name: string; x: number; y: number; active: boolean; hidden: boolean }>> {
    const cleaned = query.trim().toLowerCase();
    const matches = (this.snapshot.nodes ?? [])
      .filter((node) => !cleaned || node.name.toLowerCase().includes(cleaned))
      .slice(0, 12)
      .map((node) => ({
        id: node.id,
        name: node.name,
        x: node.x,
        y: node.y,
        active: true,
        hidden: false
      }));
    return of(matches);
  }

  createNode(node: GraphNode): Observable<GraphNode> {
    this.snapshot = {
      ...this.snapshot,
      nodes: [...this.snapshot.nodes, node]
    };
    return of(node);
  }

  updateNode(id: string, patch: GraphNodePatch): Observable<GraphNode> {
    const updated = this.snapshot.nodes.find((node) => node.id === id);
    if (!updated) {
      const { anchorYear: _anchorYear, ...nodePatch } = patch;
      return of(nodePatch as GraphNode);
    }
    const { anchorYear: _anchorYear, ...nodePatch } = patch;
    const merged = { ...updated, ...nodePatch };
    this.snapshot = {
      ...this.snapshot,
      nodes: this.snapshot.nodes.map((node) => (node.id === id ? merged : node))
    };
    return of(merged);
  }

  setNodeVisibility(id: string, _year: number, hidden: boolean): Observable<{ updated: boolean; id: string; year: number; hidden: boolean }> {
    return of({
      updated: false,
      id,
      year: this.snapshot.year,
      hidden
    });
  }

  deleteNode(id: string, _year?: number): Observable<{ deleted: boolean }> {
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

  updateEdition(year: number, patch: Partial<EditionEntry>): Observable<EditionEntry> {
    const index = this.editions.findIndex((entry) => entry.year === year);
    const normalizedRoute =
      typeof patch.iiifRoute === 'string' && patch.iiifRoute.trim().length
        ? patch.iiifRoute.trim().replace(/\/+$/, '')
        : undefined;
    const next: EditionEntry = {
      id: patch.id ?? this.editions[index]?.id ?? `edition-${year}`,
      year,
      title: patch.title ?? this.editions[index]?.title,
      iiifRoute: patch.iiifRoute !== undefined ? normalizedRoute : this.editions[index]?.iiifRoute
    };
    if (index === -1) {
      this.editions = [...this.editions, next];
      if (!this.years.includes(year)) {
        this.years.push(year);
        this.years.sort((a, b) => a - b);
      }
    } else {
      this.editions = [...this.editions.slice(0, index), next, ...this.editions.slice(index + 1)];
    }
    return of(next);
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
        distance: 10,
        validFrom: year,
        validTo: undefined,
        trips: [
          {
            id: 'trip-1',
            transport: 'courier',
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
