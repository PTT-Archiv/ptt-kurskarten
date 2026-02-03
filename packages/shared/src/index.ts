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
  departDayOffset?: DayOffset;
  arriveDayOffset?: DayOffset;
  durationMinutes: number;
  transfers?: number;
  legs: ConnectionLeg[];
};

export type StationProfileReport = {
  year: Year;
  node: GraphNode | null;
  outgoing: Array<{
    toNode: GraphNode;
    edgeId: string;
    transport: TransportType;
    tripsCount: number;
    firstDeparture?: TimeHHMM;
    lastDeparture?: TimeHHMM;
    minDurationMinutes?: number;
  }>;
  incoming: Array<{
    fromNode: GraphNode;
    edgeId: string;
    transport: TransportType;
    tripsCount: number;
    firstDeparture?: TimeHHMM;
    lastDeparture?: TimeHHMM;
    minDurationMinutes?: number;
  }>;
  totals: {
    outgoingEdges: number;
    outgoingTrips: number;
    incomingEdges: number;
    incomingTrips: number;
  };
};

export type EdgeTimetableReport = {
  year: Year;
  edge: GraphEdge | null;
  fromNode: GraphNode | null;
  toNode: GraphNode | null;
  trips: Array<{
    tripId: string;
    departs: TimeHHMM;
    arrives: TimeHHMM;
    arrivalDayOffset?: DayOffset;
    durationMinutes: number;
    notes?: string;
  }>;
  summary: {
    tripsCount: number;
    firstDeparture?: TimeHHMM;
    lastDeparture?: TimeHHMM;
    minDurationMinutes?: number;
    maxDurationMinutes?: number;
  };
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
