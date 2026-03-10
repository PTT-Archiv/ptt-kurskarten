import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import type { ConnectionOption, EdgeTrip, GraphEdge, GraphNode, GraphSnapshot, LocalizedText, TimeHHMM } from '@ptt-kurskarten/shared';
import { Observable, forkJoin, map, shareReplay } from 'rxjs';
import { computeConnections } from './routing-client';
import { environment } from '../../../environments/environment';

type NullableYear = number | null;

type StoredPlace = {
  id: string;
  defaultName: string;
  validFrom: NullableYear;
  validTo: NullableYear;
};

type StoredPlaceName = {
  id: string;
  placeId: string;
  lang: string;
  name: string;
  preferred?: boolean;
  validFrom: NullableYear;
  validTo: NullableYear;
};

type StoredMapAnchor = {
  id: string;
  mapTemplateId: string;
  placeId: string;
  x: number;
  y: number;
  iiifCenterX: number | null;
  iiifCenterY: number | null;
  validFrom: NullableYear;
  validTo: NullableYear;
};

type StoredEditionAnchorOverride = {
  id: string;
  editionId: string;
  placeId: string;
  x: number;
  y: number;
  iiifCenterX: number | null;
  iiifCenterY: number | null;
  validFrom?: NullableYear;
  validTo?: NullableYear;
};

type StoredEdition = {
  id: string;
  year: number;
  mapTemplateId: string;
};

type StoredService = {
  id: string;
  linkId: string;
  fromPlaceId: string;
  toPlaceId: string;
  validFrom: NullableYear;
  validTo: NullableYear;
  note?: LocalizedText | null;
};

type StoredServiceTrip = {
  id: string;
  serviceId: string;
  transport: EdgeTrip['transport'];
  departs: string | null;
  arrives: string | null;
  arrivalDayOffset: number;
  validFrom: NullableYear;
  validTo: NullableYear;
};

type StoredLinkMeasure = {
  id: string;
  linkId: string;
  measureKey: string;
  valueNumber: number | null;
  validFrom: NullableYear;
  validTo: NullableYear;
};

type StoredAssertion = {
  id: string;
  targetType: string;
  targetId: string;
  schemaKey: string;
  valueBoolean?: boolean | null;
  validFrom?: NullableYear;
  validTo?: NullableYear;
};

type ConnectionsRequest = {
  year: number;
  from: string;
  to: string;
  depart: TimeHHMM;
  k?: number;
  allowForeignStartFallback?: boolean;
};

type StaticGraphData = {
  places: StoredPlace[];
  placeNames: StoredPlaceName[];
  mapAnchors: StoredMapAnchor[];
  editionAnchorOverrides: StoredEditionAnchorOverride[];
  editions: StoredEdition[];
  services: StoredService[];
  serviceTrips: StoredServiceTrip[];
  linkMeasures: StoredLinkMeasure[];
  assertions: StoredAssertion[];
  availableYears: number[];
};

@Injectable({ providedIn: 'root' })
export class ViewerDataService {
  private readonly http = inject(HttpClient);
  private staticData$: Observable<StaticGraphData> | null = null;

  getYears(): Observable<number[]> {
    if (!environment.useStaticGraphData) {
      return this.http.get<number[]>(`${environment.apiBaseUrl}/years`);
    }
    return this.loadStaticData().pipe(map((data) => data.availableYears));
  }

  getGraph(year: number): Observable<GraphSnapshot> {
    if (!environment.useStaticGraphData) {
      return this.http.get<GraphSnapshot>(`${environment.apiBaseUrl}/graph?year=${year}`);
    }
    return this.loadStaticData().pipe(
      map((data) => {
        const y = coerceYear(year);
        const activeNodes = materializeNodesForYear(data, y).filter((node) => isNodeActive(node, y));
        const activeNodeIds = new Set(activeNodes.map((node) => node.id));
        const activeEdges = data.services
          .filter((service) => isStoredActive(service.validFrom, service.validTo, y))
          .filter((service) => activeNodeIds.has(service.fromPlaceId) && activeNodeIds.has(service.toPlaceId))
          .map((service) => materializeEdgeForYear(service, data, y))
          .filter((edge) => isEdgeActive(edge, y));
        return { year: y, nodes: activeNodes, edges: activeEdges };
      })
    );
  }

  getNodeAliases(year: number): Observable<Record<string, string[]>> {
    if (!environment.useStaticGraphData) {
      return this.http.get<Record<string, string[]>>(`${environment.apiBaseUrl}/place-aliases?year=${year}`);
    }
    return this.loadStaticData().pipe(
      map((data) => {
        const y = coerceYear(year);
        return buildNodeAliasesForYear(data, y);
      })
    );
  }

  getConnections(request: ConnectionsRequest): Observable<ConnectionOption[]> {
    if (!environment.useStaticGraphData) {
      const params = new HttpParams()
        .set('year', String(request.year))
        .set('from', request.from)
        .set('to', request.to)
        .set('depart', request.depart)
        .set('k', String(request.k ?? 10))
        .set('allowForeignStartFallback', String(request.allowForeignStartFallback ?? true));
      return this.http.get<ConnectionOption[]>(`${environment.apiBaseUrl}/connections`, { params });
    }

    return this.getGraph(request.year).pipe(
      map((snapshot) =>
        computeConnections(snapshot, {
          year: request.year,
          from: request.from,
          to: request.to,
          depart: request.depart,
          k: request.k,
          allowForeignStartFallback: request.allowForeignStartFallback
        })
      )
    );
  }

  private loadStaticData(): Observable<StaticGraphData> {
    if (!this.staticData$) {
      const base = environment.staticGraphDataPath.replace(/\/$/, '');
      this.staticData$ = forkJoin({
        places: this.http.get<StoredPlace[]>(`${base}/places.json`),
        placeNames: this.http.get<StoredPlaceName[]>(`${base}/place_names.json`),
        mapAnchors: this.http.get<StoredMapAnchor[]>(`${base}/map_anchors.json`),
        editionAnchorOverrides: this.http.get<StoredEditionAnchorOverride[]>(`${base}/edition_anchor_overrides.json`),
        editions: this.http.get<StoredEdition[]>(`${base}/editions.json`),
        services: this.http.get<StoredService[]>(`${base}/services.json`),
        serviceTrips: this.http.get<StoredServiceTrip[]>(`${base}/service_trips.json`),
        linkMeasures: this.http.get<StoredLinkMeasure[]>(`${base}/link_measures.json`),
        assertions: this.http.get<StoredAssertion[]>(`${base}/assertions.json`)
      }).pipe(
        map((raw) => ({
          ...raw,
          places: raw.places ?? [],
          placeNames: raw.placeNames ?? [],
          mapAnchors: raw.mapAnchors ?? [],
          editionAnchorOverrides: raw.editionAnchorOverrides ?? [],
          editions: raw.editions ?? [],
          services: raw.services ?? [],
          serviceTrips: raw.serviceTrips ?? [],
          linkMeasures: raw.linkMeasures ?? [],
          assertions: raw.assertions ?? [],
          availableYears: collectAvailableYears(raw.places ?? [], raw.services ?? [], raw.editions ?? [])
        })),
        shareReplay(1)
      );
    }
    return this.staticData$;
  }
}

function materializeNodesForYear(data: StaticGraphData, year: number): GraphNode[] {
  return data.places.map((place) => {
    const edition = resolveEditionForYear(data.editions, year);
    const anchor = resolveAnchorForPlace(place.id, edition, data, year);
    const placeName = resolvePlaceName(place, data.placeNames, year);
    const foreign = data.assertions.some((assertion) => {
      if (assertion.targetType !== 'place' || assertion.targetId !== place.id) {
        return false;
      }
      if (assertion.schemaKey !== 'place.is_foreign' || assertion.valueBoolean !== true) {
        return false;
      }
      return isStoredActive(assertion.validFrom ?? null, assertion.validTo ?? null, year);
    });

    return {
      id: place.id,
      name: placeName,
      x: anchor?.x ?? 0,
      y: anchor?.y ?? 0,
      validFrom: pickValidFrom(place.validFrom, anchor?.validFrom),
      validTo: pickValidTo(place.validTo, anchor?.validTo) ?? undefined,
      foreign: foreign ? true : undefined,
      iiifCenterX: anchor?.iiifCenterX ?? undefined,
      iiifCenterY: anchor?.iiifCenterY ?? undefined
    };
  });
}

function materializeEdgeForYear(service: StoredService, data: StaticGraphData, year: number): GraphEdge {
  const trips = data.serviceTrips
    .filter((trip) => trip.serviceId === service.id)
    .filter((trip) => isStoredActive(trip.validFrom, trip.validTo, year))
    .map((trip) => ({
      id: trip.id,
      transport: trip.transport ?? 'postkutsche',
      departs: normalizeTimeHHMM(trip.departs),
      arrives: (trip.arrives ?? '') as EdgeTrip['arrives'],
      arrivalDayOffset: normalizeDayOffset(trip.arrivalDayOffset)
    }));
  const leuge = data.linkMeasures
    .filter((measure) => measure.linkId === service.linkId && measure.measureKey === 'distance.leuge')
    .filter((measure) => isStoredActive(measure.validFrom, measure.validTo, year))
    .find((measure) => measure.valueNumber !== null)?.valueNumber;
  return {
    id: service.id,
    from: service.fromPlaceId,
    to: service.toPlaceId,
    leuge: leuge ?? undefined,
    validFrom: service.validFrom ?? 1852,
    validTo: service.validTo ?? undefined,
    notes: service.note ?? undefined,
    trips
  };
}

function buildNodeAliasesForYear(data: StaticGraphData, year: number): Record<string, string[]> {
  const nodes = materializeNodesForYear(data, year);
  const canonicalById = new Map(nodes.map((node) => [node.id, normalizeSearchToken(node.name)]));
  const out: Record<string, string[]> = {};

  for (const node of nodes) {
    const canonical = canonicalById.get(node.id) ?? '';
    const labels = new Set<string>();
    const names = data.placeNames
      .filter((entry) => entry.placeId === node.id)
      .filter((entry) => isStoredActive(entry.validFrom, entry.validTo, year));
    for (const entry of names) {
      const label = (entry.name ?? '').trim();
      if (!label) {
        continue;
      }
      const normalized = normalizeSearchToken(label);
      if (!normalized || normalized === canonical) {
        continue;
      }
      labels.add(label);
    }
    out[node.id] = [...labels];
  }

  return out;
}

function resolvePlaceName(place: StoredPlace, placeNames: StoredPlaceName[], year: number): string {
  const names = placeNames
    .filter((name) => name.placeId === place.id)
    .filter((name) => isStoredActive(name.validFrom, name.validTo, year))
    .sort((a, b) => {
      const aPreferred = a.preferred ? 0 : 1;
      const bPreferred = b.preferred ? 0 : 1;
      if (aPreferred !== bPreferred) {
        return aPreferred - bPreferred;
      }
      return langPriority(a.lang) - langPriority(b.lang);
    });
  return names[0]?.name ?? place.defaultName ?? place.id;
}

function resolveAnchorForPlace(
  placeId: string,
  edition: StoredEdition | null,
  data: StaticGraphData,
  year: number
): {
  x: number;
  y: number;
  iiifCenterX: number | null;
  iiifCenterY: number | null;
  validFrom: NullableYear;
  validTo: NullableYear;
} | null {
  if (edition) {
    const override = data.editionAnchorOverrides.find((entry) => entry.editionId === edition.id && entry.placeId === placeId);
    if (override) {
      return {
        x: override.x,
        y: override.y,
        iiifCenterX: override.iiifCenterX ?? null,
        iiifCenterY: override.iiifCenterY ?? null,
        validFrom: override.validFrom ?? edition.year,
        validTo: override.validTo ?? null
      };
    }
  }

  const templateId = edition?.mapTemplateId ?? data.mapAnchors[0]?.mapTemplateId;
  const matching = data.mapAnchors
    .filter((anchor) => anchor.placeId === placeId && (!templateId || anchor.mapTemplateId === templateId))
    .filter((anchor) => isStoredActive(anchor.validFrom, anchor.validTo, year));
  if (matching.length) {
    return matching[0];
  }
  return data.mapAnchors.find((anchor) => anchor.placeId === placeId) ?? null;
}

function resolveEditionForYear(editions: StoredEdition[], year: number): StoredEdition | null {
  if (!editions.length) {
    return null;
  }
  const exact = editions.find((edition) => edition.year === year);
  if (exact) {
    return exact;
  }
  const sorted = [...editions].sort((a, b) => a.year - b.year);
  const before = sorted.filter((edition) => edition.year <= year);
  if (before.length) {
    return before[before.length - 1];
  }
  return sorted[0];
}

function pickValidFrom(...values: Array<NullableYear | undefined>): number {
  const numeric = values.filter((value): value is number => value !== null && value !== undefined);
  if (!numeric.length) {
    return 1852;
  }
  return Math.max(...numeric);
}

function pickValidTo(...values: Array<NullableYear | undefined>): NullableYear {
  const numeric = values.filter((value): value is number => value !== null && value !== undefined);
  if (!numeric.length) {
    return null;
  }
  return Math.min(...numeric);
}

function normalizeDayOffset(value: number | null | undefined): 0 | 1 | 2 {
  if (value === 1 || value === 2) {
    return value;
  }
  return 0;
}

function normalizeTimeHHMM(value: string | null | undefined): TimeHHMM | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!/^\d{2}:\d{2}$/.test(trimmed)) {
    return undefined;
  }
  return trimmed as TimeHHMM;
}

function normalizeSearchToken(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, '')
    .toLowerCase()
    .trim();
}

function langPriority(lang: string): number {
  const order = ['de', 'fr', 'it', 'en', 'und'];
  const index = order.indexOf(lang);
  return index === -1 ? order.length : index;
}

function coerceYear(year: number): number {
  return Number.isFinite(year) ? year : 1852;
}

function isStoredActive(validFrom: NullableYear, validTo: NullableYear, year: number): boolean {
  const from = validFrom ?? Number.NEGATIVE_INFINITY;
  const to = validTo ?? Number.POSITIVE_INFINITY;
  return from <= year && year <= to;
}

function isNodeActive(node: GraphNode, year: number): boolean {
  return node.validFrom <= year && (node.validTo === undefined || year <= node.validTo);
}

function isEdgeActive(edge: GraphEdge, year: number): boolean {
  return edge.validFrom <= year && (edge.validTo === undefined || year <= edge.validTo);
}

function collectAvailableYears(places: StoredPlace[], services: StoredService[], editions: StoredEdition[]): number[] {
  const years = new Set<number>();
  for (const edition of editions) {
    if (Number.isFinite(edition.year)) {
      years.add(edition.year);
    }
  }
  for (const place of places) {
    if (place.validFrom !== null && place.validFrom !== undefined) {
      years.add(place.validFrom);
    }
    if (place.validTo !== null && place.validTo !== undefined) {
      years.add(place.validTo);
    }
  }
  for (const service of services) {
    if (service.validFrom !== null && service.validFrom !== undefined) {
      years.add(service.validFrom);
    }
    if (service.validTo !== null && service.validTo !== undefined) {
      years.add(service.validTo);
    }
  }
  if (!years.size) {
    return [1852];
  }
  return [...years].sort((a, b) => a - b);
}
