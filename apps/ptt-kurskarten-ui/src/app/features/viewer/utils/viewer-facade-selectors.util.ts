import type {
  ConnectionOption,
  GraphAssertion,
  GraphNode,
  GraphSnapshot,
  LocalizedText,
} from '@ptt-kurskarten/shared';
import {
  buildArchiveSnippetUrlForNode,
  type ArchiveTransform,
} from '@shared-ui/archive/archive-snippet.util';
import type { MobileSheetMode, SidebarFact, SidebarNodeTrip } from '@viewer/viewer.models';
import { assertionValueToString, resolveFactLink } from '@viewer/utils/viewer-facts.util';
import { getNodeById, tripSortValue } from '@viewer/utils/viewer-node-selectors.util';

const EMPTY_TEXT = '';
const PICK_TARGET_FROM = 'from';
const PICK_TARGET_TO = 'to';
const MOBILE_SHEET_MODE_DETAILS: MobileSheetMode = 'details';
const MOBILE_SHEET_MODE_PLANNER: MobileSheetMode = 'planner';
const MOBILE_SHEET_MODE_RESULTS: MobileSheetMode = 'results';
export const SIDEBAR_TRIP_DIRECTION_INCOMING = 'incoming';
export const SIDEBAR_TRIP_DIRECTION_OUTGOING = 'outgoing';
const PLACE_HIDDEN_SCHEMA_KEY = 'place.hidden';
const PLACE_FOREIGN_SCHEMA_KEY = 'place.is_foreign';
const SCHEMA_KEY_NORMALIZE_PATTERN = /[^a-z0-9]+/g;
const SCHEMA_KEY_TRIM_PATTERN = /^_+|_+$/g;

type SidebarTripDirection =
  | typeof SIDEBAR_TRIP_DIRECTION_INCOMING
  | typeof SIDEBAR_TRIP_DIRECTION_OUTGOING;

type ViewerPickTarget = typeof PICK_TARGET_FROM | typeof PICK_TARGET_TO | null;
type RoutingYearResult = { from: string; to: string; year: number } | null;
type ViewerTranslate = (key: string) => string;

export function buildPulseNodeIds(
  transientPulseIds: Set<string>,
  previewIds: { fromPreviewId: string; toPreviewId: string; placePreviewId: string },
): Set<string> {
  const ids = new Set(transientPulseIds);

  if (previewIds.fromPreviewId) {
    ids.add(previewIds.fromPreviewId);
  }
  if (previewIds.toPreviewId) {
    ids.add(previewIds.toPreviewId);
  }
  if (previewIds.placePreviewId) {
    ids.add(previewIds.placePreviewId);
  }

  return ids;
}

export function buildSidebarFacts(
  assertions: GraphAssertion[],
  placeId: string | null,
  translateSchemaKey: ViewerTranslate,
): SidebarFact[] {
  if (!placeId) {
    return [];
  }

  return assertions
    .filter((assertion) => assertion.targetType === 'place' && assertion.targetId === placeId)
    .filter(
      (assertion) =>
        assertion.schemaKey !== PLACE_HIDDEN_SCHEMA_KEY &&
        assertion.schemaKey !== PLACE_FOREIGN_SCHEMA_KEY,
    )
    .map((assertion) => mapSidebarFact(assertion, translateSchemaKey))
    .filter((fact): fact is SidebarFact => fact !== null);
}

export function buildSidebarNodeTrips(
  snapshot: GraphSnapshot | null,
  placeId: string | null,
  direction: SidebarTripDirection,
): SidebarNodeTrip[] {
  if (!snapshot || !placeId) {
    return [];
  }

  const rows: SidebarNodeTrip[] = [];
  const isOutgoing = direction === SIDEBAR_TRIP_DIRECTION_OUTGOING;

  snapshot.edges
    .filter((edge) => (isOutgoing ? edge.from === placeId : edge.to === placeId))
    .forEach((edge) => {
      const counterpartId = isOutgoing ? edge.to : edge.from;
      const counterpartNode = snapshot.nodes.find((node) => node.id === counterpartId);

      edge.trips.forEach((trip) => {
        rows.push({
          edgeId: edge.id,
          tripId: trip.id,
          nodeId: counterpartId,
          nodeName: counterpartNode?.name ?? counterpartId,
          transport: trip.transport,
          departs: trip.departs,
          arrives: trip.arrives,
          arrivalDayOffset: trip.arrivalDayOffset,
        });
      });
    });

  return rows.sort((left, right) => tripSortValue(left) - tripSortValue(right));
}

export function resolveSchemaKeyDisplayLabel(
  schemaKey: string,
  translateSchemaKey: ViewerTranslate,
): string {
  const normalized = schemaKey
    .trim()
    .toLowerCase()
    .replace(SCHEMA_KEY_NORMALIZE_PATTERN, '_')
    .replace(SCHEMA_KEY_TRIM_PATTERN, '');

  if (!normalized) {
    return schemaKey;
  }

  const translationKey = `schemaKey.${normalized}`;
  const translated = translateSchemaKey(translationKey);
  return !translated || translated === translationKey ? schemaKey : translated;
}

export function buildRouteSidebarTitle(params: {
  selectedConnection: ConnectionOption | null;
  fromId: string;
  toId: string;
  getNodeLabel: (id: string) => string;
  detailsLabel: string;
}): string {
  const from = params.selectedConnection?.from ?? params.fromId;
  const to = params.selectedConnection?.to ?? params.toId;

  if (!from || !to) {
    return params.detailsLabel;
  }

  return `${params.getNodeLabel(from)} → ${params.getNodeLabel(to)}`;
}

export function buildRouteNodePanelSnippetUrl(params: {
  graph: GraphSnapshot | null;
  nodeId: string | null;
  archiveTransform: ArchiveTransform;
  archiveIiifRoute: string;
}): string | null {
  const node = getNodeById(params.graph, params.nodeId);
  if (!node) {
    return null;
  }

  return buildArchiveSnippetUrlForNode(node, params.archiveTransform, params.archiveIiifRoute);
}

export function buildMobileSheetTitle(params: {
  mode: MobileSheetMode;
  routeNodePanelNodeName: string | null;
  sidebarPlaceNodeName: string | null;
  detailsLabel: string;
  resultsLabel: string;
  plannerTitle: string;
}): string {
  if (params.mode === MOBILE_SHEET_MODE_DETAILS) {
    return params.routeNodePanelNodeName ?? params.sidebarPlaceNodeName ?? params.detailsLabel;
  }
  if (params.mode === MOBILE_SHEET_MODE_RESULTS) {
    return params.resultsLabel;
  }
  if (params.mode === MOBILE_SHEET_MODE_PLANNER) {
    return params.plannerTitle;
  }
  return EMPTY_TEXT;
}

export function getLocalizedNoteValue(
  note: LocalizedText | undefined,
  lang: 'de' | 'fr',
): string | null {
  if (!note) {
    return null;
  }

  const value = (note as Record<string, string | undefined>)[lang] ?? note.de ?? note.fr;
  return value?.trim() ? value : null;
}

export function buildNoResultsMessage(params: {
  fromId: string;
  toId: string;
  nodes: GraphNode[];
  lastResultParams: RoutingYearResult;
  year: number;
  noInputLabel: string;
  noRouteYearLabel: string;
  noRouteNotYetLabel: string;
  noRouteTimeLabel: string;
}): string {
  if (!params.fromId || !params.toId || params.fromId === params.toId) {
    return params.noInputLabel;
  }

  const fromExists = params.nodes.some((node) => node.id === params.fromId);
  const toExists = params.nodes.some((node) => node.id === params.toId);

  if (!fromExists || !toExists) {
    return params.noRouteYearLabel;
  }

  const lastResult = params.lastResultParams;
  if (
    lastResult &&
    lastResult.from === params.fromId &&
    lastResult.to === params.toId &&
    lastResult.year !== params.year
  ) {
    return params.noRouteNotYetLabel;
  }

  return params.noRouteTimeLabel;
}

export function buildPickModeLabel(params: {
  target: ViewerPickTarget;
  pickModeFromLabel: string;
  pickModeToLabel: string;
}): string {
  if (params.target === PICK_TARGET_FROM) {
    return params.pickModeFromLabel;
  }
  if (params.target === PICK_TARGET_TO) {
    return params.pickModeToLabel;
  }
  return EMPTY_TEXT;
}

function mapSidebarFact(
  assertion: GraphAssertion,
  translateSchemaKey: ViewerTranslate,
): SidebarFact | null {
  const rawValue = assertionValueToString(assertion);
  if (!rawValue) {
    return null;
  }

  const link = resolveFactLink(assertion.schemaKey, rawValue);
  return {
    id: assertion.id,
    schemaKey: assertion.schemaKey,
    schemaLabel: resolveSchemaKeyDisplayLabel(assertion.schemaKey, translateSchemaKey),
    label: link.label,
    url: link.url,
  };
}
