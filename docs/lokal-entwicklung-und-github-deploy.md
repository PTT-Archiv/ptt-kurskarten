# Lokal entwickeln und GitHub-Deploy verstehen

Diese Datei erklärt:

1. wie du das Repository lokal startest,
2. was lokal möglich ist,
3. was beim GitHub-Deploy tatsächlich öffentlich sichtbar ist.

## 1. Voraussetzungen

- Node.js 22 (Workflows nutzen ebenfalls Node 22)
- `npm`

Im Repository-Root installieren:

```bash
npm install
```

## 2. Lokal starten (2 Terminals)

Terminal 1 (API, Watch Mode):

```bash
cd apps/ptt-kurskarten.api
npm start
```

Terminal 2 (UI, Angular Dev Server):

```bash
cd apps/ptt-kurskarten-ui
npm start
```

Dann:

- UI: `http://localhost:4200`
- API: `http://localhost:3000/api/v1`
- Health: `http://localhost:3000/api/v1/health`

Hinweis: Die UI proxyt `/api` lokal auf `http://localhost:3000` (`apps/ptt-kurskarten-ui/proxy.conf.json`).

## 3. Was lokal möglich ist

Lokal mit laufender API hast du den vollen Funktionsumfang:

- Viewer (`/`)
- Admin (`/admin`, `/admin/tutorial`)
- Reports (`/reports`)
- Connections-Seite (`/connections`)
- API-CRUD und Auswertungen über `/api/v1/...`

Standard-Persistenz lokal:

- Repository-Typ: `GRAPH_REPO=json` (Default)
- Änderungen landen direkt in `apps/ptt-kurskarten.api/data/v2/*.json`

Optional kannst du mit In-Memory-Repo starten:

```bash
cd apps/ptt-kurskarten.api
GRAPH_REPO=memory npm start
```

Dann sind Änderungen nur im RAM.

## 4. Lokale Builds

Gesamtbuild (Shared + API + UI):

```bash
npm run build
```

Static-Viewer-Build (Shared + UI static config):

```bash
npm run build:static
```

## 5. Was GitHub tatsächlich deployed

Deploy-Workflow: `.github/workflows/deploy-static-viewer.yml`

Trigger:

- `push` auf `main` oder `master`
- manuell per `workflow_dispatch`

Der Workflow baut **nur den statischen Viewer**:

- Angular `static`-Konfiguration (`environment.static.ts` + `app.routes.static.ts`)
- statische Daten aus `apps/ptt-kurskarten.api/data/v2/*.json` werden nach `assets/graph-data` kopiert
- Deployment auf GitHub Pages

Zusätzliche Prüfungen im Workflow:

- keine Admin-/Reports-/Connections-Lazy-Chunks im Deploy-Artefakt
- keine direkten `/api/v1/...` Endpoint-Strings im JS-Bundle

## 6. Was ist auf GitHub Pages sichtbar?

| Bereich | Lokal | GitHub Pages |
| --- | --- | --- |
| Viewer (`/`) | Ja | Ja |
| Routenplanung im Viewer-Overlay | Ja | Ja (berechnet clientseitig auf statischen Daten) |
| Admin (`/admin`) | Ja | Nein |
| Reports (`/reports`) | Ja | Nein |
| Connections-Seite (`/connections`) | Ja | Nein |
| Live-API-Aufrufe `/api/v1/...` aus der UI | Ja | Nein (static mode) |
| Bearbeiten/Speichern von Daten über Admin | Ja | Nein |

## 7. Was ist bei Änderungen auf GitHub sichtbar?

Auf GitHub Pages sichtbar nach Deploy sind nur:

- Änderungen am Viewer, die in der Static-Route enthalten sind
- Änderungen an statischen Assets
- Änderungen in `apps/ptt-kurskarten.api/data/v2/*.json` (weil diese ins Static-Artefakt kopiert werden)

Nicht öffentlich sichtbar auf GitHub Pages:

- API-Serverlogik (NestJS-Endpunkte, Controller, Repository-Logik)
- Admin/Reports/Connections-Routen und deren UI
- alles, was einen laufenden Backend-Service erfordert

## 8. Zweiter Workflow (kein Deploy)

`.github/workflows/security-audit.yml` deployed nichts.

Er:

- läuft wöchentlich + manuell,
- erzeugt `npm audit`-Report als Artifact,
- schlägt nur bei `high`/`critical` Vulnerabilities fehl.
