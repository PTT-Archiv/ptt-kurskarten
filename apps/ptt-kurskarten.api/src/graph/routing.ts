import type { ConnectionLeg, ConnectionOption, EdgeTrip, GraphEdge, GraphSnapshot, TimeHHMM, TransportType } from '@ptt-kurskarten/shared';

export type RoutingParams = {
  year: number;
  from: string;
  to: string;
  depart: TimeHHMM;
  maxMinutesHorizon?: number;
  minTransferMinutes?: number;
};

export type ConnectionsParams = RoutingParams & {
  k?: number;
};

type TripChoice = {
  edge: GraphEdge;
  trip: EdgeTrip;
  departAbs: number;
  arriveAbs: number;
  departDayOffset: number;
  arriveDayOffset: number;
};

type QueueItem = { nodeId: string; time: number };

type PrevInfo = {
  prevNode: string | null;
  edgeId: string | null;
  tripId: string | null;
  departAbs: number | null;
  arriveAbs: number | null;
  transport: TransportType | null;
};

const DAY_MINUTES = 1440;

export function parseTime(value: TimeHHMM): number {
  const [hh, mm] = value.split(':').map((part) => Number(part));
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) {
    return 0;
  }
  return hh * 60 + mm;
}

export function formatTime(minutes: number): TimeHHMM {
  const normalized = ((minutes % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  const hh = Math.floor(normalized / 60)
    .toString()
    .padStart(2, '0');
  const mm = Math.floor(normalized % 60)
    .toString()
    .padStart(2, '0');
  return `${hh}:${mm}` as TimeHHMM;
}

export function computeTripChoice(
  edge: GraphEdge,
  currentTime: number,
  minTransferMinutes: number
): TripChoice | null {
  const trips = edge.trips ?? [];
  if (!trips.length) {
    return null;
  }

  const earliest = currentTime + minTransferMinutes;
  const day = Math.floor(earliest / DAY_MINUTES);
  const inDay = earliest % DAY_MINUTES;

  let chosen: EdgeTrip | null = null;
  let chosenDay = day;
  let chosenDep = 0;
  let chosenArr = 0;

  for (const trip of trips) {
    const dep = parseTime(trip.departs);
    const arrRaw = parseTime(trip.arrives);
    const offset = trip.arrivalDayOffset;
    const arr = offset !== undefined ? arrRaw + offset * DAY_MINUTES : arrRaw < dep ? arrRaw + DAY_MINUTES : arrRaw;

    if (dep >= inDay && (chosen === null || dep < chosenDep)) {
      chosen = trip;
      chosenDep = dep;
      chosenArr = arr;
      chosenDay = day;
    }
  }

  if (!chosen) {
    for (const trip of trips) {
      const dep = parseTime(trip.departs);
      const arrRaw = parseTime(trip.arrives);
      const offset = trip.arrivalDayOffset;
      const arr = offset !== undefined ? arrRaw + offset * DAY_MINUTES : arrRaw < dep ? arrRaw + DAY_MINUTES : arrRaw;

      if (chosen === null || dep < chosenDep) {
        chosen = trip;
        chosenDep = dep;
        chosenArr = arr;
        chosenDay = day + 1;
      }
    }
  }

  if (!chosen) {
    return null;
  }

  const departAbs = chosenDay * DAY_MINUTES + chosenDep;
  const arriveAbs = chosenDay * DAY_MINUTES + chosenArr;
  const departDayOffset = Math.floor(departAbs / DAY_MINUTES) - Math.floor(currentTime / DAY_MINUTES);
  const arriveDayOffset = Math.floor(arriveAbs / DAY_MINUTES) - Math.floor(currentTime / DAY_MINUTES);

  return {
    edge,
    trip: chosen,
    departAbs,
    arriveAbs,
    departDayOffset,
    arriveDayOffset
  };
}

export function computeEarliestArrival(snapshot: GraphSnapshot, params: RoutingParams): ConnectionOption | null {
  const minTransferMinutes = params.minTransferMinutes ?? 8;
  const maxMinutesHorizon = params.maxMinutesHorizon ?? DAY_MINUTES * 2;
  const startTime = parseTime(params.depart);

  const adjacency = new Map<string, GraphEdge[]>();
  snapshot.edges.forEach((edge) => {
    const list = adjacency.get(edge.from) ?? [];
    list.push(edge);
    adjacency.set(edge.from, list);
  });

  const dist = new Map<string, number>();
  const prev = new Map<string, PrevInfo>();
  const heap = new MinHeap<QueueItem>((a, b) => a.time - b.time);

  dist.set(params.from, startTime);
  prev.set(params.from, {
    prevNode: null,
    edgeId: null,
    tripId: null,
    departAbs: null,
    arriveAbs: null,
    transport: null
  });
  heap.push({ nodeId: params.from, time: startTime });

  const visited = new Set<string>();

  while (!heap.isEmpty()) {
    const current = heap.pop();
    if (!current) {
      break;
    }

    if (visited.has(current.nodeId)) {
      continue;
    }
    visited.add(current.nodeId);

    if (current.time - startTime > maxMinutesHorizon) {
      break;
    }

    if (current.nodeId === params.to) {
      break;
    }

    const edges = adjacency.get(current.nodeId) ?? [];
    for (const edge of edges) {
      const choice = computeTripChoice(edge, current.time, current.nodeId === params.from ? 0 : minTransferMinutes);
      if (!choice) {
        continue;
      }

      if (choice.arriveAbs - startTime > maxMinutesHorizon) {
        continue;
      }

      const known = dist.get(edge.to);
      if (known === undefined || choice.arriveAbs < known) {
        dist.set(edge.to, choice.arriveAbs);
        prev.set(edge.to, {
          prevNode: current.nodeId,
          edgeId: edge.id,
          tripId: choice.trip.id,
          departAbs: choice.departAbs,
          arriveAbs: choice.arriveAbs,
          transport: edge.transport
        });
        heap.push({ nodeId: edge.to, time: choice.arriveAbs });
      }
    }
  }

  const targetTime = dist.get(params.to);
  if (targetTime === undefined) {
    return null;
  }

  const legs: ConnectionLeg[] = [];
  let nodeCursor: string | null = params.to;

  while (nodeCursor && nodeCursor !== params.from) {
    const info = prev.get(nodeCursor);
    if (!info || !info.prevNode || !info.edgeId || !info.tripId || info.departAbs === null || info.arriveAbs === null) {
      break;
    }

    const edge = snapshot.edges.find((candidate) => candidate.id === info.edgeId);
    const trip = edge?.trips.find((candidate) => candidate.id === info.tripId);
    if (!edge || !trip) {
      break;
    }

    const departDayOffset = Math.floor(info.departAbs / DAY_MINUTES) - Math.floor(startTime / DAY_MINUTES);
    const arriveDayOffset = Math.floor(info.arriveAbs / DAY_MINUTES) - Math.floor(startTime / DAY_MINUTES);

    legs.push({
      edgeId: edge.id,
      tripId: trip.id,
      from: edge.from,
      to: edge.to,
      transport: edge.transport,
      departs: trip.departs,
      arrives: trip.arrives,
      arrivalDayOffset: trip.arrivalDayOffset,
      departDayOffset: departDayOffset as 0 | 1 | 2,
      arriveDayOffset: arriveDayOffset as 0 | 1 | 2,
      departAbsMinutes: info.departAbs,
      arriveAbsMinutes: info.arriveAbs,
      durationMinutes: info.arriveAbs - info.departAbs
    });

    nodeCursor = info.prevNode;
  }

  legs.reverse();

  if (!legs.length) {
    return null;
  }

  const firstLeg = legs[0];
  const departAbs = firstLeg?.departAbsMinutes ?? startTime;
  const arriveAbs = firstLeg && legs.length
    ? (legs[legs.length - 1].arriveAbsMinutes ?? targetTime)
    : targetTime;
  const departDayOffset = Math.floor(departAbs / DAY_MINUTES) - Math.floor(startTime / DAY_MINUTES);
  const arriveDayOffset = Math.floor(arriveAbs / DAY_MINUTES) - Math.floor(startTime / DAY_MINUTES);

  return {
    year: params.year,
    from: params.from,
    to: params.to,
    requestedDepart: params.depart,
    departs: formatTime(departAbs),
    departDayOffset: departDayOffset as 0 | 1 | 2,
    arrives: formatTime(arriveAbs),
    arriveDayOffset: arriveDayOffset as 0 | 1 | 2,
    durationMinutes: arriveAbs - departAbs,
    legs
  };
}

export function computeConnections(snapshot: GraphSnapshot, params: ConnectionsParams): ConnectionOption[] {
  const k = Math.max(3, Math.min(params.k ?? 5, 10));
  const results: ConnectionOption[] = [];

  const base = computeEarliestArrival(snapshot, params);
  if (base) {
    results.push(base);
  } else {
    return results;
  }

  if (k === 1) {
    return results;
  }

  const adjacency = new Map<string, GraphEdge[]>();
  snapshot.edges.forEach((edge) => {
    const list = adjacency.get(edge.from) ?? [];
    list.push(edge);
    adjacency.set(edge.from, list);
  });

  const startEdges = adjacency.get(params.from) ?? [];
  const startTime = parseTime(params.depart);
  const minTransferMinutes = params.minTransferMinutes ?? 8;
  const maxMinutesHorizon = params.maxMinutesHorizon ?? DAY_MINUTES * 2;

  const candidateDepartures = new Set<number>();
  for (const edge of startEdges) {
    for (const trip of edge.trips ?? []) {
      const dep = parseTime(trip.departs);
      const depAbs = dep >= startTime ? dep : dep + DAY_MINUTES;
      candidateDepartures.add(depAbs);
    }
  }

  const sortedDepartures = [...candidateDepartures].sort((a, b) => a - b).slice(0, k * 2);

  for (const depAbs of sortedDepartures) {
    if (results.length >= k) {
      break;
    }

    const seededParams: RoutingParams = {
      ...params,
      depart: formatTime(depAbs),
      minTransferMinutes,
      maxMinutesHorizon
    };

    const option = computeEarliestArrival(snapshot, seededParams);
    if (!option) {
      continue;
    }

    const signature = option.legs.map((leg) => `${leg.edgeId}:${leg.tripId}`).join('|');
    const exists = results.some((existing) => existing.legs.map((leg) => `${leg.edgeId}:${leg.tripId}`).join('|') === signature);
    if (!exists) {
      results.push(option);
    }
  }

  return results.slice(0, k);
}

class MinHeap<T> {
  private readonly data: T[] = [];
  constructor(private readonly compare: (a: T, b: T) => number) {}

  isEmpty(): boolean {
    return this.data.length === 0;
  }

  push(item: T): void {
    this.data.push(item);
    this.bubbleUp(this.data.length - 1);
  }

  pop(): T | undefined {
    if (this.data.length === 0) {
      return undefined;
    }
    const root = this.data[0];
    const last = this.data.pop();
    if (this.data.length > 0 && last) {
      this.data[0] = last;
      this.bubbleDown(0);
    }
    return root;
  }

  private bubbleUp(index: number): void {
    let current = index;
    while (current > 0) {
      const parent = Math.floor((current - 1) / 2);
      if (this.compare(this.data[current], this.data[parent]) >= 0) {
        break;
      }
      [this.data[current], this.data[parent]] = [this.data[parent], this.data[current]];
      current = parent;
    }
  }

  private bubbleDown(index: number): void {
    let current = index;
    const length = this.data.length;
    while (true) {
      let smallest = current;
      const left = current * 2 + 1;
      const right = current * 2 + 2;
      if (left < length && this.compare(this.data[left], this.data[smallest]) < 0) {
        smallest = left;
      }
      if (right < length && this.compare(this.data[right], this.data[smallest]) < 0) {
        smallest = right;
      }
      if (smallest === current) {
        break;
      }
      [this.data[current], this.data[smallest]] = [this.data[smallest], this.data[current]];
      current = smallest;
    }
  }
}
