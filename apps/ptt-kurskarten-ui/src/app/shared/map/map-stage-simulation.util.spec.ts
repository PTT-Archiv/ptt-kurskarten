import { describe, expect, it } from 'vitest';
import {
  collectOrganicNodeEventIntensities,
  getActiveSimulationRunsAtMinute,
  getRelevantSimulationEdgeIds,
  getRelevantSimulationNodeIds,
  getTripRunProgressAtMinute,
  resolveSimulationEdgeDisplayState,
  resolveSimulationNodeDisplayState,
  type TripFlowSimulationRun
} from './map-stage-simulation.util';

function buildRun(partial: Partial<TripFlowSimulationRun> = {}): TripFlowSimulationRun {
  return {
    edgeId: partial.edgeId ?? 'edge-a',
    tripId: partial.tripId ?? 'trip-a',
    fromId: partial.fromId ?? 'node-a',
    toId: partial.toId ?? 'node-b',
    transport: partial.transport ?? 'postkutsche',
    departs: partial.departs ?? '08:00',
    arrives: partial.arrives ?? '09:00',
    arrivalDayOffset: partial.arrivalDayOffset,
    departMinute: partial.departMinute ?? 480,
    arriveMinute: partial.arriveMinute ?? 540,
    durationMinutes: partial.durationMinutes ?? 60
  };
}

describe('map-stage-simulation util', () => {
  it('filters active runs at a minute using trip progress', () => {
    const active = buildRun();
    const inactive = buildRun({ edgeId: 'edge-b', tripId: 'trip-b', departMinute: 600, arriveMinute: 660 });

    const runs = getActiveSimulationRunsAtMinute(510, [active, inactive]);

    expect(runs).toEqual([active]);
    expect(getTripRunProgressAtMinute(active, 510)).toBeCloseTo(0.5);
  });

  it('keeps overnight runs active after midnight', () => {
    const overnight = buildRun({
      edgeId: 'edge-night',
      tripId: 'trip-night',
      fromId: 'node-night-a',
      toId: 'node-night-b',
      departMinute: 1430,
      arriveMinute: 1460,
      durationMinutes: 30
    });

    const runs = getActiveSimulationRunsAtMinute(10, [overnight]);

    expect(runs).toEqual([overnight]);
    expect(getTripRunProgressAtMinute(overnight, 10)).toBeCloseTo(20 / 30);
  });

  it('derives relevant edge and node ids from active runs', () => {
    const first = buildRun();
    const second = buildRun({
      edgeId: 'edge-b',
      tripId: 'trip-b',
      fromId: 'node-b',
      toId: 'node-c'
    });

    const edgeIds = getRelevantSimulationEdgeIds([first, second]);
    const nodeIds = getRelevantSimulationNodeIds([first, second]);

    expect([...edgeIds]).toEqual(['edge-a', 'edge-b']);
    expect([...nodeIds]).toEqual(['node-a', 'node-b', 'node-c']);
  });

  it('resolves edge and node display states for relevant and non-relevant cases', () => {
    expect(resolveSimulationEdgeDisplayState('always-active', false)).toBe('base');
    expect(resolveSimulationEdgeDisplayState('unhighlighted', false)).toBe('muted');
    expect(resolveSimulationEdgeDisplayState('not-visible', true)).toBe('hidden');
    expect(resolveSimulationEdgeDisplayState('active-when-relevant-muted', true)).toBe('emphasis');
    expect(resolveSimulationEdgeDisplayState('active-when-relevant-hidden', false)).toBe('hidden');

    expect(resolveSimulationNodeDisplayState('always-active', false)).toBe('base');
    expect(resolveSimulationNodeDisplayState('unhighlighted', false)).toBe('muted');
    expect(resolveSimulationNodeDisplayState('not-visible', true)).toBe('hidden');
    expect(resolveSimulationNodeDisplayState('active-when-relevant-muted', true)).toBe('emphasis');
    expect(resolveSimulationNodeDisplayState('active-when-relevant-hidden', false)).toBe('hidden');
    expect(resolveSimulationNodeDisplayState('organic', true)).toBe('organic');
  });

  it('builds organic fade intensities for departure and arrival events', () => {
    const run = buildRun();

    const departure = collectOrganicNodeEventIntensities(483, [run], 18);
    const arrival = collectOrganicNodeEventIntensities(542, [run], 18);

    expect(departure.get('node-a')).toBeCloseTo(1 - 3 / 18);
    expect(departure.get('node-b') ?? 0).toBe(0);
    expect(arrival.get('node-b')).toBeCloseTo(1 - 2 / 18);
  });
});
