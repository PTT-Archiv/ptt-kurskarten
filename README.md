# ptt-kurskarten

Interactive monorepo for exploring and editing historical Swiss route networks ("Kurskarten"), with route planning on top of a year-filtered graph.

## What this project includes

- `apps/ptt-kurskarten-ui`: Angular app (viewer, route planner, reports, admin UI)
- `apps/ptt-kurskarten.api`: NestJS API (`/api/v1/...`) for graph data, routing, and CRUD
- `packages/shared`: shared TypeScript types used by both UI and API

## Quickstart

From repository root:

```bash
npm install
```

Start API (watch mode):

```bash
cd apps/ptt-kurskarten.api
npm start
```

Start UI (dev server with proxy to API):

```bash
cd apps/ptt-kurskarten-ui
npm start
```

Then open:

- UI: http://localhost:4200
- API base: http://localhost:3000/api/v1
- Health check: http://localhost:3000/api/v1/health

## Root commands

- `npm run build` -> build shared package, API, and UI
- `npm run build:static` -> build shared package + UI in static/read-only mode

## GitHub workflows

- `.github/workflows/deploy-static-viewer.yml` (`Deploy Static Viewer`)
  - triggers on `push` to `main`/`master` and manual `workflow_dispatch`
  - installs dependencies with `npm ci`
  - builds shared package and static viewer with repo-aware `--base-href`
  - verifies static output (no admin/reporting chunks, no direct `/api/v1/...` endpoint strings, required graph-data files exist)
  - uploads artifact and deploys to GitHub Pages
- `.github/workflows/security-audit.yml` (`Security Audit`)
  - triggers weekly (Monday 06:00 UTC) and manual `workflow_dispatch`
  - runs `npm ci`
  - generates production audit report via `npm audit --workspaces --omit=dev --json`
  - uploads audit report as workflow artifact
  - fails job only if `high` or `critical` vulnerabilities are present

## Data model (short)

Shared model types live in `packages/shared/src/index.ts`.

- `GraphNode`: station/place (`id`, `name`, map coordinates `x`/`y`, `validFrom`/`validTo`, optional `foreign`, optional IIIF center)
- `GraphEdge`: connection between nodes (`from`, `to`, `distance`, validity window, multilingual `notes`, `trips`)
- `EdgeTrip`: timetable entry on an edge (`transport`, `departs`, `arrives`, optional day offset)
- `GraphSnapshot`: graph state for one year (`year`, `nodes[]`, `edges[]`)
- `ConnectionOption`/`ConnectionLeg`: computed route-planning result objects

## Place aliases and Wikidata facts

The viewer now reads aliases from the normalized v2 model:

- API mode: `GET /api/v1/place-aliases?year=...`
- Static mode: aliases are derived from `data/v2/place_names.json` for the selected year
- Canonical place label comes from preferred active `place_names`; additional active names are search aliases

Wikidata should be stored as facts in `data/v2/assertions.json` (for example a `schemaKey` such as `place.wikidata_qid` on a `targetType: "place"` record), rather than via a separate viewer-only JSON file.

## ICA-aligned extension (context + records)

To make linkage robust and ICA-friendly, add explicit node references and archive metadata fields to each Wikidata entry (or to a dedicated linkage file):

```json
{
  "name": "Aarau",
  "qNumber": "Q14274",
  "nodeIds": ["aarau"],
  "ica": {
    "context": {
      "standard": "ISAAR(CPF)",
      "authorityId": "CH-XXX-...",
      "entityType": "corporateBody",
      "history": "..."
    },
    "record": {
      "standard": "ISAD(G)",
      "referenceCode": "CH-XXX-...",
      "title": "PTT Kursblatt Aarau",
      "date": "1852",
      "levelOfDescription": "item",
      "repository": "..."
    }
  }
}
```

Recommended next step for implementation:

- prefer `nodeIds` for node linkage and only fall back to normalized `name` matching
- keep ICA fields optional so existing data remains valid
- validate this schema in import scripts and UI load path

## API overview

Base prefix: `/api/v1`

- `GET /health`
- `GET /years`
- `GET /graph?year=1852`
- `GET /nodes/:id?year=1852`
- `GET /connections?year=...&from=...&to=...&depart=08:00&k=10&allowForeignStartFallback=true`
- `GET /report/station/:nodeId?year=1852`
- `GET /report/edge/:edgeId?year=1852`
- `POST /nodes`, `PUT /nodes/:id`, `DELETE /nodes/:id`
- `POST /edges`, `PUT /edges/:id`, `DELETE /edges/:id`

## Data and persistence

By default the API uses the JSON-backed repository (`GRAPH_REPO=json`) and persists edits into:

- `apps/ptt-kurskarten.api/data/v2/places.json`
- `apps/ptt-kurskarten.api/data/v2/place_names.json`
- `apps/ptt-kurskarten.api/data/v2/map_anchors.json`
- `apps/ptt-kurskarten.api/data/v2/editions.json`
- `apps/ptt-kurskarten.api/data/v2/links.json`
- `apps/ptt-kurskarten.api/data/v2/link_measures.json`
- `apps/ptt-kurskarten.api/data/v2/services.json`
- `apps/ptt-kurskarten.api/data/v2/service_trips.json`
- `apps/ptt-kurskarten.api/data/v2/assertions.json`

### Normalized v2 export (for future DB migration)

To generate a normalized canonical dataset from legacy JSON files:

```bash
npm run migrate:data:v2
```

Output folder:

- `apps/ptt-kurskarten.api/data/v2`

This export keeps IDs traceable, separates places/anchors/links/services/trips, and writes migration diagnostics to `migration_report.json`.

### Canonical `v2` data model (normalized)

The `data/v2` folder is the canonical edit model. It is normalized so that:

- one real-world place is stored once
- map coordinates are managed on one canonical simplified map via validity windows
- route structure is separated from timetable rows
- metadata is extensible through generic facts/assertions
- migration to SQL later is straightforward (one JSON file ~= one table)

`v2` files and roles:

- `places.json`: stable place identities
- `place_names.json`: multilingual/historical names and aliases
- `map_anchors.json`: place coordinates on the canonical simplified map (temporal via validity)
- `editions.json`: year context / provenance for a Kurskarte
- `links.json`: undirected relation between two places
- `link_measures.json`: link-level values such as `distance`
- `services.json`: directed route/service variants (`from` -> `to`), one year per record
- `service_trips.json`: timetable rows attached to one service (same year as service)
- `assertions.json`: generic facts/identifiers (including Wikidata)
- `migration_report.json`: counts and warnings from conversion

Conceptually:

```text
Place --< PlaceName
Place --< MapAnchor(validFrom/validTo)
Edition(year/provenance)
Place --< Link(placeA/placeB) >-- Place
Link --< LinkMeasure
Link --< Service(direction)
Service(year-bound) --< ServiceTrip
Any entity --< Assertion
```

#### How to work with it (archive-oriented workflow)

1. Create or find the `Place`.
2. Add canonical and alternate names in `place_names.json`.
3. Maintain map positions in `map_anchors.json` and control timeline with `validFrom` / `validTo`.
4. Create or update `editions.json` for yearly context.
5. Create `links.json` between place pairs.
6. Add `link_measures.json` (`distance`, etc.).
7. Add directed `services.json` variants.
8. Add timetable rows in `service_trips.json`.
9. Add metadata/IDs as `assertions.json`.

This keeps editing understandable for archivists: identity, map placement, route, timetable, and evidence are separate concerns.

#### Future-proofing rules

- Keep IDs stable and human-reviewable.
- Never duplicate place identity per year; use edition context instead.
- Keep `links` undirected; direction belongs in `services`.
- Keep unknown values as `null` (not guessed placeholders).

### Migration path to PostgreSQL

Because `v2` is table-shaped JSON, PostgreSQL migration can be direct:

1. Create SQL tables matching `v2` files.
2. Preserve IDs as `TEXT` primary keys.
3. Import JSON into staging tables.
4. Run referential/integrity checks.
5. Promote to production tables and add API repository for Postgres.

Suggested SQL mapping:

- `places`, `place_names`, `map_anchors`
- `editions`, `links`, `link_measures`, `services`, `service_trips`
- `assertions`

Recommended constraints/indexes:

- foreign keys on all `...Id` references
- index `map_anchors(placeId, validFrom, validTo)`
- check `placeAId < placeBId` for undirected links
- index `services(fromPlaceId)`, `services(toPlaceId)`, `service_trips(serviceId)`
- index `assertions(targetType, targetId, schemaKey)`
- optional `GIN` index for JSON fields like `assertions.valueJson` and `services.note`

Recommended rollout:

1. Keep JSON as source of truth, import to Postgres nightly.
2. Validate parity (`counts`, sampled records, route outputs).
3. Move API reads to Postgres.
4. Move writes to Postgres.
5. Keep JSON export as backup/static artifact.

### Document store vs relational store (evaluation)

#### Document store strengths

- very flexible schema changes
- easy to store heterogeneous metadata payloads
- convenient for full-document reads/writes

#### Document store risks for this project

- weaker enforcement of graph integrity (orphan refs, duplicates)
- harder multi-entity transactional updates
- more custom logic needed for archival consistency rules
- joins across place/link/service/trip are less transparent

#### Relational store strengths

- strong referential integrity and constraints
- clear normalization for archive entities
- efficient joins for reports, routing prep, QA checks
- easier long-term governance and auditability

#### Relational store risks

- more upfront schema work
- requires migration/version discipline

#### Recommendation

Use a hybrid architecture:

- relational (PostgreSQL) for canonical model and integrity
- JSON/JSONB fields for flexible metadata payloads (`assertions.valueJson`, localized notes)
- generated document snapshots for static UI/runtime speed

For this domain (historical network + provenance + multi-year editions), relational-first is the safer long-term core.

You can run with ephemeral in-memory data using:

```bash
cd apps/ptt-kurskarten.api
GRAPH_REPO=memory npm start
```

## Static/read-only build

`npm run build:static` builds the UI in static mode:

- no server-side API required at runtime
- graph data is bundled from `apps/ptt-kurskarten.api/data/v2/*.json` into UI assets
- viewer runs in read-only mode

Build output:

- `apps/ptt-kurskarten-ui/dist/ptt-kurskarten-ui`

## Workspace-specific commands

Run commands directly in a workspace when needed:

```bash
npm run test --workspace ptt-kurskarten.api
npm run test --workspace ptt-kurskarten-ui
npm run build --workspace @ptt-kurskarten/shared
```
