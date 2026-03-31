import type { ConnectionOption, LocalizedText } from '@ptt-kurskarten/shared';
import type { WaitSegment } from '@shared-ui/routing/connection-details.util';
import type {
  MobileSheetMode,
  SidebarFact,
  SidebarNodeTrip,
  ViewerFloatingActionsVm,
  ViewerHeaderVm,
  ViewerMobileSheetVm,
  ViewerPlaceDetailsVm,
  ViewerResultsVm,
  ViewerRouteDetailsVm,
  ViewerRouteNodePanelVm,
  ViewerSidebarVm,
  ViewerSurfaceMode,
} from '@viewer/viewer.models';
import { formatDuration } from '@viewer/utils/viewer-routing.util';

type ViewerResultsState = ViewerResultsVm['routingState'];
type ViewerPickTarget = 'from' | 'to' | null;

export function buildHeaderVm(params: {
  archiveModeActive: boolean;
  routePlannerOpen: boolean;
  smallScreenLayout: boolean;
  orbitVisible: boolean;
  simulationMinute: number;
  year: number;
  editionTitle: string;
  publicEditionOptions: ViewerHeaderVm['publicEditionOptions'];
  selectedEditionLabel: string;
  placeSearchQuery: string;
  placeSearchOpen: boolean;
  placeSearchActiveIndex: number;
  placeSearchResults: ViewerHeaderVm['placeSearchResults'];
}): ViewerHeaderVm {
  return { ...params };
}

export function buildResultsVm(params: {
  routingState: ViewerResultsState;
  connectionResults: ConnectionOption[];
  selectedConnectionId: string | null;
  noResultsMessage: string;
  getNodeLabel: (id: string) => string;
}): ViewerResultsVm {
  return {
    ...params,
    formatDuration,
  };
}

export function buildRouteDetailsVm(params: {
  selectedConnection: ConnectionOption | null;
  selectedWaitSegments: WaitSegment[];
  activeHoveredRouteEdgeId: string | null;
  showConnectionDetailsOnMap: boolean;
  getNodeLabel: (id: string) => string;
  getNodeName: (id: string) => string;
  getLocalizedNote: (note?: LocalizedText) => string | null;
}): ViewerRouteDetailsVm {
  return {
    ...params,
    formatDuration,
  };
}

export function buildPlaceDetailsVm(params: {
  place: { id: string; name: string } | null;
  archiveSnippetUrl: string;
  archiveIiifInfoUrl: string;
  sidebarFacts: SidebarFact[];
  outgoingNodeTrips: SidebarNodeTrip[];
  incomingNodeTrips: SidebarNodeTrip[];
}): ViewerPlaceDetailsVm {
  return { ...params };
}

export function buildSidebarVm(params: {
  isOpen: boolean;
  routeResultsVisible: boolean;
  routeSidebarTitle: string;
  sidebarPlaceNodeName: string | null;
  detailsLabel: string;
  resultsVm: ViewerResultsVm;
  routeDetailsVm: ViewerRouteDetailsVm;
  placeDetailsVm: ViewerPlaceDetailsVm;
}): ViewerSidebarVm {
  return {
    isOpen: params.isOpen,
    title: params.routeResultsVisible
      ? params.routeSidebarTitle
      : (params.sidebarPlaceNodeName ?? params.detailsLabel),
    routeResultsVisible: params.routeResultsVisible,
    resultsVm: params.resultsVm,
    routeDetailsVm: params.routeDetailsVm,
    placeDetailsVm: params.placeDetailsVm,
  };
}

export function buildRouteNodePanelVm(params: {
  visible: boolean;
  node: { id: string; name: string } | null;
  snippetUrl: string | null;
  archiveIiifInfoUrl: string;
}): ViewerRouteNodePanelVm {
  return { ...params };
}

export function buildMobileSheetVm(params: {
  visible: boolean;
  snap: ViewerMobileSheetVm['snap'];
  title: string;
  showResultsBack: boolean;
  mode: MobileSheetMode;
  resultsVm: ViewerResultsVm;
  routeDetailsVm: ViewerRouteDetailsVm;
  placeDetailsVm: ViewerPlaceDetailsVm;
}): ViewerMobileSheetVm {
  return { ...params };
}

export function buildFloatingActionsVm(params: {
  helpOpen: boolean;
  settingsOpen: boolean;
  actionStackBottomOffset: number;
  archiveModeEnabled: boolean;
  archiveModeActive: boolean;
  inactiveSurfaceMode: ViewerSurfaceMode;
  inactiveSurfacePreviewImageUrl: string;
  pickModeLabel: string;
  pickTarget: ViewerPickTarget;
  activeLang: 'de' | 'fr';
  readonlyViewer: boolean;
  tripFlowNodeMode: ViewerFloatingActionsVm['tripFlowNodeMode'];
  tripFlowEdgeMode: ViewerFloatingActionsVm['tripFlowEdgeMode'];
  tripFlowNodeModeOptions: ViewerFloatingActionsVm['tripFlowNodeModeOptions'];
  tripFlowEdgeModeOptions: ViewerFloatingActionsVm['tripFlowEdgeModeOptions'];
}): ViewerFloatingActionsVm {
  return {
    helpOpen: params.helpOpen,
    settingsOpen: params.settingsOpen,
    actionStackBottomOffset: params.actionStackBottomOffset,
    archiveModeEnabled: params.archiveModeEnabled,
    archiveModeActive: params.archiveModeActive,
    inactiveSurfaceMode: params.inactiveSurfaceMode,
    inactiveSurfacePreviewImageUrl: params.inactiveSurfacePreviewImageUrl,
    pickModeLabel: params.pickModeLabel,
    pickModeVisible: !params.archiveModeActive && !!params.pickTarget,
    resetViewVisible: !params.archiveModeActive,
    activeLang: params.activeLang,
    readonlyViewer: params.readonlyViewer,
    tripFlowNodeMode: params.tripFlowNodeMode,
    tripFlowEdgeMode: params.tripFlowEdgeMode,
    tripFlowNodeModeOptions: params.tripFlowNodeModeOptions,
    tripFlowEdgeModeOptions: params.tripFlowEdgeModeOptions,
  };
}
