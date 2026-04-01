import type {
  ConnectionLeg,
  ConnectionOption,
  EdgeTrip,
  GraphEdge,
  GraphSnapshot,
  RouteResultKind,
  TimeHHMM,
  TransportType,
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
  toNode: string;
  departAbs: number;
  arriveAbs: number;
  legs: ConnectionLeg[];
};

type ContinuationCandidate = {
  edge: GraphEdge;
  leg: ConnectionLeg;
  departAbs?: number;
  arriveAbs?: number;
};

type QueueItem = { nodeId: string; time: number };

type PrevInfo = {
  prevNode: string | null;
  legs: ConnectionLeg[];
  departAbs: number | null;
  arriveAbs: number | null;
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

function resolveArrivalMinutes(
  dep: number,
  arrRaw: number,
  offset?: number,
): number {
  let arr = arrRaw + (offset ?? 0) * DAY_MINUTES;
  if (offset === undefined && arrRaw < dep) {
    arr += DAY_MINUTES;
  }
  while (arr < dep) {
    arr += DAY_MINUTES;
  }
  return arr;
}

function resolveTripTransport(
  trip: EdgeTrip | null | undefined,
): TransportType {
  return trip?.transport ?? 'postkutsche';
}

function resolveEdgeTransport(
  edge: GraphEdge | null | undefined,
): TransportType {
  return resolveTripTransport(edge?.trips?.[0]);
}

function resolveTimeAtOrAfter(
  referenceAbs: number,
  time: TimeHHMM,
  offset?: number,
): number {
  let resolved =
    Math.floor(referenceAbs / DAY_MINUTES) * DAY_MINUTES +
    parseTime(time) +
    (offset ?? 0) * DAY_MINUTES;
  while (resolved < referenceAbs) {
    resolved += DAY_MINUTES;
  }
  return resolved;
}

function buildRouteLeg(
  edge: GraphEdge,
  trip: EdgeTrip,
  departAbs?: number,
  arriveAbs?: number,
): ConnectionLeg {
  const legArrivalDayOffset =
    departAbs !== undefined && arriveAbs !== undefined
      ? (Math.max(
          0,
          Math.floor(arriveAbs / DAY_MINUTES) -
            Math.floor(departAbs / DAY_MINUTES),
        ) as 0 | 1 | 2)
      : undefined;

  return {
    edgeId: edge.id,
    tripId: trip.id,
    from: edge.from,
    to: edge.to,
    transport: resolveTripTransport(trip),
    departs: trip.departs,
    arrives: arriveAbs !== undefined ? trip.arrives : undefined,
    notes: edge.notes,
    arrivalDayOffset: legArrivalDayOffset,
    departAbsMinutes: departAbs,
    arriveAbsMinutes: arriveAbs,
    durationMinutes:
      departAbs !== undefined && arriveAbs !== undefined
        ? arriveAbs - departAbs
        : undefined,
  };
}

function finalizeLegs(
  legs: ConnectionLeg[],
  startTime: number,
): ConnectionLeg[] {
  return legs.map((leg) => ({
    ...leg,
    departDayOffset:
      leg.departAbsMinutes !== undefined
        ? ((Math.floor(leg.departAbsMinutes / DAY_MINUTES) -
            Math.floor(startTime / DAY_MINUTES)) as 0 | 1 | 2)
        : undefined,
    arriveDayOffset:
      leg.arriveAbsMinutes !== undefined
        ? ((Math.floor(leg.arriveAbsMinutes / DAY_MINUTES) -
            Math.floor(startTime / DAY_MINUTES)) as 0 | 1 | 2)
        : undefined,
  }));
}

function buildAdjacency(snapshot: GraphSnapshot): Map<string, GraphEdge[]> {
  const adjacency = new Map<string, GraphEdge[]>();
  snapshot.edges.forEach((edge) => {
    const list = adjacency.get(edge.from) ?? [];
    list.push(edge);
    adjacency.set(edge.from, list);
  });
  return adjacency;
}

function buildReachableToTarget(
  adjacency: Map<string, GraphEdge[]>,
  targetNode: string,
): Set<string> {
  const reverse = new Map<string, string[]>();

  adjacency.forEach((edges) => {
    edges.forEach((edge) => {
      const incoming = reverse.get(edge.to) ?? [];
      incoming.push(edge.from);
      reverse.set(edge.to, incoming);
    });
  });

  const reachable = new Set<string>([targetNode]);
  const queue = [targetNode];

  while (queue.length) {
    const nodeId = queue.shift();
    if (!nodeId) {
      continue;
    }

    for (const prevNode of reverse.get(nodeId) ?? []) {
      if (reachable.has(prevNode)) {
        continue;
      }
      reachable.add(prevNode);
      queue.push(prevNode);
    }
  }

  return reachable;
}

export function computeTripChoice(
  edge: GraphEdge,
  currentTime: number,
  minTransferMinutes: number,
): TripChoice | null {
  const trips = edge.trips ?? [];
  if (!trips.length) {
    return null;
  }

  const earliest = currentTime + minTransferMinutes;
  let chosen: EdgeTrip | null = null;
  let chosenDepAbs = 0;
  let chosenArrAbs = 0;

  for (const trip of trips) {
    if (!trip.departs || !trip.arrives) {
      continue;
    }
    const depAbs = resolveTimeAtOrAfter(earliest, trip.departs);
    const arrAbs = resolveTimeAtOrAfter(
      depAbs,
      trip.arrives,
      trip.arrivalDayOffset,
    );

    if (chosen === null || depAbs < chosenDepAbs) {
      chosen = trip;
      chosenDepAbs = depAbs;
      chosenArrAbs = arrAbs;
    }
  }

  if (!chosen) {
    return null;
  }

  return {
    toNode: edge.to,
    departAbs: chosenDepAbs,
    arriveAbs: chosenArrAbs,
    legs: [buildRouteLeg(edge, chosen, chosenDepAbs, chosenArrAbs)],
  };
}

function computePartialChainChoices(
  adjacency: Map<string, GraphEdge[]>,
  edge: GraphEdge,
  currentTime: number,
  minTransferMinutes: number,
  targetReachable: Set<string>,
  targetNode: string,
): TripChoice[] {
  const choices: TripChoice[] = [];
  const trips = edge.trips ?? [];

  for (const trip of trips) {
    if (!trip.departs) {
      continue;
    }

    const departAbs = resolveTimeAtOrAfter(
      currentTime + minTransferMinutes,
      trip.departs,
    );
    const arriveAbs = trip.arrives
      ? resolveTimeAtOrAfter(departAbs, trip.arrives, trip.arrivalDayOffset)
      : undefined;
    const baseLeg = buildRouteLeg(edge, trip, departAbs, arriveAbs);
    const visitedNodes = new Set([edge.from, edge.to]);
    const continuations = extendPartialChain(
      adjacency,
      edge.to,
      resolveTripTransport(trip),
      arriveAbs ?? departAbs,
      visitedNodes,
      targetReachable,
      targetNode,
    );
    if (!continuations.length) {
      continue;
    }

    continuations.forEach((continuation) => {
      choices.push({
        toNode: continuation.toNode,
        departAbs,
        arriveAbs: continuation.arriveAbs,
        legs: [baseLeg, ...continuation.legs],
      });
    });
  }

  return choices;
}

function extendPartialChain(
  adjacency: Map<string, GraphEdge[]>,
  startNode: string,
  transport: TransportType,
  referenceAbs: number,
  visitedNodes: Set<string>,
  targetReachable: Set<string>,
  targetNode: string,
): TripChoice[] {
  if (visitedNodes.size > adjacency.size + 1) {
    return [];
  }

  const continuations = selectContinuationCandidates(
    collectContinuationCandidates(
      adjacency,
      startNode,
      transport,
      referenceAbs,
      visitedNodes,
    ),
    targetReachable,
    targetNode,
  );
  if (!continuations.length) {
    return [];
  }

  const chains: TripChoice[] = [];

  for (const next of continuations) {
    const nextNode = next.edge.to;
    if (visitedNodes.has(nextNode)) {
      continue;
    }

    if (next.arriveAbs !== undefined) {
      chains.push({
        toNode: nextNode,
        departAbs: referenceAbs,
        arriveAbs: next.arriveAbs,
        legs: [next.leg],
      });
      continue;
    }

    const nextVisitedNodes = new Set(visitedNodes);
    nextVisitedNodes.add(nextNode);
    const downstreamChains = extendPartialChain(
      adjacency,
      nextNode,
      transport,
      next.departAbs ?? referenceAbs,
      nextVisitedNodes,
      targetReachable,
      targetNode,
    );

    downstreamChains.forEach((chain) => {
      chains.push({
        toNode: chain.toNode,
        departAbs: referenceAbs,
        arriveAbs: chain.arriveAbs,
        legs: [next.leg, ...chain.legs],
      });
    });
  }

  return chains;
}

function collectContinuationCandidates(
  adjacency: Map<string, GraphEdge[]>,
  nodeId: string,
  transport: TransportType,
  referenceAbs: number,
  visitedNodes: Set<string>,
): ContinuationCandidate[] {
  const edges = adjacency.get(nodeId) ?? [];
  const candidates: ContinuationCandidate[] = [];

  for (const edge of edges) {
    if (visitedNodes.has(edge.to)) {
      continue;
    }

    for (const trip of edge.trips ?? []) {
      if (resolveTripTransport(trip) !== transport) {
        continue;
      }

      const departAbs = trip.departs
        ? resolveTimeAtOrAfter(referenceAbs, trip.departs)
        : undefined;
      const arriveAbs = trip.arrives
        ? resolveTimeAtOrAfter(
            departAbs ?? referenceAbs,
            trip.arrives,
            trip.arrivalDayOffset,
          )
        : undefined;

      candidates.push({
        edge,
        leg: buildRouteLeg(edge, trip, departAbs, arriveAbs),
        departAbs,
        arriveAbs,
      });
    }
  }

  return candidates;
}

function selectContinuationCandidates(
  candidates: ContinuationCandidate[],
  targetReachable: Set<string>,
  targetNode: string,
): ContinuationCandidate[] {
  if (!candidates.length) {
    return [];
  }

  const byEdge = new Map<string, ContinuationCandidate[]>();
  candidates.forEach((candidate) => {
    const edgeCandidates = byEdge.get(candidate.edge.id) ?? [];
    edgeCandidates.push(candidate);
    byEdge.set(candidate.edge.id, edgeCandidates);
  });

  const directTargetEdgeGroups = [...byEdge.values()].filter(
    (group) => group[0]?.edge.to === targetNode,
  );
  if (directTargetEdgeGroups.length === 1) {
    return directTargetEdgeGroups[0];
  }
  if (directTargetEdgeGroups.length > 1) {
    return [];
  }

  const targetEdgeGroups = [...byEdge.values()].filter((group) =>
    targetReachable.has(group[0]?.edge.to ?? ''),
  );
  if (targetEdgeGroups.length === 1) {
    return targetEdgeGroups[0];
  }
  if (targetEdgeGroups.length > 1) {
    return [];
  }

  if (byEdge.size !== 1) {
    return [];
  }

  return [...byEdge.values()][0] ?? [];
}

function computeOutgoingChoices(
  adjacency: Map<string, GraphEdge[]>,
  currentNode: string,
  currentTime: number,
  minTransferMinutes: number,
  targetReachable: Set<string>,
  targetNode: string,
): TripChoice[] {
  const edges = adjacency.get(currentNode) ?? [];
  const signatures = new Set<string>();
  const choices: TripChoice[] = [];

  for (const edge of edges) {
    const direct = computeTripChoice(edge, currentTime, minTransferMinutes);
    if (direct) {
      const signature = direct.legs
        .map((leg) => `${leg.edgeId}:${leg.tripId}`)
        .join('|');
      if (!signatures.has(signature)) {
        signatures.add(signature);
        choices.push(direct);
      }
    }

    for (const chain of computePartialChainChoices(
      adjacency,
      edge,
      currentTime,
      minTransferMinutes,
      targetReachable,
      targetNode,
    )) {
      const signature = chain.legs
        .map((leg) => `${leg.edgeId}:${leg.tripId}`)
        .join('|');
      if (!signatures.has(signature)) {
        signatures.add(signature);
        choices.push(chain);
      }
    }
  }

  return choices;
}

export function computeEarliestArrival(
  snapshot: GraphSnapshot,
  params: RoutingParams,
): ConnectionOption | null {
  const minTransferMinutes = params.minTransferMinutes ?? 0;
  const maxMinutesHorizon = params.maxMinutesHorizon ?? DAY_MINUTES * 20;
  const startTime = parseTime(params.depart);

  const adjacency = buildAdjacency(snapshot);
  const targetReachable = buildReachableToTarget(adjacency, params.to);

  const dist = new Map<string, number>();
  const prev = new Map<string, PrevInfo>();
  const heap = new MinHeap<QueueItem>((a, b) => a.time - b.time);

  dist.set(params.from, startTime);
  prev.set(params.from, {
    prevNode: null,
    legs: [],
    departAbs: null,
    arriveAbs: null,
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

    const choices = computeOutgoingChoices(
      adjacency,
      current.nodeId,
      current.time,
      current.nodeId === params.from ? 0 : minTransferMinutes,
      targetReachable,
      params.to,
    );
    for (const choice of choices) {
      if (visited.has(choice.toNode)) {
        continue;
      }

      if (choice.arriveAbs - startTime > maxMinutesHorizon) {
        continue;
      }

      const known = dist.get(choice.toNode);
      if (known === undefined || choice.arriveAbs < known) {
        dist.set(choice.toNode, choice.arriveAbs);
        prev.set(choice.toNode, {
          prevNode: current.nodeId,
          legs: choice.legs,
          departAbs: choice.departAbs,
          arriveAbs: choice.arriveAbs,
        });
        heap.push({ nodeId: choice.toNode, time: choice.arriveAbs });
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
    if (
      !info ||
      !info.prevNode ||
      info.departAbs === null ||
      info.arriveAbs === null ||
      info.legs.length === 0
    ) {
      break;
    }

    for (let idx = info.legs.length - 1; idx >= 0; idx -= 1) {
      legs.push(info.legs[idx]);
    }

    nodeCursor = info.prevNode;
  }

  legs.reverse();
  const finalizedLegs = finalizeLegs(legs, startTime);

  if (!finalizedLegs.length) {
    return null;
  }

  const firstLeg = finalizedLegs[0];
  const departAbs = firstLeg?.departAbsMinutes ?? startTime;
  const lastLeg = finalizedLegs[finalizedLegs.length - 1];
  const arriveAbs = lastLeg?.arriveAbsMinutes;
  const departDayOffset =
    Math.floor(departAbs / DAY_MINUTES) - Math.floor(startTime / DAY_MINUTES);
  const arriveDayOffset =
    arriveAbs !== undefined
      ? Math.floor(arriveAbs / DAY_MINUTES) -
        Math.floor(startTime / DAY_MINUTES)
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
    durationMinutes:
      arriveAbs !== undefined ? arriveAbs - departAbs : undefined,
    legs: finalizedLegs,
    kind: 'COMPLETE_JOURNEY',
  };
}

export function computeConnections(
  snapshot: GraphSnapshot,
  params: ConnectionsParams,
): ConnectionOption[] {
  const k = Math.max(3, Math.min(params.k ?? 5, 10));
  const results: ConnectionOption[] = [];
  const allowForeignStartFallback = params.allowForeignStartFallback ?? true;
  const fromNode =
    snapshot.nodes.find((node) => node.id === params.from) ?? null;
  const fromIsForeign = fromNode?.foreign === true;

  if (
    !isNodeInSnapshot(params.to, snapshot) &&
    isNodeInSnapshot(params.from, snapshot)
  ) {
    return computePrefixConnections(snapshot, params, k);
  }

  if (
    !isNodeInSnapshot(params.from, snapshot) &&
    isNodeInSnapshot(params.to, snapshot)
  ) {
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
    if (
      !(
        fromIsForeign &&
        allowForeignStartFallback &&
        isNodeInSnapshot(params.to, snapshot)
      )
    ) {
      return results;
    }
  }

  if (k === 1) {
    return results;
  }

  const adjacency = buildAdjacency(snapshot);

  const startEdges = adjacency.get(params.from) ?? [];
  const startTime = parseTime(params.depart);
  const minTransferMinutes = params.minTransferMinutes ?? 0;
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

  const sortedDepartures = [...candidateDepartures]
    .sort((a, b) => a - b)
    .slice(0, k * 2);

  for (const depAbs of sortedDepartures) {
    if (results.length >= k) {
      break;
    }

    const seededParams: RoutingParams = {
      ...params,
      depart: formatTime(depAbs),
      minTransferMinutes,
      maxMinutesHorizon,
    };

    const option = computeEarliestArrival(snapshot, seededParams);
    if (!option) {
      continue;
    }

    const signature = option.legs
      .map((leg) => `${leg.edgeId}:${leg.tripId}`)
      .join('|');
    const exists = results.some(
      (existing) =>
        existing.legs.map((leg) => `${leg.edgeId}:${leg.tripId}`).join('|') ===
        signature,
    );
    if (!exists) {
      results.push(option);
    }
  }

  if (
    fromIsForeign &&
    isNodeInSnapshot(params.to, snapshot) &&
    allowForeignStartFallback
  ) {
    const fallback = computeForeignStartFallback(snapshot, params, k);
    if (fallback.length) {
      const existing = new Set(
        results.map((option) =>
          option.legs.map((leg) => `${leg.edgeId}:${leg.tripId}`).join('|'),
        ),
      );
      const merged = [...results];
      for (const option of fallback) {
        const signature = option.legs
          .map((leg) => `${leg.edgeId}:${leg.tripId}`)
          .join('|');
        if (!existing.has(signature)) {
          existing.add(signature);
          merged.push(option);
        }
      }

      if (merged.length <= k) {
        return merged;
      }

      const normal = merged.filter(
        (option) => option.kind !== 'FOREIGN_START_FALLBACK',
      );
      const foreign = merged.filter(
        (option) => option.kind === 'FOREIGN_START_FALLBACK',
      );

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

function computePrefixConnections(
  snapshot: GraphSnapshot,
  params: ConnectionsParams,
  k: number,
): ConnectionOption[] {
  const edgesToTarget = snapshot.edges.filter((edge) => edge.to === params.to);
  const candidateNodes = Array.from(
    new Set(
      edgesToTarget
        .map((edge) => edge.from)
        .filter((nodeId) => isNodeInSnapshot(nodeId, snapshot)),
    ),
  );

  if (!candidateNodes.length) {
    return [];
  }

  const options: ConnectionOption[] = [];

  for (const candidate of candidateNodes) {
    const option = computeEarliestArrival(snapshot, {
      ...params,
      to: candidate,
    });
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
    const aArr =
      a.legs[a.legs.length - 2]?.arriveAbsMinutes ?? Number.POSITIVE_INFINITY;
    const bArr =
      b.legs[b.legs.length - 2]?.arriveAbsMinutes ?? Number.POSITIVE_INFINITY;
    return aArr - bArr;
  });

  return sorted.slice(0, k);
}

function buildContinuationLeg(
  snapshot: GraphSnapshot,
  fromId: string,
  toId: string,
): ConnectionLeg {
  const edge = snapshot.edges.find(
    (candidate) => candidate.from === fromId && candidate.to === toId,
  );
  const trip = edge?.trips?.[0];
  return {
    edgeId: edge?.id ?? `outside:${fromId}->${toId}`,
    tripId: trip?.id ?? `outside:${fromId}->${toId}`,
    from: fromId,
    to: toId,
    transport: resolveTripTransport(trip),
    departs: trip?.departs,
    arrives: undefined,
    continuationOutsideDataset: true,
  };
}

function isNodeInSnapshot(nodeId: string, snapshot: GraphSnapshot): boolean {
  return snapshot.nodes.some((node) => node.id === nodeId);
}

function computeForeignStartFallback(
  snapshot: GraphSnapshot,
  params: ConnectionsParams,
  k: number,
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
          edge,
        });
        return;
      }
      arrivalOnly.push({
        from: edge.from,
        to: edge.to,
        arrival: trip.arrives,
        arrivalDayOffset: trip.arrivalDayOffset,
        edge,
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
        tripId:
          entry.edge.trips?.[0]?.id ?? `outside:${entry.from}->${entry.to}`,
        from: entry.from,
        to: entry.to,
        transport: resolveEdgeTransport(entry.edge),
        arrives: entry.arrival,
        arrivalDayOffset: entry.arrivalDayOffset as 0 | 1 | 2 | undefined,
        notes: entry.edge.notes,
        continuationOutsideDataset: true,
        foreignStartPreface: true,
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
        foreignStartNote: entry.arrivalOnly
          ? `Known from ${entry.to}`
          : undefined,
        legs: [preface],
      });
      return;
    }

    const inner = computeConnections(snapshot, {
      ...params,
      from: entry.to,
      depart: entry.arrival,
      allowForeignStartFallback: false,
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
        tripId:
          entry.edge.trips?.[0]?.id ?? `outside:${entry.from}->${entry.to}`,
        from: entry.from,
        to: entry.to,
        transport: resolveEdgeTransport(entry.edge),
        arrives: entry.arrival,
        arrivalDayOffset: entry.arrivalDayOffset as 0 | 1 | 2 | undefined,
        notes: entry.edge.notes,
        continuationOutsideDataset: true,
        foreignStartPreface: true,
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
        foreignStartNote: entry.arrivalOnly
          ? `Known from ${entry.to}`
          : undefined,
        legs: [preface, ...option.legs],
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
      [this.data[current], this.data[parent]] = [
        this.data[parent],
        this.data[current],
      ];
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
      if (
        left < length &&
        this.compare(this.data[left], this.data[smallest]) < 0
      ) {
        smallest = left;
      }
      if (
        right < length &&
        this.compare(this.data[right], this.data[smallest]) < 0
      ) {
        smallest = right;
      }
      if (smallest === current) {
        break;
      }
      [this.data[current], this.data[smallest]] = [
        this.data[smallest],
        this.data[current],
      ];
      current = smallest;
    }
  }
}
