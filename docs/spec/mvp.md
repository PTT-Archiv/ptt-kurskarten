# Kurskarten MVP (Monorepo)

Goal:
Interactive Swiss “kurskarte”-style network: nodes (places) + edges (routes) over time.

User can:
- choose a year (slider)
- see nodes + edges for that year
- click a node to view details + connected edges
- optionally filter by transport mode (coach/postauto/rail) [MVP optional]

User cannot (Non-goals for MVP):
- OCR / automatic extraction from scanned kurskarten
- geospatial accuracy / GIS projection
- multi-user editing
- complex timetable scheduling

Data model (conceptual):
- PlaceNode: id, name, x, y, validFromYear, validToYear?, meta?
- RouteEdge: id, fromNodeId, toNodeId, validFromYear, validToYear?, transportType, durationMinutes?
- (optional) ServicePattern: frequencyText, notes

API (REST, v1):
- GET /v1/years -> available years
- GET /v1/graph?year=YYYY -> nodes[], edges[]
- GET /v1/nodes/:id?year=YYYY -> node + neighbors + edges
- (optional) GET /v1/search?q=...

Web UI:
- Canvas full area left
- Right panel: year, node details, legend
- Slider change is debounced (e.g. 150-300ms)

Performance constraints:
- Demo dataset: ~500 nodes, ~1500 edges must feel responsive
- slider scrubbing should not lock the UI

Definition of Done:
- /v1/graph returns correct filtered graph for a year
- web renders it and updates on year change
- node click highlights neighbors and shows details
- README has "how to run" from repo root
