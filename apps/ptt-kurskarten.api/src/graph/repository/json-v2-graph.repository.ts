import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { EdgeTrip, GraphEdge, GraphNode, GraphSnapshot, LocalizedText, NodeDetail, TransportType, Year } from '@ptt-kurskarten/shared';
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
  sourceId?: string;
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
  validFrom: NullableYear;
  validTo: NullableYear;
  note?: LocalizedText | null;
};

type StoredServiceTrip = {
  id: string;
  serviceId: string;
  transport: TransportType;
  departs: string | null;
  arrives: string | null;
  arrivalDayOffset: number;
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

const DEFAULT_SOURCE_ID = 'source-v2-api';
const DEFAULT_YEAR = 1852;
const FOREIGN_SCHEMA_KEY = 'place.is_foreign';
const DISTANCE_LEUGE_KEY = 'distance.leuge';

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
    const nodes = this.materializeNodes(data, y).filter((node) => this.isNodeActive(node, y));
    const nodeIds = new Set(nodes.map((node) => node.id));
    const edges = data.services
      .filter((service) => this.isStoredActive(service.validFrom, service.validTo, y))
      .filter((service) => nodeIds.has(service.fromPlaceId) && nodeIds.has(service.toPlaceId))
      .map((service) => this.materializeEdge(service, data, y))
      .filter((edge) => this.isEdgeActive(edge, y));

    return { year: y, nodes, edges };
  }

  async getNodeAliases(year: number): Promise<Record<string, string[]>> {
    const y = this.coerceYear(year);
    await this.writeQueue;
    const data = await this.loadData();
    const activeNodes = this.materializeNodes(data, y).filter((node) => this.isNodeActive(node, y));
    const aliasesById: Record<string, string[]> = {};

    for (const node of activeNodes) {
      const canonical = this.normalizeName(node.name);
      const labels = new Set<string>();
      const names = data.placeNames
        .filter((entry) => entry.placeId === node.id)
        .filter((entry) => this.isStoredActive(entry.validFrom, entry.validTo, y));
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
    const edges = snapshot.edges.filter((edge) => edge.from === nodeId || edge.to === nodeId);
    const node = snapshot.nodes.find((candidate) => candidate.id === nodeId) ?? null;
    const neighborIds = new Set(edges.flatMap((edge) => [edge.from, edge.to]));
    neighborIds.delete(nodeId);

    return {
      year: snapshot.year,
      node,
      neighbors: snapshot.nodes.filter((candidate) => neighborIds.has(candidate.id)),
      edges
    };
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
    for (const place of data.places) {
      if (place.validFrom !== null && place.validFrom !== undefined) {
        years.add(place.validFrom);
      }
      if (place.validTo !== null && place.validTo !== undefined) {
        years.add(place.validTo);
      }
    }
    for (const service of data.services) {
      if (service.validFrom !== null && service.validFrom !== undefined) {
        years.add(service.validFrom);
      }
      if (service.validTo !== null && service.validTo !== undefined) {
        years.add(service.validTo);
      }
    }

    if (!years.size) {
      return [DEFAULT_YEAR];
    }
    return [...years].sort((a, b) => a - b);
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
        validTo
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
        sourceId: DEFAULT_SOURCE_ID
      });

      data.mapAnchors.push({
        id: `anchor-${node.id}-${validFrom ?? DEFAULT_YEAR}`,
        placeId: node.id,
        x: node.x ?? 0,
        y: node.y ?? 0,
        iiifCenterX: node.iiifCenterX ?? null,
        iiifCenterY: node.iiifCenterY ?? null,
        validFrom,
        validTo
      });

      this.setForeignAssertion(data, node.id, node.foreign === true, validFrom, validTo);
      await this.persistData(data);
      const created = data.places.find((place) => place.id === node.id)!;
      return this.materializeNode(created, data);
    });
  }

  async updateNode(id: string, patch: Partial<GraphNode>): Promise<GraphNode | null> {
    return this.enqueueWrite(async () => {
      const data = await this.loadData();
      const place = data.places.find((candidate) => candidate.id === id);
      if (!place) {
        return null;
      }

      if (patch.name !== undefined) {
        place.defaultName = patch.name;
      }
      if (patch.validFrom !== undefined) {
        place.validFrom = this.toNullableYear(patch.validFrom);
      }
      if (patch.validTo !== undefined) {
        place.validTo = this.toNullableYear(patch.validTo);
      }

      if (patch.name !== undefined || patch.validFrom !== undefined || patch.validTo !== undefined) {
        this.upsertPrimaryName(data, place);
      }

      if (
        patch.x !== undefined ||
        patch.y !== undefined ||
        patch.iiifCenterX !== undefined ||
        patch.iiifCenterY !== undefined
      ) {
        const writeYear = this.toNullableYear(patch.validFrom) ?? place.validFrom ?? DEFAULT_YEAR;
        let anchor = this.resolveAnchorForPlace(id, data, writeYear ?? undefined);
        if (!anchor) {
          anchor = {
            id: `anchor-${id}-${writeYear ?? DEFAULT_YEAR}`,
            placeId: id,
            x: patch.x ?? 0,
            y: patch.y ?? 0,
            iiifCenterX: patch.iiifCenterX ?? null,
            iiifCenterY: patch.iiifCenterY ?? null,
            validFrom: place.validFrom,
            validTo: place.validTo
          };
          data.mapAnchors.push(anchor);
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
        this.setForeignAssertion(data, id, patch.foreign === true, place.validFrom, place.validTo);
      }

      await this.persistData(data);
      return this.materializeNode(place, data);
    });
  }

  async deleteNode(id: string): Promise<boolean> {
    return this.enqueueWrite(async () => {
      const data = await this.loadData();
      const before = data.places.length;
      data.places = data.places.filter((place) => place.id !== id);
      if (data.places.length === before) {
        return false;
      }

      data.placeNames = data.placeNames.filter((name) => name.placeId !== id);
      data.mapAnchors = data.mapAnchors.filter((anchor) => anchor.placeId !== id);
      data.assertions = data.assertions.filter((assertion) => !(assertion.targetType === 'place' && assertion.targetId === id));

      const removedLinkIds = new Set(
        data.links
          .filter((link) => link.placeAId === id || link.placeBId === id)
          .map((link) => link.id)
      );
      data.links = data.links.filter((link) => !removedLinkIds.has(link.id));
      data.linkMeasures = data.linkMeasures.filter((measure) => !removedLinkIds.has(measure.linkId));

      const removedServiceIds = new Set(
        data.services
          .filter((service) => service.fromPlaceId === id || service.toPlaceId === id || removedLinkIds.has(service.linkId))
          .map((service) => service.id)
      );
      data.services = data.services.filter((service) => !removedServiceIds.has(service.id));
      data.serviceTrips = data.serviceTrips.filter((trip) => !removedServiceIds.has(trip.serviceId));

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

      const linkId = this.ensureLink(data, edge.from, edge.to, edge.validFrom, edge.validTo);
      if (edge.leuge !== undefined) {
        this.upsertLinkMeasure(data, linkId, edge.leuge, edge.validFrom, edge.validTo);
      }

      data.services.push({
        id: edge.id,
        linkId,
        fromPlaceId: edge.from,
        toPlaceId: edge.to,
        validFrom: this.toNullableYear(edge.validFrom) ?? DEFAULT_YEAR,
        validTo: this.toNullableYear(edge.validTo),
        note: edge.notes ?? null
      });
      this.replaceServiceTrips(data, edge.id, edge.trips ?? [], edge.validFrom, edge.validTo);

      await this.persistData(data);
      const created = data.services.find((service) => service.id === edge.id)!;
      return this.materializeEdge(created, data);
    });
  }

  async updateEdge(id: string, patch: Partial<GraphEdge>): Promise<GraphEdge | null> {
    return this.enqueueWrite(async () => {
      const data = await this.loadData();
      const index = data.services.findIndex((service) => service.id === id);
      if (index === -1) {
        return null;
      }

      const current = this.materializeEdge(data.services[index], data);
      const merged = { ...current, ...patch, id } as GraphEdge;
      const oldLinkId = data.services[index].linkId;
      const nextLinkId = this.ensureLink(data, merged.from, merged.to, merged.validFrom, merged.validTo);

      data.services[index] = {
        id,
        linkId: nextLinkId,
        fromPlaceId: merged.from,
        toPlaceId: merged.to,
        validFrom: this.toNullableYear(merged.validFrom) ?? DEFAULT_YEAR,
        validTo: this.toNullableYear(merged.validTo),
        note: merged.notes ?? null
      };

      if (patch.leuge !== undefined) {
        this.upsertLinkMeasure(data, nextLinkId, patch.leuge, merged.validFrom, merged.validTo);
      }
      if (patch.trips !== undefined) {
        this.replaceServiceTrips(data, id, patch.trips ?? [], merged.validFrom, merged.validTo);
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

      data.serviceTrips = data.serviceTrips.filter((trip) => trip.serviceId !== id);
      this.cleanupOrphanLinks(data);
      await this.persistData(data);
      return true;
    });
  }

  private materializeNodes(data: V2Data, year?: number): GraphNode[] {
    return data.places.map((place) => this.materializeNode(place, data, year));
  }

  private materializeNode(place: StoredPlace, data: V2Data, year?: number): GraphNode {
    const anchor = this.resolveAnchorForPlace(place.id, data, year);
    const validFrom = this.pickValidFrom(place.validFrom, anchor?.validFrom);
    const validTo = this.pickValidTo(place.validTo, anchor?.validTo);

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
      iiifCenterY: anchor?.iiifCenterY ?? undefined
    };
  }

  private materializeEdge(service: StoredService, data: V2Data, year?: number): GraphEdge {
    const trips = data.serviceTrips
      .filter((trip) => trip.serviceId === service.id)
      .filter((trip) => (year !== undefined ? this.isStoredActive(trip.validFrom, trip.validTo, year) : true))
      .map((trip) => this.materializeTrip(trip));

    const leuge = this.resolveLeuge(service.linkId, data.linkMeasures, year);

    return {
      id: service.id,
      from: service.fromPlaceId,
      to: service.toPlaceId,
      leuge,
      validFrom: service.validFrom ?? DEFAULT_YEAR,
      validTo: service.validTo ?? undefined,
      notes: service.note ?? undefined,
      trips
    };
  }

  private materializeTrip(trip: StoredServiceTrip): EdgeTrip {
    const departs = trip.departs ?? undefined;
    const arrives = trip.arrives ?? '';
    return {
      id: trip.id,
      transport: trip.transport ?? 'postkutsche',
      departs: departs as EdgeTrip['departs'],
      arrives: arrives as EdgeTrip['arrives'],
      arrivalDayOffset: this.normalizeDayOffset(trip.arrivalDayOffset)
    };
  }

  private resolveLeuge(linkId: string, linkMeasures: StoredLinkMeasure[], year?: number): number | undefined {
    const candidates = linkMeasures
      .filter((measure) => measure.linkId === linkId && measure.measureKey === DISTANCE_LEUGE_KEY)
      .filter((measure) => (year !== undefined ? this.isStoredActive(measure.validFrom, measure.validTo, year) : true))
      .filter((measure) => measure.valueNumber !== null && measure.valueNumber !== undefined);
    return candidates.length ? (candidates[0].valueNumber as number) : undefined;
  }

  private resolvePlaceName(place: StoredPlace, placeNames: StoredPlaceName[], year?: number): string {
    const names = placeNames
      .filter((name) => name.placeId === place.id)
      .filter((name) => (year !== undefined ? this.isStoredActive(name.validFrom, name.validTo, year) : true))
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

  private resolveForeignFlag(placeId: string, assertions: StoredAssertion[], year?: number): boolean {
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
      return this.isStoredActive(assertion.validFrom ?? null, assertion.validTo ?? null, year);
    });
  }

  private resolveAnchorForPlace(placeId: string, data: V2Data, year?: number): StoredMapAnchor | null {
    const candidates = data.mapAnchors
      .filter((anchor) => anchor.placeId === placeId)
      .filter((anchor) => (year !== undefined ? this.isStoredActive(anchor.validFrom, anchor.validTo, year) : true));
    if (candidates.length) {
      return candidates[0];
    }
    return data.mapAnchors.find((anchor) => anchor.placeId === placeId) ?? null;
  }

  private isNodeActive(node: GraphNode, year: Year): boolean {
    return node.validFrom <= year && (node.validTo === undefined || year <= node.validTo);
  }

  private isEdgeActive(edge: GraphEdge, year: Year): boolean {
    return edge.validFrom <= year && (edge.validTo === undefined || year <= edge.validTo);
  }

  private isStoredActive(validFrom: NullableYear, validTo: NullableYear, year: number): boolean {
    const from = validFrom ?? Number.NEGATIVE_INFINITY;
    const to = validTo ?? Number.POSITIVE_INFINITY;
    return from <= year && year <= to;
  }

  private pickValidFrom(...values: Array<NullableYear | undefined>): Year {
    const numeric = values.filter((value): value is number => value !== null && value !== undefined);
    if (!numeric.length) {
      return DEFAULT_YEAR;
    }
    return Math.max(...numeric);
  }

  private pickValidTo(...values: Array<NullableYear | undefined>): Year | null {
    const numeric = values.filter((value): value is number => value !== null && value !== undefined);
    if (!numeric.length) {
      return null;
    }
    return Math.min(...numeric);
  }

  private normalizeDayOffset(value: number | null | undefined): 0 | 1 | 2 {
    if (value === 1 || value === 2) {
      return value;
    }
    return 0;
  }

  private langPriority(lang: string): number {
    const order = ['de', 'fr', 'it', 'en', 'und'];
    const index = order.indexOf(lang);
    return index === -1 ? order.length : index;
  }

  private toNullableYear(value: number | undefined): NullableYear {
    if (value === undefined || value === null || !Number.isFinite(value)) {
      return null;
    }
    return value;
  }

  private coerceYear(year: number): Year {
    return Number.isFinite(year) ? year : DEFAULT_YEAR;
  }

  private ensureLink(data: V2Data, from: string, to: string, validFrom?: number, validTo?: number): string {
    const [a, b] = this.normalizeLinkNodes(from, to);
    const linkId = `${a}__${b}`;
    const existing = data.links.find((link) => link.id === linkId);
    if (existing) {
      if (validFrom !== undefined) {
        existing.validFrom = existing.validFrom === null ? validFrom : Math.min(existing.validFrom, validFrom);
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
      validTo: this.toNullableYear(validTo)
    });
    return linkId;
  }

  private normalizeLinkNodes(a: string, b: string): [string, string] {
    return a <= b ? [a, b] : [b, a];
  }

  private upsertLinkMeasure(
    data: V2Data,
    linkId: string,
    leuge: number,
    validFrom?: number,
    validTo?: number
  ): void {
    const id = `link-measure-${linkId}-distance-leuge`;
    const existing = data.linkMeasures.find((measure) => measure.id === id);
    if (existing) {
      existing.valueNumber = leuge;
      if (validFrom !== undefined) {
        existing.validFrom = this.toNullableYear(validFrom);
      }
      if (validTo !== undefined) {
        existing.validTo = this.toNullableYear(validTo);
      }
      return;
    }
    data.linkMeasures.push({
      id,
      linkId,
      measureKey: DISTANCE_LEUGE_KEY,
      valueNumber: leuge,
      validFrom: this.toNullableYear(validFrom),
      validTo: this.toNullableYear(validTo)
    });
  }

  private replaceServiceTrips(
    data: V2Data,
    serviceId: string,
    trips: EdgeTrip[],
    validFrom?: number,
    validTo?: number
  ): void {
    data.serviceTrips = data.serviceTrips.filter((trip) => trip.serviceId !== serviceId);
    const normalized = trips.map((trip) => ({
      id: trip.id ?? randomUUID(),
      serviceId,
      transport: (trip.transport ?? 'postkutsche') as TransportType,
      departs: this.normalizeTripTime(trip.departs),
      arrives: this.normalizeTripTime(trip.arrives),
      arrivalDayOffset: this.normalizeDayOffset(trip.arrivalDayOffset),
      validFrom: this.toNullableYear(validFrom),
      validTo: this.toNullableYear(validTo)
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

  private cleanupOrphanLinks(data: V2Data): void {
    const usedLinkIds = new Set(data.services.map((service) => service.linkId));
    data.links = data.links.filter((link) => usedLinkIds.has(link.id));
    data.linkMeasures = data.linkMeasures.filter((measure) => usedLinkIds.has(measure.linkId));
  }

  private upsertPrimaryName(data: V2Data, place: StoredPlace): void {
    const existing = data.placeNames.find(
      (name) => name.placeId === place.id && name.preferred === true && (name.nameType ?? 'primary') === 'primary'
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
      sourceId: DEFAULT_SOURCE_ID
    });
  }

  private setForeignAssertion(
    data: V2Data,
    placeId: string,
    enabled: boolean,
    validFrom: NullableYear,
    validTo: NullableYear
  ): void {
    const current = data.assertions.filter(
      (assertion) =>
        assertion.targetType === 'place' && assertion.targetId === placeId && assertion.schemaKey === FOREIGN_SCHEMA_KEY
    );
    if (!enabled) {
      if (current.length) {
        const ids = new Set(current.map((assertion) => assertion.id));
        data.assertions = data.assertions.filter((assertion) => !ids.has(assertion.id));
      }
      return;
    }
    if (current.length) {
      current.forEach((assertion) => {
        assertion.valueBoolean = true;
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
      valueBoolean: true,
      validFrom,
      validTo
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

  private async loadData(): Promise<V2Data> {
    await this.ensureInitialized();
    return {
      places: await this.readArrayFile<StoredPlace>(this.placesPath),
      placeNames: await this.readArrayFile<StoredPlaceName>(this.placeNamesPath),
      mapAnchors: await this.readArrayFile<StoredMapAnchor>(this.mapAnchorsPath),
      editions: await this.readArrayFile<StoredEdition>(this.editionsPath),
      links: await this.readArrayFile<StoredLink>(this.linksPath),
      linkMeasures: await this.readArrayFile<StoredLinkMeasure>(this.linkMeasuresPath),
      services: await this.readArrayFile<StoredService>(this.servicesPath),
      serviceTrips: await this.readArrayFile<StoredServiceTrip>(this.serviceTripsPath),
      assertions: await this.readArrayFile<StoredAssertion>(this.assertionsPath)
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

  private async writeJsonAtomic(filePath: string, data: unknown): Promise<void> {
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
      () => undefined
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
