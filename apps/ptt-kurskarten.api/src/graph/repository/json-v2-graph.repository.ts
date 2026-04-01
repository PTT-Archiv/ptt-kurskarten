import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type {
  EdgeTrip,
  EditionEntry,
  GraphAssertion,
  GraphEdge,
  GraphNode,
  GraphNodePatch,
  GraphSnapshot,
  LocalizedText,
  NodeDetail,
  TimeHHMM,
  TransportType,
  Year,
} from '@ptt-kurskarten/shared';
import type { GraphRepository } from '../graph.repository';

type NullableYear = Year | null;

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
  normalized?: string;
  preferred?: boolean;
  nameType?: string;
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

type StoredLink = {
  id: string;
  placeAId: string;
  placeBId: string;
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

type StoredService = {
  id: string;
  linkId: string;
  fromPlaceId: string;
  toPlaceId: string;
  year: Year;
  note?: LocalizedText | null;
};

type StoredServiceTrip = {
  id: string;
  serviceId: string;
  transport: TransportType;
  departs: string | null;
  arrives: string | null;
  arrivalDayOffset: number;
  year: Year;
};

type StoredAssertion = {
  id: string;
  targetType: string;
  targetId: string;
  schemaKey: string;
  valueType?: 'string' | 'number' | 'boolean' | 'json';
  valueText?: string | null;
  valueNumber?: number | null;
  valueBoolean?: boolean | null;
  valueJson?: unknown | null;
  validFrom?: NullableYear;
  validTo?: NullableYear;
};

type V2Data = {
  places: StoredPlace[];
  placeNames: StoredPlaceName[];
  mapAnchors: StoredMapAnchor[];
  editions: StoredEdition[];
  links: StoredLink[];
  linkMeasures: StoredLinkMeasure[];
  services: StoredService[];
  serviceTrips: StoredServiceTrip[];
  assertions: StoredAssertion[];
};

const DEFAULT_YEAR = 1852;
const FOREIGN_SCHEMA_KEY = 'place.is_foreign';
const HIDDEN_SCHEMA_KEY = 'place.hidden';
const DISTANCE_MEASURE_KEY = 'distance';
const LEGACY_DISTANCE_MEASURE_KEY = 'distance.leuge';
const TIME_HHMM_PATTERN = /^\d{2}:\d{2}$/;

export class JsonV2GraphRepository implements GraphRepository {
  private readonly dataDir: string;
  private readonly placesPath: string;
  private readonly placeNamesPath: string;
  private readonly mapAnchorsPath: string;
  private readonly editionsPath: string;
  private readonly linksPath: string;
  private readonly linkMeasuresPath: string;
  private readonly servicesPath: string;
  private readonly serviceTripsPath: string;
  private readonly assertionsPath: string;
  private initPromise: Promise<void> | null = null;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor() {
    const rootDataDir = this.resolveDataDir();
    this.dataDir = path.join(rootDataDir, 'v2');
    this.placesPath = path.join(this.dataDir, 'places.json');
    this.placeNamesPath = path.join(this.dataDir, 'place_names.json');
    this.mapAnchorsPath = path.join(this.dataDir, 'map_anchors.json');
    this.editionsPath = path.join(this.dataDir, 'editions.json');
    this.linksPath = path.join(this.dataDir, 'links.json');
    this.linkMeasuresPath = path.join(this.dataDir, 'link_measures.json');
    this.servicesPath = path.join(this.dataDir, 'services.json');
    this.serviceTripsPath = path.join(this.dataDir, 'service_trips.json');
    this.assertionsPath = path.join(this.dataDir, 'assertions.json');
  }

  async getGraphSnapshot(year: number): Promise<GraphSnapshot> {
    const y = this.coerceYear(year);
    await this.writeQueue;
    const data = await this.loadData();
    const nodes = this.materializeNodes(data, y)
      .filter((node) => this.isNodeActive(node, y))
      .filter((node) => !this.resolveHiddenFlag(node.id, data.assertions, y));
    const nodeIds = new Set(nodes.map((node) => node.id));
    const edges = data.services
      .filter((service) => this.coerceStoredServiceYear(service) === y)
      .filter(
        (service) =>
          nodeIds.has(service.fromPlaceId) && nodeIds.has(service.toPlaceId),
      )
      .map((service) => this.materializeEdge(service, data, y))
      .filter((edge) => this.isEdgeActive(edge, y));

    return { year: y, nodes, edges };
  }

  async getNodeAliases(year: number): Promise<Record<string, string[]>> {
    const y = this.coerceYear(year);
    await this.writeQueue;
    const data = await this.loadData();
    const activeNodes = this.materializeNodes(data, y)
      .filter((node) => this.isNodeActive(node, y))
      .filter((node) => !this.resolveHiddenFlag(node.id, data.assertions, y));
    const aliasesById: Record<string, string[]> = {};

    for (const node of activeNodes) {
      const canonical = this.normalizeName(node.name);
      const labels = new Set<string>();
      const names = data.placeNames
        .filter((entry) => entry.placeId === node.id)
        .filter((entry) =>
          this.isStoredActive(entry.validFrom, entry.validTo, y),
        );
      for (const entry of names) {
        const label = (entry.name ?? '').trim();
        if (!label) {
          continue;
        }
        const normalized = this.normalizeName(label);
        if (!normalized || normalized === canonical) {
          continue;
        }
        labels.add(label);
      }
      aliasesById[node.id] = [...labels];
    }

    return aliasesById;
  }

  async getNodeNeighborhood(nodeId: string, year: number): Promise<NodeDetail> {
    const snapshot = await this.getGraphSnapshot(year);
    const edges = snapshot.edges.filter(
      (edge) => edge.from === nodeId || edge.to === nodeId,
    );
    const node =
      snapshot.nodes.find((candidate) => candidate.id === nodeId) ?? null;
    const neighborIds = new Set(edges.flatMap((edge) => [edge.from, edge.to]));
    neighborIds.delete(nodeId);

    return {
      year: snapshot.year,
      node,
      neighbors: snapshot.nodes.filter((candidate) =>
        neighborIds.has(candidate.id),
      ),
      edges,
    };
  }

  async getAssertions(filters?: {
    year?: number;
    targetType?: string;
    targetId?: string;
  }): Promise<GraphAssertion[]> {
    await this.writeQueue;
    const data = await this.loadData();
    const year = Number.isFinite(filters?.year)
      ? this.coerceYear(Number(filters?.year))
      : undefined;
    const targetType = filters?.targetType?.trim();
    const targetId = filters?.targetId?.trim();

    return data.assertions
      .filter((assertion) =>
        targetType ? assertion.targetType === targetType : true,
      )
      .filter((assertion) =>
        targetId ? assertion.targetId === targetId : true,
      )
      .filter((assertion) =>
        year !== undefined
          ? this.isStoredActive(
              assertion.validFrom ?? null,
              assertion.validTo ?? null,
              year,
            )
          : true,
      )
      .map((assertion) => this.materializeAssertion(assertion));
  }

  async createAssertion(assertion: GraphAssertion): Promise<GraphAssertion> {
    return this.enqueueWrite(async () => {
      const data = await this.loadData();
      const id = assertion.id?.trim() || randomUUID();
      const existing = data.assertions.find((item) => item.id === id);
      if (existing) {
        return this.materializeAssertion(existing);
      }
      const next: StoredAssertion = {
        id,
        targetType: (assertion.targetType ?? 'place').trim() || 'place',
        targetId: assertion.targetId?.trim() ?? '',
        schemaKey: assertion.schemaKey?.trim() ?? '',
        validFrom: this.toNullableYear(assertion.validFrom),
        validTo: this.toNullableYear(assertion.validTo),
      };
      this.applyStoredAssertionValue(next, assertion);
      data.assertions.push(next);
      await this.persistData(data);
      return this.materializeAssertion(next);
    });
  }

  async updateAssertion(
    id: string,
    patch: Partial<GraphAssertion>,
  ): Promise<GraphAssertion | null> {
    return this.enqueueWrite(async () => {
      const data = await this.loadData();
      const index = data.assertions.findIndex((item) => item.id === id);
      if (index === -1) {
        return null;
      }
      const current = data.assertions[index];
      const next: StoredAssertion = {
        ...current,
        targetType:
          patch.targetType !== undefined
            ? patch.targetType?.trim() || current.targetType
            : current.targetType,
        targetId:
          patch.targetId !== undefined
            ? patch.targetId?.trim() || current.targetId
            : current.targetId,
        schemaKey:
          patch.schemaKey !== undefined
            ? patch.schemaKey?.trim() || current.schemaKey
            : current.schemaKey,
        validFrom:
          patch.validFrom !== undefined
            ? this.toNullableYear(patch.validFrom)
            : (current.validFrom ?? null),
        validTo:
          patch.validTo !== undefined
            ? this.toNullableYear(patch.validTo)
            : (current.validTo ?? null),
      };
      const shouldPatchValue =
        patch.valueType !== undefined ||
        patch.valueText !== undefined ||
        patch.valueNumber !== undefined ||
        patch.valueBoolean !== undefined ||
        patch.valueJson !== undefined;
      if (shouldPatchValue) {
        this.applyStoredAssertionValue(next, patch);
      }
      data.assertions[index] = next;
      await this.persistData(data);
      return this.materializeAssertion(next);
    });
  }

  async deleteAssertion(id: string): Promise<boolean> {
    return this.enqueueWrite(async () => {
      const data = await this.loadData();
      const next = data.assertions.filter((item) => item.id !== id);
      if (next.length === data.assertions.length) {
        return false;
      }
      data.assertions = next;
      await this.persistData(data);
      return true;
    });
  }

  async getAvailableYears(): Promise<number[]> {
    await this.writeQueue;
    const data = await this.loadData();
    const years = new Set<number>();

    for (const edition of data.editions) {
      if (Number.isFinite(edition.year)) {
        years.add(edition.year);
      }
    }
    if (!years.size) {
      return [DEFAULT_YEAR];
    }
    return [...years].sort((a, b) => a - b);
  }

  async getEditions(): Promise<EditionEntry[]> {
    await this.writeQueue;
    const data = await this.loadData();
    return data.editions
      .map((edition) => this.materializeEdition(edition))
      .sort((a, b) => a.year - b.year);
  }

  async updateEdition(
    year: number,
    patch: Partial<EditionEntry>,
  ): Promise<EditionEntry> {
    return this.enqueueWrite(async () => {
      const data = await this.loadData();
      const targetYear = this.coerceYear(year);
      const index = data.editions.findIndex(
        (edition) => this.coerceYear(edition.year) === targetYear,
      );
      const existing = index === -1 ? null : data.editions[index];
      const next: StoredEdition = {
        id: existing?.id ?? patch.id ?? `edition-${targetYear}`,
        year: targetYear,
        title: patch.title ?? existing?.title,
        iiifRoute:
          this.normalizeIiifRoute(patch.iiifRoute) ?? existing?.iiifRoute,
        public: patch.public ?? existing?.public ?? true,
      };

      if (patch.iiifRoute !== undefined) {
        next.iiifRoute = this.normalizeIiifRoute(patch.iiifRoute);
      }
      if (patch.public !== undefined) {
        next.public = patch.public;
      }

      if (index === -1) {
        data.editions.push(next);
      } else {
        data.editions[index] = next;
      }

      await this.persistData(data);
      return this.materializeEdition(next);
    });
  }

  async getAllNodes(): Promise<GraphNode[]> {
    await this.writeQueue;
    const data = await this.loadData();
    return this.materializeNodes(data);
  }

  async createNode(node: GraphNode): Promise<GraphNode> {
    return this.enqueueWrite(async () => {
      const data = await this.loadData();
      const existing = data.places.find((place) => place.id === node.id);
      if (existing) {
        return this.materializeNode(existing, data);
      }

      const validFrom = this.toNullableYear(node.validFrom) ?? DEFAULT_YEAR;
      const validTo = this.toNullableYear(node.validTo);
      data.places.push({
        id: node.id,
        defaultName: node.name ?? 'Unnamed',
        validFrom,
        validTo,
      });

      data.placeNames.push({
        id: randomUUID(),
        placeId: node.id,
        lang: 'und',
        name: node.name ?? 'Unnamed',
        normalized: this.normalizeName(node.name ?? 'Unnamed'),
        preferred: true,
        nameType: 'primary',
        validFrom,
        validTo,
      });

      data.mapAnchors.push({
        id: `anchor-${node.id}-${validFrom ?? DEFAULT_YEAR}`,
        placeId: node.id,
        x: node.x ?? 0,
        y: node.y ?? 0,
        iiifCenterX: node.iiifCenterX ?? null,
        iiifCenterY: node.iiifCenterY ?? null,
        validFrom,
        validTo,
      });

      this.setForeignAssertion(
        data,
        node.id,
        node.foreign === true,
        validFrom,
        validTo,
      );
      await this.persistData(data);
      const created = data.places.find((place) => place.id === node.id)!;
      return this.materializeNode(created, data);
    });
  }

  async updateNode(
    id: string,
    patch: GraphNodePatch,
  ): Promise<GraphNode | null> {
    return this.enqueueWrite(async () => {
      const data = await this.loadData();
      const place = data.places.find((candidate) => candidate.id === id);
      if (!place) {
        return null;
      }
      const anchorYear = this.toNullableYear(patch.anchorYear);

      if (patch.name !== undefined) {
        place.defaultName = patch.name;
      }
      if (patch.validFrom !== undefined) {
        place.validFrom = this.toNullableYear(patch.validFrom);
      }
      if (patch.validTo !== undefined) {
        place.validTo = this.toNullableYear(patch.validTo);
      }

      if (
        patch.name !== undefined ||
        patch.validFrom !== undefined ||
        patch.validTo !== undefined
      ) {
        this.upsertPrimaryName(data, place);
      }

      if (
        patch.x !== undefined ||
        patch.y !== undefined ||
        patch.iiifCenterX !== undefined ||
        patch.iiifCenterY !== undefined
      ) {
        const writeYear =
          anchorYear ??
          this.toNullableYear(patch.validFrom) ??
          place.validFrom ??
          DEFAULT_YEAR;
        const fallbackAnchor =
          anchorYear !== null
            ? this.resolveAnchorForPlaceWithoutExactYear(id, data, anchorYear)
            : this.resolveAnchorForPlace(id, data, writeYear ?? undefined);
        let anchor =
          anchorYear !== null
            ? this.resolveAnchorForPlaceAtExactYear(id, data, anchorYear)
            : this.resolveAnchorForPlace(id, data, writeYear ?? undefined);
        if (!anchor) {
          const initialValidFrom = anchorYear ?? place.validFrom;
          const initialValidTo = anchorYear ?? place.validTo;
          const suggestedId = `anchor-${id}-${writeYear ?? DEFAULT_YEAR}`;
          const anchorId = data.mapAnchors.some(
            (candidate) => candidate.id === suggestedId,
          )
            ? `${suggestedId}-${randomUUID().slice(0, 8)}`
            : suggestedId;
          anchor = {
            id: anchorId,
            placeId: id,
            x: patch.x ?? fallbackAnchor?.x ?? 0,
            y: patch.y ?? fallbackAnchor?.y ?? 0,
            iiifCenterX:
              patch.iiifCenterX ?? fallbackAnchor?.iiifCenterX ?? null,
            iiifCenterY:
              patch.iiifCenterY ?? fallbackAnchor?.iiifCenterY ?? null,
            validFrom: initialValidFrom,
            validTo: initialValidTo,
          };
          data.mapAnchors.push(anchor);
        }
        if (
          anchorYear !== null &&
          patch.x === undefined &&
          patch.y === undefined &&
          anchor.x === 0 &&
          anchor.y === 0 &&
          fallbackAnchor
        ) {
          // Heal previously created year-anchors that were initialized at (0,0).
          anchor.x = fallbackAnchor.x;
          anchor.y = fallbackAnchor.y;
        }
        if (patch.x !== undefined) {
          anchor.x = patch.x;
        }
        if (patch.y !== undefined) {
          anchor.y = patch.y;
        }
        if (patch.iiifCenterX !== undefined) {
          anchor.iiifCenterX = patch.iiifCenterX ?? null;
        }
        if (patch.iiifCenterY !== undefined) {
          anchor.iiifCenterY = patch.iiifCenterY ?? null;
        }
        if (patch.validFrom !== undefined) {
          anchor.validFrom = this.toNullableYear(patch.validFrom);
        }
        if (patch.validTo !== undefined) {
          anchor.validTo = this.toNullableYear(patch.validTo);
        }
      }

      if (patch.foreign !== undefined) {
        this.setForeignAssertion(
          data,
          id,
          patch.foreign === true,
          place.validFrom,
          place.validTo,
        );
      }

      await this.persistData(data);
      return this.materializeNode(place, data);
    });
  }

  async setNodeHidden(
    id: string,
    year: number,
    hidden: boolean,
  ): Promise<boolean> {
    return this.enqueueWrite(async () => {
      const data = await this.loadData();
      const place = data.places.find((candidate) => candidate.id === id);
      if (!place) {
        return false;
      }
      const targetYear = this.coerceYear(year);
      this.setHiddenAssertion(data, id, hidden, targetYear);
      await this.persistData(data);
      return true;
    });
  }

  async deleteNode(id: string, year?: number): Promise<boolean> {
    if (year !== undefined) {
      return this.enqueueWrite(async () => {
        const data = await this.loadData();
        const place = data.places.find((candidate) => candidate.id === id);
        if (!place) {
          return false;
        }
        const targetYear = this.coerceYear(year);
        if (!this.isStoredActive(place.validFrom, place.validTo, targetYear)) {
          return false;
        }
        this.setHiddenAssertion(data, id, true, targetYear);
        await this.persistData(data);
        return true;
      });
    }
    return this.enqueueWrite(async () => {
      const data = await this.loadData();
      const before = data.places.length;
      data.places = data.places.filter((place) => place.id !== id);
      if (data.places.length === before) {
        return false;
      }

      data.placeNames = data.placeNames.filter((name) => name.placeId !== id);
      data.mapAnchors = data.mapAnchors.filter(
        (anchor) => anchor.placeId !== id,
      );
      data.assertions = data.assertions.filter(
        (assertion) =>
          !(assertion.targetType === 'place' && assertion.targetId === id),
      );

      const removedLinkIds = new Set(
        data.links
          .filter((link) => link.placeAId === id || link.placeBId === id)
          .map((link) => link.id),
      );
      data.links = data.links.filter((link) => !removedLinkIds.has(link.id));
      data.linkMeasures = data.linkMeasures.filter(
        (measure) => !removedLinkIds.has(measure.linkId),
      );

      const removedServiceIds = new Set(
        data.services
          .filter(
            (service) =>
              service.fromPlaceId === id ||
              service.toPlaceId === id ||
              removedLinkIds.has(service.linkId),
          )
          .map((service) => service.id),
      );
      data.services = data.services.filter(
        (service) => !removedServiceIds.has(service.id),
      );
      data.serviceTrips = data.serviceTrips.filter(
        (trip) => !removedServiceIds.has(trip.serviceId),
      );

      this.cleanupOrphanLinks(data);
      await this.persistData(data);
      return true;
    });
  }

  async createEdge(edge: GraphEdge): Promise<GraphEdge> {
    return this.enqueueWrite(async () => {
      const data = await this.loadData();
      const existing = data.services.find((service) => service.id === edge.id);
      if (existing) {
        return this.materializeEdge(existing, data);
      }

      const serviceYear = this.coerceServiceYear(edge.validFrom, edge.validTo);
      const linkId = this.ensureLink(
        data,
        edge.from,
        edge.to,
        serviceYear,
        serviceYear,
      );
      if (edge.distance !== undefined) {
        this.upsertLinkMeasure(data, linkId, edge.distance, serviceYear);
      }

      data.services.push({
        id: edge.id,
        linkId,
        fromPlaceId: edge.from,
        toPlaceId: edge.to,
        year: serviceYear,
        note: edge.notes ?? null,
      });
      this.replaceServiceTrips(data, edge.id, edge.trips ?? [], serviceYear);

      await this.persistData(data);
      const created = data.services.find((service) => service.id === edge.id)!;
      return this.materializeEdge(created, data);
    });
  }

  async updateEdge(
    id: string,
    patch: Partial<GraphEdge>,
  ): Promise<GraphEdge | null> {
    return this.enqueueWrite(async () => {
      const data = await this.loadData();
      const index = data.services.findIndex((service) => service.id === id);
      if (index === -1) {
        return null;
      }

      const current = this.materializeEdge(data.services[index], data);
      const merged = { ...current, ...patch, id } as GraphEdge;
      const serviceYear = this.coerceServiceYear(
        merged.validFrom,
        merged.validTo,
      );
      const oldLinkId = data.services[index].linkId;
      const nextLinkId = this.ensureLink(
        data,
        merged.from,
        merged.to,
        serviceYear,
        serviceYear,
      );

      data.services[index] = {
        id,
        linkId: nextLinkId,
        fromPlaceId: merged.from,
        toPlaceId: merged.to,
        year: serviceYear,
        note: merged.notes ?? null,
      };

      if (patch.distance !== undefined) {
        this.upsertLinkMeasure(data, nextLinkId, patch.distance, serviceYear);
      }
      if (patch.trips !== undefined) {
        this.replaceServiceTrips(data, id, patch.trips ?? [], serviceYear);
      }

      if (oldLinkId !== nextLinkId) {
        this.cleanupOrphanLinks(data);
      }

      await this.persistData(data);
      return this.materializeEdge(data.services[index], data);
    });
  }

  async deleteEdge(id: string): Promise<boolean> {
    return this.enqueueWrite(async () => {
      const data = await this.loadData();
      const before = data.services.length;
      data.services = data.services.filter((service) => service.id !== id);
      if (data.services.length === before) {
        return false;
      }

      data.serviceTrips = data.serviceTrips.filter(
        (trip) => trip.serviceId !== id,
      );
      this.cleanupOrphanLinks(data);
      await this.persistData(data);
      return true;
    });
  }

  private materializeNodes(data: V2Data, year?: number): GraphNode[] {
    return data.places.map((place) => this.materializeNode(place, data, year));
  }

  private materializeNode(
    place: StoredPlace,
    data: V2Data,
    year?: number,
  ): GraphNode {
    const anchor = this.resolveAnchorForPlace(place.id, data, year);
    const validFrom = this.toNullableYear(place.validFrom) ?? DEFAULT_YEAR;
    const validTo = this.toNullableYear(place.validTo);

    const name = this.resolvePlaceName(place, data.placeNames, year);
    const foreign = this.resolveForeignFlag(place.id, data.assertions, year);

    return {
      id: place.id,
      name,
      x: anchor?.x ?? 0,
      y: anchor?.y ?? 0,
      validFrom,
      validTo: validTo ?? undefined,
      foreign: foreign ? true : undefined,
      iiifCenterX: anchor?.iiifCenterX ?? undefined,
      iiifCenterY: anchor?.iiifCenterY ?? undefined,
    };
  }

  private materializeEdge(
    service: StoredService,
    data: V2Data,
    year?: number,
  ): GraphEdge {
    const serviceYear = this.coerceStoredServiceYear(service);
    const trips = data.serviceTrips
      .filter((trip) => trip.serviceId === service.id)
      .filter((trip) =>
        year !== undefined
          ? this.coerceStoredTripYear(trip, serviceYear) === year
          : true,
      )
      .map((trip) => this.materializeTrip(trip));

    const distance = this.resolveDistance(
      service.linkId,
      data.linkMeasures,
      year ?? serviceYear,
    );

    return {
      id: service.id,
      from: service.fromPlaceId,
      to: service.toPlaceId,
      distance,
      validFrom: serviceYear,
      validTo: undefined,
      notes: service.note ?? undefined,
      trips,
    };
  }

  private materializeTrip(trip: StoredServiceTrip): EdgeTrip {
    return {
      id: trip.id,
      transport: trip.transport ?? 'postkutsche',
      departs: this.parseTripTime(trip.departs),
      arrives: this.parseTripTime(trip.arrives),
      arrivalDayOffset: this.normalizeDayOffset(trip.arrivalDayOffset),
    };
  }

  private resolveDistance(
    linkId: string,
    linkMeasures: StoredLinkMeasure[],
    year?: number,
  ): number | undefined {
    const candidates = linkMeasures
      .filter(
        (measure) =>
          measure.linkId === linkId &&
          (measure.measureKey === DISTANCE_MEASURE_KEY ||
            measure.measureKey === LEGACY_DISTANCE_MEASURE_KEY),
      )
      .filter((measure) =>
        year !== undefined
          ? this.isStoredActive(measure.validFrom, measure.validTo, year)
          : true,
      )
      .filter(
        (measure) =>
          measure.valueNumber !== null && measure.valueNumber !== undefined,
      )
      .sort((a, b) => {
        if (year === undefined) {
          return 0;
        }
        const aExact = a.validFrom === year && a.validTo === year ? 1 : 0;
        const bExact = b.validFrom === year && b.validTo === year ? 1 : 0;
        if (aExact !== bExact) {
          return bExact - aExact;
        }
        const aFrom = a.validFrom ?? Number.NEGATIVE_INFINITY;
        const bFrom = b.validFrom ?? Number.NEGATIVE_INFINITY;
        return bFrom - aFrom;
      });
    return candidates.length
      ? (candidates[0].valueNumber as number)
      : undefined;
  }

  private resolvePlaceName(
    place: StoredPlace,
    placeNames: StoredPlaceName[],
    year?: number,
  ): string {
    const names = placeNames
      .filter((name) => name.placeId === place.id)
      .filter((name) =>
        year !== undefined
          ? this.isStoredActive(name.validFrom, name.validTo, year)
          : true,
      )
      .sort((a, b) => {
        const ap = a.preferred ? 0 : 1;
        const bp = b.preferred ? 0 : 1;
        if (ap !== bp) {
          return ap - bp;
        }
        return this.langPriority(a.lang) - this.langPriority(b.lang);
      });
    return names[0]?.name ?? place.defaultName ?? place.id;
  }

  private resolveForeignFlag(
    placeId: string,
    assertions: StoredAssertion[],
    year?: number,
  ): boolean {
    return assertions.some((assertion) => {
      if (assertion.targetType !== 'place' || assertion.targetId !== placeId) {
        return false;
      }
      if (assertion.schemaKey !== FOREIGN_SCHEMA_KEY) {
        return false;
      }
      if (assertion.valueBoolean !== true) {
        return false;
      }
      if (year === undefined) {
        return true;
      }
      return this.isStoredActive(
        assertion.validFrom ?? null,
        assertion.validTo ?? null,
        year,
      );
    });
  }

  private resolveHiddenFlag(
    placeId: string,
    assertions: StoredAssertion[],
    year?: number,
  ): boolean {
    return assertions.some((assertion) => {
      if (assertion.targetType !== 'place' || assertion.targetId !== placeId) {
        return false;
      }
      if (assertion.schemaKey !== HIDDEN_SCHEMA_KEY) {
        return false;
      }
      if (assertion.valueBoolean !== true) {
        return false;
      }
      if (year === undefined) {
        return true;
      }
      return this.isStoredActive(
        assertion.validFrom ?? null,
        assertion.validTo ?? null,
        year,
      );
    });
  }

  private resolveAnchorForPlace(
    placeId: string,
    data: V2Data,
    year?: number,
  ): StoredMapAnchor | null {
    const candidates = data.mapAnchors
      .filter((anchor) => anchor.placeId === placeId)
      .filter((anchor) =>
        year !== undefined
          ? this.isStoredActive(anchor.validFrom, anchor.validTo, year)
          : true,
      );
    if (candidates.length) {
      candidates.sort((a, b) => {
        if (year !== undefined) {
          const aExact = a.validFrom === year && a.validTo === year ? 1 : 0;
          const bExact = b.validFrom === year && b.validTo === year ? 1 : 0;
          if (aExact !== bExact) {
            return bExact - aExact;
          }
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
      return candidates[0];
    }
    return data.mapAnchors.find((anchor) => anchor.placeId === placeId) ?? null;
  }

  private materializeEdition(edition: StoredEdition): EditionEntry {
    return {
      id: edition.id,
      year: this.coerceYear(edition.year),
      title: edition.title,
      iiifRoute: this.normalizeIiifRoute(edition.iiifRoute),
      public: edition.public !== false,
    };
  }

  private materializeAssertion(assertion: StoredAssertion): GraphAssertion {
    return {
      id: assertion.id,
      targetType: assertion.targetType,
      targetId: assertion.targetId,
      schemaKey: assertion.schemaKey,
      valueType: assertion.valueType,
      valueText: assertion.valueText ?? null,
      valueNumber: assertion.valueNumber ?? null,
      valueBoolean: assertion.valueBoolean ?? null,
      valueJson: assertion.valueJson ?? null,
      validFrom: assertion.validFrom ?? null,
      validTo: assertion.validTo ?? null,
    };
  }

  private applyStoredAssertionValue(
    target: StoredAssertion,
    source: Partial<GraphAssertion>,
  ): void {
    const resolvedType = this.resolveStoredAssertionValueType(source);
    target.valueType = resolvedType;
    target.valueText = null;
    target.valueNumber = null;
    target.valueBoolean = null;
    target.valueJson = null;
    if (resolvedType === 'string') {
      target.valueText = source.valueText ?? '';
      return;
    }
    if (resolvedType === 'number') {
      target.valueNumber = source.valueNumber ?? null;
      return;
    }
    if (resolvedType === 'boolean') {
      target.valueBoolean = source.valueBoolean ?? null;
      return;
    }
    if (resolvedType === 'json') {
      target.valueJson = source.valueJson ?? null;
    }
  }

  private resolveStoredAssertionValueType(
    source: Partial<GraphAssertion>,
  ): 'string' | 'number' | 'boolean' | 'json' {
    if (
      source.valueType === 'string' ||
      source.valueType === 'number' ||
      source.valueType === 'boolean' ||
      source.valueType === 'json'
    ) {
      return source.valueType;
    }
    if (source.valueText !== undefined) {
      return 'string';
    }
    if (source.valueNumber !== undefined) {
      return 'number';
    }
    if (source.valueBoolean !== undefined) {
      return 'boolean';
    }
    return 'json';
  }

  private resolveAnchorForPlaceAtExactYear(
    placeId: string,
    data: V2Data,
    year: number,
  ): StoredMapAnchor | null {
    return (
      data.mapAnchors.find(
        (anchor) =>
          anchor.placeId === placeId &&
          anchor.validFrom === year &&
          anchor.validTo === year,
      ) ?? null
    );
  }

  private resolveAnchorForPlaceWithoutExactYear(
    placeId: string,
    data: V2Data,
    year: number,
  ): StoredMapAnchor | null {
    const candidates = data.mapAnchors
      .filter((anchor) => anchor.placeId === placeId)
      .filter((anchor) =>
        this.isStoredActive(anchor.validFrom, anchor.validTo, year),
      )
      .filter(
        (anchor) => !(anchor.validFrom === year && anchor.validTo === year),
      );
    if (candidates.length) {
      candidates.sort((a, b) => {
        const aFrom = a.validFrom ?? Number.NEGATIVE_INFINITY;
        const bFrom = b.validFrom ?? Number.NEGATIVE_INFINITY;
        if (aFrom !== bFrom) {
          return bFrom - aFrom;
        }
        const aTo = a.validTo ?? Number.POSITIVE_INFINITY;
        const bTo = b.validTo ?? Number.POSITIVE_INFINITY;
        return aTo - bTo;
      });
      return candidates[0];
    }
    return (
      data.mapAnchors.find(
        (anchor) =>
          anchor.placeId === placeId &&
          !(anchor.validFrom === year && anchor.validTo === year),
      ) ?? null
    );
  }

  private isNodeActive(node: GraphNode, year: Year): boolean {
    return (
      node.validFrom <= year &&
      (node.validTo === undefined || year <= node.validTo)
    );
  }

  private isEdgeActive(edge: GraphEdge, year: Year): boolean {
    return (
      edge.validFrom <= year &&
      (edge.validTo === undefined || year <= edge.validTo)
    );
  }

  private isStoredActive(
    validFrom: NullableYear,
    validTo: NullableYear,
    year: number,
  ): boolean {
    const from = validFrom ?? Number.NEGATIVE_INFINITY;
    const to = validTo ?? Number.POSITIVE_INFINITY;
    return from <= year && year <= to;
  }

  private normalizeDayOffset(value: number | null | undefined): 0 | 1 | 2 {
    if (value === 1 || value === 2) {
      return value;
    }
    return 0;
  }

  private coerceServiceYear(validFrom?: number, validTo?: number): Year {
    const year =
      this.toNullableYear(validFrom) ??
      this.toNullableYear(validTo) ??
      DEFAULT_YEAR;
    return year;
  }

  private coerceStoredServiceYear(service: StoredService): Year {
    return Number.isFinite(service.year) ? Number(service.year) : DEFAULT_YEAR;
  }

  private coerceStoredTripYear(
    trip: StoredServiceTrip,
    fallbackYear: Year,
  ): Year {
    return Number.isFinite(trip.year) ? Number(trip.year) : fallbackYear;
  }

  private langPriority(lang: string): number {
    const order = ['de', 'fr', 'it', 'en', 'und'];
    const index = order.indexOf(lang);
    return index === -1 ? order.length : index;
  }

  private toNullableYear(value: number | null | undefined): NullableYear {
    if (value === undefined || value === null || !Number.isFinite(value)) {
      return null;
    }
    return value;
  }

  private coerceYear(year: number): Year {
    return Number.isFinite(year) ? year : DEFAULT_YEAR;
  }

  private ensureLink(
    data: V2Data,
    from: string,
    to: string,
    validFrom?: number,
    validTo?: number,
  ): string {
    const [a, b] = this.normalizeLinkNodes(from, to);
    const linkId = `${a}__${b}`;
    const existing = data.links.find((link) => link.id === linkId);
    if (existing) {
      if (validFrom !== undefined) {
        existing.validFrom =
          existing.validFrom === null
            ? validFrom
            : Math.min(existing.validFrom, validFrom);
      }
      if (validTo !== undefined) {
        if (existing.validTo === null) {
          existing.validTo = validTo;
        } else {
          existing.validTo = Math.max(existing.validTo, validTo);
        }
      }
      return linkId;
    }

    data.links.push({
      id: linkId,
      placeAId: a,
      placeBId: b,
      validFrom: this.toNullableYear(validFrom),
      validTo: this.toNullableYear(validTo),
    });
    return linkId;
  }

  private normalizeLinkNodes(a: string, b: string): [string, string] {
    return a <= b ? [a, b] : [b, a];
  }

  private upsertLinkMeasure(
    data: V2Data,
    linkId: string,
    distance: number,
    year: number,
  ): void {
    const id = `link-measure-${linkId}-distance-${year}`;
    const existing = data.linkMeasures.find(
      (measure) =>
        measure.id === id ||
        (measure.linkId === linkId &&
          (measure.measureKey === DISTANCE_MEASURE_KEY ||
            measure.measureKey === LEGACY_DISTANCE_MEASURE_KEY) &&
          measure.validFrom === year &&
          measure.validTo === year),
    );
    if (existing) {
      existing.valueNumber = distance;
      existing.validFrom = year;
      existing.validTo = year;
      existing.measureKey = DISTANCE_MEASURE_KEY;
      existing.id = id;
      return;
    }

    data.linkMeasures.push({
      id,
      linkId,
      measureKey: DISTANCE_MEASURE_KEY,
      valueNumber: distance,
      validFrom: year,
      validTo: year,
    });
  }

  private replaceServiceTrips(
    data: V2Data,
    serviceId: string,
    trips: EdgeTrip[],
    year: number,
  ): void {
    data.serviceTrips = data.serviceTrips.filter(
      (trip) => trip.serviceId !== serviceId,
    );
    const normalized = trips.map((trip) => ({
      id: trip.id ?? randomUUID(),
      serviceId,
      transport: trip.transport ?? 'postkutsche',
      departs: this.normalizeTripTime(trip.departs),
      arrives: this.normalizeTripTime(trip.arrives),
      arrivalDayOffset: this.normalizeDayOffset(trip.arrivalDayOffset),
      year,
    }));
    data.serviceTrips = data.serviceTrips.concat(normalized);
  }

  private normalizeTripTime(value: string | undefined): string | null {
    if (!value) {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }

  private parseTripTime(value: string | null): TimeHHMM | undefined {
    if (!value) {
      return undefined;
    }
    const normalized = value.trim();
    return TIME_HHMM_PATTERN.test(normalized)
      ? (normalized as TimeHHMM)
      : undefined;
  }

  private cleanupOrphanLinks(data: V2Data): void {
    const usedLinkIds = new Set(data.services.map((service) => service.linkId));
    data.links = data.links.filter((link) => usedLinkIds.has(link.id));
    data.linkMeasures = data.linkMeasures.filter((measure) =>
      usedLinkIds.has(measure.linkId),
    );
  }

  private upsertPrimaryName(data: V2Data, place: StoredPlace): void {
    const existing = data.placeNames.find(
      (name) =>
        name.placeId === place.id &&
        name.preferred === true &&
        (name.nameType ?? 'primary') === 'primary',
    );
    if (existing) {
      existing.name = place.defaultName;
      existing.normalized = this.normalizeName(place.defaultName);
      existing.validFrom = place.validFrom;
      existing.validTo = place.validTo;
      return;
    }
    data.placeNames.push({
      id: randomUUID(),
      placeId: place.id,
      lang: 'und',
      name: place.defaultName,
      normalized: this.normalizeName(place.defaultName),
      preferred: true,
      nameType: 'primary',
      validFrom: place.validFrom,
      validTo: place.validTo,
    });
  }

  private setForeignAssertion(
    data: V2Data,
    placeId: string,
    enabled: boolean,
    validFrom: NullableYear,
    validTo: NullableYear,
  ): void {
    const current = data.assertions.filter(
      (assertion) =>
        assertion.targetType === 'place' &&
        assertion.targetId === placeId &&
        assertion.schemaKey === FOREIGN_SCHEMA_KEY,
    );
    if (!enabled) {
      if (current.length) {
        const ids = new Set(current.map((assertion) => assertion.id));
        data.assertions = data.assertions.filter(
          (assertion) => !ids.has(assertion.id),
        );
      }
      return;
    }
    if (current.length) {
      current.forEach((assertion) => {
        assertion.valueType = 'boolean';
        assertion.valueText = null;
        assertion.valueNumber = null;
        assertion.valueBoolean = true;
        assertion.valueJson = null;
        assertion.validFrom = validFrom;
        assertion.validTo = validTo;
      });
      return;
    }
    data.assertions.push({
      id: randomUUID(),
      targetType: 'place',
      targetId: placeId,
      schemaKey: FOREIGN_SCHEMA_KEY,
      valueType: 'boolean',
      valueText: null,
      valueNumber: null,
      valueBoolean: true,
      valueJson: null,
      validFrom,
      validTo,
    });
  }

  private setHiddenAssertion(
    data: V2Data,
    placeId: string,
    enabled: boolean,
    year: number,
  ): void {
    const current = data.assertions.filter(
      (assertion) =>
        assertion.targetType === 'place' &&
        assertion.targetId === placeId &&
        assertion.schemaKey === HIDDEN_SCHEMA_KEY &&
        assertion.validFrom === year &&
        assertion.validTo === year,
    );
    if (!enabled) {
      if (current.length) {
        const ids = new Set(current.map((assertion) => assertion.id));
        data.assertions = data.assertions.filter(
          (assertion) => !ids.has(assertion.id),
        );
      }
      return;
    }
    if (current.length) {
      current.forEach((assertion) => {
        assertion.valueType = 'boolean';
        assertion.valueText = null;
        assertion.valueNumber = null;
        assertion.valueBoolean = true;
        assertion.valueJson = null;
        assertion.validFrom = year;
        assertion.validTo = year;
      });
      return;
    }
    data.assertions.push({
      id: randomUUID(),
      targetType: 'place',
      targetId: placeId,
      schemaKey: HIDDEN_SCHEMA_KEY,
      valueType: 'boolean',
      valueText: null,
      valueNumber: null,
      valueBoolean: true,
      valueJson: null,
      validFrom: year,
      validTo: year,
    });
  }

  private normalizeName(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[’']/g, '')
      .toLowerCase()
      .trim();
  }

  private normalizeIiifRoute(value: string | undefined): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }
    const trimmed = value.trim();
    if (!trimmed.length) {
      return undefined;
    }
    return trimmed.replace(/\/+$/, '');
  }

  private async loadData(): Promise<V2Data> {
    await this.ensureInitialized();
    return {
      places: await this.readArrayFile<StoredPlace>(this.placesPath),
      placeNames: await this.readArrayFile<StoredPlaceName>(
        this.placeNamesPath,
      ),
      mapAnchors: await this.readArrayFile<StoredMapAnchor>(
        this.mapAnchorsPath,
      ),
      editions: await this.readArrayFile<StoredEdition>(this.editionsPath),
      links: await this.readArrayFile<StoredLink>(this.linksPath),
      linkMeasures: await this.readArrayFile<StoredLinkMeasure>(
        this.linkMeasuresPath,
      ),
      services: await this.readArrayFile<StoredService>(this.servicesPath),
      serviceTrips: await this.readArrayFile<StoredServiceTrip>(
        this.serviceTripsPath,
      ),
      assertions: await this.readArrayFile<StoredAssertion>(
        this.assertionsPath,
      ),
    };
  }

  private async persistData(data: V2Data): Promise<void> {
    await this.writeJsonAtomic(this.placesPath, data.places);
    await this.writeJsonAtomic(this.placeNamesPath, data.placeNames);
    await this.writeJsonAtomic(this.mapAnchorsPath, data.mapAnchors);
    await this.writeJsonAtomic(this.editionsPath, data.editions);
    await this.writeJsonAtomic(this.linksPath, data.links);
    await this.writeJsonAtomic(this.linkMeasuresPath, data.linkMeasures);
    await this.writeJsonAtomic(this.servicesPath, data.services);
    await this.writeJsonAtomic(this.serviceTripsPath, data.serviceTrips);
    await this.writeJsonAtomic(this.assertionsPath, data.assertions);
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.initializeStorage();
    }
    await this.initPromise;
  }

  private async initializeStorage(): Promise<void> {
    await fs.mkdir(this.dataDir, { recursive: true });
    await this.ensureFile(this.placesPath);
    await this.ensureFile(this.placeNamesPath);
    await this.ensureFile(this.mapAnchorsPath);
    await this.ensureFile(this.editionsPath);
    await this.ensureFile(this.linksPath);
    await this.ensureFile(this.linkMeasuresPath);
    await this.ensureFile(this.servicesPath);
    await this.ensureFile(this.serviceTripsPath);
    await this.ensureFile(this.assertionsPath);
  }

  private async ensureFile(filePath: string): Promise<void> {
    try {
      await fs.access(filePath);
    } catch (error: any) {
      if (error?.code !== 'ENOENT') {
        throw error;
      }
      await this.writeJsonAtomic(filePath, []);
    }
  }

  private async readArrayFile<T>(filePath: string): Promise<T[]> {
    let raw = '';
    try {
      raw = await fs.readFile(filePath, 'utf8');
    } catch (error: any) {
      if (error?.code === 'ENOENT') {
        return [];
      }
      throw error;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`Malformed JSON in ${filePath}`);
    }

    if (!Array.isArray(parsed)) {
      throw new Error(`Expected array in ${filePath}`);
    }
    return parsed as T[];
  }

  private async writeJsonAtomic(
    filePath: string,
    data: unknown,
  ): Promise<void> {
    const json = `${JSON.stringify(data, null, 2)}\n`;
    const tmpPath = `${filePath}.tmp`;
    const handle = await fs.open(tmpPath, 'w');
    try {
      await handle.writeFile(json, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(tmpPath, filePath);
  }

  private enqueueWrite<T>(task: () => Promise<T>): Promise<T> {
    const run = this.writeQueue.then(task, task);
    this.writeQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private resolveDataDir(): string {
    const cwd = process.cwd();
    if (path.basename(cwd) === 'ptt-kurskarten.api') {
      return path.join(cwd, 'data');
    }
    return path.join(cwd, 'apps', 'ptt-kurskarten.api', 'data');
  }
}
