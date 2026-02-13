import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { EdgeTrip, GraphEdge, GraphNode, GraphSnapshot, NodeDetail, Year } from '@ptt-kurskarten/shared';
import type { GraphRepository } from '../graph.repository';

type StoredNode = Omit<GraphNode, 'validTo'> & { validTo: Year | null };
type StoredEdge = Omit<GraphEdge, 'validTo' | 'trips'> & {
  validTo: Year | null;
  durationMinutes?: number | null;
};
type StoredTrip = EdgeTrip & { edgeId: string };

type GraphData = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};

export class JsonGraphRepository implements GraphRepository {
  private readonly dataDir: string;
  private readonly nodesPath: string;
  private readonly edgesPath: string;
  private readonly tripsPath: string;
  private initPromise: Promise<void> | null = null;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor() {
    this.dataDir = this.resolveDataDir();
    this.nodesPath = path.join(this.dataDir, 'nodes.json');
    this.edgesPath = path.join(this.dataDir, 'edges.json');
    this.tripsPath = path.join(this.dataDir, 'trips.json');
  }

  async getGraphSnapshot(year: number): Promise<GraphSnapshot> {
    const y = this.coerceYear(year);
    await this.writeQueue;
    const { nodes, edges } = await this.loadGraphData();
    const activeNodes = nodes.filter((node) => this.isNodeActive(node, y));
    const activeNodeIds = new Set(activeNodes.map((node) => node.id));
    const activeEdges = edges.filter(
      (edge) => this.isEdgeActive(edge, y) && activeNodeIds.has(edge.from) && activeNodeIds.has(edge.to)
    );

    return {
      year: y,
      nodes: activeNodes,
      edges: activeEdges.map((edge) => ({ ...edge, trips: edge.trips ?? [] }))
    };
  }

  async getNodeNeighborhood(nodeId: string, year: number): Promise<NodeDetail> {
    const snapshot = await this.getGraphSnapshot(year);
    const edges = snapshot.edges.filter((edge) => edge.from === nodeId || edge.to === nodeId);
    const node = snapshot.nodes.find((candidate) => candidate.id === nodeId) ?? null;
    const neighborIds = new Set(edges.flatMap((edge) => [edge.from, edge.to]));
    neighborIds.delete(nodeId);

    return {
      year: snapshot.year,
      node,
      neighbors: snapshot.nodes.filter((candidate) => neighborIds.has(candidate.id)),
      edges
    };
  }

  async getAvailableYears(): Promise<number[]> {
    await this.writeQueue;
    const { nodes, edges } = await this.loadGraphData();
    const years = new Set<number>();

    nodes.forEach((node) => {
      years.add(node.validFrom);
      if (node.validTo !== undefined) {
        years.add(node.validTo);
      }
    });

    edges.forEach((edge) => {
      years.add(edge.validFrom);
      if (edge.validTo !== undefined) {
        years.add(edge.validTo);
      }
    });

    if (years.size === 0) {
      return [1852];
    }

    return [...years].sort((a, b) => a - b);
  }

  async getAllNodes(): Promise<GraphNode[]> {
    await this.writeQueue;
    await this.ensureInitialized();
    const nodes = await this.readArrayFile<StoredNode>(this.nodesPath);
    return nodes.map((node) => this.fromStoredNode(node));
  }

  async createNode(node: GraphNode): Promise<GraphNode> {
    return this.enqueueWrite(async () => {
      await this.ensureInitialized();
      const nodes = await this.readArrayFile<StoredNode>(this.nodesPath);
      const existing = nodes.find((candidate) => candidate.id === node.id);
      if (existing) {
        return this.fromStoredNode(existing);
      }
      nodes.push(this.toStoredNode(node));
      await this.writeJsonAtomic(this.nodesPath, nodes);
      return node;
    });
  }

  async updateNode(id: string, patch: Partial<GraphNode>): Promise<GraphNode | null> {
    return this.enqueueWrite(async () => {
      await this.ensureInitialized();
      const nodes = await this.readArrayFile<StoredNode>(this.nodesPath);
      const index = nodes.findIndex((candidate) => candidate.id === id);
      if (index === -1) {
        return null;
      }
      const updated = { ...this.fromStoredNode(nodes[index]), ...patch, id } satisfies GraphNode;
      nodes[index] = this.toStoredNode(updated);
      await this.writeJsonAtomic(this.nodesPath, nodes);
      return updated;
    });
  }

  async deleteNode(id: string): Promise<boolean> {
    return this.enqueueWrite(async () => {
      await this.ensureInitialized();
      const nodes = await this.readArrayFile<StoredNode>(this.nodesPath);
      const edges = await this.readArrayFile<StoredEdge>(this.edgesPath);
      const trips = await this.readArrayFile<StoredTrip>(this.tripsPath);
      const index = nodes.findIndex((candidate) => candidate.id === id);
      if (index === -1) {
        return false;
      }

      const remainingNodes = [...nodes.slice(0, index), ...nodes.slice(index + 1)];
      const removedEdgeIds = new Set(
        edges.filter((edge) => edge.from === id || edge.to === id).map((edge) => edge.id)
      );
      const remainingEdges = edges.filter((edge) => !removedEdgeIds.has(edge.id));
      const remainingTrips = trips.filter((trip) => !removedEdgeIds.has(trip.edgeId));

      await this.writeJsonAtomic(this.nodesPath, remainingNodes);
      await this.writeJsonAtomic(this.edgesPath, remainingEdges);
      await this.writeJsonAtomic(this.tripsPath, remainingTrips);
      return true;
    });
  }

  async createEdge(edge: GraphEdge): Promise<GraphEdge> {
    return this.enqueueWrite(async () => {
      await this.ensureInitialized();
      const edges = await this.readArrayFile<StoredEdge>(this.edgesPath);
      const trips = await this.readArrayFile<StoredTrip>(this.tripsPath);
      const existing = edges.find((candidate) => candidate.id === edge.id);
      if (existing) {
        return this.assembleEdge(existing, trips);
      }

      const normalizedTrips = this.normalizeTrips(edge.id, edge.trips ?? []);
      const storedEdge = this.toStoredEdge({ ...edge, trips: [] });
      const nextTrips = trips.filter((trip) => trip.edgeId !== edge.id).concat(normalizedTrips);

      edges.push(storedEdge);
      await this.writeJsonAtomic(this.edgesPath, edges);
      await this.writeJsonAtomic(this.tripsPath, nextTrips);

      return { ...edge, trips: normalizedTrips.map(this.stripTripEdgeId) };
    });
  }

  async updateEdge(id: string, patch: Partial<GraphEdge>): Promise<GraphEdge | null> {
    return this.enqueueWrite(async () => {
      await this.ensureInitialized();
      const edges = await this.readArrayFile<StoredEdge>(this.edgesPath);
      const trips = await this.readArrayFile<StoredTrip>(this.tripsPath);
      const index = edges.findIndex((candidate) => candidate.id === id);
      if (index === -1) {
        return null;
      }

      const existing = this.assembleEdge(edges[index], trips);
      const updated = { ...existing, ...patch, id } satisfies GraphEdge;
      const nextTripsPayload = patch.trips ?? existing.trips ?? [];
      const normalizedTrips = this.normalizeTrips(id, nextTripsPayload);

      edges[index] = this.toStoredEdge(updated);
      const nextTrips = trips.filter((trip) => trip.edgeId !== id).concat(normalizedTrips);

      await this.writeJsonAtomic(this.edgesPath, edges);
      await this.writeJsonAtomic(this.tripsPath, nextTrips);

      return { ...updated, trips: normalizedTrips.map(this.stripTripEdgeId) };
    });
  }

  async deleteEdge(id: string): Promise<boolean> {
    return this.enqueueWrite(async () => {
      await this.ensureInitialized();
      const edges = await this.readArrayFile<StoredEdge>(this.edgesPath);
      const trips = await this.readArrayFile<StoredTrip>(this.tripsPath);
      const index = edges.findIndex((candidate) => candidate.id === id);
      if (index === -1) {
        return false;
      }
      const nextEdges = [...edges.slice(0, index), ...edges.slice(index + 1)];
      const nextTrips = trips.filter((trip) => trip.edgeId !== id);
      await this.writeJsonAtomic(this.edgesPath, nextEdges);
      await this.writeJsonAtomic(this.tripsPath, nextTrips);
      return true;
    });
  }

  private coerceYear(year: number): Year {
    return Number.isFinite(year) ? year : 1852;
  }

  private isNodeActive(node: GraphNode, year: Year): boolean {
    return node.validFrom <= year && (node.validTo === undefined || year <= node.validTo);
  }

  private isEdgeActive(edge: GraphEdge, year: Year): boolean {
    return edge.validFrom <= year && (edge.validTo === undefined || year <= edge.validTo);
  }

  private async loadGraphData(): Promise<GraphData> {
    await this.ensureInitialized();
    const nodes = await this.readArrayFile<StoredNode>(this.nodesPath);
    let edges = await this.readArrayFile<StoredEdge>(this.edgesPath);
    const trips = await this.readArrayFile<StoredTrip>(this.tripsPath);

    const normalizedNodes = nodes.map((node) => this.fromStoredNode(node));
    const migration = this.migrateEdgesIfNeeded(edges, normalizedNodes);
    if (migration.changed) {
      edges = migration.edges;
      await this.enqueueWrite(async () => {
        await this.writeJsonAtomic(this.edgesPath, migration.edges);
      });
    }
    const normalizedEdges = edges.map((edge) => this.assembleEdge(edge, trips));

    return {
      nodes: normalizedNodes,
      edges: normalizedEdges
    };
  }

  private assembleEdge(edge: StoredEdge, trips: StoredTrip[]): GraphEdge {
    const edgeTrips = trips.filter((trip) => trip.edgeId === edge.id).map(this.stripTripEdgeId);
    const durationMinutes =
      edge.durationMinutes ??
      this.deriveDurationMinutes(edgeTrips);
    return {
      ...edge,
      validTo: edge.validTo ?? undefined,
      durationMinutes,
      trips: edgeTrips
    };
  }

  private normalizeTrips(edgeId: string, trips: EdgeTrip[]): StoredTrip[] {
    return trips.map((trip) => ({
      ...trip,
      id: trip.id ?? randomUUID(),
      edgeId
    }));
  }

  private stripTripEdgeId(trip: StoredTrip): EdgeTrip {
    const { edgeId: _edgeId, ...rest } = trip;
    return rest;
  }

  private deriveDurationMinutes(trips: EdgeTrip[]): number | undefined {
    const durations: number[] = [];
    for (const trip of trips) {
      if (!trip.departs || !trip.arrives) {
        continue;
      }
      const depart = this.parseTime(trip.departs);
      const arriveRaw = this.parseTime(trip.arrives);
      const offset = trip.arrivalDayOffset ?? 0;
      let arrive = arriveRaw + offset * 1440;
      if (offset === 0 && arriveRaw < depart) {
        arrive += 1440;
      }
      const duration = arrive - depart;
      if (duration >= 0) {
        durations.push(duration);
      }
    }
    if (!durations.length) {
      return undefined;
    }
    return Math.min(...durations);
  }

  private parseTime(value: string): number {
    const [hh, mm] = value.split(':').map((part) => Number(part));
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) {
      return 0;
    }
    return hh * 60 + mm;
  }

  private toStoredNode(node: GraphNode): StoredNode {
    return {
      ...node,
      validTo: node.validTo ?? null
    };
  }

  private fromStoredNode(node: StoredNode): GraphNode {
    return {
      ...node,
      validTo: node.validTo ?? undefined
    };
  }

  private toStoredEdge(edge: GraphEdge): StoredEdge {
    const { trips: _trips, ...rest } = edge;
    return {
      ...rest,
      validTo: edge.validTo ?? null,
      durationMinutes: edge.durationMinutes ?? null
    };
  }

  private migrateEdgesIfNeeded(
    edges: StoredEdge[],
    nodes: GraphNode[]
  ): { edges: StoredEdge[]; changed: boolean } {
    const nodeIds = new Set(nodes.map((node) => node.id));
    const nameToId = new Map<string, string>();
    const duplicates = new Set<string>();

    nodes.forEach((node) => {
      if (nameToId.has(node.name)) {
        duplicates.add(node.name);
        return;
      }
      nameToId.set(node.name, node.id);
    });

    duplicates.forEach((name) => nameToId.delete(name));

    let changed = false;
    const migrated = edges.map((edge) => {
      const { durationMinutes: _durationMinutes, ...base } = edge as StoredEdge & { durationMinutes?: number };
      let next: StoredEdge = { ...base };
      if (_durationMinutes !== undefined) {
        changed = true;
      }

      if (!nodeIds.has(edge.from)) {
        const mapped = nameToId.get(edge.from);
        if (mapped) {
          console.info(`Migrated edge ${edge.id} from "${edge.from}" to node id "${mapped}" (from).`);
          next = { ...next, from: mapped };
          changed = true;
        } else {
          console.warn(`Failed to migrate edge ${edge.id}: from node "${edge.from}" not found.`);
        }
      }

      if (!nodeIds.has(edge.to)) {
        const mapped = nameToId.get(edge.to);
        if (mapped) {
          console.info(`Migrated edge ${edge.id} from "${edge.to}" to node id "${mapped}" (to).`);
          next = { ...next, to: mapped };
          changed = true;
        } else {
          console.warn(`Failed to migrate edge ${edge.id}: to node "${edge.to}" not found.`);
        }
      }

      return next;
    });

    return { edges: migrated, changed };
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.initializeStorage();
    }
    await this.initPromise;
  }

  private async initializeStorage(): Promise<void> {
    await fs.mkdir(this.dataDir, { recursive: true });
    await this.ensureFile(this.nodesPath);
    await this.ensureFile(this.edgesPath);
    await this.ensureFile(this.tripsPath);
  }

  private async ensureFile(filePath: string): Promise<void> {
    try {
      await fs.access(filePath);
    } catch (error: any) {
      if (error?.code !== 'ENOENT') {
        throw error;
      }
      await this.writeJsonAtomic(filePath, []);
    }
  }

  private async readArrayFile<T>(filePath: string): Promise<T[]> {
    let raw = '';
    try {
      raw = await fs.readFile(filePath, 'utf8');
    } catch (error: any) {
      if (error?.code === 'ENOENT') {
        return [];
      }
      throw error;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      throw new Error(`Malformed JSON in ${filePath}`);
    }

    if (!Array.isArray(parsed)) {
      throw new Error(`Expected array in ${filePath}`);
    }

    return parsed as T[];
  }

  private async writeJsonAtomic(filePath: string, data: unknown): Promise<void> {
    const json = `${JSON.stringify(data, null, 2)}\n`;
    const tmpPath = `${filePath}.tmp`;
    const handle = await fs.open(tmpPath, 'w');
    try {
      await handle.writeFile(json, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(tmpPath, filePath);
  }

  private enqueueWrite<T>(task: () => Promise<T>): Promise<T> {
    const run = this.writeQueue.then(task, task);
    this.writeQueue = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  private resolveDataDir(): string {
    const cwd = process.cwd();
    if (path.basename(cwd) === 'ptt-kurskarten.api') {
      return path.join(cwd, 'data');
    }
    return path.join(cwd, 'apps', 'ptt-kurskarten.api', 'data');
  }
}
