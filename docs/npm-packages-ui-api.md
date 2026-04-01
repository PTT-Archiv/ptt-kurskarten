# NPM-Pakete in Workspace, UI und API

Dieses Dokument beschreibt die direkt deklarierten NPM-Pakete aus den folgenden Dateien:

- `package.json`
- `apps/ptt-kurskarten-ui/package.json`
- `apps/ptt-kurskarten.api/package.json`

## Was bedeuten die zwei Typen?

- `dependency`: Diese Pakete werden zur Laufzeit der Anwendung benötigt. Ohne sie startet die UI oder API nicht korrekt oder zentrale Funktionen fehlen.
- `devDependency`: Diese Pakete werden nur für Entwicklung, Build, Tests, Linting oder Formatierung benötigt. Sie unterstützen den Entwicklungsprozess, sind aber normalerweise nicht Teil der eigentlichen Laufzeit.

## Warum sind die Pakete an verschiedenen Stellen eingetragen?

- `package.json` im Workspace-Root enthält gemeinsames Tooling und root-weite Pakete, die nicht nur zu einer einzelnen App gehören.
- `apps/ptt-kurskarten-ui/package.json` enthält alles, was speziell für das Angular-Frontend und dessen SSR-Betrieb gebraucht wird.
- `apps/ptt-kurskarten.api/package.json` enthält alles, was speziell für das NestJS-Backend gebraucht wird.
- UI und API sind über `@ptt-kurskarten/shared` miteinander verbunden. Dort liegen gemeinsame Typen oder wiederverwendbare Bausteine, damit beide Anwendungen auf derselben fachlichen Grundlage arbeiten.

## Workspace Root Tooling

Im Root liegen vor allem Werkzeuge, die den gesamten Monorepo betreffen. Sie sind hier platziert, weil sie nicht nur einer einzelnen App dienen, sondern konsistente Regeln und Abläufe für das ganze Projekt bereitstellen.

| Paket                              | Typ             | Kurzbeschreibung                                                             |
| ---------------------------------- | --------------- | ---------------------------------------------------------------------------- |
| `@typescript-eslint/eslint-plugin` | `devDependency` | ESLint-Regeln speziell für TypeScript-Code.                                  |
| `@typescript-eslint/parser`        | `devDependency` | ESLint-Parser für TypeScript-Syntax und typbasierte Analyse.                 |
| `angular-eslint`                   | `devDependency` | Angular-spezifische ESLint-Integration für TypeScript- und Template-Dateien. |
| `eslint`                           | `devDependency` | Linter für einheitliche Qualitäts- und Stilregeln im gesamten Workspace.     |
| `eslint-config-prettier`           | `devDependency` | Schaltet ESLint-Regeln ab, die mit Prettier kollidieren würden.              |
| `eslint-plugin-unused-imports`     | `devDependency` | Findet und bereinigt ungenutzte Imports und Variablen.                       |
| `husky`                            | `devDependency` | Verwaltet Git-Hooks, um lokale Prüfungen vor Commits auszuführen.            |
| `lint-staged`                      | `devDependency` | Führt Linting und Formatierung nur für bereits gestagte Dateien aus.         |
| `prettier`                         | `devDependency` | Formatter für konsistente Code- und Dokumentformatierung im Monorepo.        |

## UI (`apps/ptt-kurskarten-ui`)

Die UI enthält Angular-, SSR- und Frontend-spezifische Pakete. Diese liegen bewusst im UI-Paket, weil sie für Rendering, Routing, Übersetzungen, Tests und den SSR-Server des Frontends verantwortlich sind.

| Paket                               | Typ             | Kurzbeschreibung                                                                                |
| ----------------------------------- | --------------- | ----------------------------------------------------------------------------------------------- |
| `@angular/build`                    | `devDependency` | Build-System für Bundling, Optimierung und Auslieferung der Angular-Anwendung.                  |
| `@angular/cli`                      | `devDependency` | Kommandozeilenwerkzeug zum Starten, Bauen und Verwalten der Angular-App.                        |
| `@angular/common`                   | `dependency`    | Gemeinsame Angular-Direktiven, Pipes und Hilfsfunktionen für das Frontend.                      |
| `@angular/compiler`                 | `dependency`    | Angular-Template-Compiler zur Umwandlung von Templates in ausführbaren Code.                    |
| `@angular/compiler-cli`             | `devDependency` | Compiler-Anbindung für TypeScript- und Angular-Builds.                                          |
| `@angular/core`                     | `dependency`    | Kernpaket von Angular mit Komponentenmodell, DI und Laufzeitverhalten.                          |
| `@angular/platform-browser`         | `dependency`    | Browser-spezifische Laufzeitunterstützung für das Angular-Frontend.                             |
| `@angular/platform-server`          | `dependency`    | Server-seitige Angular-Unterstützung für SSR und Prerendering.                                  |
| `@angular/router`                   | `dependency`    | Routing-Bibliothek für Navigation und View-Komposition im Frontend.                             |
| `@angular/ssr`                      | `dependency`    | Angular-Werkzeuge für Server Side Rendering und SSR-Integration.                                |
| `@fortawesome/angular-fontawesome`  | `dependency`    | Angular-Bindings zur Nutzung von Font-Awesome-Icons in Templates.                               |
| `@fortawesome/fontawesome-svg-core` | `dependency`    | SVG-Kernbibliothek von Font Awesome.                                                            |
| `@fortawesome/free-solid-svg-icons` | `dependency`    | Freies Solid-Iconset von Font Awesome für die UI.                                               |
| `@jsverse/transloco`                | `dependency`    | Internationalisierungsbibliothek für Übersetzungen und lokalisierte Inhalte.                    |
| `@ptt-kurskarten/shared`            | `dependency`    | Gemeinsames Workspace-Paket für geteilte Typen und wiederverwendbare Logik zwischen UI und API. |
| `@types/express`                    | `devDependency` | TypeScript-Typdefinitionen für Express.                                                         |
| `@types/node`                       | `devDependency` | TypeScript-Typdefinitionen für Node.js-APIs.                                                    |
| `@types/openseadragon`              | `devDependency` | TypeScript-Typdefinitionen für OpenSeadragon im Frontend.                                       |
| `express`                           | `dependency`    | Serverframework, das hier den Angular-SSR-Server hostet.                                        |
| `jsdom`                             | `devDependency` | DOM-Implementierung für Node.js, nützlich für Tests und browserähnliche Umgebungen.             |
| `openseadragon`                     | `dependency`    | Bildbetrachter für große, zoombare Karten- und Scanbilder im Frontend.                          |
| `rxjs`                              | `dependency`    | Reaktive Bibliothek für Streams, asynchrone Abläufe und Event-Verarbeitung.                     |
| `tslib`                             | `dependency`    | Laufzeit-Hilfsbibliothek für von TypeScript erzeugten Code.                                     |
| `typescript`                        | `devDependency` | TypeScript-Compiler und Sprachwerkzeuge für die UI.                                             |
| `vitest`                            | `devDependency` | Test-Runner für Unit- und Integrationstests im Frontend.                                        |
| `zone.js`                           | `dependency`    | Bibliothek zur Kontextverfolgung, die Angular bei Change Detection unterstützt.                 |

## API (`apps/ptt-kurskarten.api`)

Die API enthält NestJS- und Backend-spezifische Pakete. Diese liegen im API-Paket, weil sie für HTTP-Server, Dependency Injection, Tests, Build-Werkzeuge und Backend-Entwicklung benötigt werden.

| Paket                      | Typ             | Kurzbeschreibung                                                                                |
| -------------------------- | --------------- | ----------------------------------------------------------------------------------------------- |
| `@eslint/eslintrc`         | `devDependency` | Kompatibilitätshilfen für ESLint-Konfigurationen.                                               |
| `@eslint/js`               | `devDependency` | Offizielle Basiskonfigurationen und Regeln des ESLint-Projekts.                                 |
| `@nestjs/cli`              | `devDependency` | NestJS-Kommandozeilenwerkzeug zum Generieren, Starten und Bauen der API.                        |
| `@nestjs/common`           | `dependency`    | Zentrale NestJS-Dekoratoren, Interfaces, Pipes, Guards und Hilfsfunktionen.                     |
| `@nestjs/core`             | `dependency`    | Laufzeitkern von NestJS für Bootstrap, Module und Dependency Injection.                         |
| `@nestjs/platform-express` | `dependency`    | Express-Adapter für NestJS, damit die API auf Express läuft.                                    |
| `@nestjs/schematics`       | `devDependency` | Generatoren für Module, Controller und Services über die Nest-CLI.                              |
| `@nestjs/testing`          | `devDependency` | Testhilfen für isolierte NestJS-Tests und Testmodule.                                           |
| `@ptt-kurskarten/shared`   | `dependency`    | Gemeinsames Workspace-Paket für geteilte Typen und wiederverwendbare Logik zwischen API und UI. |
| `@swc/cli`                 | `devDependency` | Kommandozeilenwerkzeug für den schnellen TypeScript/JavaScript-Compiler SWC.                    |
| `@swc/core`                | `devDependency` | Kernbibliothek des SWC-Compilers.                                                               |
| `@types/express`           | `devDependency` | TypeScript-Typdefinitionen für Express.                                                         |
| `@types/node`              | `devDependency` | TypeScript-Typdefinitionen für Node.js-APIs.                                                    |
| `@types/supertest`         | `devDependency` | TypeScript-Typdefinitionen für Supertest.                                                       |
| `@vitest/coverage-v8`      | `devDependency` | V8-basierte Code-Coverage-Integration für Vitest.                                               |
| `chokidar`                 | `devDependency` | Datei-Watcher für zuverlässige Änderungsüberwachung in der Entwicklung.                         |
| `eslint`                   | `devDependency` | Linter für Qualitäts- und Stilregeln im Backend-Code.                                           |
| `eslint-config-prettier`   | `devDependency` | Verhindert Konflikte zwischen ESLint-Regeln und Prettier-Formatierung.                          |
| `eslint-plugin-prettier`   | `devDependency` | Meldet Prettier-Formatierungsprobleme direkt über ESLint.                                       |
| `globals`                  | `devDependency` | Stellt bekannte globale Variablen für ESLint-Konfigurationen bereit.                            |
| `prettier`                 | `devDependency` | Formatter für konsistente Formatierung der API-Quellen.                                         |
| `reflect-metadata`         | `dependency`    | Metadaten-Bibliothek, die von NestJS-Dekoratoren und Dependency Injection benötigt wird.        |
| `rxjs`                     | `dependency`    | Reaktive Bibliothek für Observable-basierte Abläufe im Backend.                                 |
| `source-map-support`       | `devDependency` | Verbessert Stacktraces, indem kompilierter Code auf TypeScript-Quellen zurückgeführt wird.      |
| `supertest`                | `devDependency` | Bibliothek zum Testen von HTTP-Endpunkten der API.                                              |
| `ts-loader`                | `devDependency` | TypeScript-Loader für Build-Pipelines mit webpack-artiger Integration.                          |
| `ts-node`                  | `devDependency` | Führt TypeScript-Dateien direkt in Node.js ohne separaten Vorab-Build aus.                      |
| `tsconfig-paths`           | `devDependency` | Löst TypeScript-Pfadaliasse zur Laufzeit anhand der `tsconfig` auf.                             |
| `typescript`               | `devDependency` | TypeScript-Compiler und Sprachwerkzeuge für die API.                                            |
| `typescript-eslint`        | `devDependency` | Bündelt TypeScript-Unterstützung für ESLint, inklusive Parser und Regelsätzen.                  |
| `vitest`                   | `devDependency` | Test-Runner für Unit-, Integrations- und End-to-End-Tests der API.                              |
