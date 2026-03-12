# Admin-Benutzerhandbuch

Dieses Handbuch beschreibt die tägliche Arbeit in der Admin-Seite:

1. Entitäten über **Quick Entry (Quick Entity)** erfassen
2. **Archive Snippets** (Ausschnitt aus Originalkarte) anpassen
3. Neue **Kurskarten/Jahre** hinzufügen

## 1. Überblick: Was wird im Admin bearbeitet?

Im Admin arbeitest du auf einem **einheitlichen Kartenlayout** (vereinfachte Schweiz-Karte).
Die Daten sind zeitlich gesteuert:
- Places/Anchors/Facts über `validFrom` / `validTo`
- Services/Trips über **ein fixes Jahr** (keine Zeitspanne)

- **Place**: stabiler Ort (Identität)
- **Link**: Verbindung zwischen zwei Orten (strukturell)
- **Service**: gerichtete Variante eines Links (von -> nach), gilt genau für 1 Jahr
- **Trip**: einzelne Fahrzeit-Zeile eines Service (im selben Jahr)
- **Fact**: Metadaten/Fakten (z. B. Wikidata, Archivhinweise)
- **Anchor**: Kartenposition eines Place (gültig für Zeiträume)


![Screenshot-Platzhalter: Admin-Übersicht](./images/admin-handbuch/01-admin-uebersicht.png)

## 2. Quick Entry Workflow (empfohlene Reihenfolge)

Empfohlene Reihenfolge bei neuen Daten:

1. **Place** anlegen
2. **Link** zwischen Places anlegen
3. **Service** (Richtung + Notizen + Trips) anlegen
4. Optional **Trip**-Tabellen schnell ergänzen
5. Optional **Fact** ergänzen

### 2.1 Quick Mode: Place

1. Quick Mode auf **Place** stellen (`P`).
2. Namen eingeben.
3. In der Vorschlagsliste zuerst **bestehende Places** prüfen (inkl. hidden/not active Hinweis), danach optional GeoAdmin wählen.
4. Passende Aktion klicken:
   - **Use Existing Place** (bereits sichtbar)
   - **Unhide & Use Place** (im Jahr versteckt)
   - **Create Place** (wenn wirklich neu)

Hinweis:
- Bestehende Places wiederverwenden vermeidet Duplikate und übernimmt die vorhandene Anchor-Historie.
- Wenn GeoAdmin gewählt wurde, wird dessen gemappte Position verwendet.
- Sonst wird die aktuelle Karten-Cursorposition verwendet.


![Screenshot-Platzhalter: Quick Place](./images/admin-handbuch/02-quick-place.png)

### 2.2 Quick Mode: Link

1. Quick Mode auf **Link** stellen (`L`).
2. `Von` und `Nach` auswählen.
3. Optional `Distance` setzen.
4. **Create Link Draft** klicken.

Ergebnis:
- Es wird ein Link-Entwurf vorbereitet, danach direkt mit **Service** weiterarbeiten.

![Screenshot-Platzhalter: Quick Link](./images/admin-handbuch/03-quick-link.png)

### 2.3 Quick Mode: Service

1. Quick Mode auf **Service** stellen (`S`).
2. Oben im Admin das **Zieljahr** wählen.
3. `Von`/`Nach` prüfen, optional Notiz DE/FR ergänzen.
4. Trips erfassen (Transport, Dep, Arr).
5. **Create Service** klicken.

Hinweis:
- Ein Service gilt nur für das aktuell gewählte Jahr.
- Für ein anderes Jahr wird ein eigener Service-Datensatz angelegt.

![Screenshot-Platzhalter: Quick Service](./images/admin-handbuch/04-quick-service.png)

### 2.4 Quick Mode: Trip

1. Quick Mode auf **Trip** stellen (`T`).
2. Mehrere Zeilen erfassen (Transport, Dep, Arr).
3. **Append to Service** nutzen, um Trips an den gewählten Service anzuhängen.

![Screenshot-Platzhalter: Quick Trip](./images/admin-handbuch/05-quick-trip.png)

### 2.5 Quick Mode: Fact

1. Quick Mode auf **Fact** stellen (`F`).
2. Ziel-Place wählen (über Auswahl/aktuellen Kontext).
3. `schemaKey`, `valueType`, `value` setzen.
4. Fact hinzufügen oder bestehende Facts im Inspector bearbeiten.

Beispiel:
- `schemaKey = identifier.wikidata`
- `valueType = string`
- `value = Q11943`

Link-Syntax in `value`:
- Standard: Link wird automatisch aus `schemaKey` + `value` erzeugt.
  Beispiel: `schemaKey=identifier.wikidata`, `value=Q11943` -> Wikidata-Link.
- Standard: `schemaKey=identifier.mfk_permalink`, `value=152454` -> MFK-Link.
- `Q11943;wikidata` -> Label `Q11943`, Link über Provider-Template.
- `MFK Objekt 152454;https://mfk.rechercheonline.ch/mfkobject:152454` -> frei gesetzter externer Link.
- `mfkobject:152454;mfk` -> Link über den Provider `mfk`.

Hinweis:
- Nach dem `;` kann entweder eine volle URL oder ein Provider-Key stehen.
- Aktuell vordefinierte Provider: `wikidata`, `mfk`.
- Ohne `;...` funktioniert Link-Auflösung nur bei **exakt gemapptem** `schemaKey` (z. B. `identifier.wikidata`).

![Screenshot-Platzhalter: Quick Trip](./images/admin-handbuch/06-quick-fact.png)

![Screenshot-Platzhalter: Quick Trip](./images/admin-handbuch/07-quick-fact-2.png)


## 3. Archive Snippets anpassen

Archive Snippets werden im rechten Inspector unter **Anchors** gepflegt.

### Ablauf

1. Place auf der Karte auswählen.
2. Oben im Admin das **Zieljahr** wählen (Snippet wird pro Jahr gespeichert).
3. Rechts Tab **Anchors** öffnen.
4. Im Snippet-Viewer Position/Zoom so einstellen, dass der gewünschte Kartenausschnitt passt.
5. Änderungen werden für bestehende Places direkt gespeichert (Toast-Bestätigung beachten).

Wichtig:
- Der Snippet-Ausschnitt gehört zum Place (IIIF-Zentrum), nicht zum Trip.
- Snippet-Änderungen gelten für das aktuell gewählte Jahr (jahresspezifischer Anchor-Eintrag).
- Die IIIF-Route wird ebenfalls pro Jahr gesetzt (oben neben der Jahresauswahl: **IIIF Route (per year)**).
- Für zeitliche Unterschiede nutzt du `validFrom` / `validTo` bei Place/Anchor/Facts.


![Screenshot-Platzhalter: Quick Trip](./images/admin-handbuch/08-archive-snippet.png)

## 4. Neue Kurskarte (neues Jahr) hinzufügen

Ein neues Jahr kann direkt im Admin angelegt werden (oben rechts).


1. Oben im Header im Feld **New Edition** das Jahr eingeben (z. B. `1865`).
2. **Add** klicken.
3. Das Jahr wird erstellt und direkt ausgewählt.
4. Optional direkt daneben die **IIIF Route (per year)** setzen.

Technisch wird dabei ein Edition-Eintrag in `editions.json` erzeugt/aktualisiert.

### 4.2 JSON-Datei (Fallback)

Datei:
- `apps/ptt-kurskarten.api/data/v2/editions.json`

Beispiel-Eintrag:

```json
{
  "id": "edition-1865",
  "year": 1865,
  "title": "Kurskarte 1865",
  "iiifRoute": "https://iiif.ptt-archiv.ch/iiif/3/P-38-2-1865-01.jp2"
}
```

Danach erscheint das Jahr in der Jahresauswahl (weil die API `editions` in `/years` berücksichtigt).


### 4.3 Inhalt für das neue Jahr bereitstellen

Damit das Jahr nicht leer ist, müssen Entitäten für dieses Jahr aktiv sein:

- Places: `validFrom` / `validTo`
- Anchors: `validFrom` / `validTo`
- Services + Trips: **jeweils für genau dieses Jahr**
- Facts (falls zeitabhängig): `validFrom` / `validTo`

Praktischer Weg:

1. Jahr im Admin über **New Edition** anlegen (oder per `editions.json` fallback).
2. Im Admin auf dieses Jahr wechseln.
3. Bestehende Daten übernehmen/anpassen (Gültigkeiten setzen; Services ggf. neu für das Zieljahr anlegen).
4. Fehlende Places/Services per Quick Entry ergänzen.
5. Snippets in **Anchors** prüfen.

## 5. Speichern, Sichtbarkeit, Sicherheit

- Änderungen sind nach Speichern/Erstellen direkt wirksam (kein Draft/Main-Workflow).
- **Delete Place** im Admin wirkt auf das aktuell gewählte Jahr (Ausblendung für dieses Jahr), nicht global über alle Jahre.
- Vor grösseren Umbauten: Backup/Commit erstellen.

### 5.1 Jahreslogik (wichtig)

- **Jahresgebunden**: `Service`, `Trip`, `Edition` (und iiifRoute pro Edition/Jahr).
- **Zeitspanne über validFrom/validTo**: `Place`, `Anchor`, `Fact`.
- Ein Place kann über viele Jahre existieren, aber pro Jahr unterschiedliche Anchors/Facts haben.

### 5.2 Delete vs. Unhide

- **Delete Place** im Admin blendet den Place für das gewählte Jahr aus (`place.hidden` für dieses Jahr).
- **Unhide & Use Place** macht einen im gewählten Jahr versteckten Place wieder sichtbar.
- Für dauerhaftes Entfernen über alle Jahre muss außerhalb der UI in den JSON-Daten bereinigt werden.

### 5.3 Duplikate vermeiden

- Beim Anlegen immer zuerst Vorschläge prüfen und nach Möglichkeit **Use Existing Place** nutzen.
- Ein neuer Place soll nur erstellt werden, wenn es wirklich ein neuer Ort ist.
- Wiederverwendung vorhandener Places erhält die Anchor-Historie und verhindert doppelte Orte mit gleichem Namen.

### 5.4 Fakten-Regeln

- Bevorzugte Identifier-Keys:
  - `identifier.wikidata` (z. B. `Q11943`)
  - `identifier.mfk_permalink` (z. B. `152454`)
- `valueType` muss zum Wert passen:
  - `string` für IDs/Texte
  - `number` für Zahlenwerte
  - `boolean` für Ja/Nein
- Link-Auflösung:
  - Automatisch über `schemaKey` (wenn Mapping vorhanden).
  - Optional mit `;` im Wert:
    - `Q11943;wikidata`
    - `MFK Objekt 152454;https://mfk.rechercheonline.ch/mfkobject:152454`

### 5.5 Validierung und typische Fehler

- Place/Link/Service kann nicht erstellt werden:
  - Pflichtfelder prüfen (`Von`, `Nach`, Jahr, Zeiten).
- Fact wird nicht als Link angezeigt:
  - `schemaKey` prüfen oder `;provider`/`https://...` ergänzen.
- Ort im Jahr nicht sichtbar:
  - `validFrom`/`validTo` prüfen, ggf. Unhide verwenden.
- Falsche Position auf Karte:
  - im Tab **Anchors** für das richtige Jahr korrigieren.

## 6. Empfohlener End-to-End-Workflow

1. Zieljahr wählen oder über **New Edition** anlegen.
2. Place prüfen/auswählen (möglichst bestehenden Place wiederverwenden).
3. Anchor und Archive Snippet prüfen.
4. Link anlegen/prüfen.
5. Service im Zieljahr anlegen.
6. Trips ergänzen.
7. Facts ergänzen (Identifier, Hinweise).
8. Alles im Viewer/Graph für dieses Jahr kurz visuell prüfen.

## 7. Qualitätssicherung (vor Abschluss)

1. Sind alle neuen Orte im richtigen Jahr sichtbar?
2. Gibt es versehentliche Dubletten mit sehr ähnlichem Namen?
3. Stimmen Richtung und Zeiten der Services/Trips?
4. Sind Anchors und Snippets im Zieljahr korrekt?
5. Sind Facts sinnvoll benannt und korrekt typisiert (`valueType`)?
6. Sind `validFrom` / `validTo` konsistent gesetzt?

## 8. Troubleshooting (Kurzreferenz)

- **Bern/Ort X fehlt**: Jahr prüfen, dann Hidden-Status und Gültigkeit prüfen.
- **Fact nicht speicherbar/editierbar**: Pflichtfelder (`schemaKey`, `valueType`, Wert) prüfen.
- **Neuer Place wurde doppelt erstellt**: künftig Vorschlag nutzen; Dublette außerhalb UI zusammenführen.
- **Snippets/Anchor springen**: sicherstellen, dass der gewünschte Jahr-Anchor bearbeitet wird.

## 9. Datenpflege außerhalb Admin-UI (Fallback)

- JSON-Dateien in `apps/ptt-kurskarten.api/data/v2/` nur für gezielte Korrekturen direkt bearbeiten.
- Danach API/UI neu laden und die Änderung im Admin verifizieren.
- Bei manuellen Eingriffen besonders auf IDs und Referenzen achten:
  - `services.linkId` muss zu `links.id` passen.
  - `service_trips.serviceId` muss zu `services.id` passen.
  - `assertions.targetId` muss zu existierender Entität passen.

## 10. Tastatur-Shortcuts (wichtig für schnelle Erfassung)

- `P`: Place
- `L`: Link
- `S`: Service
- `T`: Trip
- `F`: Fact
- `Cmd/Ctrl + S`: Speichern
- `Cmd/Ctrl + Z`: Undo (Verschiebungen)
- `Esc`: Auswahl/Pending-Aktion abbrechen

*Screenshot-Platzhalter: Shortcut-Hinweise (Bilddatei aktuell nicht im Repository).*

## 11. Schnell-Checkliste pro neuer Verbindung

1. Place vorhanden?
2. Link vorhanden?
3. Service-Richtung korrekt?
4. Trips vollständig und Zeitformat korrekt?
5. Facts/Identifier korrekt?
6. Anchor/Snippet visuell geprüft?
7. Gültigkeiten korrekt (Places/Anchors/Facts mit `validFrom`/`validTo`, Services/Trips als Jahresdatensatz)?

## 12. Glossar

| Begriff | Erklärung |
| --- | --- |
| Quick Entry / Quick Entity | Eingabebereich links oben zum schnellen Erstellen/Bearbeiten (Modes: Place, Link, Service, Trip, Fact). |
| Place | Stabiler Ort (Identität), der über Jahre weiterlebt. |
| Link | Struktur-Verbindung zwischen zwei Places (ohne Richtung). |
| Service | Gerichtete Verbindung (`from` -> `to`) für genau ein Jahr. |
| Trip | Einzelne Fahrzeit-Zeile innerhalb eines Service. |
| Fact | Zusatzinformation zu einer Entität (hier v. a. Place), z. B. Identifier. |
| schemaKey | Typ eines Facts (z. B. `identifier.wikidata`). |
| valueType | Datentyp des Fact-Werts (`string`, `number`, `boolean`). |
| Anchor | Kartenposition eines Place auf der Admin-Karte. |
| Archive Snippet | IIIF-Ausschnitt der historischen Karte zum gewählten Place/Jahr. |
| Edition | Ein Jahrgang/Kurskarte in der Jahresauswahl. |
| IIIF Route (per year) | IIIF-Basisroute, die für das aktuell gewählte Jahr verwendet wird. |
| validFrom / validTo | Zeitliche Gültigkeit eines Datensatzes (Facts/Places/Anchors). |
| Hidden (Place) | Place ist für ein Jahr ausgeblendet, bleibt aber als Identität erhalten; kann per **Unhide** wieder sichtbar gemacht werden. |
