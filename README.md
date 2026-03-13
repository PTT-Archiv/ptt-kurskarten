# ptt-kurskarten

`ptt-kurskarten` ist eine interaktive Plattform zur Erkundung historischer Schweizer Kurskarten. Das Projekt kombiniert eine gerenderte Netzkarte, eine Originalkartenansicht auf Basis von IIIF, Routing zwischen Orten sowie Werkzeuge für Datenpflege und Auswertung.

## Links

- Live-Viewer: https://blopditu.github.io/ptt-kurskarten/
- Lokale Entwicklung und GitHub Deploy: [docs/lokal-entwicklung-und-github-deploy.md](docs/lokal-entwicklung-und-github-deploy.md)
- Admin-Benutzerhandbuch: [docs/admin-benutzerhandbuch.md](docs/admin-benutzerhandbuch.md)
- Arc42-Dokumentation: [docs/arc42.md](docs/arc42.md)
- Datenmodell `v2`: [apps/ptt-kurskarten.api/data/v2/README.md](apps/ptt-kurskarten.api/data/v2/README.md)

## Lokal starten

Voraussetzungen:

- Node.js
- npm

Dependencies installieren:

```bash
npm install
```

API starten:

```bash
cd apps/ptt-kurskarten.api
npm start
```

UI in einem zweiten Terminal starten:

```bash
cd apps/ptt-kurskarten-ui
npm start
```

Dann öffnen:

- UI: http://localhost:4200
- API: http://localhost:3000/api/v1
- Health: http://localhost:3000/api/v1/health

Für Details zu lokalem Setup, Static Build und GitHub Pages siehe [docs/lokal-entwicklung-und-github-deploy.md](docs/lokal-entwicklung-und-github-deploy.md).

## Projektstruktur

- `apps/ptt-kurskarten-ui`: Angular-Frontend mit Viewer, Admin, Reports und Connections
- `apps/ptt-kurskarten.api`: NestJS-API für Graphdaten, Routing und CRUD
- `packages/shared`: gemeinsame TypeScript-Typen
- `apps/ptt-kurskarten.api/data/v2`: kanonische normalisierte Datenbasis

## Weitere Doku

- Usability-Test Trip Planning: [docs/usability-test-one-person-trip-planning.md](docs/usability-test-one-person-trip-planning.md)
- Usability-Test Admin: [docs/usability-test-one-person-admin.md](docs/usability-test-one-person-admin.md)
