#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const API_DATA_DIR = path.join(ROOT, 'apps', 'ptt-kurskarten.api', 'data');
const OUTPUT_DIR = path.join(API_DATA_DIR, 'v2');
const WIKIDATA_PATH = path.join(ROOT, 'wikidata.json');

const LEGACY_SOURCE_ID = 'source-legacy-graph-json';
const WIKIDATA_SOURCE_ID = 'source-wikidata-json';
const IMPORT_SOURCE_ID = 'source-v2-migration-script';
const TEMPLATE_ID = 'map-template-switzerland-base-v1';

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`Expected array in ${filePath}`);
  }
  return parsed;
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeText(filePath, value) {
  fs.writeFileSync(filePath, value, 'utf8');
}

function yearOrNull(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeTime(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeName(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, '')
    .toLowerCase()
    .trim();
}

function segmentIdFor(a, b) {
  return a <= b ? `${a}__${b}` : `${b}__${a}`;
}

function sortById(rows) {
  return [...rows].sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

function collectYears(nodes, edges) {
  const years = new Set();
  for (const row of [...nodes, ...edges]) {
    const from = yearOrNull(row.validFrom);
    const to = yearOrNull(row.validTo);
    if (from !== null) {
      years.add(from);
    }
    if (to !== null) {
      years.add(to);
    }
  }
  if (!years.size) {
    years.add(1852);
  }
  return [...years].sort((a, b) => a - b);
}

function buildWikidataByName(entries) {
  const byName = new Map();
  const duplicateNames = [];
  for (const entry of entries) {
    const key = normalizeName(entry.name);
    if (!key) {
      continue;
    }
    if (byName.has(key)) {
      duplicateNames.push(entry.name);
      continue;
    }
    byName.set(key, entry);
  }
  return { byName, duplicateNames };
}

function getLabelSets(entry) {
  const sets = [];
  if (entry && typeof entry === 'object') {
    if (entry.translations && typeof entry.translations === 'object') {
      sets.push(entry.translations);
    }
    if (entry.translationsByQNumber && typeof entry.translationsByQNumber === 'object') {
      for (const set of Object.values(entry.translationsByQNumber)) {
        if (set && typeof set === 'object') {
          sets.push(set);
        }
      }
    }
  }
  return sets;
}

function ensureDir(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
  fs.mkdirSync(dirPath, { recursive: true });
}

function main() {
  const nodesPath = path.join(API_DATA_DIR, 'nodes.json');
  const edgesPath = path.join(API_DATA_DIR, 'edges.json');
  const segmentsPath = path.join(API_DATA_DIR, 'segments.json');
  const tripsPath = path.join(API_DATA_DIR, 'trips.json');

  const nodes = readJson(nodesPath);
  const edges = readJson(edgesPath);
  const segments = readJson(segmentsPath);
  const trips = readJson(tripsPath);
  const wikidata = readJson(WIKIDATA_PATH);

  const edgesById = new Map(edges.map((edge) => [edge.id, edge]));
  const edgesBySegment = new Map();
  for (const edge of edges) {
    const key = segmentIdFor(edge.from, edge.to);
    const list = edgesBySegment.get(key) ?? [];
    list.push(edge);
    edgesBySegment.set(key, list);
  }

  const years = collectYears(nodes, edges);
  const editions = years.map((year) => ({
    id: `edition-${year}`,
    year,
    version: 1,
    title: `Kurskarte ${year}`,
    mapTemplateId: TEMPLATE_ID,
    sourceId: LEGACY_SOURCE_ID
  }));

  const mapTemplates = [
    {
      id: TEMPLATE_ID,
      label: 'Swiss base map template',
      description: 'Default reusable map template migrated from legacy node coordinates.',
      sourceId: LEGACY_SOURCE_ID
    }
  ];

  const places = [];
  const placeNames = [];
  const mapAnchors = [];
  const anchorOverrides = [];
  const links = [];
  const linkMeasures = [];
  const services = [];
  const serviceTrips = [];
  const assertions = [];

  let placeNameCounter = 0;
  let assertionCounter = 0;
  const placeNameDedup = new Set();

  const addPlaceName = ({ placeId, lang, name, preferred, sourceId, validFrom, validTo, nameType }) => {
    const normalized = normalizeName(name);
    if (!normalized) {
      return;
    }
    const dedupKey = `${placeId}|${lang}|${normalized}|${preferred ? '1' : '0'}|${nameType}`;
    if (placeNameDedup.has(dedupKey)) {
      return;
    }
    placeNameDedup.add(dedupKey);
    placeNameCounter += 1;
    placeNames.push({
      id: `place-name-${String(placeNameCounter).padStart(6, '0')}`,
      placeId,
      lang,
      name: String(name).trim(),
      normalized,
      preferred: Boolean(preferred),
      nameType,
      validFrom,
      validTo,
      sourceId
    });
  };

  const addAssertion = ({
    targetType,
    targetId,
    schemaKey,
    valueType,
    valueText = null,
    valueNumber = null,
    valueBoolean = null,
    valueJson = null,
    validFrom = null,
    validTo = null,
    sourceId = IMPORT_SOURCE_ID,
    status = 'asserted',
    confidence = null
  }) => {
    assertionCounter += 1;
    assertions.push({
      id: `assertion-${String(assertionCounter).padStart(6, '0')}`,
      targetType,
      targetId,
      schemaKey,
      valueType,
      valueText,
      valueNumber,
      valueBoolean,
      valueJson,
      validFrom,
      validTo,
      sourceId,
      status,
      confidence
    });
  };

  for (const node of nodes) {
    const validFrom = yearOrNull(node.validFrom);
    const validTo = yearOrNull(node.validTo);

    places.push({
      id: node.id,
      kind: 'place',
      status: 'active',
      defaultName: node.name,
      validFrom,
      validTo,
      sourceId: LEGACY_SOURCE_ID,
      legacyNodeId: node.id
    });

    addPlaceName({
      placeId: node.id,
      lang: 'und',
      name: node.name,
      preferred: true,
      sourceId: LEGACY_SOURCE_ID,
      validFrom,
      validTo,
      nameType: 'primary'
    });

    mapAnchors.push({
      id: `anchor-${TEMPLATE_ID}-${node.id}`,
      mapTemplateId: TEMPLATE_ID,
      placeId: node.id,
      x: Number(node.x),
      y: Number(node.y),
      iiifCenterX: node.iiifCenterX ?? null,
      iiifCenterY: node.iiifCenterY ?? null,
      validFrom,
      validTo,
      sourceId: LEGACY_SOURCE_ID
    });

    if (node.foreign === true) {
      addAssertion({
        targetType: 'place',
        targetId: node.id,
        schemaKey: 'place.is_foreign',
        valueType: 'boolean',
        valueBoolean: true,
        validFrom,
        validTo,
        sourceId: LEGACY_SOURCE_ID,
        status: 'observed',
        confidence: 1
      });
    }
  }

  for (const segment of segments) {
    const related = edgesBySegment.get(segment.id) ?? [];
    const validFromCandidates = related.map((edge) => yearOrNull(edge.validFrom)).filter((v) => v !== null);
    const validToCandidates = related.map((edge) => yearOrNull(edge.validTo)).filter((v) => v !== null);
    const hasOpenEnded = related.some((edge) => yearOrNull(edge.validTo) === null);
    const validFrom = validFromCandidates.length ? Math.min(...validFromCandidates) : null;
    const validTo = validToCandidates.length && !hasOpenEnded ? Math.max(...validToCandidates) : null;

    links.push({
      id: segment.id,
      placeAId: segment.a,
      placeBId: segment.b,
      validFrom,
      validTo,
      sourceId: LEGACY_SOURCE_ID,
      legacySegmentId: segment.id
    });

    if (segment.leuge !== null && segment.leuge !== undefined) {
      linkMeasures.push({
        id: `link-measure-${segment.id}-distance-leuge`,
        linkId: segment.id,
        measureKey: 'distance.leuge',
        valueNumber: Number(segment.leuge),
        unit: 'leuge',
        validFrom,
        validTo,
        sourceId: LEGACY_SOURCE_ID
      });
    }
  }

  for (const edge of edges) {
    services.push({
      id: edge.id,
      linkId: segmentIdFor(edge.from, edge.to),
      fromPlaceId: edge.from,
      toPlaceId: edge.to,
      validFrom: yearOrNull(edge.validFrom),
      validTo: yearOrNull(edge.validTo),
      note: edge.notes ?? null,
      sourceId: LEGACY_SOURCE_ID,
      legacyEdgeId: edge.id
    });
  }

  for (const trip of trips) {
    const parentService = edgesById.get(trip.edgeId);
    serviceTrips.push({
      id: trip.id,
      serviceId: trip.edgeId,
      transport: trip.transport ?? 'postkutsche',
      departs: normalizeTime(trip.departs),
      arrives: normalizeTime(trip.arrives),
      arrivalDayOffset: Number.isFinite(trip.arrivalDayOffset) ? trip.arrivalDayOffset : 0,
      validFrom: parentService ? yearOrNull(parentService.validFrom) : null,
      validTo: parentService ? yearOrNull(parentService.validTo) : null,
      sourceId: LEGACY_SOURCE_ID,
      legacyTripId: trip.id
    });
  }

  const { byName: wikidataByName, duplicateNames: duplicateWikidataNames } = buildWikidataByName(wikidata);
  const normalizedPlaceNameHitCount = new Map();

  for (const place of places) {
    const key = normalizeName(place.defaultName);
    if (!key) {
      continue;
    }
    const entry = wikidataByName.get(key);
    if (!entry) {
      continue;
    }
    normalizedPlaceNameHitCount.set(key, (normalizedPlaceNameHitCount.get(key) ?? 0) + 1);

    if (typeof entry.qNumber === 'string' && /^Q\d+$/.test(entry.qNumber)) {
      addAssertion({
        targetType: 'place',
        targetId: place.id,
        schemaKey: 'identifier.wikidata',
        valueType: 'string',
        valueText: entry.qNumber,
        validFrom: place.validFrom,
        validTo: place.validTo,
        sourceId: WIKIDATA_SOURCE_ID,
        status: 'resolved',
        confidence: 1
      });
    }

    const qNumbers = Array.isArray(entry.qNumbers) ? entry.qNumbers : [];
    for (const qid of qNumbers) {
      if (typeof qid === 'string' && /^Q\d+$/.test(qid)) {
        addAssertion({
          targetType: 'place',
          targetId: place.id,
          schemaKey: 'identifier.wikidata.candidate',
          valueType: 'string',
          valueText: qid,
          validFrom: place.validFrom,
          validTo: place.validTo,
          sourceId: WIKIDATA_SOURCE_ID,
          status: 'candidate',
          confidence: 0.5
        });
      }
    }

    for (const labelSet of getLabelSets(entry)) {
      for (const [lang, label] of Object.entries(labelSet)) {
        if (typeof label !== 'string') {
          continue;
        }
        if (normalizeName(label) === normalizeName(place.defaultName)) {
          continue;
        }
        addPlaceName({
          placeId: place.id,
          lang,
          name: label,
          preferred: false,
          sourceId: WIKIDATA_SOURCE_ID,
          validFrom: place.validFrom,
          validTo: place.validTo,
          nameType: 'alias'
        });
      }
    }
  }

  const duplicatePlaceNames = [...normalizedPlaceNameHitCount.entries()]
    .filter(([, count]) => count > 1)
    .map(([name]) => name)
    .sort();

  const missingTripServices = serviceTrips
    .filter((trip) => !edgesById.has(trip.serviceId))
    .map((trip) => trip.id);

  const missingLinkForService = services
    .filter((service) => !segments.some((segment) => segment.id === service.linkId))
    .map((service) => service.id);

  const sources = [
    {
      id: LEGACY_SOURCE_ID,
      kind: 'dataset',
      citation: 'Legacy JSON graph repository (nodes/edges/segments/trips)',
      detail: 'apps/ptt-kurskarten.api/data/*.json'
    },
    {
      id: WIKIDATA_SOURCE_ID,
      kind: 'dataset',
      citation: 'Wikidata enrichment export',
      detail: 'wikidata.json'
    },
    {
      id: IMPORT_SOURCE_ID,
      kind: 'process',
      citation: 'v2 migration script execution',
      detail: 'scripts/migrate_data_v2.js'
    }
  ];

  const report = {
    generatedAt: new Date().toISOString(),
    counts: {
      places: places.length,
      placeNames: placeNames.length,
      mapTemplates: mapTemplates.length,
      mapAnchors: mapAnchors.length,
      anchorOverrides: anchorOverrides.length,
      editions: editions.length,
      links: links.length,
      linkMeasures: linkMeasures.length,
      services: services.length,
      serviceTrips: serviceTrips.length,
      assertions: assertions.length,
      sources: sources.length
    },
    warnings: {
      duplicateWikidataNameKeys: duplicateWikidataNames,
      duplicatePlaceNameKeysLinkedToOneWikidataEntry: duplicatePlaceNames,
      missingTripServices,
      servicesWithoutLink: missingLinkForService
    }
  };

  ensureDir(OUTPUT_DIR);

  const readme = `# data/v2

Normalized canonical dataset exported from legacy graph JSON files.

## Design Goals

- Stable place identity separate from map coordinates
- Undirected links separate from directed services
- Trips attached to services
- Generic assertions for metadata (including Wikidata references)
- JSON layout that can be migrated 1:1 into relational DB tables later

## Files

- editions.json: time/edition context records
- map_templates.json: reusable base map templates
- places.json: stable place entities
- place_names.json: multilingual and alternate place names
- map_anchors.json: default place coordinates per map template
- edition_anchor_overrides.json: per-edition coordinate overrides (usually empty)
- links.json: undirected place pairs
- link_measures.json: link-level measures (e.g. distance.leuge)
- services.json: directed route variants between places
- service_trips.json: timetable rows attached to services
- assertions.json: generic metadata assertions (booleans, strings, numbers, JSON)
- sources.json: provenance/source catalog
- migration_report.json: row counts and migration warnings

## Notes

- IDs from legacy data are preserved where possible for traceability.
- Duplicate names are not auto-merged into one place entity during migration.
- Wikidata is mapped name-based from repository-root wikidata.json.
`;

  writeText(path.join(OUTPUT_DIR, 'README.md'), readme);
  writeJson(path.join(OUTPUT_DIR, 'editions.json'), sortById(editions));
  writeJson(path.join(OUTPUT_DIR, 'map_templates.json'), sortById(mapTemplates));
  writeJson(path.join(OUTPUT_DIR, 'places.json'), sortById(places));
  writeJson(path.join(OUTPUT_DIR, 'place_names.json'), sortById(placeNames));
  writeJson(path.join(OUTPUT_DIR, 'map_anchors.json'), sortById(mapAnchors));
  writeJson(path.join(OUTPUT_DIR, 'edition_anchor_overrides.json'), sortById(anchorOverrides));
  writeJson(path.join(OUTPUT_DIR, 'links.json'), sortById(links));
  writeJson(path.join(OUTPUT_DIR, 'link_measures.json'), sortById(linkMeasures));
  writeJson(path.join(OUTPUT_DIR, 'services.json'), sortById(services));
  writeJson(path.join(OUTPUT_DIR, 'service_trips.json'), sortById(serviceTrips));
  writeJson(path.join(OUTPUT_DIR, 'assertions.json'), sortById(assertions));
  writeJson(path.join(OUTPUT_DIR, 'sources.json'), sortById(sources));
  writeJson(path.join(OUTPUT_DIR, 'migration_report.json'), report);

  console.log('v2 migration complete.');
  console.log(JSON.stringify(report, null, 2));
}

main();
