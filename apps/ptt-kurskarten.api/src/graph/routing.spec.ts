import type { GraphSnapshot } from '@ptt-kurskarten/shared';
import { computeConnections, computeEarliestArrival } from './routing';

function buildNode(id: string, name: string, foreign?: boolean) {
  return { id, name, x: 0, y: 0, validFrom: 1800, foreign };
}

function buildSnapshot(
  edges: GraphSnapshot['edges'],
  nodes?: GraphSnapshot['nodes'],
): GraphSnapshot {
  return {
    year: 1852,
    nodes: nodes ?? [
      buildNode('a', 'A'),
      buildNode('b', 'B'),
      buildNode('c', 'C'),
      buildNode('d', 'D'),
    ],
    edges,
  };
}

describe('routing', () => {
  it('finds a transfer path with time-dependent trips', () => {
    const snapshot: GraphSnapshot = {
      year: 1852,
      nodes: [
        { id: 'a', name: 'A', x: 0, y: 0, validFrom: 1800 },
        { id: 'b', name: 'B', x: 0, y: 0, validFrom: 1800 },
        { id: 'c', name: 'C', x: 0, y: 0, validFrom: 1800 },
      ],
      edges: [
        {
          id: 'a-b',
          from: 'a',
          to: 'b',
          validFrom: 1800,
          trips: [
            {
              id: 'a-b-1',
              transport: 'courier',
              departs: '17:40',
              arrives: '18:30',
            },
            {
              id: 'a-b-2',
              transport: 'courier',
              departs: '19:00',
              arrives: '19:50',
            },
          ],
        },
        {
          id: 'b-c',
          from: 'b',
          to: 'c',
          validFrom: 1800,
          trips: [
            {
              id: 'b-c-1',
              transport: 'courier',
              departs: '18:45',
              arrives: '19:30',
            },
            {
              id: 'b-c-2',
              transport: 'courier',
              departs: '20:05',
              arrives: '21:00',
            },
          ],
        },
      ],
    };

    const result = computeEarliestArrival(snapshot, {
      year: 1852,
      from: 'a',
      to: 'c',
      depart: '17:30',
      minTransferMinutes: 5,
    });

    expect(result).not.toBeNull();
    expect(result?.legs.length).toBe(2);
    expect(result?.legs[0].edgeId).toBe('a-b');
    expect(result?.legs[1].edgeId).toBe('b-c');
  });

  it('handles overnight arrival with day offset', () => {
    const snapshot: GraphSnapshot = {
      year: 1852,
      nodes: [
        { id: 'a', name: 'A', x: 0, y: 0, validFrom: 1800 },
        { id: 'b', name: 'B', x: 0, y: 0, validFrom: 1800 },
      ],
      edges: [
        {
          id: 'a-b',
          from: 'a',
          to: 'b',
          validFrom: 1800,
          trips: [
            {
              id: 'a-b-overnight',
              transport: 'postkutsche',
              departs: '22:30',
              arrives: '01:10',
              arrivalDayOffset: 1,
            },
          ],
        },
      ],
    };

    const result = computeEarliestArrival(snapshot, {
      year: 1852,
      from: 'a',
      to: 'b',
      depart: '22:00',
      minTransferMinutes: 0,
    });

    expect(result).not.toBeNull();
    expect(result?.legs[0].arrivalDayOffset).toBe(1);
  });

  it('normalizes bad overnight offsets instead of producing negative durations', () => {
    const snapshot: GraphSnapshot = {
      year: 1852,
      nodes: [
        { id: 'a', name: 'A', x: 0, y: 0, validFrom: 1800 },
        { id: 'b', name: 'B', x: 0, y: 0, validFrom: 1800 },
      ],
      edges: [
        {
          id: 'a-b',
          from: 'a',
          to: 'b',
          validFrom: 1800,
          trips: [
            {
              id: 'a-b-1',
              transport: 'postkutsche',
              departs: '21:40',
              arrives: '11:10',
              arrivalDayOffset: 0,
            },
          ],
        },
      ],
    };

    const result = computeEarliestArrival(snapshot, {
      year: 1852,
      from: 'a',
      to: 'b',
      depart: '20:00',
      minTransferMinutes: 0,
    });

    expect(result).not.toBeNull();
    expect(result?.durationMinutes).toBe(810);
    expect(result?.legs[0].durationMinutes).toBe(810);
    expect(result?.legs[0].arrivalDayOffset).toBe(1);
    expect(result?.legs[0].arriveDayOffset).toBe(1);
  });

  it('uses actual trip timetable when choosing the fastest path', () => {
    const snapshot: GraphSnapshot = {
      year: 1852,
      nodes: [
        { id: 'a', name: 'A', x: 0, y: 0, validFrom: 1800 },
        { id: 'b', name: 'B', x: 0, y: 0, validFrom: 1800 },
        { id: 'c', name: 'C', x: 0, y: 0, validFrom: 1800 },
      ],
      edges: [
        {
          id: 'a-b',
          from: 'a',
          to: 'b',
          validFrom: 1800,
          trips: [
            {
              id: 'a-b-1',
              transport: 'courier',
              departs: '08:00',
              arrives: '08:10',
            },
          ],
        },
        {
          id: 'b-c',
          from: 'b',
          to: 'c',
          validFrom: 1800,
          trips: [
            {
              id: 'b-c-1',
              transport: 'courier',
              departs: '08:15',
              arrives: '08:20',
            },
          ],
        },
        {
          id: 'a-c',
          from: 'a',
          to: 'c',
          validFrom: 1800,
          trips: [
            {
              id: 'a-c-1',
              transport: 'courier',
              departs: '08:05',
              arrives: '09:30',
            },
          ],
        },
      ],
    };

    const result = computeEarliestArrival(snapshot, {
      year: 1852,
      from: 'a',
      to: 'c',
      depart: '07:55',
      minTransferMinutes: 0,
    });

    expect(result).not.toBeNull();
    expect(result?.legs.map((leg) => leg.edgeId)).toEqual(['a-b', 'b-c']);
    expect(result?.arrives).toBe('08:20');
  });

  it('chains a known departure to a later known arrival through partial intermediate segments', () => {
    const snapshot = buildSnapshot([
      {
        id: 'samedan-scanfs',
        from: 'a',
        to: 'b',
        validFrom: 1800,
        trips: [{ id: 'a-b-1', transport: 'postkutsche', departs: '05:00' }],
      },
      {
        id: 'scanfs-zernetz',
        from: 'b',
        to: 'c',
        validFrom: 1800,
        trips: [{ id: 'b-c-1', transport: 'postkutsche', arrives: '11:00' }],
      },
    ]);

    const result = computeEarliestArrival(snapshot, {
      year: 1852,
      from: 'a',
      to: 'c',
      depart: '04:30',
      minTransferMinutes: 0,
    });

    expect(result).not.toBeNull();
    expect(result?.departs).toBe('05:00');
    expect(result?.arrives).toBe('11:00');
    expect(result?.legs.map((leg) => leg.edgeId)).toEqual([
      'samedan-scanfs',
      'scanfs-zernetz',
    ]);
  });

  it('also chains from a fully timed first leg into an arrival-only continuation', () => {
    const snapshot = buildSnapshot([
      {
        id: 'solothurn-duerrmuehle',
        from: 'a',
        to: 'b',
        validFrom: 1800,
        trips: [
          {
            id: 'a-b-1',
            transport: 'postkutsche',
            departs: '20:00',
            arrives: '20:40',
          },
        ],
      },
      {
        id: 'duerrmuehle-oensingen',
        from: 'b',
        to: 'c',
        validFrom: 1800,
        trips: [{ id: 'b-c-1', transport: 'postkutsche', arrives: '21:45' }],
      },
    ]);

    const result = computeEarliestArrival(snapshot, {
      year: 1852,
      from: 'a',
      to: 'c',
      depart: '19:30',
      minTransferMinutes: 0,
    });

    expect(result).not.toBeNull();
    expect(result?.departs).toBe('20:00');
    expect(result?.arrives).toBe('21:45');
    expect(result?.legs.map((leg) => leg.edgeId)).toEqual([
      'solothurn-duerrmuehle',
      'duerrmuehle-oensingen',
    ]);
    expect(result?.legs[0]?.arrives).toBe('20:40');
  });

  it('allows both-unknown trips only as internal bridge segments', () => {
    const chained = computeEarliestArrival(
      buildSnapshot([
        {
          id: 'a-b',
          from: 'a',
          to: 'b',
          validFrom: 1800,
          trips: [{ id: 'a-b-1', transport: 'postkutsche', departs: '05:00' }],
        },
        {
          id: 'b-c',
          from: 'b',
          to: 'c',
          validFrom: 1800,
          trips: [{ id: 'b-c-1', transport: 'postkutsche' }],
        },
        {
          id: 'c-d',
          from: 'c',
          to: 'd',
          validFrom: 1800,
          trips: [{ id: 'c-d-1', transport: 'postkutsche', arrives: '09:00' }],
        },
      ]),
      {
        year: 1852,
        from: 'a',
        to: 'd',
        depart: '04:30',
        minTransferMinutes: 0,
      },
    );

    expect(chained).not.toBeNull();
    expect(chained?.legs.map((leg) => leg.edgeId)).toEqual([
      'a-b',
      'b-c',
      'c-d',
    ]);
    expect(chained?.arrives).toBe('09:00');

    const standalone = computeEarliestArrival(
      buildSnapshot(
        [
          {
            id: 'a-b',
            from: 'a',
            to: 'b',
            validFrom: 1800,
            trips: [{ id: 'a-b-1', transport: 'postkutsche' }],
          },
        ],
        [buildNode('a', 'A'), buildNode('b', 'B')],
      ),
      {
        year: 1852,
        from: 'a',
        to: 'b',
        depart: '04:30',
        minTransferMinutes: 0,
      },
    );

    expect(standalone).toBeNull();
  });

  it('does not start a normal route on arrival-only trips', () => {
    const snapshot = buildSnapshot(
      [
        {
          id: 'a-b',
          from: 'a',
          to: 'b',
          validFrom: 1800,
          trips: [{ id: 'a-b-1', transport: 'postkutsche', arrives: '07:00' }],
        },
      ],
      [buildNode('a', 'A'), buildNode('b', 'B')],
    );

    const result = computeEarliestArrival(snapshot, {
      year: 1852,
      from: 'a',
      to: 'b',
      depart: '04:30',
      minTransferMinutes: 0,
    });

    expect(result).toBeNull();
  });

  it('uses the requested destination to disambiguate a plausible partial continuation', () => {
    const snapshot = buildSnapshot([
      {
        id: 'a-b',
        from: 'a',
        to: 'b',
        validFrom: 1800,
        trips: [{ id: 'a-b-1', transport: 'postkutsche', departs: '20:00' }],
      },
      {
        id: 'b-c',
        from: 'b',
        to: 'c',
        validFrom: 1800,
        trips: [
          { id: 'b-c-1', transport: 'postkutsche', arrives: '09:55' },
          { id: 'b-c-2', transport: 'postkutsche', arrives: '21:45' },
        ],
      },
      {
        id: 'b-d',
        from: 'b',
        to: 'd',
        validFrom: 1800,
        trips: [{ id: 'b-d-1', transport: 'postkutsche', arrives: '20:30' }],
      },
    ]);

    const result = computeEarliestArrival(snapshot, {
      year: 1852,
      from: 'a',
      to: 'c',
      depart: '19:30',
      minTransferMinutes: 0,
    });

    expect(result).not.toBeNull();
    expect(result?.legs.map((leg) => `${leg.edgeId}:${leg.tripId}`)).toEqual([
      'a-b:a-b-1',
      'b-c:b-c-2',
    ]);
    expect(result?.departs).toBe('20:00');
    expect(result?.arrives).toBe('21:45');
  });

  it('prefers a direct continuation to the requested destination over indirect target-reachable detours', () => {
    const snapshot = buildSnapshot([
      {
        id: 'solothurn-duerrmuehle',
        from: 'a',
        to: 'b',
        validFrom: 1800,
        trips: [{ id: 'a-b-1', transport: 'postkutsche', departs: '20:00' }],
      },
      {
        id: 'duerrmuehle-oensingen',
        from: 'b',
        to: 'c',
        validFrom: 1800,
        trips: [{ id: 'b-c-1', transport: 'postkutsche', arrives: '21:45' }],
      },
      {
        id: 'duerrmuehle-balstall',
        from: 'b',
        to: 'd',
        validFrom: 1800,
        trips: [
          {
            id: 'b-d-1',
            transport: 'postkutsche',
            departs: '20:10',
            arrives: '20:15',
          },
        ],
      },
      {
        id: 'balstall-oensingen',
        from: 'd',
        to: 'c',
        validFrom: 1800,
        trips: [
          {
            id: 'd-c-1',
            transport: 'postkutsche',
            departs: '20:20',
            arrives: '22:10',
          },
        ],
      },
    ]);

    const result = computeEarliestArrival(snapshot, {
      year: 1852,
      from: 'a',
      to: 'c',
      depart: '19:30',
      minTransferMinutes: 0,
    });

    expect(result).not.toBeNull();
    expect(result?.legs.map((leg) => leg.edgeId)).toEqual([
      'solothurn-duerrmuehle',
      'duerrmuehle-oensingen',
    ]);
    expect(result?.arrives).toBe('21:45');
  });

  it('still aborts heuristic chaining when multiple continuations remain target-reachable', () => {
    const snapshot = buildSnapshot(
      [
        {
          id: 'a-b',
          from: 'a',
          to: 'b',
          validFrom: 1800,
          trips: [{ id: 'a-b-1', transport: 'postkutsche', departs: '05:00' }],
        },
        {
          id: 'b-c',
          from: 'b',
          to: 'c',
          validFrom: 1800,
          trips: [{ id: 'b-c-1', transport: 'postkutsche', arrives: '07:00' }],
        },
        {
          id: 'b-d',
          from: 'b',
          to: 'd',
          validFrom: 1800,
          trips: [{ id: 'b-d-1', transport: 'postkutsche', arrives: '07:30' }],
        },
        {
          id: 'c-e',
          from: 'c',
          to: 'e',
          validFrom: 1800,
          trips: [
            {
              id: 'c-e-1',
              transport: 'postkutsche',
              departs: '08:10',
              arrives: '09:00',
            },
          ],
        },
        {
          id: 'd-e',
          from: 'd',
          to: 'e',
          validFrom: 1800,
          trips: [
            {
              id: 'd-e-1',
              transport: 'postkutsche',
              departs: '08:15',
              arrives: '08:50',
            },
          ],
        },
      ],
      [
        buildNode('a', 'A'),
        buildNode('b', 'B'),
        buildNode('c', 'C'),
        buildNode('d', 'D'),
        buildNode('e', 'E'),
      ],
    );

    const result = computeEarliestArrival(snapshot, {
      year: 1852,
      from: 'a',
      to: 'e',
      depart: '04:30',
      minTransferMinutes: 0,
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
          trips: [{ id: 'x-b-1', transport: 'postkutsche', arrives: '08:00' }],
        },
        {
          id: 'b-c',
          from: 'b',
          to: 'c',
          validFrom: 1800,
          trips: [{ id: 'b-c-1', transport: 'postkutsche', departs: '09:00' }],
        },
        {
          id: 'c-d',
          from: 'c',
          to: 'd',
          validFrom: 1800,
          trips: [{ id: 'c-d-1', transport: 'postkutsche', arrives: '10:00' }],
        },
      ],
      [buildNode('b', 'B'), buildNode('c', 'C'), buildNode('d', 'D')],
    );

    const results = computeConnections(snapshot, {
      year: 1852,
      from: 'x',
      to: 'd',
      depart: '07:00',
      k: 3,
    });

    expect(results[0]?.kind).toBe('FOREIGN_START_FALLBACK');
    expect(results[0]?.legs.map((leg) => leg.edgeId)).toEqual([
      'foreign-b',
      'b-c',
      'c-d',
    ]);
    expect(results[0]?.arrives).toBe('10:00');
  });
});
