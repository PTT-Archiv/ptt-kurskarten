import type { GraphEdge, GraphNode, GraphSnapshot, NodeDetail } from '@ptt-kurskarten/shared';

export const GRAPH_REPOSITORY = 'GRAPH_REPOSITORY';

export interface GraphRepository {
  getGraphSnapshot(year: number): Promise<GraphSnapshot>;
  getNodeNeighborhood(nodeId: string, year: number): Promise<NodeDetail>;
  getAvailableYears(): Promise<number[]>;
  createNode(node: GraphNode): Promise<GraphNode>;
  updateNode(id: string, patch: Partial<GraphNode>): Promise<GraphNode | null>;
  createEdge(edge: GraphEdge): Promise<GraphEdge>;
  updateEdge(id: string, patch: Partial<GraphEdge>): Promise<GraphEdge | null>;
}
