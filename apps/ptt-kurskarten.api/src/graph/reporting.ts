import type { EdgeTimetableReport, GraphEdge, GraphNode, GraphSnapshot, StationProfileReport, TimeHHMM } from '@ptt-kurskarten/shared';

const DAY_MINUTES = 1440;

export function timeToMinutes(value: TimeHHMM): number {
  const [hh, mm] = value.split(':').map((part) => Number(part));
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) {
    return 0;
  }
  return hh * 60 + mm;
}

export function computeDurationMinutes(departs: TimeHHMM, arrives: TimeHHMM, arrivalDayOffset?: number): number {
  const dep = timeToMinutes(departs);
  const arrRaw = timeToMinutes(arrives);
  const arr = arrRaw + (arrivalDayOffset ?? 0) * DAY_MINUTES;
  const normalized = arr < dep ? arr + DAY_MINUTES : arr;
  return normalized - dep;
}

export function buildStationProfile(snapshot: GraphSnapshot, nodeId: string): StationProfileReport {
  const nodesById = new Map(snapshot.nodes.map((node) => [node.id, node]));
  const node = nodesById.get(nodeId) ?? null;

  const outgoingEdges = snapshot.edges.filter((edge) => edge.from === nodeId);
  const incomingEdges = snapshot.edges.filter((edge) => edge.to === nodeId);

  const outgoing = outgoingEdges
    .map((edge) => buildEdgeStats(edge, nodesById.get(edge.to)))
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  const incoming = incomingEdges
    .map((edge) => buildEdgeStats(edge, nodesById.get(edge.from), true))
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  outgoing.sort((a, b) => b.tripsCount - a.tripsCount || a.toNode.name.localeCompare(b.toNode.name));
  incoming.sort((a, b) => b.tripsCount - a.tripsCount || a.fromNode.name.localeCompare(b.fromNode.name));

  return {
    year: snapshot.year,
    node,
    outgoing,
    incoming,
    totals: {
      outgoingEdges: outgoing.length,
      outgoingTrips: outgoing.reduce((sum, entry) => sum + entry.tripsCount, 0),
      incomingEdges: incoming.length,
      incomingTrips: incoming.reduce((sum, entry) => sum + entry.tripsCount, 0)
    }
  };
}

export function buildEdgeTimetable(snapshot: GraphSnapshot, edgeId: string): EdgeTimetableReport {
  const edge = snapshot.edges.find((candidate) => candidate.id === edgeId) ?? null;
  const nodesById = new Map(snapshot.nodes.map((node) => [node.id, node]));
  const fromNode = edge ? nodesById.get(edge.from) ?? null : null;
  const toNode = edge ? nodesById.get(edge.to) ?? null : null;

  const trips = (edge?.trips ?? []).map((trip) => ({
    tripId: trip.id,
    departs: trip.departs,
    arrives: trip.arrives,
    arrivalDayOffset: trip.arrivalDayOffset,
    durationMinutes: computeDurationMinutes(trip.departs, trip.arrives, trip.arrivalDayOffset),
    notes: trip.notes
  }));

  trips.sort((a, b) => timeToMinutes(a.departs) - timeToMinutes(b.departs));

  const departures = trips.map((trip) => timeToMinutes(trip.departs));
  const durations = trips.map((trip) => trip.durationMinutes);

  const summary = {
    tripsCount: trips.length,
    firstDeparture: trips.length ? trips[0].departs : undefined,
    lastDeparture: trips.length ? trips[trips.length - 1].departs : undefined,
    minDurationMinutes: durations.length ? Math.min(...durations) : undefined,
    maxDurationMinutes: durations.length ? Math.max(...durations) : undefined
  };

  return {
    year: snapshot.year,
    edge,
    fromNode,
    toNode,
    trips,
    summary
  };
}

function buildEdgeStats(
  edge: GraphEdge,
  otherNode: GraphNode | undefined,
  incoming = false
):
  | {
      toNode: GraphNode;
      edgeId: string;
      transport: GraphEdge['transport'];
      tripsCount: number;
      firstDeparture?: TimeHHMM;
      lastDeparture?: TimeHHMM;
      minDurationMinutes?: number;
    }
  | {
      fromNode: GraphNode;
      edgeId: string;
      transport: GraphEdge['transport'];
      tripsCount: number;
      firstDeparture?: TimeHHMM;
      lastDeparture?: TimeHHMM;
      minDurationMinutes?: number;
    }
  | null {
  if (!otherNode) {
    return null;
  }

  const trips = edge.trips ?? [];
  const departures = trips.map((trip) => timeToMinutes(trip.departs));
  const durations = trips.map((trip) => computeDurationMinutes(trip.departs, trip.arrives, trip.arrivalDayOffset));

  const base = {
    edgeId: edge.id,
    transport: edge.transport,
    tripsCount: trips.length,
    firstDeparture: departures.length
      ? trips[departures.indexOf(Math.min(...departures))].departs
      : undefined,
    lastDeparture: departures.length
      ? trips[departures.indexOf(Math.max(...departures))].departs
      : undefined,
    minDurationMinutes: durations.length ? Math.min(...durations) : undefined
  };

  if (incoming) {
    return { ...base, fromNode: otherNode };
  }

  return { ...base, toNode: otherNode };
}
