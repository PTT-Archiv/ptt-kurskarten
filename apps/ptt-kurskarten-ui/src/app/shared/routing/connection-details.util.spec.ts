import { describe, expect, it } from 'vitest';
import type { ConnectionLeg, ConnectionOption } from '@ptt-kurskarten/shared';
import { buildWaitSegments } from './connection-details.util';

function buildLeg(partial: Partial<ConnectionLeg> = {}): ConnectionLeg {
  return {
    edgeId: partial.edgeId ?? 'edge-a',
    tripId: partial.tripId ?? 'trip-a',
    from: partial.from ?? 'node-a',
    to: partial.to ?? 'node-b',
    transport: partial.transport ?? 'postkutsche',
    departs: partial.departs ?? '09:00',
    arrives: partial.arrives ?? '10:00',
    arrivalDayOffset: partial.arrivalDayOffset,
    departDayOffset: partial.departDayOffset,
    departAbsMinutes: partial.departAbsMinutes,
    arriveAbsMinutes: partial.arriveAbsMinutes,
    durationMinutes: partial.durationMinutes ?? 60,
    notes: partial.notes
  };
}

function buildOption(legs: ConnectionLeg[]): ConnectionOption {
  return {
    id: 'option-a',
    year: 1852,
    from: 'node-a',
    to: 'node-c',
    requestedDepart: '09:00',
    departs: legs[0]?.departs ?? '09:00',
    arrives: legs.at(-1)?.arrives ?? '10:00',
    legs,
    kind: 'COMPLETE_JOURNEY'
  };
}

describe('connection-details util', () => {
  it('does not create an overnight wait when the next leg departs at the same minute', () => {
    const option = buildOption([
      buildLeg({
        edgeId: 'edge-1',
        tripId: 'trip-1',
        from: 'bellinzona',
        to: 'bironico',
        departs: '09:40',
        arrives: '11:55',
        departAbsMinutes: 580,
        arriveAbsMinutes: 715,
        durationMinutes: 135
      }),
      buildLeg({
        edgeId: 'edge-2',
        tripId: 'trip-2',
        from: 'bironico',
        to: 'lugano',
        departs: '11:55',
        arrives: '13:30',
        departAbsMinutes: 715,
        arriveAbsMinutes: 810,
        durationMinutes: 95
      })
    ]);

    expect(buildWaitSegments(option)).toEqual([null]);
  });

  it('keeps a real overnight wait when the next leg departs after midnight', () => {
    const option = buildOption([
      buildLeg({
        edgeId: 'edge-1',
        tripId: 'trip-1',
        from: 'a',
        to: 'b',
        departs: '22:30',
        arrives: '23:55',
        departAbsMinutes: 1350,
        arriveAbsMinutes: 1435,
        durationMinutes: 85
      }),
      buildLeg({
        edgeId: 'edge-2',
        tripId: 'trip-2',
        from: 'b',
        to: 'c',
        departs: '00:10',
        arrives: '01:00',
        departAbsMinutes: 1450,
        arriveAbsMinutes: 1500,
        departDayOffset: 1,
        arrivalDayOffset: 1,
        durationMinutes: 50
      })
    ]);

    expect(buildWaitSegments(option)).toEqual([
      {
        atNodeId: 'b',
        startAbsMin: 1435,
        endAbsMin: 1450,
        durationMinutes: 15,
        overnight: true,
        startDayOffset: 0,
        endDayOffset: 1
      }
    ]);
  });

  it('keeps wait segments aligned with their preceding leg index', () => {
    const option = buildOption([
      buildLeg({
        edgeId: 'edge-1',
        tripId: 'trip-1',
        from: 'a',
        to: 'b',
        departs: '09:40',
        arrives: '11:55',
        departAbsMinutes: 580,
        arriveAbsMinutes: 715,
        durationMinutes: 135
      }),
      buildLeg({
        edgeId: 'edge-2',
        tripId: 'trip-2',
        from: 'b',
        to: 'c',
        departs: '11:55',
        arrives: '13:30',
        departAbsMinutes: 715,
        arriveAbsMinutes: 810,
        durationMinutes: 95
      }),
      buildLeg({
        edgeId: 'edge-3',
        tripId: 'trip-3',
        from: 'c',
        to: 'd',
        departs: '13:45',
        arrives: '15:00',
        departAbsMinutes: 825,
        arriveAbsMinutes: 900,
        durationMinutes: 75
      })
    ]);

    expect(buildWaitSegments(option)).toEqual([
      null,
      {
        atNodeId: 'c',
        startAbsMin: 810,
        endAbsMin: 825,
        durationMinutes: 15,
        overnight: false,
        startDayOffset: 0,
        endDayOffset: 0
      }
    ]);
  });
});
