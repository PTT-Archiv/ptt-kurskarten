import type { ConnectionOption } from '@ptt-kurskarten/shared';
import { describe, expect, it } from 'vitest';
import {
  buildFloatingActionsVm,
  buildMobileSheetVm,
  buildPlaceDetailsVm,
  buildResultsVm,
  buildRouteDetailsVm,
  buildSidebarVm,
} from './viewer-vm.util';

function buildConnection(partial: Partial<ConnectionOption> = {}): ConnectionOption {
  return {
    id: partial.id ?? 'route-1',
    year: partial.year ?? 1852,
    from: partial.from ?? 'node-a',
    to: partial.to ?? 'node-b',
    requestedDepart: partial.requestedDepart ?? '08:00',
    departs: partial.departs ?? '08:00',
    arrives: partial.arrives ?? '09:00',
    durationMinutes: partial.durationMinutes ?? 60,
    legs: partial.legs ?? [
      {
        edgeId: 'edge-1',
        tripId: 'trip-1',
        from: 'node-a',
        to: 'node-b',
        transport: 'postkutsche',
        departs: '08:00',
        arrives: '09:00',
      },
    ],
    kind: partial.kind ?? 'COMPLETE_JOURNEY',
  };
}

describe('viewer-vm util', () => {
  it('builds result and route detail VMs with formatter callbacks intact', () => {
    const selectedConnection = buildConnection();
    const resultsVm = buildResultsVm({
      routingState: 'results',
      connectionResults: [selectedConnection],
      selectedConnectionId: selectedConnection.id ?? null,
      noResultsMessage: 'No route',
      getNodeLabel: (id) => `Label ${id}`,
    });

    const routeDetailsVm = buildRouteDetailsVm({
      selectedConnection,
      selectedWaitSegments: [],
      activeHoveredRouteEdgeId: 'edge-1',
      showConnectionDetailsOnMap: true,
      getNodeLabel: (id) => `Label ${id}`,
      getNodeName: (id) => `Name ${id}`,
      getLocalizedNote: () => 'Localized',
    });

    expect(resultsVm.getNodeLabel('node-a')).toBe('Label node-a');
    expect(resultsVm.formatDuration(60)).toBe('1h 00m');
    expect(routeDetailsVm.getNodeName('node-b')).toBe('Name node-b');
    expect(routeDetailsVm.getLocalizedNote()).toBe('Localized');
  });

  it('derives sidebar and mobile sheet VMs from visibility/title inputs', () => {
    const resultsVm = buildResultsVm({
      routingState: 'idle',
      connectionResults: [],
      selectedConnectionId: null,
      noResultsMessage: 'No route',
      getNodeLabel: (id) => id,
    });
    const routeDetailsVm = buildRouteDetailsVm({
      selectedConnection: null,
      selectedWaitSegments: [],
      activeHoveredRouteEdgeId: null,
      showConnectionDetailsOnMap: false,
      getNodeLabel: (id) => id,
      getNodeName: (id) => id,
      getLocalizedNote: () => null,
    });
    const placeDetailsVm = buildPlaceDetailsVm({
      place: { id: 'node-a', name: 'Luzern' },
      archiveSnippetUrl: 'snippet.jpg',
      archiveIiifInfoUrl: 'info.json',
      sidebarFacts: [],
      outgoingNodeTrips: [],
      incomingNodeTrips: [],
    });

    const sidebarVm = buildSidebarVm({
      isOpen: true,
      routeResultsVisible: false,
      routeSidebarTitle: 'Route title',
      sidebarPlaceNodeName: 'Luzern',
      detailsLabel: 'Details',
      resultsVm,
      routeDetailsVm,
      placeDetailsVm,
    });
    const mobileSheetVm = buildMobileSheetVm({
      visible: true,
      snap: 'half',
      title: 'Results',
      showResultsBack: true,
      mode: 'results',
      resultsVm,
      routeDetailsVm,
      placeDetailsVm,
    });

    expect(sidebarVm.title).toBe('Luzern');
    expect(sidebarVm.isOpen).toBe(true);
    expect(mobileSheetVm.visible).toBe(true);
    expect(mobileSheetVm.mode).toBe('results');
    expect(mobileSheetVm.showResultsBack).toBe(true);
  });

  it('builds floating actions visibility from archive and pick state', () => {
    const floatingActionsVm = buildFloatingActionsVm({
      helpOpen: false,
      settingsOpen: true,
      actionStackBottomOffset: 24,
      archiveModeEnabled: true,
      archiveModeActive: false,
      inactiveSurfaceMode: 'archive',
      inactiveSurfacePreviewImageUrl: 'preview.png',
      pickModeLabel: 'Pick start',
      pickTarget: 'from',
      activeLang: 'de',
      readonlyViewer: false,
      tripFlowNodeMode: 'always-active',
      tripFlowEdgeMode: 'always-active',
      tripFlowNodeModeOptions: [],
      tripFlowEdgeModeOptions: [],
    });

    expect(floatingActionsVm.pickModeVisible).toBe(true);
    expect(floatingActionsVm.resetViewVisible).toBe(true);
    expect(floatingActionsVm.pickModeLabel).toBe('Pick start');
  });
});
