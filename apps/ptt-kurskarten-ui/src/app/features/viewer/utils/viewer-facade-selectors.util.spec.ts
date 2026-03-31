import type {
  ConnectionOption,
  GraphAssertion,
  GraphSnapshot,
  LocalizedText,
} from '@ptt-kurskarten/shared';
import { describe, expect, it } from 'vitest';
import {
  buildMobileSheetTitle,
  buildNoResultsMessage,
  buildRouteSidebarTitle,
  buildSidebarFacts,
  buildSidebarNodeTrips,
  getLocalizedNoteValue,
  resolveSchemaKeyDisplayLabel,
} from './viewer-facade-selectors.util';

function buildAssertion(partial: Partial<GraphAssertion> = {}): GraphAssertion {
  return {
    id: partial.id ?? 'fact-1',
    targetType: partial.targetType ?? 'place',
    targetId: partial.targetId ?? 'place-a',
    schemaKey: partial.schemaKey ?? 'identifier.wikidata',
    valueType: partial.valueType ?? 'string',
    valueText: partial.valueText ?? 'Q42',
    valueNumber: partial.valueNumber ?? null,
    valueBoolean: partial.valueBoolean ?? null,
    valueJson: partial.valueJson ?? null,
    validFrom: partial.validFrom,
    validTo: partial.validTo,
  };
}

function buildSnapshot(): GraphSnapshot {
  return {
    year: 1852,
    nodes: [
      { id: 'place-a', name: 'Luzern', x: 0, y: 0, validFrom: 1800 },
      { id: 'place-b', name: 'Bern', x: 0, y: 0, validFrom: 1800 },
      { id: 'place-c', name: 'Basel', x: 0, y: 0, validFrom: 1800 },
    ],
    edges: [
      {
        id: 'edge-out',
        from: 'place-a',
        to: 'place-b',
        validFrom: 1800,
        trips: [
          { id: 'trip-out-late', transport: 'postkutsche', departs: '09:15', arrives: '10:00' },
          { id: 'trip-out-early', transport: 'postkutsche', departs: '08:00', arrives: '08:45' },
        ],
      },
      {
        id: 'edge-in',
        from: 'place-c',
        to: 'place-a',
        validFrom: 1800,
        trips: [{ id: 'trip-in', transport: 'postkutsche', arrives: '07:30' }],
      },
    ],
  };
}

function buildConnection(partial: Partial<ConnectionOption> = {}): ConnectionOption {
  return {
    id: partial.id ?? 'route-1',
    year: partial.year ?? 1852,
    from: partial.from ?? 'place-a',
    to: partial.to ?? 'place-b',
    requestedDepart: partial.requestedDepart ?? '08:00',
    departs: partial.departs ?? '08:00',
    arrives: partial.arrives ?? '09:00',
    durationMinutes: partial.durationMinutes ?? 60,
    legs: partial.legs ?? [
      {
        edgeId: 'edge-out',
        tripId: 'trip-out',
        from: 'place-a',
        to: 'place-b',
        transport: 'postkutsche',
        departs: '08:00',
        arrives: '09:00',
      },
    ],
    kind: partial.kind ?? 'COMPLETE_JOURNEY',
  };
}

describe('viewer-facade-selectors util', () => {
  it('builds sidebar facts and filters hidden or foreign schema keys', () => {
    const facts = buildSidebarFacts(
      [
        buildAssertion({ id: 'visible', schemaKey: 'identifier.wikidata', valueText: 'Q72' }),
        buildAssertion({ id: 'hidden', schemaKey: 'place.hidden', valueText: 'true' }),
        buildAssertion({ id: 'foreign', schemaKey: 'place.is_foreign', valueText: 'true' }),
      ],
      'place-a',
      (key) => (key === 'schemaKey.identifier_wikidata' ? 'Wikidata' : key),
    );

    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({
      id: 'visible',
      schemaLabel: 'Wikidata',
      label: 'Q72',
      url: 'https://www.wikidata.org/wiki/Q72',
    });
  });

  it('sorts outgoing and incoming sidebar trips by their timetable order', () => {
    const snapshot = buildSnapshot();

    const outgoing = buildSidebarNodeTrips(snapshot, 'place-a', 'outgoing');
    const incoming = buildSidebarNodeTrips(snapshot, 'place-a', 'incoming');

    expect(outgoing.map((trip) => trip.tripId)).toEqual(['trip-out-early', 'trip-out-late']);
    expect(outgoing[0]?.nodeName).toBe('Bern');
    expect(incoming.map((trip) => trip.tripId)).toEqual(['trip-in']);
    expect(incoming[0]?.nodeName).toBe('Basel');
  });

  it('derives route/sidebar/mobile labels and no-results messages from pure inputs', () => {
    expect(
      buildRouteSidebarTitle({
        selectedConnection: buildConnection(),
        fromId: '',
        toId: '',
        getNodeLabel: (id) => `Node ${id}`,
        detailsLabel: 'Details',
      }),
    ).toBe('Node place-a → Node place-b');

    expect(
      buildMobileSheetTitle({
        mode: 'details',
        routeNodePanelNodeName: null,
        sidebarPlaceNodeName: 'Luzern',
        detailsLabel: 'Details',
        resultsLabel: 'Results',
        plannerTitle: 'Routing',
      }),
    ).toBe('Luzern');

    expect(
      buildNoResultsMessage({
        fromId: '',
        toId: '',
        nodes: buildSnapshot().nodes,
        lastResultParams: null,
        year: 1852,
        noInputLabel: 'Choose places',
        noRouteYearLabel: 'Missing in year',
        noRouteNotYetLabel: 'Not yet in 1852',
        noRouteTimeLabel: 'No route at time',
      }),
    ).toBe('Choose places');

    expect(
      buildNoResultsMessage({
        fromId: 'place-a',
        toId: 'place-b',
        nodes: buildSnapshot().nodes,
        lastResultParams: { from: 'place-a', to: 'place-b', year: 1851 },
        year: 1852,
        noInputLabel: 'Choose places',
        noRouteYearLabel: 'Missing in year',
        noRouteNotYetLabel: 'Not yet in 1852',
        noRouteTimeLabel: 'No route at time',
      }),
    ).toBe('Not yet in 1852');
  });

  it('localizes notes and falls back to the raw schema key when translation is missing', () => {
    const note: LocalizedText = { de: ' Hinweis ', fr: 'Remarque' };

    expect(getLocalizedNoteValue(note, 'de')).toBe(' Hinweis ');
    expect(resolveSchemaKeyDisplayLabel('identifier.unknown-key', (key) => key)).toBe(
      'identifier.unknown-key',
    );
  });
});
