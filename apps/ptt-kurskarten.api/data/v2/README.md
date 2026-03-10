# data/v2

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
