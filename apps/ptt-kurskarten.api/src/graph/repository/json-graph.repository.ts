import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type {
  EdgeTrip,
  EditionEntry,
  GraphAssertion,
  GraphEdge,
  GraphNode,
  GraphNodePatch,
  GraphSnapshot,
  NodeDetail,
  TransportType,
  Year,
} from '@ptt-kurskarten/shared';
import type { GraphRepository } from '../graph.repository';

type StoredNode = Omit<GraphNode, 'validTo'> & { validTo: Year | null };
type StoredEdge = Omit<GraphEdge, 'validTo' | 'trips' | 'distance'> & {
  validTo: Year | null;
};
type StoredSegment = {
  id: string;
  a: string;
  b: string;
  distance?: number | null;
  leuge?: number | null;
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
  private readonly segmentsPath: string;
  private readonly tripsPath: string;
  private initPromise: Promise<void> | null = null;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor() {
    this.dataDir = this.resolveDataDir();
    this.nodesPath = path.join(this.dataDir, 'nodes.json');
    this.edgesPath = path.join(this.dataDir, 'edges.json');
    this.segmentsPath = path.join(this.dataDir, 'segments.json');
    this.tripsPath = path.join(this.dataDir, 'trips.json');
  }

  async getGraphSnapshot(year: number): Promise<GraphSnapshot> {
    const y = this.coerceYear(year);
    await this.writeQueue;
    const { nodes, edges } = await this.loadGraphData();
    const activeNodes = nodes.filter((node) => this.isNodeActive(node, y));
    const activeNodeIds = new Set(activeNodes.map((node) => node.id));
    const activeEdges = edges.filter(
      (edge) =>
        this.isEdgeActive(edge, y) &&
        activeNodeIds.has(edge.from) &&
        activeNodeIds.has(edge.to),
    );

    return {
      year: y,
      nodes: activeNodes,
      edges: activeEdges.map((edge) => ({ ...edge, trips: edge.trips ?? [] })),
    };
  }

  async getNodeAliases(_year: number): Promise<Record<string, string[]>> {
    return {};
  }

  async getNodeNeighborhood(nodeId: string, year: number): Promise<NodeDetail> {
    const snapshot = await this.getGraphSnapshot(year);
    const edges = snapshot.edges.filter(
      (edge) => edge.from === nodeId || edge.to === nodeId,
    );
    const node =
      snapshot.nodes.find((candidate) => candidate.id === nodeId) ?? null;
    const neighborIds = new Set(edges.flatMap((edge) => [edge.from, edge.to]));
    neighborIds.delete(nodeId);

    return {
      year: snapshot.year,
      node,
      neighbors: snapshot.nodes.filter((candidate) =>
        neighborIds.has(candidate.id),
      ),
      edges,
    };
  }

  async getAssertions(_filters?: {
    year?: number;
    targetType?: string;
    targetId?: string;
  }): Promise<GraphAssertion[]> {
    return [];
  }

  async createAssertion(assertion: GraphAssertion): Promise<GraphAssertion> {
    return assertion;
  }

  async updateAssertion(
    _id: string,
    _patch: Partial<GraphAssertion>,
  ): Promise<GraphAssertion | null> {
    return null;
  }

  async deleteAssertion(_id: string): Promise<boolean> {
    return false;
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

  async getEditions(): Promise<EditionEntry[]> {
    const years = await this.getAvailableYears();
    return years.map((year) => ({ id: `edition-${year}`, year, public: true }));
  }

  async updateEdition(
    year: number,
    patch: Partial<EditionEntry>,
  ): Promise<EditionEntry> {
    const y = Number.isFinite(year) ? year : 1852;
    return {
      id: patch.id ?? `edition-${y}`,
      year: y,
      title: patch.title,
      iiifRoute:
        typeof patch.iiifRoute === 'string' && patch.iiifRoute.trim().length
          ? patch.iiifRoute.trim().replace(/\/+$/, '')
          : undefined,
      public: patch.public ?? true,
    };
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

  async updateNode(
    id: string,
    patch: GraphNodePatch,
  ): Promise<GraphNode | null> {
    return this.enqueueWrite(async () => {
      await this.ensureInitialized();
      const nodes = await this.readArrayFile<StoredNode>(this.nodesPath);
      const index = nodes.findIndex((candidate) => candidate.id === id);
      if (index === -1) {
        return null;
      }
      const { anchorYear: _anchorYear, ...nodePatch } = patch;
      const updated = {
        ...this.fromStoredNode(nodes[index]),
        ...nodePatch,
        id,
      } satisfies GraphNode;
      nodes[index] = this.toStoredNode(updated);
      await this.writeJsonAtomic(this.nodesPath, nodes);
      return updated;
    });
  }

  async setNodeHidden(
    _id: string,
    _year: number,
    _hidden: boolean,
  ): Promise<boolean> {
    return false;
  }

  async deleteNode(id: string, _year?: number): Promise<boolean> {
    return this.enqueueWrite(async () => {
      await this.ensureInitialized();
      const nodes = await this.readArrayFile<StoredNode>(this.nodesPath);
      const edges = await this.readArrayFile<StoredEdge>(this.edgesPath);
      const segments = await this.readArrayFile<StoredSegment>(
        this.segmentsPath,
      );
      const trips = await this.readArrayFile<StoredTrip>(this.tripsPath);
      const index = nodes.findIndex((candidate) => candidate.id === id);
      if (index === -1) {
        return false;
      }

      const remainingNodes = [
        ...nodes.slice(0, index),
        ...nodes.slice(index + 1),
      ];
      const removedEdgeIds = new Set(
        edges
          .filter((edge) => edge.from === id || edge.to === id)
          .map((edge) => edge.id),
      );
      const remainingEdges = edges.filter(
        (edge) => !removedEdgeIds.has(edge.id),
      );
      const remainingSegments = this.cleanupOrphanSegments(
        segments,
        remainingEdges,
      );
      const remainingTrips = trips.filter(
        (trip) => !removedEdgeIds.has(trip.edgeId),
      );

      await this.writeJsonAtomic(this.nodesPath, remainingNodes);
      await this.writeJsonAtomic(this.edgesPath, remainingEdges);
      await this.writeJsonAtomic(this.segmentsPath, remainingSegments);
      await this.writeJsonAtomic(this.tripsPath, remainingTrips);
      return true;
    });
  }

  async createEdge(edge: GraphEdge): Promise<GraphEdge> {
    return this.enqueueWrite(async () => {
      await this.ensureInitialized();
      const edges = await this.readArrayFile<StoredEdge>(this.edgesPath);
      const segments = await this.readArrayFile<StoredSegment>(
        this.segmentsPath,
      );
      const trips = await this.readArrayFile<StoredTrip>(this.tripsPath);
      const existing = edges.find((candidate) => candidate.id === edge.id);
      if (existing) {
        return this.assembleEdge(existing, trips, segments);
      }

      const normalizedTrips = this.normalizeTrips(edge.id, edge.trips ?? []);
      const storedEdge = this.toStoredEdge({ ...edge, trips: [] });
      const nextSegments = this.upsertSegment(
        segments,
        edge.from,
        edge.to,
        edge.distance,
      );
      const nextTrips = trips
        .filter((trip) => trip.edgeId !== edge.id)
        .concat(normalizedTrips);

      edges.push(storedEdge);
      await this.writeJsonAtomic(this.edgesPath, edges);
      await this.writeJsonAtomic(this.segmentsPath, nextSegments);
      await this.writeJsonAtomic(this.tripsPath, nextTrips);

      const distance = this.getSegmentDistance(
        nextSegments,
        edge.from,
        edge.to,
      );
      return {
        ...edge,
        distance,
        trips: normalizedTrips.map(this.stripTripEdgeId),
      };
    });
  }

  async updateEdge(
    id: string,
    patch: Partial<GraphEdge>,
  ): Promise<GraphEdge | null> {
    return this.enqueueWrite(async () => {
      await this.ensureInitialized();
      const edges = await this.readArrayFile<StoredEdge>(this.edgesPath);
      const segments = await this.readArrayFile<StoredSegment>(
        this.segmentsPath,
      );
      const trips = await this.readArrayFile<StoredTrip>(this.tripsPath);
      const index = edges.findIndex((candidate) => candidate.id === id);
      if (index === -1) {
        return null;
      }

      const existing = this.assembleEdge(edges[index], trips, segments);
      const updated = { ...existing, ...patch, id } satisfies GraphEdge;
      const nextTripsPayload = patch.trips ?? existing.trips ?? [];
      const normalizedTrips = this.normalizeTrips(id, nextTripsPayload);
      const nextSegments = this.upsertSegment(
        segments,
        updated.from,
        updated.to,
        patch.distance,
      );

      edges[index] = this.toStoredEdge(updated);
      const nextTrips = trips
        .filter((trip) => trip.edgeId !== id)
        .concat(normalizedTrips);

      await this.writeJsonAtomic(this.edgesPath, edges);
      await this.writeJsonAtomic(this.segmentsPath, nextSegments);
      await this.writeJsonAtomic(this.tripsPath, nextTrips);

      const distance = this.getSegmentDistance(
        nextSegments,
        updated.from,
        updated.to,
      );
      return {
        ...updated,
        distance,
        trips: normalizedTrips.map(this.stripTripEdgeId),
      };
    });
  }

  async deleteEdge(id: string): Promise<boolean> {
    return this.enqueueWrite(async () => {
      await this.ensureInitialized();
      const edges = await this.readArrayFile<StoredEdge>(this.edgesPath);
      const segments = await this.readArrayFile<StoredSegment>(
        this.segmentsPath,
      );
      const trips = await this.readArrayFile<StoredTrip>(this.tripsPath);
      const index = edges.findIndex((candidate) => candidate.id === id);
      if (index === -1) {
        return false;
      }
      const nextEdges = [...edges.slice(0, index), ...edges.slice(index + 1)];
      const nextSegments = this.cleanupOrphanSegments(segments, nextEdges);
      const nextTrips = trips.filter((trip) => trip.edgeId !== id);
      await this.writeJsonAtomic(this.edgesPath, nextEdges);
      await this.writeJsonAtomic(this.segmentsPath, nextSegments);
      await this.writeJsonAtomic(this.tripsPath, nextTrips);
      return true;
    });
  }

  private coerceYear(year: number): Year {
    return Number.isFinite(year) ? year : 1852;
  }

  private isNodeActive(node: GraphNode, year: Year): boolean {
    return (
      node.validFrom <= year &&
      (node.validTo === undefined || year <= node.validTo)
    );
  }

  private isEdgeActive(edge: GraphEdge, year: Year): boolean {
    return (
      edge.validFrom <= year &&
      (edge.validTo === undefined || year <= edge.validTo)
    );
  }

  private async loadGraphData(): Promise<GraphData> {
    await this.ensureInitialized();
    const nodes = await this.readArrayFile<StoredNode>(this.nodesPath);
    const rawEdges = await this.readArrayFile<StoredEdge>(this.edgesPath);
    let edges = rawEdges;
    let segments = await this.readArrayFile<StoredSegment>(this.segmentsPath);
    const trips = await this.readArrayFile<StoredTrip>(this.tripsPath);

    const normalizedNodes = nodes.map((node) => this.fromStoredNode(node));
    const migration = this.migrateEdgesIfNeeded(
      rawEdges,
      normalizedNodes,
      segments,
    );
    if (migration.changed) {
      edges = migration.edges;
      segments = migration.segments;
      await this.enqueueWrite(async () => {
        await this.writeJsonAtomic(this.edgesPath, migration.edges);
        await this.writeJsonAtomic(this.segmentsPath, migration.segments);
      });
    }
    const normalizedEdges = edges.map((edge) =>
      this.assembleEdge(edge, trips, segments),
    );

    return {
      nodes: normalizedNodes,
      edges: normalizedEdges,
    };
  }

  private assembleEdge(
    edge: StoredEdge,
    trips: StoredTrip[],
    segments: StoredSegment[],
  ): GraphEdge {
    const edgeTrips = trips
      .filter((trip) => trip.edgeId === edge.id)
      .map(this.stripTripEdgeId);
    const distance = this.getSegmentDistance(segments, edge.from, edge.to);
    return {
      ...edge,
      distance,
      validTo: edge.validTo ?? undefined,
      trips: edgeTrips,
    };
  }

  private normalizeTrips(edgeId: string, trips: EdgeTrip[]): StoredTrip[] {
    return trips.map((trip) => ({
      ...trip,
      id: trip.id ?? randomUUID(),
      transport: trip.transport ?? 'postkutsche',
      edgeId,
    }));
  }

  private stripTripEdgeId(trip: StoredTrip): EdgeTrip {
    const { edgeId: _edgeId, ...rest } = trip;
    return {
      transport: 'postkutsche',
      ...rest,
    };
  }

  private toStoredNode(node: GraphNode): StoredNode {
    return {
      ...node,
      validTo: node.validTo ?? null,
    };
  }

  private fromStoredNode(node: StoredNode): GraphNode {
    return {
      ...node,
      validTo: node.validTo ?? undefined,
    };
  }

  private toStoredEdge(edge: GraphEdge): StoredEdge {
    const { trips: _trips, distance: _distance, ...rest } = edge;
    return {
      ...rest,
      validTo: edge.validTo ?? null,
    };
  }

  private migrateEdgesIfNeeded(
    edges: StoredEdge[],
    nodes: GraphNode[],
    existingSegments: StoredSegment[],
  ): { edges: StoredEdge[]; segments: StoredSegment[]; changed: boolean } {
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
    const segments = new Map(
      existingSegments.map((segment) => [segment.id, segment]),
    );
    const migrated = edges.map((edge) => {
      const {
        durationMinutes: _durationMinutes,
        distance: edgeDistance,
        leuge: edgeLeuge,
        ...base
      } = edge as StoredEdge & {
        durationMinutes?: number;
        distance?: number;
        leuge?: number;
      };
      const segmentDistance = edgeDistance ?? edgeLeuge;
      let next: StoredEdge = { ...base };
      if (_durationMinutes !== undefined) {
        changed = true;
      }
      if (edgeLeuge !== undefined || edgeDistance !== undefined) {
        changed = true;
      }

      if (!nodeIds.has(edge.from)) {
        const mapped = nameToId.get(edge.from);
        if (mapped) {
          console.info(
            `Migrated edge ${edge.id} from "${edge.from}" to node id "${mapped}" (from).`,
          );
          next = { ...next, from: mapped };
          changed = true;
        } else {
          console.warn(
            `Failed to migrate edge ${edge.id}: from node "${edge.from}" not found.`,
          );
        }
      }

      if (!nodeIds.has(edge.to)) {
        const mapped = nameToId.get(edge.to);
        if (mapped) {
          console.info(
            `Migrated edge ${edge.id} from "${edge.to}" to node id "${mapped}" (to).`,
          );
          next = { ...next, to: mapped };
          changed = true;
        } else {
          console.warn(
            `Failed to migrate edge ${edge.id}: to node "${edge.to}" not found.`,
          );
        }
      }

      const segment = this.createStoredSegment(
        next.from,
        next.to,
        segmentDistance,
      );
      const existing = segments.get(segment.id);
      if (!existing) {
        changed = true;
        segments.set(segment.id, segment);
      } else if (
        this.getStoredSegmentDistance(existing) === null &&
        this.getStoredSegmentDistance(segment) !== null
      ) {
        changed = true;
        segments.set(segment.id, segment);
      }

      return next;
    });

    return { edges: migrated, segments: [...segments.values()], changed };
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
    await this.ensureFile(this.segmentsPath);
    await this.ensureFile(this.tripsPath);
  }

  private getSegmentDistance(
    segments: StoredSegment[],
    from: string,
    to: string,
  ): number | undefined {
    const id = this.segmentIdFor(from, to);
    const segment = segments.find((candidate) => candidate.id === id);
    return this.getStoredSegmentDistance(segment) ?? undefined;
  }

  private upsertSegment(
    segments: StoredSegment[],
    from: string,
    to: string,
    distance: number | undefined,
  ): StoredSegment[] {
    const next = [...segments];
    const segment = this.createStoredSegment(from, to, distance);
    const index = next.findIndex((candidate) => candidate.id === segment.id);
    if (index === -1) {
      next.push(segment);
      return next;
    }
    if (distance !== undefined) {
      next[index] = segment;
    }
    return next;
  }

  private cleanupOrphanSegments(
    segments: StoredSegment[],
    edges: StoredEdge[],
  ): StoredSegment[] {
    const used = new Set(
      edges.map((edge) => this.segmentIdFor(edge.from, edge.to)),
    );
    return segments.filter((segment) => used.has(segment.id));
  }

  private createStoredSegment(
    from: string,
    to: string,
    distance?: number,
  ): StoredSegment {
    const [a, b] = this.normalizeSegmentNodes(from, to);
    return {
      id: this.segmentIdFor(from, to),
      a,
      b,
      distance: distance ?? null,
    };
  }

  private getStoredSegmentDistance(
    segment: StoredSegment | undefined,
  ): number | null | undefined {
    if (!segment) {
      return undefined;
    }
    if (segment.distance !== undefined) {
      return segment.distance;
    }
    return segment.leuge;
  }

  private normalizeSegmentNodes(from: string, to: string): [string, string] {
    return from <= to ? [from, to] : [to, from];
  }

  private segmentIdFor(from: string, to: string): string {
    const [a, b] = this.normalizeSegmentNodes(from, to);
    return `${a}__${b}`;
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

  private async writeJsonAtomic(
    filePath: string,
    data: unknown,
  ): Promise<void> {
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
      () => undefined,
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
