import type { TimeHHMM, TransportType } from '@ptt-kurskarten/shared';

export const MINUTES_PER_DAY = 1440;
export const ORGANIC_NODE_FADE_MINUTES = 100;

export const TRIP_FLOW_NODE_MODES = [
  'always-active',
  'unhighlighted',
  'not-visible',
  'active-when-relevant-muted',
  'active-when-relevant-hidden',
  'organic'
] as const;

export const TRIP_FLOW_EDGE_MODES = [
  'always-active',
  'unhighlighted',
  'not-visible',
  'active-when-relevant-muted',
  'active-when-relevant-hidden'
] as const;

export type TripFlowNodeMode = (typeof TRIP_FLOW_NODE_MODES)[number];
export type TripFlowEdgeMode = (typeof TRIP_FLOW_EDGE_MODES)[number];
export type TripFlowDisplayState = 'base' | 'emphasis' | 'muted' | 'hidden';

export type TripFlowSimulationRun = {
  edgeId: string;
  tripId: string;
  fromId: string;
  toId: string;
  transport: TransportType;
  departs?: TimeHHMM;
  arrives: TimeHHMM;
  arrivalDayOffset?: number;
  departMinute: number;
  arriveMinute: number;
  durationMinutes: number;
};

export function isTripFlowNodeMode(value: string): value is TripFlowNodeMode {
  return (TRIP_FLOW_NODE_MODES as readonly string[]).includes(value);
}

export function isTripFlowEdgeMode(value: string): value is TripFlowEdgeMode {
  return (TRIP_FLOW_EDGE_MODES as readonly string[]).includes(value);
}

export function normalizeMinute(value: number): number {
  return ((value % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

export function getTripRunProgressAtMinute(run: TripFlowSimulationRun, minute: number): number | null {
  const absoluteMinute = liftMinuteIntoRunWindow(minute, run.departMinute);
  if (absoluteMinute < run.departMinute || absoluteMinute > run.arriveMinute) {
    return null;
  }
  return Math.max(0, Math.min(1, (absoluteMinute - run.departMinute) / run.durationMinutes));
}

export function getActiveSimulationRunsAtMinute(minute: number, runs: TripFlowSimulationRun[]): TripFlowSimulationRun[] {
  const normalizedMinute = normalizeMinute(minute);
  return runs.filter((run) => getTripRunProgressAtMinute(run, normalizedMinute) !== null);
}

export function getRelevantSimulationEdgeIds(runs: TripFlowSimulationRun[]): Set<string> {
  return new Set(runs.map((run) => run.edgeId));
}

export function getRelevantSimulationNodeIds(runs: TripFlowSimulationRun[]): Set<string> {
  const ids = new Set<string>();
  runs.forEach((run) => {
    ids.add(run.fromId);
    ids.add(run.toId);
  });
  return ids;
}

export function resolveSimulationEdgeDisplayState(
  mode: TripFlowEdgeMode,
  isRelevant: boolean
): TripFlowDisplayState {
  switch (mode) {
    case 'always-active':
      return 'base';
    case 'unhighlighted':
      return 'muted';
    case 'not-visible':
      return 'hidden';
    case 'active-when-relevant-muted':
      return isRelevant ? 'emphasis' : 'muted';
    case 'active-when-relevant-hidden':
      return isRelevant ? 'emphasis' : 'hidden';
  }
}

export function resolveSimulationNodeDisplayState(
  mode: TripFlowNodeMode,
  isRelevant: boolean
): TripFlowDisplayState | 'organic' {
  switch (mode) {
    case 'always-active':
      return 'base';
    case 'unhighlighted':
      return 'muted';
    case 'not-visible':
      return 'hidden';
    case 'active-when-relevant-muted':
      return isRelevant ? 'emphasis' : 'muted';
    case 'active-when-relevant-hidden':
      return isRelevant ? 'emphasis' : 'hidden';
    case 'organic':
      return 'organic';
  }
}

export function collectOrganicNodeEventIntensities(
  minute: number,
  runs: TripFlowSimulationRun[],
  fadeMinutes = ORGANIC_NODE_FADE_MINUTES
): Map<string, number> {
  const intensities = new Map<string, number>();
  const normalizedMinute = normalizeMinute(minute);

  runs.forEach((run) => {
    const absoluteMinute = liftMinuteIntoRunWindow(normalizedMinute, run.departMinute);
    const departIntensity = getEventFadeIntensity(absoluteMinute, run.departMinute, fadeMinutes);
    if (departIntensity > 0) {
      intensities.set(run.fromId, Math.max(intensities.get(run.fromId) ?? 0, departIntensity));
    }

    const arriveIntensity = getEventFadeIntensity(absoluteMinute, run.arriveMinute, fadeMinutes);
    if (arriveIntensity > 0) {
      intensities.set(run.toId, Math.max(intensities.get(run.toId) ?? 0, arriveIntensity));
    }
  });

  return intensities;
}

function liftMinuteIntoRunWindow(minute: number, referenceMinute: number): number {
  let absoluteMinute = normalizeMinute(minute);
  while (absoluteMinute < referenceMinute) {
    absoluteMinute += MINUTES_PER_DAY;
  }
  return absoluteMinute;
}

function getEventFadeIntensity(absoluteMinute: number, eventMinute: number, fadeMinutes: number): number {
  if (absoluteMinute < eventMinute || absoluteMinute > eventMinute + fadeMinutes) {
    return 0;
  }
  return Math.max(0, 1 - (absoluteMinute - eventMinute) / fadeMinutes);
}
