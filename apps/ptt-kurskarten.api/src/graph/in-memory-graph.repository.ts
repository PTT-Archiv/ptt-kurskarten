import type { GraphEdge, GraphNode, GraphSnapshot, NodeDetail, Year } from '@ptt-kurskarten/shared';
import type { GraphRepository } from './graph.repository';

const YEARS: number[] = [1840, 1855, 1852, 1888, 1900];

let NODES: GraphNode[] = [
  { id: 'bern', name: 'Bern', x: 300, y: 200, validFrom: 1800 },
  { id: 'zurich', name: 'Zurich', x: 420, y: 140, validFrom: 1800 },
  { id: 'basel', name: 'Basel', x: 240, y: 90, validFrom: 1830 },
  { id: 'geneva', name: 'Geneva', x: 120, y: 240, validFrom: 1845 },
  { id: 'lucerne', name: 'Lucerne', x: 360, y: 220, validFrom: 1855, validTo: 1885 },
  { id: 'st-gallen', name: 'St. Gallen', x: 520, y: 110, validFrom: 1875 }
];

let EDGES: GraphEdge[] = [
  {
    id: 'bern-zurich-coach',
    from: 'bern',
    to: 'zurich',
    transport: 'postkutsche',
    validFrom: 1845,
    validTo: 1865,
    durationMinutes: 600,
    trips: [
      {
        id: 'bern-zurich-coach-early',
        departs: '06:15',
        arrives: '16:15',
        arrivalDayOffset: 0
      }
    ]
  },
  {
    id: 'bern-zurich-rail',
    from: 'bern',
    to: 'zurich',
    transport: 'courier',
    validFrom: 1866,
    durationMinutes: 210,
    trips: [
      { id: 'bern-zurich-rail-1', departs: '06:15', arrives: '09:10' },
      { id: 'bern-zurich-rail-2', departs: '12:00', arrives: '14:55' },
      { id: 'bern-zurich-rail-3', departs: '18:30', arrives: '21:10' }
    ]
  },
  {
    id: 'basel-zurich-rail',
    from: 'basel',
    to: 'zurich',
    transport: 'courier',
    validFrom: 1855,
    durationMinutes: 180,
    trips: [
      { id: 'basel-zurich-rail-overnight', departs: '22:40', arrives: '01:20', arrivalDayOffset: 1 }
    ]
  },
  {
    id: 'bern-geneva-coach',
    from: 'bern',
    to: 'geneva',
    transport: 'postkutsche',
    validFrom: 1848,
    validTo: 1878,
    durationMinutes: 540,
    trips: [{ id: 'bern-geneva-coach-1', departs: '07:00', arrives: '16:00' }]
  },
  {
    id: 'bern-geneva-rail',
    from: 'bern',
    to: 'geneva',
    transport: 'courier',
    validFrom: 1879,
    durationMinutes: 190,
    trips: [
      { id: 'bern-geneva-rail-1', departs: '08:00', arrives: '11:10' },
      { id: 'bern-geneva-rail-2', departs: '14:00', arrives: '17:10' }
    ]
  },
  {
    id: 'lucerne-bern-coach',
    from: 'lucerne',
    to: 'bern',
    transport: 'postkutsche',
    validFrom: 1855,
    validTo: 1885,
    durationMinutes: 240,
    trips: [{ id: 'lucerne-bern-coach-1', departs: '09:30', arrives: '13:30' }]
  },
  {
    id: 'zurich-st-gallen-rail',
    from: 'zurich',
    to: 'st-gallen',
    transport: 'courier',
    validFrom: 1875,
    durationMinutes: 150,
    trips: [
      { id: 'zurich-st-gallen-rail-1', departs: '05:50', arrives: '08:20' },
      { id: 'zurich-st-gallen-rail-2', departs: '17:15', arrives: '19:45' }
    ]
  }
];

export class InMemoryGraphRepository implements GraphRepository {
  async getGraphSnapshot(year: number): Promise<GraphSnapshot> {
    const y = this.coerceYear(year);
    return {
      year: y,
      nodes: this.filterNodes(y),
      edges: this.filterEdges(y)
    };
  }

  async getNodeNeighborhood(nodeId: string, year: number): Promise<NodeDetail> {
    const y = this.coerceYear(year);
    const nodes = this.filterNodes(y);
    const edges = this.filterEdges(y).filter((edge) => edge.from === nodeId || edge.to === nodeId);
    const node = nodes.find((candidate) => candidate.id === nodeId) ?? null;
    const neighborIds = new Set(edges.flatMap((edge) => [edge.from, edge.to]));
    neighborIds.delete(nodeId);

    return {
      year: y,
      node,
      neighbors: nodes.filter((candidate) => neighborIds.has(candidate.id)),
      edges
    };
  }

  async getAvailableYears(): Promise<number[]> {
    return YEARS;
  }

  async getAllNodes(): Promise<GraphNode[]> {
    return NODES;
  }

  async createNode(node: GraphNode): Promise<GraphNode> {
    const exists = NODES.find((candidate) => candidate.id === node.id);
    if (exists) {
      return exists;
    }
    NODES = [...NODES, node];
    return node;
  }

  async updateNode(id: string, patch: Partial<GraphNode>): Promise<GraphNode | null> {
    const index = NODES.findIndex((candidate) => candidate.id === id);
    if (index === -1) {
      return null;
    }
    const updated = { ...NODES[index], ...patch, id } satisfies GraphNode;
    NODES = [...NODES.slice(0, index), updated, ...NODES.slice(index + 1)];
    return updated;
  }

  async deleteNode(id: string): Promise<boolean> {
    const index = NODES.findIndex((candidate) => candidate.id === id);
    if (index === -1) {
      return false;
    }
    NODES = [...NODES.slice(0, index), ...NODES.slice(index + 1)];
    const removedEdges = EDGES.filter((edge) => edge.from === id || edge.to === id).map((edge) => edge.id);
    if (removedEdges.length) {
      const removedSet = new Set(removedEdges);
      EDGES = EDGES.filter((edge) => !removedSet.has(edge.id));
    }
    return true;
  }

  async createEdge(edge: GraphEdge): Promise<GraphEdge> {
    const exists = EDGES.find((candidate) => candidate.id === edge.id);
    if (exists) {
      return exists;
    }
    const normalized = { ...edge, trips: edge.trips ?? [] };
    EDGES = [...EDGES, normalized];
    return normalized;
  }

  async updateEdge(id: string, patch: Partial<GraphEdge>): Promise<GraphEdge | null> {
    const index = EDGES.findIndex((candidate) => candidate.id === id);
    if (index === -1) {
      return null;
    }
    const updated = { ...EDGES[index], ...patch, id } satisfies GraphEdge;
    const normalized = { ...updated, trips: updated.trips ?? EDGES[index].trips ?? [] };
    EDGES = [...EDGES.slice(0, index), normalized, ...EDGES.slice(index + 1)];
    return normalized;
  }

  async deleteEdge(id: string): Promise<boolean> {
    const index = EDGES.findIndex((candidate) => candidate.id === id);
    if (index === -1) {
      return false;
    }
    EDGES = [...EDGES.slice(0, index), ...EDGES.slice(index + 1)];
    return true;
  }

  private coerceYear(year: number): Year {
    return Number.isFinite(year) ? year : 1852;
  }

  private filterNodes(year: Year): GraphNode[] {
    return NODES.filter((node) => node.validFrom <= year && (node.validTo === undefined || node.validTo >= year));
  }

  private filterEdges(year: Year): GraphEdge[] {
    return EDGES.filter((edge) => edge.validFrom <= year && (edge.validTo === undefined || edge.validTo >= year)).map(
      (edge) => ({
        ...edge,
        trips: edge.trips ?? []
      })
    );
  }
}
