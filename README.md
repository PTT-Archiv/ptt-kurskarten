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
