import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import type {
  ConnectionOption,
  EdgeTrip,
  EditionEntry,
  GraphAssertion,
  GraphEdge,
  GraphNode,
  GraphSnapshot,
  LocalizedText,
  TimeHHMM
} from '@ptt-kurskarten/shared';
import { Observable, forkJoin, map, shareReplay } from 'rxjs';
import { computeConnections } from '@viewer/routing-client';
import { environment } from '@env/environment';

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
  placeId: string;
  x: number;
  y: number;
  iiifCenterX: number | null;
  iiifCenterY: number | null;
  validFrom: NullableYear;
  validTo: NullableYear;
};

type StoredEdition = {
  id: string;
  year: number;
  title?: string;
  iiifRoute?: string;
  public?: boolean;
};

type StoredService = {
  id: string;
  linkId: string;
  fromPlaceId: string;
  toPlaceId: string;
  year: number;
  note?: LocalizedText | null;
};

type StoredServiceTrip = {
  id: string;
  serviceId: string;
  transport: EdgeTrip['transport'];
  departs: string | null;
  arrives: string | null;
  arrivalDayOffset: number;
  year: number;
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
  valueType?: GraphAssertion['valueType'];
  valueText?: string | null;
  valueNumber?: number | null;
  valueBoolean?: boolean | null;
  valueJson?: unknown | null;
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

type AssertionFilters = {
  year?: number;
  targetType?: string;
  targetId?: string;
};

type StaticGraphData = {
  places: StoredPlace[];
  placeNames: StoredPlaceName[];
  mapAnchors: StoredMapAnchor[];
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
          .filter((service) => coerceStoredServiceYear(service) === y)
          .filter((service) => activeNodeIds.has(service.fromPlaceId) && activeNodeIds.has(service.toPlaceId))
          .map((service) => materializeEdgeForYear(service, data, y))
          .filter((edge) => isEdgeActive(edge, y));
        return { year: y, nodes: activeNodes, edges: activeEdges };
      })
    );
  }

  getEditions(): Observable<EditionEntry[]> {
    if (!environment.useStaticGraphData) {
      return this.http.get<EditionEntry[]>(`${environment.apiBaseUrl}/editions`);
    }
    return this.loadStaticData().pipe(
      map((data) =>
        (data.editions ?? [])
          .map((edition) => ({
            id: edition.id,
            year: coerceYear(edition.year),
            title: edition.title,
            iiifRoute: typeof edition.iiifRoute === 'string' ? edition.iiifRoute.trim().replace(/\/+$/, '') : undefined,
            public: edition.public !== false
          }))
          .sort((a, b) => a.year - b.year)
      )
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

  getAssertions(filters?: AssertionFilters): Observable<GraphAssertion[]> {
    if (!environment.useStaticGraphData) {
      let params = new HttpParams();
      if (Number.isFinite(filters?.year)) {
        params = params.set('year', String(filters?.year));
      }
      const targetType = filters?.targetType?.trim();
      if (targetType) {
        params = params.set('targetType', targetType);
      }
      const targetId = filters?.targetId?.trim();
      if (targetId) {
        params = params.set('targetId', targetId);
      }
      return this.http.get<GraphAssertion[]>(`${environment.apiBaseUrl}/assertions`, { params });
    }
    return this.loadStaticData().pipe(
      map((data) =>
        (data.assertions ?? [])
          .filter((assertion) => (filters?.targetType ? assertion.targetType === filters.targetType : true))
          .filter((assertion) => (filters?.targetId ? assertion.targetId === filters.targetId : true))
          .filter((assertion) =>
            Number.isFinite(filters?.year)
              ? isStoredActive(assertion.validFrom ?? null, assertion.validTo ?? null, Number(filters?.year))
              : true
          )
          .map((assertion) => materializeAssertion(assertion))
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
  const nodes: GraphNode[] = [];
  for (const place of data.places) {
    const anchor = resolveAnchorForPlace(place.id, data, year);
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
    const hidden = data.assertions.some((assertion) => {
      if (assertion.targetType !== 'place' || assertion.targetId !== place.id) {
        return false;
      }
      if (assertion.schemaKey !== 'place.hidden' || assertion.valueBoolean !== true) {
        return false;
      }
      return isStoredActive(assertion.validFrom ?? null, assertion.validTo ?? null, year);
    });
    if (hidden) {
      continue;
    }
    nodes.push({
      id: place.id,
      name: placeName,
      x: anchor?.x ?? 0,
      y: anchor?.y ?? 0,
      validFrom: place.validFrom ?? 1852,
      validTo: place.validTo ?? undefined,
      foreign: foreign ? true : undefined,
      iiifCenterX: anchor?.iiifCenterX ?? undefined,
      iiifCenterY: anchor?.iiifCenterY ?? undefined
    });
  }
  return nodes;
}

function materializeEdgeForYear(service: StoredService, data: StaticGraphData, year: number): GraphEdge {
  const serviceYear = coerceStoredServiceYear(service);
  const trips = data.serviceTrips
    .filter((trip) => trip.serviceId === service.id)
    .filter((trip) => coerceStoredTripYear(trip, serviceYear) === year)
    .map((trip) => ({
      id: trip.id,
      transport: trip.transport ?? 'postkutsche',
      departs: normalizeTimeHHMM(trip.departs),
      arrives: normalizeTimeHHMM(trip.arrives),
      arrivalDayOffset: normalizeDayOffset(trip.arrivalDayOffset)
    }));
  const distance = data.linkMeasures
    .filter((measure) =>
      measure.linkId === service.linkId &&
      (measure.measureKey === 'distance' || measure.measureKey === 'distance.leuge')
    )
    .filter((measure) => isStoredActive(measure.validFrom, measure.validTo, year))
    .sort((a, b) => {
      const aExact = a.validFrom === year && a.validTo === year ? 1 : 0;
      const bExact = b.validFrom === year && b.validTo === year ? 1 : 0;
      if (aExact !== bExact) {
        return bExact - aExact;
      }
      const aFrom = a.validFrom ?? Number.NEGATIVE_INFINITY;
      const bFrom = b.validFrom ?? Number.NEGATIVE_INFINITY;
      return bFrom - aFrom;
    })
    .find((measure) => measure.valueNumber !== null)?.valueNumber;
  return {
    id: service.id,
    from: service.fromPlaceId,
    to: service.toPlaceId,
    distance: distance ?? undefined,
    validFrom: serviceYear,
    validTo: undefined,
    notes: service.note ?? undefined,
    trips
  };
}

function materializeAssertion(assertion: StoredAssertion): GraphAssertion {
  const valueType = normalizeAssertionValueType(assertion);
  return {
    id: assertion.id,
    targetType: assertion.targetType,
    targetId: assertion.targetId,
    schemaKey: assertion.schemaKey,
    valueType,
    valueText: assertion.valueText ?? null,
    valueNumber: assertion.valueNumber ?? null,
    valueBoolean: assertion.valueBoolean ?? null,
    valueJson: assertion.valueJson ?? null,
    validFrom: assertion.validFrom ?? null,
    validTo: assertion.validTo ?? null
  };
}

function normalizeAssertionValueType(assertion: StoredAssertion): GraphAssertion['valueType'] {
  if (
    assertion.valueType === 'string' ||
    assertion.valueType === 'number' ||
    assertion.valueType === 'boolean' ||
    assertion.valueType === 'json'
  ) {
    return assertion.valueType;
  }
  if (assertion.valueText !== null && assertion.valueText !== undefined) {
    return 'string';
  }
  if (assertion.valueNumber !== null && assertion.valueNumber !== undefined) {
    return 'number';
  }
  if (assertion.valueBoolean !== null && assertion.valueBoolean !== undefined) {
    return 'boolean';
  }
  if (assertion.valueJson !== null && assertion.valueJson !== undefined) {
    return 'json';
  }
  return undefined;
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
  const matching = data.mapAnchors
    .filter((anchor) => anchor.placeId === placeId)
    .filter((anchor) => isStoredActive(anchor.validFrom, anchor.validTo, year));
  if (matching.length) {
    matching.sort((a, b) => {
      const aExact = a.validFrom === year && a.validTo === year ? 1 : 0;
      const bExact = b.validFrom === year && b.validTo === year ? 1 : 0;
      if (aExact !== bExact) {
        return bExact - aExact;
      }
      const aFrom = a.validFrom ?? Number.NEGATIVE_INFINITY;
      const bFrom = b.validFrom ?? Number.NEGATIVE_INFINITY;
      if (aFrom !== bFrom) {
        return bFrom - aFrom;
      }
      const aTo = a.validTo ?? Number.POSITIVE_INFINITY;
      const bTo = b.validTo ?? Number.POSITIVE_INFINITY;
      return aTo - bTo;
    });
    return matching[0];
  }
  return data.mapAnchors.find((anchor) => anchor.placeId === placeId) ?? null;
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
  if (!years.size) {
    return [1852];
  }
  return [...years].sort((a, b) => a - b);
}

function coerceStoredServiceYear(service: StoredService): number {
  return typeof service.year === 'number' && Number.isFinite(service.year) ? service.year : 1852;
}

function coerceStoredTripYear(trip: StoredServiceTrip, fallbackYear: number): number {
  return typeof trip.year === 'number' && Number.isFinite(trip.year) ? trip.year : fallbackYear;
}
