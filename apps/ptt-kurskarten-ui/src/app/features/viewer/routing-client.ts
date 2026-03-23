import type {
  ConnectionLeg,
  ConnectionOption,
  EdgeTrip,
  GraphEdge,
  GraphSnapshot,
  TimeHHMM,
  TransportType
} from '@ptt-kurskarten/shared';

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
  allowForeignStartFallback?: boolean;
};

type TripChoice = {
  edge: GraphEdge;
  trip: EdgeTrip;
  departAbs: number;
  arriveAbs: number;
  departDayOffset: number;
  arriveDayOffset: number;
  arrivesKnown: boolean;
};

type QueueItem = { nodeId: string; time: number };

type PrevInfo = {
  prevNode: string | null;
  edgeId: string | null;
  tripId: string | null;
  departAbs: number | null;
  arriveAbs: number | null;
  arriveKnown: boolean;
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

function resolveArrivalMinutes(dep: number, arrRaw: number, offset?: number): number {
  let arr = arrRaw + (offset ?? 0) * DAY_MINUTES;
  if (offset === undefined && arrRaw < dep) {
    arr += DAY_MINUTES;
  }
  while (arr < dep) {
    arr += DAY_MINUTES;
  }
  return arr;
}

function resolveTripTransport(trip: EdgeTrip | null | undefined): TransportType {
  return trip?.transport ?? 'postkutsche';
}

function resolveEdgeTransport(edge: GraphEdge | null | undefined): TransportType {
  return resolveTripTransport(edge?.trips?.[0]);
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
  let chosenArrKnown = true;

  for (const trip of trips) {
    if (!trip.departs) {
      continue;
    }
    const dep = parseTime(trip.departs);
    const arrives = trip.arrives;
    const hasArrive = Boolean(arrives);
    const arrRaw = arrives ? parseTime(arrives) : dep;
    const offset = hasArrive ? trip.arrivalDayOffset : undefined;
    const arr = resolveArrivalMinutes(dep, arrRaw, offset);

    if (dep >= inDay && (chosen === null || dep < chosenDep)) {
      chosen = trip;
      chosenDep = dep;
      chosenArr = arr;
      chosenArrKnown = hasArrive;
      chosenDay = day;
    }
  }

  if (!chosen) {
    for (const trip of trips) {
      if (!trip.departs) {
        continue;
      }
      const dep = parseTime(trip.departs);
      const arrives = trip.arrives;
      const hasArrive = Boolean(arrives);
      const arrRaw = arrives ? parseTime(arrives) : dep;
      const offset = hasArrive ? trip.arrivalDayOffset : undefined;
      const arr = resolveArrivalMinutes(dep, arrRaw, offset);

      if (chosen === null || dep < chosenDep) {
        chosen = trip;
        chosenDep = dep;
        chosenArr = arr;
        chosenArrKnown = hasArrive;
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
    arriveDayOffset,
    arrivesKnown: chosenArrKnown
  };
}

export function computeEarliestArrival(snapshot: GraphSnapshot, params: RoutingParams): ConnectionOption | null {
  const minTransferMinutes = params.minTransferMinutes ?? 3;
  const maxMinutesHorizon = params.maxMinutesHorizon ?? DAY_MINUTES * 20;
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
    arriveKnown: true,
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
      if (visited.has(edge.to)) {
        continue;
      }
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
          arriveKnown: choice.arrivesKnown,
          transport: resolveTripTransport(choice.trip)
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
  const backtrackVisited = new Set<string>();

  while (nodeCursor && nodeCursor !== params.from) {
    if (backtrackVisited.has(nodeCursor)) {
      break;
    }
    backtrackVisited.add(nodeCursor);

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
    const legArrivalDayOffset = Math.max(
      0,
      Math.floor(info.arriveAbs / DAY_MINUTES) - Math.floor(info.departAbs / DAY_MINUTES)
    );

    legs.push({
      edgeId: edge.id,
      tripId: trip.id,
      from: edge.from,
      to: edge.to,
      transport: resolveTripTransport(trip),
      departs: trip.departs,
      arrives: info.arriveKnown ? trip.arrives : undefined,
      notes: edge.notes,
      arrivalDayOffset: info.arriveKnown ? (legArrivalDayOffset as 0 | 1 | 2) : undefined,
      departDayOffset: departDayOffset as 0 | 1 | 2,
      arriveDayOffset: info.arriveKnown ? (arriveDayOffset as 0 | 1 | 2) : undefined,
      departAbsMinutes: info.departAbs,
      arriveAbsMinutes: info.arriveKnown ? info.arriveAbs : undefined,
      durationMinutes: info.arriveKnown ? info.arriveAbs - info.departAbs : undefined
    });

    nodeCursor = info.prevNode;
  }

  legs.reverse();

  if (!legs.length) {
    return null;
  }

  const firstLeg = legs[0];
  const departAbs = firstLeg?.departAbsMinutes ?? startTime;
  const lastLeg = legs[legs.length - 1];
  const arriveAbs = lastLeg?.arriveAbsMinutes;
  const departDayOffset = Math.floor(departAbs / DAY_MINUTES) - Math.floor(startTime / DAY_MINUTES);
  const arriveDayOffset = arriveAbs !== undefined
    ? Math.floor(arriveAbs / DAY_MINUTES) - Math.floor(startTime / DAY_MINUTES)
    : undefined;

  return {
    year: params.year,
    from: params.from,
    to: params.to,
    requestedDepart: params.depart,
    departs: formatTime(departAbs),
    departDayOffset: departDayOffset as 0 | 1 | 2,
    arrives: arriveAbs !== undefined ? formatTime(arriveAbs) : undefined,
    arriveDayOffset: arriveDayOffset as 0 | 1 | 2,
    durationMinutes: arriveAbs !== undefined ? arriveAbs - departAbs : undefined,
    legs,
    kind: 'COMPLETE_JOURNEY'
  };
}

export function computeConnections(snapshot: GraphSnapshot, params: ConnectionsParams): ConnectionOption[] {
  const k = Math.max(3, Math.min(params.k ?? 5, 10));
  const results: ConnectionOption[] = [];
  const allowForeignStartFallback = params.allowForeignStartFallback ?? true;
  const fromNode = snapshot.nodes.find((node) => node.id === params.from) ?? null;
  const fromIsForeign = fromNode?.foreign === true;

  if (!isNodeInSnapshot(params.to, snapshot) && isNodeInSnapshot(params.from, snapshot)) {
    return computePrefixConnections(snapshot, params, k);
  }

  if (!isNodeInSnapshot(params.from, snapshot) && isNodeInSnapshot(params.to, snapshot)) {
    if (!allowForeignStartFallback) {
      return [];
    }
    results.push(...computeForeignStartFallback(snapshot, params, k));
    return results.slice(0, k);
  }

  const base = computeEarliestArrival(snapshot, params);
  if (base) {
    results.push(base);
  } else {
    if (!(fromIsForeign && allowForeignStartFallback && isNodeInSnapshot(params.to, snapshot))) {
      return results;
    }
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
  const minTransferMinutes = params.minTransferMinutes ?? 3;
  const maxMinutesHorizon = params.maxMinutesHorizon ?? DAY_MINUTES * 2;

  const candidateDepartures = new Set<number>();
  for (const edge of startEdges) {
    for (const trip of edge.trips ?? []) {
      if (!trip.departs) {
        continue;
      }
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

  if (fromIsForeign && isNodeInSnapshot(params.to, snapshot) && allowForeignStartFallback) {
    const fallback = computeForeignStartFallback(snapshot, params, k);
    if (fallback.length) {
      const existing = new Set(
        results.map((option) => option.legs.map((leg) => `${leg.edgeId}:${leg.tripId}`).join('|'))
      );
      const merged = [...results];
      for (const option of fallback) {
        const signature = option.legs.map((leg) => `${leg.edgeId}:${leg.tripId}`).join('|');
        if (!existing.has(signature)) {
          existing.add(signature);
          merged.push(option);
        }
      }

      if (merged.length <= k) {
        return merged;
      }

      const normal = merged.filter((option) => option.kind !== 'FOREIGN_START_FALLBACK');
      const foreign = merged.filter((option) => option.kind === 'FOREIGN_START_FALLBACK');

      if (normal.length && foreign.length && k > 1) {
        const trimmed = normal.slice(0, k - 1);
        trimmed.push(foreign[0]);
        return trimmed;
      }

      return merged.slice(0, k);
    }
  }

  return results.slice(0, k);
}

function computePrefixConnections(snapshot: GraphSnapshot, params: ConnectionsParams, k: number): ConnectionOption[] {
  const edgesToTarget = snapshot.edges.filter((edge) => edge.to === params.to);
  const candidateNodes = Array.from(
    new Set(
      edgesToTarget
        .map((edge) => edge.from)
        .filter((nodeId) => isNodeInSnapshot(nodeId, snapshot))
    )
  );

  if (!candidateNodes.length) {
    return [];
  }

  const options: ConnectionOption[] = [];

  for (const candidate of candidateNodes) {
    const option = computeEarliestArrival(snapshot, { ...params, to: candidate });
    if (!option) {
      continue;
    }
    const continuation = buildContinuationLeg(snapshot, candidate, params.to);
    option.legs = [...option.legs, continuation];
    option.kind = 'COMPLETE_PREFIX';
    option.resolvedTo = candidate;
    option.targetOutsideDataset = true;
    option.to = params.to;
    options.push(option);
  }

  const sorted = options.sort((a, b) => {
    const aArr = a.legs[a.legs.length - 2]?.arriveAbsMinutes ?? Number.POSITIVE_INFINITY;
    const bArr = b.legs[b.legs.length - 2]?.arriveAbsMinutes ?? Number.POSITIVE_INFINITY;
    return aArr - bArr;
  });

  return sorted.slice(0, k);
}

function buildContinuationLeg(snapshot: GraphSnapshot, fromId: string, toId: string): ConnectionLeg {
  const edge = snapshot.edges.find((candidate) => candidate.from === fromId && candidate.to === toId);
  const trip = edge?.trips?.[0];
  return {
    edgeId: edge?.id ?? `outside:${fromId}->${toId}`,
    tripId: trip?.id ?? `outside:${fromId}->${toId}`,
    from: fromId,
    to: toId,
    transport: resolveTripTransport(trip),
    departs: trip?.departs,
    arrives: undefined,
    continuationOutsideDataset: true
  };
}

function isNodeInSnapshot(nodeId: string, snapshot: GraphSnapshot): boolean {
  return snapshot.nodes.some((node) => node.id === nodeId);
}

function computeForeignStartFallback(
  snapshot: GraphSnapshot,
  params: ConnectionsParams,
  k: number
): ConnectionOption[] {
  const knownDepartures: Array<{
    from: string;
    to: string;
    depart: TimeHHMM;
    arrival: TimeHHMM;
    arrivalDayOffset?: number;
    edge: GraphEdge;
  }> = [];
  const arrivalOnly: Array<{
    from: string;
    to: string;
    arrival: TimeHHMM;
    arrivalDayOffset?: number;
    edge: GraphEdge;
  }> = [];

  snapshot.edges.forEach((edge) => {
    if (edge.from !== params.from) {
      return;
    }
    if (!isNodeInSnapshot(edge.to, snapshot)) {
      return;
    }
    (edge.trips ?? []).forEach((trip) => {
      if (!trip.arrives) {
        return;
      }
      if (trip.departs) {
        const depart = parseTime(trip.departs);
        const requested = parseTime(params.depart);
        if (depart < requested) {
          return;
        }
        knownDepartures.push({
          from: edge.from,
          to: edge.to,
          depart: trip.departs,
          arrival: trip.arrives,
          arrivalDayOffset: trip.arrivalDayOffset,
          edge
        });
        return;
      }
      arrivalOnly.push({
        from: edge.from,
        to: edge.to,
        arrival: trip.arrives,
        arrivalDayOffset: trip.arrivalDayOffset,
        edge
      });
    });
  });

  const effectiveKnown = arrivalOnly.length > 0 ? [] : knownDepartures;

  const sortedKnown = effectiveKnown.sort((a, b) => {
    const aDep = parseTime(a.depart);
    const bDep = parseTime(b.depart);
    if (aDep !== bDep) {
      return aDep - bDep;
    }
    return a.to.localeCompare(b.to);
  });

  const sortedArrivalOnly = arrivalOnly.sort((a, b) => {
    const aArr = parseTime(a.arrival);
    const bArr = parseTime(b.arrival);
    if (aArr !== bArr) {
      return aArr - bArr;
    }
    return a.to.localeCompare(b.to);
  });

  const options: ConnectionOption[] = [];

  const pushFromEntry = (entry: {
    from: string;
    to: string;
    arrival: TimeHHMM;
    arrivalDayOffset?: number;
    edge: GraphEdge;
    depart?: TimeHHMM;
    arrivalOnly?: boolean;
  }) => {
    if (entry.to === params.to) {
      const preface: ConnectionLeg = {
        edgeId: entry.edge.id,
        tripId: entry.edge.trips?.[0]?.id ?? `outside:${entry.from}->${entry.to}`,
        from: entry.from,
        to: entry.to,
        transport: resolveEdgeTransport(entry.edge),
        arrives: entry.arrival,
        arrivalDayOffset: entry.arrivalDayOffset as 0 | 1 | 2 | undefined,
        notes: entry.edge.notes,
        continuationOutsideDataset: true,
        foreignStartPreface: true
      };
      options.push({
        year: params.year,
        from: params.from,
        to: params.to,
        requestedDepart: params.depart,
        departs: entry.depart ?? entry.arrival,
        kind: 'FOREIGN_START_FALLBACK',
        requestedFrom: params.from,
        effectiveFrom: entry.to,
        effectiveStartTime: entry.arrival,
        foreignStartNote: entry.arrivalOnly ? `Known from ${entry.to}` : undefined,
        legs: [preface]
      });
      return;
    }

    const inner = computeConnections(snapshot, {
      ...params,
      from: entry.to,
      depart: entry.arrival,
      allowForeignStartFallback: false
    });
    if (!inner.length) {
      return;
    }
    inner.forEach((option) => {
      if (options.length >= k) {
        return;
      }
    const preface: ConnectionLeg = {
      edgeId: entry.edge.id,
      tripId: entry.edge.trips?.[0]?.id ?? `outside:${entry.from}->${entry.to}`,
      from: entry.from,
      to: entry.to,
      transport: resolveEdgeTransport(entry.edge),
      arrives: entry.arrival,
      arrivalDayOffset: entry.arrivalDayOffset as 0 | 1 | 2 | undefined,
      notes: entry.edge.notes,
      continuationOutsideDataset: true,
      foreignStartPreface: true
    };
      options.push({
        ...option,
        from: params.from,
        to: params.to,
        requestedDepart: params.depart,
        departs: entry.depart ?? entry.arrival,
        kind: 'FOREIGN_START_FALLBACK',
        requestedFrom: params.from,
        effectiveFrom: entry.to,
        effectiveStartTime: entry.arrival,
        foreignStartNote: entry.arrivalOnly ? `Known from ${entry.to}` : undefined,
        legs: [preface, ...option.legs]
      });
    });
  };

  for (const entry of sortedKnown) {
    if (options.length >= k) {
      break;
    }
    pushFromEntry(entry);
  }

  for (const entry of sortedArrivalOnly) {
    if (options.length >= k) {
      break;
    }
    pushFromEntry({ ...entry, arrivalOnly: true });
  }

  return options;
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
