import type {
  EditionEntry,
  GraphAssertion,
  GraphEdge,
  GraphNode,
  GraphNodePatch,
  GraphSnapshot,
  NodeDetail,
} from '@ptt-kurskarten/shared';

export const GRAPH_REPOSITORY = 'GRAPH_REPOSITORY';

export interface GraphRepository {
  getGraphSnapshot(year: number): Promise<GraphSnapshot>;
  getNodeAliases(year: number): Promise<Record<string, string[]>>;
  getNodeNeighborhood(nodeId: string, year: number): Promise<NodeDetail>;
  getAssertions(filters?: {
    year?: number;
    targetType?: string;
    targetId?: string;
  }): Promise<GraphAssertion[]>;
  createAssertion(assertion: GraphAssertion): Promise<GraphAssertion>;
  updateAssertion(
    id: string,
    patch: Partial<GraphAssertion>,
  ): Promise<GraphAssertion | null>;
  deleteAssertion(id: string): Promise<boolean>;
  getAvailableYears(): Promise<number[]>;
  getEditions(): Promise<EditionEntry[]>;
  updateEdition(
    year: number,
    patch: Partial<EditionEntry>,
  ): Promise<EditionEntry>;
  getAllNodes(): Promise<GraphNode[]>;
  createNode(node: GraphNode): Promise<GraphNode>;
  updateNode(id: string, patch: GraphNodePatch): Promise<GraphNode | null>;
  setNodeHidden(id: string, year: number, hidden: boolean): Promise<boolean>;
  deleteNode(id: string, year?: number): Promise<boolean>;
  createEdge(edge: GraphEdge): Promise<GraphEdge>;
  updateEdge(id: string, patch: Partial<GraphEdge>): Promise<GraphEdge | null>;
  deleteEdge(id: string): Promise<boolean>;
}
