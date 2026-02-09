import type { GraphSnapshot } from '@ptt-kurskarten/shared';
import { computeEarliestArrival } from './routing';

describe('routing', () => {
  it('finds a transfer path with time-dependent trips', () => {
    const snapshot: GraphSnapshot = {
      year: 1871,
      nodes: [
        { id: 'a', name: 'A', x: 0, y: 0, validFrom: 1800 },
        { id: 'b', name: 'B', x: 0, y: 0, validFrom: 1800 },
        { id: 'c', name: 'C', x: 0, y: 0, validFrom: 1800 }
      ],
      edges: [
        {
          id: 'a-b',
          from: 'a',
          to: 'b',
          transport: 'courier',
          validFrom: 1800,
          trips: [
            { id: 'a-b-1', departs: '17:40', arrives: '18:30' },
            { id: 'a-b-2', departs: '19:00', arrives: '19:50' }
          ]
        },
        {
          id: 'b-c',
          from: 'b',
          to: 'c',
          transport: 'courier',
          validFrom: 1800,
          trips: [
            { id: 'b-c-1', departs: '18:45', arrives: '19:30' },
            { id: 'b-c-2', departs: '20:05', arrives: '21:00' }
          ]
        }
      ]
    };

    const result = computeEarliestArrival(snapshot, {
      year: 1871,
      from: 'a',
      to: 'c',
      depart: '17:30',
      minTransferMinutes: 5
    });

    expect(result).not.toBeNull();
    expect(result?.legs.length).toBe(2);
    expect(result?.legs[0].edgeId).toBe('a-b');
    expect(result?.legs[1].edgeId).toBe('b-c');
  });

  it('handles overnight arrival with day offset', () => {
    const snapshot: GraphSnapshot = {
      year: 1871,
      nodes: [
        { id: 'a', name: 'A', x: 0, y: 0, validFrom: 1800 },
        { id: 'b', name: 'B', x: 0, y: 0, validFrom: 1800 }
      ],
      edges: [
        {
          id: 'a-b',
          from: 'a',
          to: 'b',
          transport: 'postkutsche',
          validFrom: 1800,
          trips: [{ id: 'a-b-overnight', departs: '22:30', arrives: '01:10', arrivalDayOffset: 1 }]
        }
      ]
    };

    const result = computeEarliestArrival(snapshot, {
      year: 1871,
      from: 'a',
      to: 'b',
      depart: '22:00',
      minTransferMinutes: 0
    });

    expect(result).not.toBeNull();
    expect(result?.legs[0].arrivalDayOffset).toBe(1);
  });
});
