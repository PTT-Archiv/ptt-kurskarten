#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const API_DATA_DIR = path.join(ROOT, 'apps', 'ptt-kurskarten.api', 'data');
const OUTPUT_DIR = path.join(API_DATA_DIR, 'v2');
const WIKIDATA_PATH = path.join(ROOT, 'wikidata.json');

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
    title: `Kurskarte ${year}`
  }));

  const places = [];
  const placeNames = [];
  const mapAnchors = [];
  const links = [];
  const linkMeasures = [];
  const services = [];
  const serviceTrips = [];
  const assertions = [];

  let placeNameCounter = 0;
  let assertionCounter = 0;
  const placeNameDedup = new Set();

  const addPlaceName = ({ placeId, lang, name, preferred, validFrom, validTo, nameType }) => {
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
      validTo
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
    validTo = null
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
      validTo
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
      validTo
    });

    addPlaceName({
      placeId: node.id,
      lang: 'und',
      name: node.name,
      preferred: true,
      validFrom,
      validTo,
      nameType: 'primary'
    });

    mapAnchors.push({
      id: `anchor-${node.id}`,
      placeId: node.id,
      x: Number(node.x),
      y: Number(node.y),
      iiifCenterX: node.iiifCenterX ?? null,
      iiifCenterY: node.iiifCenterY ?? null,
      validFrom,
      validTo
    });

    if (node.foreign === true) {
      addAssertion({
        targetType: 'place',
        targetId: node.id,
        schemaKey: 'place.is_foreign',
        valueType: 'boolean',
        valueBoolean: true,
        validFrom,
        validTo
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
      validTo
    });

    const segmentDistance = segment.distance ?? segment.leuge;
    if (segmentDistance !== null && segmentDistance !== undefined) {
      linkMeasures.push({
        id: `link-measure-${segment.id}-distance`,
        linkId: segment.id,
        measureKey: 'distance',
        valueNumber: Number(segmentDistance),
        unit: 'distance',
        validFrom,
        validTo
      });
    }
  }

  for (const edge of edges) {
    const serviceYear = yearOrNull(edge.validFrom) ?? 1852;
    services.push({
      id: edge.id,
      linkId: segmentIdFor(edge.from, edge.to),
      fromPlaceId: edge.from,
      toPlaceId: edge.to,
      year: serviceYear,
      note: edge.notes ?? null
    });
  }

  for (const trip of trips) {
    const parentService = edgesById.get(trip.edgeId);
    const serviceYear = parentService ? yearOrNull(parentService.validFrom) ?? 1852 : 1852;
    serviceTrips.push({
      id: trip.id,
      serviceId: trip.edgeId,
      transport: trip.transport ?? 'postkutsche',
      departs: normalizeTime(trip.departs),
      arrives: normalizeTime(trip.arrives),
      arrivalDayOffset: Number.isFinite(trip.arrivalDayOffset) ? trip.arrivalDayOffset : 0,
      year: serviceYear
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

    const wikidataQNumbers = new Set();
    if (typeof entry.qNumber === 'string' && /^Q\d+$/.test(entry.qNumber)) {
      wikidataQNumbers.add(entry.qNumber.trim().toUpperCase());
    }
    const qNumbers = Array.isArray(entry.qNumbers) ? entry.qNumbers : [];
    for (const qid of qNumbers) {
      if (typeof qid === 'string' && /^Q\d+$/.test(qid)) {
        wikidataQNumbers.add(qid.trim().toUpperCase());
      }
    }
    if (wikidataQNumbers.size) {
      const lowestQid = [...wikidataQNumbers].sort(
        (a, b) => Number(a.slice(1)) - Number(b.slice(1))
      )[0];
      addAssertion({
        targetType: 'place',
        targetId: place.id,
        schemaKey: 'identifier.wikidata',
        valueType: 'string',
        valueText: lowestQid,
        validFrom: place.validFrom,
        validTo: place.validTo
      });
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

  const report = {
    generatedAt: new Date().toISOString(),
    counts: {
      places: places.length,
      placeNames: placeNames.length,
      mapAnchors: mapAnchors.length,
      editions: editions.length,
      links: links.length,
      linkMeasures: linkMeasures.length,
      services: services.length,
      serviceTrips: serviceTrips.length,
      assertions: assertions.length
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

Normalized canonical dataset exported from graph JSON files.

## Design Goals

- Stable place identity separate from map coordinates
- Undirected links separate from directed services
- Services and trips are year-bound (one year per service)
- Generic assertions for metadata (including Wikidata references)
- JSON layout that can be migrated 1:1 into relational DB tables later

## Files

- editions.json: time context records (year metadata)
- places.json: stable place entities
- place_names.json: multilingual and alternate place names
- map_anchors.json: place coordinates on the single canonical simplified map
- links.json: undirected place pairs
- link_measures.json: link-level measures (e.g. distance)
- services.json: directed route variants between places (year-bound)
- service_trips.json: timetable rows attached to services (same year as parent service)
- assertions.json: generic metadata assertions (booleans, strings, numbers, JSON)
- migration_report.json: row counts and migration warnings

## Notes

- IDs from source data are preserved where possible for traceability.
- Duplicate names are not auto-merged into one place entity during migration.
- Wikidata is mapped name-based from repository-root wikidata.json.
`;

  writeText(path.join(OUTPUT_DIR, 'README.md'), readme);
  writeJson(path.join(OUTPUT_DIR, 'editions.json'), sortById(editions));
  writeJson(path.join(OUTPUT_DIR, 'places.json'), sortById(places));
  writeJson(path.join(OUTPUT_DIR, 'place_names.json'), sortById(placeNames));
  writeJson(path.join(OUTPUT_DIR, 'map_anchors.json'), sortById(mapAnchors));
  writeJson(path.join(OUTPUT_DIR, 'links.json'), sortById(links));
  writeJson(path.join(OUTPUT_DIR, 'link_measures.json'), sortById(linkMeasures));
  writeJson(path.join(OUTPUT_DIR, 'services.json'), sortById(services));
  writeJson(path.join(OUTPUT_DIR, 'service_trips.json'), sortById(serviceTrips));
  writeJson(path.join(OUTPUT_DIR, 'assertions.json'), sortById(assertions));
  writeJson(path.join(OUTPUT_DIR, 'migration_report.json'), report);

  console.log('v2 migration complete.');
  console.log(JSON.stringify(report, null, 2));
}

main();
