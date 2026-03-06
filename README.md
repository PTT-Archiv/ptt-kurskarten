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
npm run dev:api
```

Start UI (dev server with proxy to API):

```bash
npm run dev:web
```

Then open:

- UI: http://localhost:4200
- API base: http://localhost:3000/api/v1
- Health check: http://localhost:3000/api/v1/health

## Root commands

- `npm run dev:web` -> run Angular dev server
- `npm run dev:api` -> run Nest API in watch mode
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
- `GraphEdge`: connection between nodes (`from`, `to`, `leuge`, validity window, multilingual `notes`, `trips`)
- `EdgeTrip`: timetable entry on an edge (`transport`, `departs`, `arrives`, optional day offset)
- `GraphSnapshot`: graph state for one year (`year`, `nodes[]`, `edges[]`)
- `ConnectionOption`/`ConnectionLeg`: computed route-planning result objects

## Wikidata Q-number linkage

Wikidata metadata is loaded from `apps/ptt-kurskarten-ui/src/assets/wikidata.json` (via `environment.staticWikidataPath`).

Current linkage behavior:

- `GraphNode` itself does not store `qNumber`
- viewer code (`fetchWikidata` in `viewer.component.ts`) normalizes `entry.name` and node names
- linkage is therefore name-based: `node.name` -> matching Wikidata `entry.name`
- `qNumber` = single resolved item; `qNumbers` = ambiguous candidates
- translations from `translations` and `translationsByQNumber` are used as search aliases

The enrichment helper script `scripts/enrich_wikidata.py` resolves and updates Q-number data in repository-root `wikidata.json` (including label translations). If you use this script, sync/export the result to `apps/ptt-kurskarten-ui/src/assets/wikidata.json` for the viewer/static build.

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

- `apps/ptt-kurskarten.api/data/nodes.json`
- `apps/ptt-kurskarten.api/data/edges.json`
- `apps/ptt-kurskarten.api/data/segments.json`
- `apps/ptt-kurskarten.api/data/trips.json`

You can run with ephemeral in-memory data using:

```bash
GRAPH_REPO=memory npm run dev:api
```

## Static/read-only build

`npm run build:static` builds the UI in static mode:

- no server-side API required at runtime
- graph data is bundled from `apps/ptt-kurskarten.api/data/*.json` into UI assets
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
