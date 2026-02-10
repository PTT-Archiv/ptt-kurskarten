import type { GraphSnapshot, TimeHHMM } from '@ptt-kurskarten/shared';

export const outsideDatasetSnapshot: GraphSnapshot = {
  year: 1852,
  nodes: [
    { id: 'A', name: 'A', x: 0, y: 0, validFrom: 1800 },
    { id: 'B', name: 'B', x: 1, y: 1, validFrom: 1800 },
    { id: 'C', name: 'C', x: 2, y: 2, validFrom: 1800 }
  ],
  edges: [
    {
      id: 'A-B',
      from: 'A',
      to: 'B',
      transport: 'courier',
      validFrom: 1800,
      trips: [{ id: 'A-B-1', departs: '08:00', arrives: '08:30' }]
    },
    {
      id: 'B-C',
      from: 'B',
      to: 'C',
      transport: 'courier',
      validFrom: 1800,
      trips: [{ id: 'B-C-1', departs: '08:40', arrives: '09:10' }]
    },
    {
      id: 'C-D',
      from: 'C',
      to: 'D',
      transport: 'postkutsche',
      validFrom: 1800,
      trips: [{ id: 'C-D-1', departs: '09:20', arrives: '10:00' }]
    }
  ]
};

export const outsideDatasetParams = {
  year: 1852,
  from: 'A',
  to: 'D',
  depart: '08:00' as TimeHHMM,
  k: 3
};

export const outsideDatasetExpected = {
  kind: 'COMPLETE_PREFIX',
  resolvedTo: 'C',
  targetOutsideDataset: true
};
