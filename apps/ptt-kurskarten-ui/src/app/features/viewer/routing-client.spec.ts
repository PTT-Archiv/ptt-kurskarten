import { describe, expect, it } from 'vitest';
import type { GraphSnapshot } from '@ptt-kurskarten/shared';
import { computeConnections, computeEarliestArrival } from './routing-client';

function buildNode(id: string, name: string, foreign?: boolean) {
  return { id, name, x: 0, y: 0, validFrom: 1800, foreign };
}

function buildSnapshot(edges: GraphSnapshot['edges'], nodes?: GraphSnapshot['nodes']): GraphSnapshot {
  return {
    year: 1852,
    nodes: nodes ?? [
      buildNode('a', 'A'),
      buildNode('b', 'B'),
      buildNode('c', 'C'),
      buildNode('d', 'D')
    ],
    edges
  };
}

describe('routing-client', () => {
  it('chains a known departure to a later known arrival through partial intermediate segments', () => {
    const snapshot = buildSnapshot([
      {
        id: 'samedan-scanfs',
        from: 'a',
        to: 'b',
        validFrom: 1800,
        trips: [{ id: 'a-b-1', transport: 'postkutsche', departs: '05:00' }]
      },
      {
        id: 'scanfs-zernetz',
        from: 'b',
        to: 'c',
        validFrom: 1800,
        trips: [{ id: 'b-c-1', transport: 'postkutsche', arrives: '11:00' }]
      }
    ]);

    const result = computeEarliestArrival(snapshot, {
      year: 1852,
      from: 'a',
      to: 'c',
      depart: '04:30',
      minTransferMinutes: 0
    });

    expect(result).not.toBeNull();
    expect(result?.departs).toBe('05:00');
    expect(result?.arrives).toBe('11:00');
    expect(result?.legs.map((leg) => leg.edgeId)).toEqual(['samedan-scanfs', 'scanfs-zernetz']);
  });

  it('allows both-unknown trips only as internal bridge segments', () => {
    const chained = computeEarliestArrival(
      buildSnapshot([
        {
          id: 'a-b',
          from: 'a',
          to: 'b',
          validFrom: 1800,
          trips: [{ id: 'a-b-1', transport: 'postkutsche', departs: '05:00' }]
        },
        {
          id: 'b-c',
          from: 'b',
          to: 'c',
          validFrom: 1800,
          trips: [{ id: 'b-c-1', transport: 'postkutsche' }]
        },
        {
          id: 'c-d',
          from: 'c',
          to: 'd',
          validFrom: 1800,
          trips: [{ id: 'c-d-1', transport: 'postkutsche', arrives: '09:00' }]
        }
      ]),
      {
        year: 1852,
        from: 'a',
        to: 'd',
        depart: '04:30',
        minTransferMinutes: 0
      }
    );

    expect(chained).not.toBeNull();
    expect(chained?.legs.map((leg) => leg.edgeId)).toEqual(['a-b', 'b-c', 'c-d']);
    expect(chained?.arrives).toBe('09:00');

    const standalone = computeEarliestArrival(
      buildSnapshot([
        {
          id: 'a-b',
          from: 'a',
          to: 'b',
          validFrom: 1800,
          trips: [{ id: 'a-b-1', transport: 'postkutsche' }]
        }
      ], [buildNode('a', 'A'), buildNode('b', 'B')]),
      {
        year: 1852,
        from: 'a',
        to: 'b',
        depart: '04:30',
        minTransferMinutes: 0
      }
    );

    expect(standalone).toBeNull();
  });

  it('does not start a normal route on arrival-only trips', () => {
    const snapshot = buildSnapshot([
      {
        id: 'a-b',
        from: 'a',
        to: 'b',
        validFrom: 1800,
        trips: [{ id: 'a-b-1', transport: 'postkutsche', arrives: '07:00' }]
      }
    ], [buildNode('a', 'A'), buildNode('b', 'B')]);

    const result = computeEarliestArrival(snapshot, {
      year: 1852,
      from: 'a',
      to: 'b',
      depart: '04:30',
      minTransferMinutes: 0
    });

    expect(result).toBeNull();
  });

  it('aborts heuristic chaining when an intermediate continuation is ambiguous', () => {
    const snapshot = buildSnapshot([
      {
        id: 'a-b',
        from: 'a',
        to: 'b',
        validFrom: 1800,
        trips: [{ id: 'a-b-1', transport: 'postkutsche', departs: '05:00' }]
      },
      {
        id: 'b-c',
        from: 'b',
        to: 'c',
        validFrom: 1800,
        trips: [{ id: 'b-c-1', transport: 'postkutsche', arrives: '07:00' }]
      },
      {
        id: 'b-d',
        from: 'b',
        to: 'd',
        validFrom: 1800,
        trips: [{ id: 'b-d-1', transport: 'postkutsche', arrives: '07:30' }]
      }
    ]);

    const result = computeEarliestArrival(snapshot, {
      year: 1852,
      from: 'a',
      to: 'c',
      depart: '04:30',
      minTransferMinutes: 0
    });

    expect(result).toBeNull();
  });

  it('uses the same chaining logic after a foreign-start arrival-only preface', () => {
    const snapshot = buildSnapshot(
      [
        {
          id: 'foreign-b',
          from: 'x',
          to: 'b',
          validFrom: 1800,
          trips: [{ id: 'x-b-1', transport: 'postkutsche', arrives: '08:00' }]
        },
        {
          id: 'b-c',
          from: 'b',
          to: 'c',
          validFrom: 1800,
          trips: [{ id: 'b-c-1', transport: 'postkutsche', departs: '09:00' }]
        },
        {
          id: 'c-d',
          from: 'c',
          to: 'd',
          validFrom: 1800,
          trips: [{ id: 'c-d-1', transport: 'postkutsche', arrives: '10:00' }]
        }
      ],
      [buildNode('b', 'B'), buildNode('c', 'C'), buildNode('d', 'D')]
    );

    const results = computeConnections(snapshot, {
      year: 1852,
      from: 'x',
      to: 'd',
      depart: '07:00',
      k: 3
    });

    expect(results[0]?.kind).toBe('FOREIGN_START_FALLBACK');
    expect(results[0]?.legs.map((leg) => leg.edgeId)).toEqual(['foreign-b', 'b-c', 'c-d']);
    expect(results[0]?.arrives).toBe('10:00');
  });
});
