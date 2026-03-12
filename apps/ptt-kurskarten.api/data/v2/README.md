# data/v2

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
