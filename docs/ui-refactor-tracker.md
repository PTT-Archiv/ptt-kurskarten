# UI- und Viewer-Refactor-Tracker

Dieses Dokument ist die zentrale, abhakbare Arbeitsliste fuer das laufende UI-Refactoring in `ptt-kurskarten-ui`.

Legende:

- `[x]` erledigt
- `[ ]` offen

Pflegeregel:

- Bei Abschluss direkt abhaken.
- Bei Teilfortschritt kurze Notiz direkt unter dem Punkt ergaenzen.
- Nur konkrete, pruefbare Aufgaben aufnehmen.
- Erledigte Punkte nicht loeschen.
- Technische Refactors und visuelle Verifikation getrennt halten.

## 1. Bereits umgesetzt

- [x] Globale CSS-Foundation unter `apps/ptt-kurskarten-ui/src/styles/` eingefuehrt.
- [x] Globale Token-Datei fuer Farben, Spacing, Radius, Shadows und Typography eingefuehrt.
- [x] Globale Base-Styles und UI-Primitives fuer Buttons, Surfaces und Form-Controls eingefuehrt.
- [x] Viewer, Admin und Toast auf gemeinsame globale UI-Primitives umgestellt.
- [x] Widerspruechliche Altklassen wie `ghost-btn` als Design-System-Namen aus der aktiven Nutzung entfernt.
- [x] Viewer-CSS aus dem Shell-Stylesheet in Child-Komponenten aufgeteilt.
- [x] `ViewEncapsulation.None` aus dem Viewer entfernt.
- [x] `viewer.component.css` auf Shell-/Layout-/Koordinationsregeln reduziert.
- [x] Child-CSS-Dateien fuer Header, Mobile Sheet, Floating Actions, Sidebar, Results, Place Details, Route Details und Route Node Panel befuellt.
- [x] Repeated UI-Rhythmuswerte im Viewer ueber globale Tokens vereinheitlicht.
- [x] Token-Sweep fuer Spacing, Radius, Typography und ausgewaehlte Insets im Viewer durchgefuehrt.
- [x] Viewer-Fassade in mehrere feature-lokale Stores und Utils aufgeteilt.
- [x] Viewer-Stores und Viewer-Utils in eigene Unterordner verschoben.
- [x] TS-Path-Aliases fuer `@viewer/*`, `@admin/*`, `@connections/*`, `@reports/*` und weitere UI-Pfade eingefuehrt.
- [x] Angular-Viewer-Child-Komponenten auf `input()` / `output()` und `OnPush` umgestellt.

## 2. Globales UI-System

- [ ] Typography-Scale als verbindliche UI-Regel dokumentieren und auf Admin/Shared UI vollstaendig angleichen.
- [x] Gemeinsame Surface-/Panel-Primitives weiter schaerfen, damit lokale Panel-Basisregeln in Features weiter schrumpfen.
- [ ] Gemeinsame State-Konventionen fuer `is-active`, `is-selected`, `is-open`, `is-disabled` dokumentieren.
- [x] Gemeinsame Text-/Section-Helfer pruefen und entscheiden, was globales Primitive wird und was lokal bleiben soll.
- [x] Uebrige doppelte Form-Control-Stile zwischen Viewer und Admin auf gemeinsame Primitives zurueckfuehren.
- [ ] Design-System-Naming mit strengem BEM in `docs/engineering-standards.md` oder `AGENTS.md` explizit festhalten.

## 3. Viewer

### Shell und Layout

- [x] Viewer-Shell und Child-Ownership stilistisch getrennt.
- [ ] Shell-Koordination auf wirklich featureuebergreifende Layout-Regeln begrenzen und Rest-Duplikate weiter abbauen.
- [ ] Pruefen, ob `viewer.component.css` noch weitere Child-nahe Selektoren enthaelt, die nach unten verschoben werden koennen.

### Header

- [x] Header nutzt komponentenlokale Styles.
- [ ] Header-Typografie und Search-/Edition-Spacing auf verbleibende Sonderfaelle pruefen.
- [ ] Archiv-Mode- und Small-Screen-Regeln im Header nach moeglichen Vereinfachungen durchsuchen.

### Mobile Sheet

- [x] Mobile-Sheet-Styles in eigene Component-CSS verschoben.
- [ ] `peek` / `half` / `full` visuell auf Mobile gegenpruefen.
- [ ] Mobile-Sheet-Hoehen und Insets auf moegliche weitere Tokenisierung pruefen, ohne Geometrie kuenstlich zu abstrahieren.

### Floating Actions

- [x] Floating-Actions-Styles in eigene Component-CSS verschoben.
- [ ] Help-/Settings-Popup-Stile auf gemeinsame Overlay-Primitives pruefen.
- [ ] Sprach- und Layer-Switcher visuell gegen Admin-/Shared-Controls abgleichen.

### Sidebar und Route Node Panel

- [x] Sidebar-Styles in eigene Component-CSS verschoben.
- [x] Route-Node-Panel-Styles in eigene Component-CSS verschoben.
- [ ] Sidebar-/Route-Panel-Section-Patterns weiter vereinheitlichen.
- [ ] Open-/Closed-States auf moegliche weitere Lokalisierung am Host pruefen.

### Results, Place Details und Route Details

- [x] Results-, Place-Details- und Route-Details-Stile lokalisiert.
- [ ] Gemeinsame Card-/Meta-/Section-Patterns zwischen den Panels weiter vereinheitlichen.
- [ ] `muted`-/Meta-Textregeln auf gemeinsame Primitive oder klare lokale Ownership pruefen.

### Planner Overlay und Time Controls

- [ ] Route-Planner-Overlay-Styles aus TS in echte CSS-Datei auslagern.
- [ ] Time-Control-Styles aus TS in echte CSS-Datei auslagern.
- [ ] Planner-Overlay weiter in kleinere visuelle/technische Unterkomponenten zerlegen.
- [ ] Typeahead-/Field-Teile des Planners weiter von Shell-Layout entkoppeln.

### Facade, Stores, Utils und Tests

- [x] Viewer-Fassade strukturell in Stores/Utils aufgeteilt.
- [ ] `viewer.facade.ts` weiter schrumpfen und nur als duenne Orchestrierung belassen.
- [ ] Pure Selektoren/Mapper aus der Fassade weiter in Utils verschieben, wo keine Injection noetig ist.
- [ ] Gezielt Unit-Tests fuer Stores und VM-Ableitungen ergaenzen.
- [ ] Inline-Styles in Viewer-Komponenten systematisch abbauen.

## 4. Admin / Toast / Shared UI

- [x] Admin und Toast an die globale UI-Foundation angebunden.
- [ ] Admin-Buttons vollstaendig auf globale Primitives und Viewer-nahe Designlogik angleichen.
- [ ] Admin-Form-Controls und Panels auf verbleibende Alt-Design-Regeln pruefen.
- [ ] Toast-Container und Dismiss-Controls visuell gegen die neue Foundation validieren.
- [x] Shared UI-Komponenten wie Map-/Archive-nahe Controls auf gemeinsame Design-Tokens angleichen.

## 5. Qualitaet und Verifikation

- [x] Angular-UI nach den groesseren Refactors mit `ngc -p apps/ptt-kurskarten-ui/tsconfig.app.json` erfolgreich kompiliert.
- [ ] Manueller Browser-Pass fuer Viewer auf Desktop durchfuehren.
- [ ] Manueller Browser-Pass fuer Viewer auf Mobile durchfuehren.
- [ ] Archive-Mode im Browser gezielt gegenpruefen.
- [ ] Planner-/Search-Flows im Browser gezielt gegenpruefen.
- [ ] Hover-/Focus-/Disabled-Zustaende ueber Viewer, Admin und Toast gezielt gegenpruefen.
- [ ] Kleine Playwright-Smoke-Tests fuer Viewer-Shell, Sidebar, Planner und Mobile Sheet entwerfen.
- [ ] Entscheiden, ob kuenftig eine automatisierte visuelle Regression fuer Kern-UI-Zustaende eingefuehrt wird.

## 6. Spaeter / Nice to have

- [ ] Design-System-Regeln als eigenes Kapitel in den Engineering-Standards dokumentieren.
- [ ] Admin- und Viewer-Panels auf einen gemeinsamen semantischen Panel-Baukasten zusammenziehen.
- [ ] Weitere Shared-Primitives fuer Listen, Status-Badges und Meta-Zeilen ableiten.
- [ ] Screenshot-basierte Referenzdokumentation fuer wichtige UI-Zustaende aufbauen.
- [ ] Refactor-Tracker spaeter in bereichsspezifische Tracker aufteilen, falls das Dokument zu gross wird.
