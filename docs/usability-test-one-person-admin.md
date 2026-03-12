# Usability-Testskript Admin (1 Testperson)

Projekt: PTT Kurskarten Admin  
Testfokus: Neuer End-to-End-Admin-Flow (kompakt)  
Datum: ____________________  
Moderation: ____________________  
Beobachtung: ____________________  
Testperson-ID: ____________________

---

## 1. Rahmen

Gerat: ____________________  
Browser: ____________________  
Sprache in der App: ____________________  
Startzeit: ____________________  
Endzeit: ____________________

### Start-Checkliste

- [ ] Ziel erklaren: Bedienbarkeit des gesamten Admin-Ablaufs
- [ ] Lautes Denken anfordern
- [ ] Hinweis: Es wird mit Test-/Mock-Daten gearbeitet
- [ ] Erlaubnis fur schriftliche Beobachtungen

Allgemeine Notizen:

................................................................................  
................................................................................  
................................................................................

---

## 2. Kompakte Szenarien (decken den gesamten Ablauf ab)

### Szenario 1: Neue Kurskarte (Edition) anlegen
Aufgabe:
1. Admin offnen.
2. Neues Jahr (z. B. `1895`) uber **New Edition** anlegen.
3. Fur das neue Jahr eine **IIIF Route (per year)** setzen.
4. Auf ein anderes Jahr wechseln und wieder zuruck.

Erfolgskriterien:
- Jahr wird erfolgreich angelegt und auswahlbar.
- IIIF Route wird gespeichert.
- Jahrwechsel ist fur die Person nachvollziehbar.

Feedback der Testperson:

................................................................................  
................................................................................

Beobachtungen:

................................................................................  
................................................................................

Zeit: __________  
Ergebnis: [ ] Erfolg  [ ] Teilweise  [ ] Kein Erfolg

---

### Szenario 2: Place/Node erfassen und Anchor/Snippet prufen
Aufgabe:
1. Im Quick Entry mit **Place (P)** einen Ort erfassen.
2. Falls Vorschlag existiert: **Use Existing Place** oder **Unhide & Use Place** nutzen.
3. Falls kein passender Ort: **Create Place** nutzen.
4. Im Tab **Anchors** Position/Snippet fur das gewahlte Jahr anpassen.

Erfolgskriterien:
- Unterschied zwischen Wiederverwenden vs. Neu-Anlegen wird verstanden.
- Place ist im gewahlten Jahr sichtbar.
- Anchor/Snippet kann gefunden und bearbeitet werden.

Feedback:

................................................................................  
................................................................................

Beobachtungen:

................................................................................  
................................................................................

Zeit: __________  
Ergebnis: [ ] Erfolg  [ ] Teilweise  [ ] Kein Erfolg

---

### Szenario 3: Verbindung erfassen (Link -> Service -> Trips)
Aufgabe:
1. Mit **Link (L)** eine Verbindung zwischen zwei Places vorbereiten.
2. Mit **Service (S)** fur das Zieljahr einen Service erstellen.
3. Mit **Trip (T)** mindestens zwei Fahrten erfassen (inkl. Korrektur einer Zeit).

Erfolgskriterien:
- Reihenfolge Link -> Service -> Trips wird verstanden.
- Jahrbezug von Service/Trips ist klar.
- Zeiten konnen korrekt bearbeitet werden.

Feedback:

................................................................................  
................................................................................

Beobachtungen:

................................................................................  
................................................................................

Zeit: __________  
Ergebnis: [ ] Erfolg  [ ] Teilweise  [ ] Kein Erfolg

---

### Szenario 4: Facts erfassen und verifizieren
Aufgabe:
1. Mit **Fact (F)** fur einen Place mindestens zwei Facts anlegen:
   - `identifier.wikidata` mit Wert (z. B. `Q11943`)
   - ein externer Link (z. B. `Objekt 152454;https://mfk.rechercheonline.ch/mfkobject:152454`)
2. Einen Fact bearbeiten.
3. Einen Fact entfernen.
4. Optional im Viewer kurz prufen, ob Fact sichtbar und Link klickbar ist.

Erfolgskriterien:
- `schemaKey`, `valueType`, Wertfelder werden korrekt genutzt.
- Link-Syntax wird verstanden (`;provider` oder `;https://...`).
- Bearbeiten/Loschen funktioniert ohne Verwirrung.

Feedback:

................................................................................  
................................................................................

Beobachtungen:

................................................................................  
................................................................................

Zeit: __________  
Ergebnis: [ ] Erfolg  [ ] Teilweise  [ ] Kein Erfolg

---

### Szenario 5: Sichtbarkeit, Jahrlogik und Effizienz
Aufgabe:
1. Einen Place im aktuellen Jahr mit **Delete Place** ausblenden.
2. Den gleichen Place uber Quick Place wiederfinden und **Unhide & Use Place** ausfuhren.
3. Jahr wechseln und prufen, ob das Verhalten jahresabhangig ist.
4. Mindestens zwei Shortcuts nutzen (`P`, `L`, `S`, `T`, `F`, `Esc`, `Cmd/Ctrl+S`, `Cmd/Ctrl+Z`).

Erfolgskriterien:
- Unterschied zwischen Ausblenden (jahrbezogen) und dauerhaftem Loschen ist klar.
- Unhide-Flow ist auffindbar.
- Jahrlogik und Shortcuts werden sinnvoll genutzt.

Feedback:

................................................................................  
................................................................................

Beobachtungen:

................................................................................  
................................................................................

Zeit: __________  
Ergebnis: [ ] Erfolg  [ ] Teilweise  [ ] Kein Erfolg

---

## 3. Nachbefragung

1. Welche Aktion war am klarsten?  

................................................................................  
................................................................................

2. Wo waren Unsicherheiten am grossten?  

................................................................................  
................................................................................

3. Was sollte zuerst verbessert werden?  

................................................................................  
................................................................................

4. Bedienbarkeit Admin gesamt (1-5):  1  2  3  4  5

---

## 4. Auswertung fur das Team

Top-3 Probleme:

1. .............................................................................  
2. .............................................................................  
3. .............................................................................

Top-3 Verbesserungen:

1. .............................................................................  
2. .............................................................................  
3. .............................................................................

Prioritat fur Umsetzung:

- [ ] Hoch
- [ ] Mittel
- [ ] Niedrig

Nachtest erforderlich: [ ] Ja  [ ] Nein
