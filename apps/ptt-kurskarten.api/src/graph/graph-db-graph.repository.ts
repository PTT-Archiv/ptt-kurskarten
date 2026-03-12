import type { GraphAssertion, GraphSnapshot, NodeDetail } from '@ptt-kurskarten/shared';
import type { GraphRepository } from './graph.repository';

export class GraphDbGraphRepository implements GraphRepository {
  async getGraphSnapshot(_year: number): Promise<GraphSnapshot> {
    // Neo4j-style query should filter by validity and return only required fields.
    throw new Error('Graph DB repository not wired yet.');
  }

  async getNodeAliases(_year: number): Promise<Record<string, string[]>> {
    throw new Error('Graph DB repository not wired yet.');
  }

  async getNodeNeighborhood(_nodeId: string, _year: number): Promise<NodeDetail> {
    throw new Error('Graph DB repository not wired yet.');
  }

  async getAssertions(_filters?: { year?: number; targetType?: string; targetId?: string }): Promise<GraphAssertion[]> {
    throw new Error('Graph DB repository not wired yet.');
  }

  async createAssertion(_assertion: GraphAssertion): Promise<GraphAssertion> {
    throw new Error('Graph DB repository not wired yet.');
  }

  async updateAssertion(_id: string, _patch: Partial<GraphAssertion>): Promise<GraphAssertion | null> {
    throw new Error('Graph DB repository not wired yet.');
  }

  async deleteAssertion(_id: string): Promise<boolean> {
    throw new Error('Graph DB repository not wired yet.');
  }

  async getAvailableYears(): Promise<number[]> {
    throw new Error('Graph DB repository not wired yet.');
  }

  async getEditions(): Promise<import('@ptt-kurskarten/shared').EditionEntry[]> {
    throw new Error('Graph DB repository not wired yet.');
  }

  async updateEdition(
    _year: number,
    _patch: Partial<import('@ptt-kurskarten/shared').EditionEntry>
  ): Promise<import('@ptt-kurskarten/shared').EditionEntry> {
    throw new Error('Graph DB repository not wired yet.');
  }

  async getAllNodes(): Promise<import('@ptt-kurskarten/shared').GraphNode[]> {
    throw new Error('Graph DB repository not wired yet.');
  }

  async createNode(_node: import('@ptt-kurskarten/shared').GraphNode): Promise<import('@ptt-kurskarten/shared').GraphNode> {
    throw new Error('Graph DB repository not wired yet.');
  }

  async updateNode(
    _id: string,
    _patch: import('@ptt-kurskarten/shared').GraphNodePatch
  ): Promise<import('@ptt-kurskarten/shared').GraphNode | null> {
    throw new Error('Graph DB repository not wired yet.');
  }

  async setNodeHidden(_id: string, _year: number, _hidden: boolean): Promise<boolean> {
    throw new Error('Graph DB repository not wired yet.');
  }

  async deleteNode(_id: string, _year?: number): Promise<boolean> {
    throw new Error('Graph DB repository not wired yet.');
  }

  async createEdge(_edge: import('@ptt-kurskarten/shared').GraphEdge): Promise<import('@ptt-kurskarten/shared').GraphEdge> {
    throw new Error('Graph DB repository not wired yet.');
  }

  async updateEdge(
    _id: string,
    _patch: Partial<import('@ptt-kurskarten/shared').GraphEdge>
  ): Promise<import('@ptt-kurskarten/shared').GraphEdge | null> {
    throw new Error('Graph DB repository not wired yet.');
  }

  async deleteEdge(_id: string): Promise<boolean> {
    throw new Error('Graph DB repository not wired yet.');
  }
}
