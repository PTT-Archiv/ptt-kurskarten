export type Year = number;

export type TransportType = 'coach' | 'rail' | 'tram' | 'ship';

export type TimeHHMM = `${number}${number}:${number}${number}`;

export type DayOffset = 0 | 1 | 2;

export type EdgeTrip = {
  id: string;
  departs: TimeHHMM;
  arrives: TimeHHMM;
  arrivalDayOffset?: DayOffset;
  notes?: string;
};

export type GraphNode = {
  id: string;
  name: string;
  x: number;
  y: number;
  validFrom: Year;
  validTo?: Year;
};

export type GraphEdge = {
  id: string;
  from: string;
  to: string;
  transport: TransportType;
  validFrom: Year;
  validTo?: Year;
  durationMinutes?: number;
  trips: EdgeTrip[];
};

export type ConnectionLeg = {
  edgeId: string;
  tripId: string;
  from: string;
  to: string;
  transport: TransportType;
  departs: TimeHHMM;
  arrives: TimeHHMM;
  arrivalDayOffset?: DayOffset;
  departDayOffset?: DayOffset;
  arriveDayOffset?: DayOffset;
  departAbsMinutes?: number;
  arriveAbsMinutes?: number;
  durationMinutes?: number;
};

export type ConnectionOption = {
  id?: string;
  year: Year;
  from: string;
  to: string;
  requestedDepart: TimeHHMM;
  departs: TimeHHMM;
  arrives: TimeHHMM;
  arriveDayOffset?: DayOffset;
  durationMinutes: number;
  transfers?: number;
  legs: ConnectionLeg[];
};

export type GraphSnapshot = {
  year: Year;
  nodes: GraphNode[];
  edges: GraphEdge[];
};

export type NodeDetail = {
  year: Year;
  node: GraphNode | null;
  neighbors: GraphNode[];
  edges: GraphEdge[];
};
