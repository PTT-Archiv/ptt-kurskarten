# Usability-Testskript Admin (1 Testperson)

Projekt: PTT Kurskarten Admin  
Testfokus: Alle zentralen Admin-Funktionen (mit Mock-Daten)  
Datum: ____________________  
Moderation: ____________________  
Beobachtung: ____________________  
Testperson-ID: ____________________

---

## 1. Rahmen

Gerät: ____________________  
Browser: ____________________  
Sprache in der App: ____________________  
Startzeit: ____________________  
Endzeit: ____________________

### Start-Checkliste

- [ ] Ziel erklären: Bedienbarkeit der Admin-Funktionen
- [ ] Lautes Denken anfordern
- [ ] Hinweis: Daten dürfen Mock-Daten sein
- [ ] Erlaubnis für schriftliche Beobachtungen

Allgemeine Notizen:

................................................................................  
................................................................................  
................................................................................

---

## 2. Szenarien Admin

### Szenario 1: Orientierung im Admin
Aufgabe: Öffnen Sie die Admin-Seite und erklären Sie, was Sie in der Oberfläche erkennen (Karte, Seitenpanel, Buttons, Jahr).

Erfolgskriterien:
- Wichtige Bereiche werden korrekt erkannt
- Primäre Aktionen (Knoten/Kante hinzufügen) werden gefunden

Feedback der Testperson:

................................................................................  
................................................................................

Beobachtungen:

................................................................................  
................................................................................

Zeit: __________  
Ergebnis: [ ] Erfolg  [ ] Teilweise  [ ] Kein Erfolg

---

### Szenario 2: Knoten erstellen
Aufgabe: Erstellen Sie einen neuen Knoten auf der Karte, vergeben Sie einen Namen und speichern Sie.

Erfolgskriterien:
- Neuer Knoten wird erstellt
- Name wird gesetzt
- Speichern wird erfolgreich durchgeführt

Feedback:

................................................................................  
................................................................................

Beobachtungen:

................................................................................  
................................................................................

Zeit: __________  
Ergebnis: [ ] Erfolg  [ ] Teilweise  [ ] Kein Erfolg

---

### Szenario 3: Knoten bearbeiten
Aufgabe: Bearbeiten Sie einen bestehenden Knoten: Name, `validFrom`, `validTo`, Checkbox `Ausland`.

Erfolgskriterien:
- Felder werden gefunden und geändert
- Änderung wird gespeichert
- Person versteht Unterschied zwischen sofortiger Änderung und Speichern

Feedback:

................................................................................  
................................................................................

Beobachtungen:

................................................................................  
................................................................................

Zeit: __________  
Ergebnis: [ ] Erfolg  [ ] Teilweise  [ ] Kein Erfolg

---

### Szenario 4: Geo-Suche für Knotenname
Aufgabe: Aktivieren Sie die Geo-Suche, tippen Sie einen Ort und übernehmen Sie einen Treffer.

Erfolgskriterien:
- Geo-Suche wird ein-/ausgeschaltet
- Trefferliste wird verstanden
- Trefferauswahl wird übernommen

Feedback:

................................................................................  
................................................................................

Beobachtungen:

................................................................................  
................................................................................

Zeit: __________  
Ergebnis: [ ] Erfolg  [ ] Teilweise  [ ] Kein Erfolg

---

### Szenario 5: Kante erstellen
Aufgabe: Erstellen Sie eine neue Kante zwischen zwei Knoten.

Erfolgskriterien:
- Von/Nach-Knoten korrekt gewählt
- Transporttyp gesetzt
- `validFrom`, `validTo`, `distance` gesetzt
- Kante gespeichert

Feedback:

................................................................................  
................................................................................

Beobachtungen:

................................................................................  
................................................................................

Zeit: __________  
Ergebnis: [ ] Erfolg  [ ] Teilweise  [ ] Kein Erfolg

---

### Szenario 6: Fahrten (Trips) pflegen
Aufgabe: Fügen Sie zwei Fahrten hinzu, duplizieren Sie eine Fahrt, entfernen Sie eine Fahrt, korrigieren Sie Zeiten.

Erfolgskriterien:
- Fahrtenliste wird gefunden
- Hinzufügen/Duplizieren/Löschen klappt
- Zeitfelder HH:MM werden korrekt genutzt

Feedback:

................................................................................  
................................................................................

Beobachtungen:

................................................................................  
................................................................................

Zeit: __________  
Ergebnis: [ ] Erfolg  [ ] Teilweise  [ ] Kein Erfolg

---

### Szenario 7: Kante bearbeiten
Aufgabe: Öffnen Sie eine bestehende Kante und ändern Sie Transport, `distance` und Notizen (DE/FR). Speichern Sie.

Erfolgskriterien:
- Kante wird aus Liste oder Karte gewählt
- Änderungen werden durchgeführt
- Update wird gespeichert

Feedback:

................................................................................  
................................................................................

Beobachtungen:

................................................................................  
................................................................................

Zeit: __________  
Ergebnis: [ ] Erfolg  [ ] Teilweise  [ ] Kein Erfolg

---

### Szenario 8: Löschen (Knoten und Kante)
Aufgabe: Löschen Sie einmal eine Kante und einmal einen Knoten (inkl. Bestätigung beim Knoten).

Erfolgskriterien:
- Richtige Löschaktionen werden gefunden
- Sicherheitsabfrage beim Knoten wird verstanden
- Keine unbeabsichtigten Nebeneffekte

Feedback:

................................................................................  
................................................................................

Beobachtungen:

................................................................................  
................................................................................

Zeit: __________  
Ergebnis: [ ] Erfolg  [ ] Teilweise  [ ] Kein Erfolg

---

### Szenario 9: Undo und Jahr-Filter
Aufgabe: Verschieben oder ändern Sie etwas, nutzen Sie danach `Undo`. Prüfen Sie dann die Darstellung bei anderem Jahr über den Slider.

Erfolgskriterien:
- Undo wird gefunden und verstanden
- Jahr-Slider wird erkannt und korrekt benutzt
- Änderungen in der Ansicht werden nachvollzogen

Feedback:

................................................................................  
................................................................................

Beobachtungen:

................................................................................  
................................................................................

Zeit: __________  
Ergebnis: [ ] Erfolg  [ ] Teilweise  [ ] Kein Erfolg

---

### Szenario 10: Shortcuts und Speichern
Aufgabe: Nutzen Sie mindestens zwei Tastaturkürzel (`N`, `E`, `Esc`, `Ctrl/Cmd+S`, `Ctrl/Cmd+Z`) und beschreiben Sie, ob sie erwartbar sind.

Erfolgskriterien:
- Kürzel werden entdeckt oder verstanden
- Mindestens zwei Kürzel korrekt genutzt
- Speichervorgang per Shortcut funktioniert

Feedback:

................................................................................  
................................................................................

Beobachtungen:

................................................................................  
................................................................................

Zeit: __________  
Ergebnis: [ ] Erfolg  [ ] Teilweise  [ ] Kein Erfolg

---

### Optional: Demo-Funktionen
Aufgabe: Falls Demo aktiv ist, testen Sie `Tutorial neu starten` und `Demo zurücksetzen`.

Erfolgskriterien:
- Demo-Aktionen werden gefunden
- Wirkung der Aktionen ist verständlich

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

1. Welche Admin-Aktion war am klarsten?  

................................................................................  
................................................................................

2. Wo hatten Sie die meisten Unsicherheiten?  

................................................................................  
................................................................................

3. Was sollte zuerst verbessert werden?  

................................................................................  
................................................................................

4. Bedienbarkeit Admin gesamt (1-5):  1  2  3  4  5

---

## 4. Auswertung für das Team

Top-3 Probleme:

1. .............................................................................  
2. .............................................................................  
3. .............................................................................

Top-3 Verbesserungen:

1. .............................................................................  
2. .............................................................................  
3. .............................................................................

Priorität für Umsetzung:

- [ ] Hoch
- [ ] Mittel
- [ ] Niedrig

Nachtest erforderlich: [ ] Ja  [ ] Nein
