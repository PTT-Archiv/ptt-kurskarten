import type { GraphNode, GraphSnapshot } from '@ptt-kurskarten/shared';
import type { SidebarNodeTrip } from '@viewer/viewer.models';
import { parseTimeMinutes } from '@viewer/utils/viewer-routing.util';

export function buildNodeNameById(nodes: GraphNode[]): Record<string, string> {
  const byId: Record<string, string> = {};
  for (const node of nodes) {
    byId[node.id] = node.name;
  }
  return byId;
}

export function getNodeById(graph: GraphSnapshot | null, id: string | null): GraphNode | null {
  if (!graph || !id) {
    return null;
  }
  return graph.nodes.find((node) => node.id === id) ?? null;
}

export function getDefaultArchiveNode(graph: GraphSnapshot | null): GraphNode | null {
  if (!graph) {
    return null;
  }
  return (
    graph.nodes.find((node) => node.name === 'Luzern') ??
    graph.nodes.find((node) => node.id === 'luzern') ??
    graph.nodes[0] ??
    null
  );
}

export function tripSortValue(trip: SidebarNodeTrip): number {
  if (trip.departs) {
    return parseTimeMinutes(trip.departs);
  }
  if (trip.arrives) {
    return parseTimeMinutes(trip.arrives) + 720;
  }
  return Number.MAX_SAFE_INTEGER;
}
