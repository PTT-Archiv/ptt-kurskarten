import type {
  ConnectionOption,
  EditionEntry,
  GraphNode,
  LocalizedText,
  TimeHHMM,
  TransportType
} from '@ptt-kurskarten/shared';
import type { WaitSegment } from '@shared-ui/routing/connection-details.util';
import type { TripFlowEdgeMode, TripFlowNodeMode } from '@shared-ui/map/map-stage-simulation.util';

export type SidebarNodeTrip = {
  edgeId: string;
  tripId: string;
  nodeId: string;
  nodeName: string;
  transport: TransportType;
  departs?: TimeHHMM;
  arrives?: TimeHHMM;
  arrivalDayOffset?: number;
};

export type SidebarFact = {
  id: string;
  schemaKey: string;
  schemaLabel: string;
  label: string;
  url: string | null;
};

export type ViewerSurfaceMode = 'map' | 'archive';
export type MobileSheetMode = 'closed' | 'planner' | 'results' | 'details';
export type MobileSheetSnap = 'peek' | 'half' | 'full';
export type TripFlowModeOption<T extends string> = { value: T; labelKey: string };

export interface ViewerHeaderVm {
  archiveModeActive: boolean;
  routePlannerOpen: boolean;
  smallScreenLayout: boolean;
  orbitVisible: boolean;
  simulationMinute: number;
  year: number;
  editionTitle: string;
  publicEditionOptions: EditionEntry[];
  selectedEditionLabel: string;
  placeSearchQuery: string;
  placeSearchOpen: boolean;
  placeSearchActiveIndex: number;
  placeSearchResults: GraphNode[];
}

export interface ViewerFloatingActionsVm {
  helpOpen: boolean;
  settingsOpen: boolean;
  actionStackBottomOffset: number;
  archiveModeEnabled: boolean;
  archiveModeActive: boolean;
  inactiveSurfaceMode: ViewerSurfaceMode;
  inactiveSurfacePreviewImageUrl: string;
  pickModeLabel: string;
  pickModeVisible: boolean;
  resetViewVisible: boolean;
  activeLang: 'de' | 'fr';
  readonlyViewer: boolean;
  tripFlowNodeMode: TripFlowNodeMode;
  tripFlowEdgeMode: TripFlowEdgeMode;
  tripFlowNodeModeOptions: TripFlowModeOption<TripFlowNodeMode>[];
  tripFlowEdgeModeOptions: TripFlowModeOption<TripFlowEdgeMode>[];
}

export interface ViewerResultsVm {
  routingState: 'idle' | 'searching' | 'results' | 'no_results' | 'error';
  connectionResults: ConnectionOption[];
  selectedConnectionId: string | null;
  noResultsMessage: string;
  getNodeLabel: (id: string) => string;
  formatDuration: (minutes?: number) => string;
}

export interface ViewerRouteDetailsVm {
  selectedConnection: ConnectionOption | null;
  selectedWaitSegments: WaitSegment[];
  activeHoveredRouteEdgeId: string | null;
  showConnectionDetailsOnMap: boolean;
  getNodeLabel: (id: string) => string;
  getNodeName: (id: string) => string;
  getLocalizedNote: (note?: LocalizedText) => string | null;
  formatDuration: (minutes?: number) => string;
}

export interface ViewerPlaceDetailsVm {
  place: { id: string; name: string } | null;
  archiveSnippetUrl: string;
  archiveIiifInfoUrl: string;
  sidebarFacts: SidebarFact[];
  outgoingNodeTrips: SidebarNodeTrip[];
  incomingNodeTrips: SidebarNodeTrip[];
}

export interface ViewerSidebarVm {
  isOpen: boolean;
  title: string;
  routeResultsVisible: boolean;
  resultsVm: ViewerResultsVm;
  routeDetailsVm: ViewerRouteDetailsVm;
  placeDetailsVm: ViewerPlaceDetailsVm;
}

export interface ViewerRouteNodePanelVm {
  visible: boolean;
  node: { id: string; name: string } | null;
  snippetUrl: string | null;
  archiveIiifInfoUrl: string;
}

export interface ViewerMobileSheetVm {
  visible: boolean;
  snap: MobileSheetSnap;
  title: string;
  showResultsBack: boolean;
  mode: MobileSheetMode;
  resultsVm: ViewerResultsVm;
  routeDetailsVm: ViewerRouteDetailsVm;
  placeDetailsVm: ViewerPlaceDetailsVm;
}
