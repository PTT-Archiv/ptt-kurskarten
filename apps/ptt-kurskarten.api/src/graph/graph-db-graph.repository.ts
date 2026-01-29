import type { GraphSnapshot, NodeDetail } from '@ptt-kurskarten/shared';
import type { GraphRepository } from './graph.repository';

export class GraphDbGraphRepository implements GraphRepository {
  async getGraphSnapshot(_year: number): Promise<GraphSnapshot> {
    // Neo4j-style query should filter by validity and return only required fields.
    throw new Error('Graph DB repository not wired yet.');
  }

  async getNodeNeighborhood(_nodeId: string, _year: number): Promise<NodeDetail> {
    throw new Error('Graph DB repository not wired yet.');
  }

  async getAvailableYears(): Promise<number[]> {
    throw new Error('Graph DB repository not wired yet.');
  }

  async createNode(_node: import('@ptt-kurskarten/shared').GraphNode): Promise<import('@ptt-kurskarten/shared').GraphNode> {
    throw new Error('Graph DB repository not wired yet.');
  }

  async updateNode(
    _id: string,
    _patch: Partial<import('@ptt-kurskarten/shared').GraphNode>
  ): Promise<import('@ptt-kurskarten/shared').GraphNode | null> {
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
}
