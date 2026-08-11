# CSV-Tool V0.6 — Analyse, Befunde, Weiterentwicklung

**Stand:** 2026-08-11 · **Grundlage:** `index.html` @ 076a0cb, `CSV_Tool_SPEZIFIKATION.md` V0.6

Befunde 01–13 wurden im Browser (Chromium via Playwright) reproduziert, Befund 14 aus dem Code
gelesen. Der Reproduktions-Harness liegt unter `tools/befunde-repro.mjs`.

> **Alle Befunde sind behoben** (V0.6.1). Dieses Dokument bleibt als Befundprotokoll
> erhalten: es hält fest, was gemessen wurde und warum die jeweilige Lösung gewählt wurde.
> Jeder Befund trägt am Ende eine Zeile **Behoben** mit der umgesetzten Lösung.
> Befunde 15–19 kamen bei der Nachprüfung dazu und standen nicht in der ursprünglichen Analyse.
> Abschnitt 3a beschreibt den Umbau, der die Ursache hinter sechs von ihnen beseitigt.
> `npm test` prüft alle Befunde plus Gegenproben — Stand: **32 bestanden, 0 auffällig**.

---

## 1. Überblick

Browserbasierter CSV-Betrachter und -Editor als Single-File-Anwendung: 2.691 Zeilen, 164 KB,
keine Abhängigkeiten, kein Build-Schritt. 269 Zeilen CSS, ~2.250 Zeilen JavaScript in 22 benannten
Abschnitten.

### Datenkette

Das tragende Entwurfsmuster ist eine dreistufige Kette:

| Ebene | Inhalt | Aufgabe |
|---|---|---|
| `rows` | `String[][]` | Die Wahrheit. Wird nur durch History-Befehle verändert. |
| `visibleIndices` | `Number[]` | Ergebnis von Volltextfilter, Spaltenfiltern und Sortierung. |
| `viewRows` | `{kind:'data'\|'group'}[]` | Flacher Render-Plan; Gruppenköpfe und Datenzeilen in einer Liste. |

Sortieren verändert die Daten nie, Gruppierung ist reine Sicht. Das ist sauber — **aber**:
Auswahlbereiche werden als Rechteck über *Roh-Indizes* (`r1..r2`) gespeichert. Jede Funktion, die
die Auswahl auswertet, ohne gegen `visibleIndices` zu schneiden, greift auf ausgeblendete Zeilen zu.
Daraus folgen die drei schwersten Befunde.

### Modulkarte

| Zeile | Abschnitt | Anmerkung |
|---|---|---|
| 435 | Konstanten & Zustand | globales `appState`, keine Kapselung, keine Persistenz außer Theme |
| 472 | History | Command-Pattern, `applyForward`/`applyInverse`, 11 Befehlstypen |
| 529 | Parser | RFC-4180-Zeichenautomat, Trennzeichen-Erkennung per Varianzheuristik |
| 588 | Spaltentypen | Typerkennung aus Stichprobe (DE/US-Formate); einziges gekapseltes Modul |
| 762 | Filter & Sortierung | `rebuildVisible()` → `buildViewRows()` |
| 880 | Rendering | virtuelles Fenster, HTML als String, `innerHTML` pro Frame |
| 1200 | Bearbeiten / Zwischenablage / Struktur / AutoFill | alle Mutationen laufen über die History |
| 1534 | Filter-Popup | Excel-Verhalten: Werteliste berücksichtigt die *anderen* Spaltenfilter |
| 1812 | Export | 8 Formate, eigener CRC32-/ZIP-Store-Writer für XLSX |
| 2383 | Suchen & Ersetzen | Live-Vorschau, Regex mit Rückverweisen, gebündeltes Undo |

---

## 2. Was nachweislich funktioniert

- **XLSX-Export erzeugt echtes Excel.** Datei geschrieben und mit `unzip -t` geprüft: gültiges ZIP,
  alle 6 OOXML-Einträge fehlerfrei, Zahlen als `t="n"`, Datumswerte mit Stilverweis, Kopfzeile eingefroren.
- **Undo stellt zusammengesetzte Operationen wieder her** (Einfügen über den Tabellenrand hinaus:
  Zeilen anlegen + Werte schreiben → Ausgangszustand exakt wiederhergestellt).
- **AutoFill respektiert aktive Filter** — ausgefilterte Zeilen werden übersprungen.
- **Navigation überspringt eingeklappte Gruppen**; Sortierung bleibt innerhalb der Gruppen erhalten
  (stabile Sortierung).
- **Kein XSS** — Zellinhalte werden escaped, Header-Umbenennung liest `textContent`.
- **Randfälle** (leere Datei, nur Kopfzeile, Semikolon, einspaltig) laufen ohne Ausnahme durch.

---

## 3. Befunde

### 01 · KRITISCH — Entf löscht Werte in ausgefilterten Zeilen mit
`clearSelectionValues`, **index.html:1794**

Iteriert mit `for (let r=sel.r1; r<=sel.r2; r++)` über den Roh-Indexbereich. Bei aktivem Filter
werden ausgeblendete Zeilen mitgeleert — ohne Warnung. Der Nutzer sieht nur die sichtbaren Zeilen
leer werden und hat keinen Anlass, Undo zu drücken.

```
5 Zeilen, Filter blendet 2 aus → 3 sichtbar
Strg+A, dann Entf
Ergebnis: alle 5 Zeilen geleert, auch die ausgeblendeten
```

**Ansatz:** über `visibleIndices` iterieren — wie `deleteSelectedRows`, `doCopy` und
`commitAutoFill` es bereits richtig machen.

**Behoben:** `clearSelectionValues` geht über `selectedVisibleRows()` und `selectedVisibleCols()`; ausgefilterte Zeilen und ausgeblendete Spalten bleiben unberührt.

---

### 02 · HOCH — Live-Summe rechnet über ausgeblendete Zeilen
`updateStatus`, **index.html:1189**

```
Spalte „Menge", Filter auf Gruppe A (5 von 10 Zeilen sichtbar)
Statusleiste zeigt:  550
Korrekt wäre:        250
```

Besonders unangenehm, weil die Summe das Werkzeug ist, mit dem man einen Filter auf Plausibilität prüft.

**Behoben:** `updateStatus` bildet Anzahl und Summe über `selectedVisibleRows()` × `selectedVisibleCols()`. Gemessen: 250 statt 550.

---

### 03 · HOCH — Strg+A wählt ein Rechteck statt der sichtbaren Zeilen
keydown-Handler, **index.html:2615**

```
5 von 9 Zeilen sichtbar, Strg+A
Auswahlrechteck: 9 Zeilen
Statusleiste:    „Auswahl: 9×4 Zellen"
```

Die Hilfe verspricht „Alles auswählen (sichtbar)". Wurzel von 01 und 02.

**Ansatz:** Auswahl als Zeilen*menge* führen, oder mindestens eine gemeinsame Hilfsfunktion
`selectedVisibleRows()`, die jede auswertende Stelle benutzen muss. Damit fallen 01–03 gemeinsam.

**Behoben:** Der Handler ruft `selectAllVisible()`. Auswahl und Statusanzeige umfassen nur die sichtbaren Zeilen; die Hilfe nennt es jetzt „Alles auswählen (nur sichtbare Zeilen)".

---

### 04 · HOCH — Virtuelles Scrollen lässt den unteren Bildschirmrand leer
`renderVirtual`, **index.html:1046–1047**

Das sichtbare Fenster beginnt in Sizer-Koordinaten bei `scrollTop + HEADER_H + frozenH`
(Kopfzeile und eingefrorener Block liegen sticky darüber). Die Berechnung zieht `virtualOffsetTop`
jedoch *ab*, statt es zu ignorieren — das Fenster verschiebt sich um `(34 + frozenH) / rowH` Zeilen
nach oben.

Messung bei `scrollTop=20000`, Viewport 900 px:

```
frozenRows= 0  rowH=28 → Lücke unten: keine   (Overscan fängt es ab)
frozenRows= 3  rowH=28 → Lücke unten: keine
frozenRows=20  rowH=20 → Lücke unten: 249 px
frozenRows=20  rowH=80 → Lücke unten: 849 px  (fast der ganze Viewport)
```

**Ansatz:**
```js
firstVisible = Math.floor(scrollTop / ROW_H) - VIRTUAL_OVERSCAN
lastVisible  = Math.ceil((scrollTop + viewportH) / ROW_H) + VIRTUAL_OVERSCAN
```
Behebt zugleich, dass Zeilen oberhalb des Viewports gerendert werden (bis 2.320 px Verschwendung).

**Behoben:** `virtualOffsetTop` wird nicht mehr abgezogen — die Offsets kürzen sich weg. Gemessen: 0 px Lücke in allen vier Konfigurationen.

---

### 05 · HOCH — Nachkommastellen verschwinden in der Anzeige
`ColumnTypes.formatValue`, **index.html:677**

`toLocaleString('de-DE', { maximumFractionDigits: 6 })` ohne `minimumFractionDigits`:
`1299.90` → `1.299,9`, `79.00` → `79`, `24.50` → `24,5`. Bei Geldbeträgen wirkt die Tabelle
fehlerhaft, obwohl die Daten intakt sind.

**Reichweite:** Anzeige sowie **Markdown-, HTML- und Jira-Export** (nutzen `formatValue`).
CSV, TSV und XLSX sind korrekt. Ein Markdown-Export ist damit kein verlustfreier Roundtrip.

**Ansatz:** Nachkommastellen aus den Rohwerten der Spalte ableiten und als `minimumFractionDigits`
setzen; alternativ Anzeigeformat pro Spalte.

**Behoben:** `cols[].decimals` hält die Nachkommastellen der Spalte, `formatValue` setzt sie als `minimumFractionDigits` (Obergrenze bleibt 6, es wird nie abgeschnitten). Ohne Angabe zählt der Wert selbst.

---

### 06 · HOCH — JSON-Export verliert Spalten mit gleichem Namen
`buildJSON`, **index.html:1920**

```
Spalten: A, A, B   Werte: 1, 2, 3
JSON:    {"A": 2, "B": 3}   → Spalte 1 fehlt, ohne Warnung
```

**Ansatz:** doppelte Namen beim Export eindeutig machen (`A`, `A_2`) und per Toast informieren;
besser noch beim Laden entschärfen — davon profitieren auch Gruppierung und Filter.

**Behoben:** `uniqueHeaderNames()` macht doppelte Namen eindeutig (`A`, `A_2`); `exportJSON` weist per Toast darauf hin.

---

### 07 · MITTEL — Pfeiltasten-Navigation ist linear zur Zeilenzahl
`moveActive` **:1235**, `findViewRowByData` **:857**

`moveActive` baut pro Tastendruck ein Array aller sichtbaren Zeilen und sucht per `indexOf`;
`scrollIntoView` scannt nochmals linear. Drei O(n)-Durchläufe pro Anschlag.

```
200.000 Zeilen:
  Laden:                    981 ms
  Pfeiltaste (Mittelwert): 30,4 ms   → Ziel < 16 ms; Tastenwiederholung staut sich auf
  Volltextsuche:             39 ms
```

**Ansatz:** `Map<rIdx, viewRowIndex>` in `buildViewRows()` mitführen, aktive Position als
`viewRows`-Index halten → O(1).

**Behoben:** `buildViewRows()` füllt eine träge aufgebaute `Map<rIdx, viewRowIndex>`; `moveActive` läuft über Positionen im Render-Plan. Gemessen: 5,7 ms statt 30,4 ms pro Anschlag.

---

### 08 · MITTEL — Wertefilter durchsucht ein Array statt eines Sets
`rowPassesColFilters` **:773**, `getUniqueValuesForCol` **:1580**

`filter.excluded` ist ein Array, geprüft mit `includes()` pro Zeile → Zeilen × abgewählte Werte.
Die Spezifikation beschreibt das Feld selbst als Set.

```
100.000 Zeilen × 1.500 abgewählte Werte:
  Array.includes (aktuell): 467 ms
  Set.has (Gegenprobe):      10 ms   → Faktor 47
```

**Ansatz:** zusätzlich ein `Set` im Spaltenzustand führen; die History serialisiert weiterhin das
Array, damit Undo unverändert funktioniert.

**Behoben:** `excludedSet()` hält pro Filterobjekt ein `Set` in einer `WeakMap`; `excluded` bleibt für die Historie ein Array. Zusätzlich werden die aktiven Filter einmal pro `rebuildVisible()` vorberechnet. Gemessen: Faktor 1× statt 47×.

---

### 09 · MITTEL — „Ganze Zelle" wird ignoriert, sobald Regex aktiv ist
`srCompile`, **index.html:2411**

Die Anker `^…$` werden nur im Nicht-Regex-Zweig gesetzt; die UI lässt beide Häkchen zu.

```
Suchen „lph", Regex ✓, Ganze Zelle ✓, Ersetzen durch „XXX"
Erwartet:    0 Treffer
Tatsächlich: 1 Treffer  →  „Alpha" wird zu „AXXXa"
```

**Ansatz:** im Regex-Zweig ankern: `'^(?:' + find + ')$'` (nicht-einfangende Gruppe erhält
Alternativen wie `a|b` korrekt).

**Behoben:** Im Regex-Zweig wird als `^(?:…)$` verankert. Gemessen: 0 statt 1 Treffer.

---

### 10 · MITTEL — Sammelaktionen erzeugen mehrere Undo-Schritte
`showAllColumns` **:1372**, `clearAllFilters` **:1785**, Optionen-Menü **:2542**

Die Spezifikation hebt bei Suchen & Ersetzen ausdrücklich hervor, dass ein Strg+Z die gesamte
Aktion zurücknimmt. Drei Sammelaktionen halten sich nicht daran.

```
Einfügen (2×4 Zellen):         1 Schritt   ✓
Alle Spalten einblenden (2):   2 Schritte
Alle Filter zurücksetzen (2):  2 Schritte
Alle Fixierungen aufheben (n): n Schritte
```

**Ansatz:** Befehlstyp `batch` mit Liste von Teilbefehlen, den `applyForward`/`applyInverse`
vorwärts bzw. rückwärts abarbeiten.

**Behoben:** Neuer Befehlstyp `batch`. Alle vier Sammelaktionen — Spalten einblenden, Filter zurücksetzen, Fixierungen aufheben, Typen neu erkennen — sowie das mehrteilige Einfügen sind je ein Undo-Schritt.

---

### 11 · MITTEL — Zweite Datei lässt sich nicht per Drag & Drop laden
window-drop-Handler, **index.html:2680**

`if (empty-state.style.display === 'none') return;` — nach dem ersten Öffnen nimmt das Fenster
keine Dateien mehr an, die Dropzone ist verdeckt. Es bleibt nur Strg+O.

**Ansatz:** Abbruch entfernen, bei `dragenter` mit Dateien eine Overlay-Dropzone einblenden.

**Behoben:** Der Abbruch ist weg; bei Dateien über dem Fenster erscheint eine Overlay-Dropzone. Geprüft mit einem echten `drop`-Ereignis samt `File`.

---

### 12 · MITTEL — Trennzeichen/Kopfzeile wirken erst „beim nächsten Öffnen"
`showOptsMenu`, **index.html:2539–2540**

Der Dateitext wird nach dem Parsen verworfen. Zusammen mit Befund 11: Trennzeichen umstellen,
Strg+O, Datei erneut heraussuchen.

**Ansatz:** Rohtext (oder das `File`-Handle) behalten und „Neu einlesen" anbieten. Macht auch den
Roadmap-Punkt „Encoding-Auswahl (ISO-8859-1)" erst umsetzbar.

**Behoben:** `appState.rawText` hält den Rohtext, `reparse()` liest ihn mit den aktuellen Parser-Optionen neu ein. Trennzeichen- und Kopfzeilen-Umschaltung wirken sofort; im Optionen-Menü gibt es zusätzlich „Datei neu einlesen". Preis: der Rohtext bleibt im Speicher.

---

### 13 · GERING — Das Suchfeld filtert die Tabelle, statt nur zu markieren
`performSearch`, **index.html:2359**

Setzt `appState.filter = q` und blendet Nicht-Treffer aus (verifiziert: 3 Zeilen → 1 sichtbar).
Die Hilfe nennt es „Suchen" und bietet Trefferzähler mit Vor/Zurück-Navigation — was wenig Sinn
ergibt, wenn ohnehin nur Treffer sichtbar sind.

**Ansatz:** Entscheidung, keine Reparatur — entweder als „Filtern" beschriften und die
Treffernavigation entfernen, oder Suche und Filter trennen (markieren statt ausblenden, mit
Umschalter „nur Treffer zeigen"). Zweiteres passt besser zur Excel-Nähe des Programms.

**Behoben:** Die Suche markiert nur noch. Ausblenden übernimmt der Schalter „Nur Treffer" im Suchfeld. Preis: die Trefferliste wird über alle sichtbaren Zeilen aufgebaut (72 ms bei 200.000 Zeilen × 4 Spalten).

---

### 14 · GERING — Kleinkram

- **`FROZEN_ROWS_MAX` fehlt im Code.** Steht in der Spezifikation (Abschnitt 6), im Code ist die 20
  im `prompt()`-Text hartcodiert (Zeile 2288).
- **Toter Code.** Zeile 955: `isFrozen ? (vk*ROW_H) : (vk*ROW_H)` — identische Zweige, das Flag wird
  sonst nirgends benutzt. Zeile 1665: wirkungslose Anweisung `pop.outerHTML;`. Attribut `data-vk`
  wird gerendert, nie gelesen.
- **Mehrdeutige Tausendertrennzeichen.** `parseNumber("1.234")` → `1.234`, nicht `1234`. Bei einem
  einzelnen Punkt nicht eindeutig auflösbar; in einer deutschsprachigen Oberfläche mit deutscher
  Datumserkennung ist die US-Lesart aber die überraschendere. Sauber nur über ein Zahlformat pro Spalte.
- **`escapeAttr` maskiert `>` nicht** (Zeile 1059). In gequoteten Attributen ungefährlich, aber die
  Funktion sieht allgemeiner aus, als sie ist.
- **Listener-Neubindung pro Frame.** `renderVirtual` setzt `innerHTML` und bindet danach für jede
  Zelle neue Listener (Zeile 1056). Ereignis-Delegation würde die Bindungsarbeit aus dem Scroll-Pfad nehmen.

**Behoben:** `FROZEN_ROWS_MAX` und `DECIMALS_MAX` sind Konstanten; toter Code (`isFrozen`,
`pop.outerHTML`, `data-vk`) ist entfernt; `parseNumber('1.234.567')` liefert `1234567`
(einzelnes `1.234` bleibt bewusst mehrdeutig — sauber nur über ein Zahlformat pro Spalte);
`escapeAttr` maskiert auch `>`; Zell-Ereignisse laufen über Delegation.

Bei der Umstellung auf Delegation fiel ein weiterer Fehler auf, der nicht Teil der
ursprünglichen Analyse war: Die Listener auf den Containern selbst wurden **pro Frame
zusätzlich** gebunden und häuften sich unbegrenzt an. Das ist mit derselben Änderung erledigt.

---

### 15 · HOCH — Doppelklick öffnete den Zelleditor, der sofort wieder verschwand
`beginEditCell` / `renderVirtual` · beim Prüfen der Delegation gefunden, **nicht** Teil der ursprünglichen Analyse

Der erste Klick löst `selectCell` → `scheduleRender()` aus. Der eingeplante Frame lief nach
`beginEditCell` und ersetzte per `innerHTML` die gesamte Zeilenliste — mitsamt dem gerade
geöffneten Editor. Gegen `index.html` @ 076a0cb verifiziert: der Fehler bestand schon vorher,
ist also keine Folge der Umstellung.

```
Doppelklick auf eine Zelle
Erwartet:    Editor offen
Vorher:      kein Editor (weggerendert)
```

**Behoben:** `editingCell` merkt sich den offenen Editor; `renderVirtual` steigt aus, solange
er im DOM ist, und heilt ein verwaistes Flag selbst. Beim Scrollen wird die Bearbeitung
übernommen, damit der Editor nicht an einer aus dem Fenster laufenden Zeile klebt.

---

### 16 · HOCH — AutoFill überschreibt ausgeblendete Spalten
`commitAutoFill`, bei der Nachprüfung gefunden

Spiegelbild von Befund 01, nur für Spalten: Die Quell- und Zielspalten wurden mit
`for (let c = startSel.c1; c <= startSel.c2; c++)` durchlaufen. Liegt eine ausgeblendete
Spalte im Bereich, füllt AutoFill sie mit — unsichtbar für den Nutzer.

```
Spalten A | Versteckt | C, Auswahl A..C, AutoFill nach unten
Versteckt vorher:  schutz1, schutz2, schutz3, schutz4
Versteckt nachher: schutz1, schutz2, schutz1, schutz2   ← überschrieben
```

**Behoben:** `selectedVisibleCols()` bestimmt die zu füllenden Spalten; die Vorschau
(`showAutoFillPreview`) benutzt dieselbe Liste, damit sie nicht mehr verspricht als sie hält.

---

### 17 · HOCH — „Spalte(n) löschen" löscht ausgeblendete Spalten mit
`deleteSelectedCols`, bei der Nachprüfung gefunden

Gleiche Ursache. Wer zwei nebeneinander *dargestellte* Spalten wählt, zwischen denen eine
ausgeblendete liegt, verliert diese beim Löschen — ohne Hinweis.

```
Spalten A | Versteckt | C | D, gewählt A..C
Kopfzeilen nachher: D          ← „Versteckt" ist weg
```

**Behoben:** Auch hier `selectedVisibleCols()`. Die Sperre gegen das Löschen der letzten
Spalte zählt jetzt die *sichtbaren* Spalten („Letzte sichtbare Spalte nicht löschbar.").

---

### 18 · KRITISCH — AutoFill füllt bei aktiver Sortierung die falschen Zeilen
`commitAutoFill`, bei der Nachprüfung gefunden

Quelle und Ziel wurden über Roh-Indizes bestimmt (`visR.filter(r => r > startSel.r2 && r <= currentR)`).
Sobald sortiert ist, stimmt „unterhalb" im Roh-Index nicht mehr mit „unterhalb" auf dem
Bildschirm überein. Je nach Sortierung passiert daher **gar nichts** oder es werden **mehr
Zeilen überschrieben, als gezogen wurden**:

```
Daten Prio/Wert: 1/A 5/B 2/C 4/D 3/E, aufsteigend nach Prio sortiert
Anzeige:            A C E D B      (Roh-Indizes 0,2,4,3,1)
Gezogen:            1. bis 3. angezeigte Zeile
Erwartet:           A A A D B
Tatsächlich:        A A A A A      ← D und B mitgefüllt, ohne dass darüber gezogen wurde

Absteigend sortiert: AutoFill tat gar nichts.
```

Das ist stiller Datenverlust: Zeilen außerhalb des gezogenen Bereichs werden überschrieben,
und der Nutzer hat keinen Anlass, Undo zu drücken.

**Behoben:** `autoFillRanges()` bestimmt Quell- und Zielzeilen über die Positionen im
Render-Plan, also in Anzeigereihenfolge. Damit fallen Gruppenköpfe und eingeklappte Gruppen
automatisch heraus. Die Vorschau benutzt dieselbe Liste.

---

### 19 · MITTEL — Spaltenauswahl ignorierte fixierte Spalten
`selectedVisibleCols` / Rendering, bei der Nachprüfung gefunden

Der vierte und letzte Fall derselben Ursache — bis zum Umbau nur latent, weil noch niemand
mit fixierten Spalten eine Mehrfachauswahl getroffen hatte. `visibleCols()` zieht fixierte
Spalten nach vorn, `c1..c2` blieb aber Index-Reihenfolge:

```
Spalten A B C D, C ist fixiert  →  Anzeige: C A B D
Gewählt: die zwei ERSTEN angezeigten Spalten (C und A)
Ergebnis: A B C          ← B ist mit drin, C und A stehen falsch herum
```

Das traf auch das Kopieren: `getSelectionAsMatrix` lieferte Spalten in Index- statt in
Anzeigereihenfolge, sodass eine kopierte Zeile anders aussah als auf dem Schirm.

**Behoben:** durch den Umbau des Auswahlmodells (siehe unten) — die Spaltenachse ist jetzt
selbst eine Anzeigeposition.

---

## 3a. Umbau des Auswahlmodells (V0.7)

Sechs der neunzehn Befunde (01–03, 16–19) hatten dieselbe Ursache: Die Auswahl war ein
Rechteck über *Roh-Indizes*, während der Nutzer über *Angezeigtes* zieht. Vier
Anzeige-Eigenschaften brachten beides auseinander:

| Anzeige-Eigenschaft | Wirkung auf `r1..r2` / `c1..c2` | Befund |
|---|---|---|
| Filter blendet Zeilen aus | Bereich enthält unsichtbare Zeilen | 01, 02, 03 |
| Sortierung ändert die Reihenfolge | „unterhalb" stimmt nicht mehr | 18 |
| Spalten ausgeblendet | Bereich enthält unsichtbare Spalten | 16, 17 |
| Spalten fixiert (`pinned` zuerst) | Bereich ist auf dem Schirm nicht zusammenhängend | 19 |

Jeder Befund wurde einzeln geflickt, indem die auswertende Stelle gegen `visibleIndices`
bzw. `hidden` schnitt. Das ist Symptombehandlung: Die nächste neue Funktion, die die
Auswahl anfasst, erbt den Fehler erneut.

**Der Umbau** verlegt die Auswahl in Anzeigekoordinaten:

```js
appState.selection = { type, v1, k1, v2, k2, anchorV, anchorK }
//  v = Position in appState.viewRows   — Filter, Sortierung, Gruppierung eingerechnet
//  k = Position in visibleCols()       — ausgeblendete und fixierte Spalten eingerechnet
```

Damit ist die gespeicherte Auswahl per Konstruktion das, was der Nutzer umrandet sieht;
die vier Abweichungen können nicht mehr entstehen. Roh-Indizes gibt es weiterhin — aber nur
an den Rändern (DOM-Attribute, Datenoperationen), und die Umrechnung liegt an genau einer
Stelle: `posOfRow`/`rowAtPos`, `posOfCol`/`colAtPos`.

Nebeneffekte, die dabei herausfielen:

- Das Rendering wurde **einfacher**: `buildRowHTML` bekommt die Zeilenposition ohnehin
  gereicht und die Spaltenschleife läuft ohnehin über Anzeigepositionen — der Auswahltest
  ist jetzt ein reiner Bereichsvergleich ohne Umrechnung.
- Pfeiltasten bewegen sich in Anzeigereihenfolge: Pfeil-rechts geht zur Spalte rechts
  daneben, auch wenn dort eine fixierte Spalte steht.
- Einfügen schreibt Spalten in Anzeigereihenfolge — passend dazu, wie Kopieren sie liest.

**Preis:** Positionen sind nicht datenstabil. Ändert sich die Sortierung, bleibt die Auswahl
an ihrer Bildschirmstelle stehen und umfasst danach andere Zeilen. Das entspricht dem
Verhalten von Excel und ist die bewusste Entscheidung; `clampSelection()` stutzt die
Positionen nach jedem Neuaufbau des Render-Plans auf den gültigen Bereich.
`appState.active` bleibt ein Roh-Index, damit der Bearbeitungscursor an seiner Zelle klebt.

**Zusätzlich dabei gefunden:** Ein offener Zelleditor blockierte `renderVirtual` auch über
das Laden einer neuen Datei hinweg — die App blieb dann mit leerem Raster stehen.
`loadCSVText` und `newEmpty` setzen `editingCell` jetzt zurück.

---

## 4. Vorschläge für die Weiterentwicklung

Die Roadmap der Spezifikation ist gut gefüllt. Die folgenden Punkte standen bewusst davor, weil
sie strukturelle Schwächen beheben, die sonst jede weitere Funktion mitschleppt. Die ersten
sechs Zeilen sind mit V0.6.1 umgesetzt und hier als Beleg stehen geblieben.

| Priorität | Aufwand | Vorschlag |
|---|---|---|
| ✅ erledigt | klein | **Gemeinsame Funktion `selectedVisibleRows()`** — löst Befunde 01–03 in einem Zug und verhindert, dass der nächste Bearbeitungsbefehl den Fehler erbt. |
| ✅ erledigt | klein | **Testgerüst im Browser.** Die globalen Funktionen machen die App hervorragend fernsteuerbar (siehe `tools/befunde-repro.mjs`, inzwischen 23 Prüfungen inkl. Gegenproben). |
| ✅ erledigt | mittel | **`batch`-Befehl in der History** — ein Undo-Schritt pro Nutzeraktion. Beseitigt Befund 10 und ist Voraussetzung für Duplikat-Entfernung, Spaltentransformationen und berechnete Spalten. |
| ✅ erledigt | mittel | **Index-Karte in `buildViewRows()`** — macht Navigation, Scrollen und Trefferansprung O(1) (Befund 07). |
| ✅ teilweise | mittel | **Format und Zahlenschema pro Spalte** — `cols[].decimals` behebt Befund 05. Ein frei wählbares Anzeigeformat je Spalte (Währung, Prozent, feste Stellen) fehlt weiterhin und bleibt die Grundlage für die geplante bedingte Formatierung. |
| ✅ erledigt | mittel | **Rohtext behalten, „Neu einlesen" anbieten** — behebt Befund 12, macht die geplante Encoding-Auswahl erst umsetzbar. |
| Sinnvoll | klein | **Spaltenstatistik-Panel** (Roadmap) — mit dem vorhandenen Typsystem fast geschenkt: Min, Max, Median, eindeutige Werte, Leeranteil. Schnellster sichtbarer Zugewinn. |
| Sinnvoll | mittel | **Duplikat-Erkennung über ausgewählte Spalten** (Roadmap) — mit `batch` ein einziger Undo-Schritt. |
| Später | groß | **Streaming-Parser im Web Worker** — aktuell liest `readAsText` die ganze Datei in den Speicher und das Parsen blockiert den Hauptthread. Dehnt die 500k-Zusage auf sehr große Dateien aus und macht den Ladebalken echt. |
| Später | mittel | **Mehrspaltige Sortierung und Sitzungspersistenz** (Roadmap) — Sortierung nur von einem Feld auf eine Kriterienliste erweitern; `appState` ist bereits serialisierbar, nur die `Set`-Felder brauchen eine Umwandlung. |

---

## 5. Spezifikation gegen Code

| Zusage | Stand | Anmerkung |
|---|---|---|
| 8 Exportformate | erfüllt | CSV, TSV, Markdown, Jira, JSON, HTML, XLSX + 2 Zwischenablage-Wege |
| Zeilen einfrieren | erfüllt | virtuelles Scrollen korrigiert (04) |
| Gruppierung | erfüllt | Kontextmenü-Einträge und Navigation wie beschrieben |
| Zeilenhöhe 20–80 px | erfüllt | Presets und freie Eingabe; überdauert den Dateiwechsel |
| Suchen & Ersetzen | erfüllt | „Ganze Zelle" wirkt jetzt auch mit Regex (09) |
| Undo als ein Schritt je Aktion | erfüllt | Befehlstyp `batch` (10) |
| Konstante `FROZEN_ROWS_MAX` | erfüllt | im Code, benutzt an beiden Stellen |
| `excluded` als Set | bewusst abweichend | Array + `Set` in einer `WeakMap`; die Historie serialisiert weiterhin das Array (in der Spezifikation nachgezogen) |
| 500.000+ Zeilen | erfüllt | Pfeiltaste 5,7 ms bei 200.000 Zeilen (07). Laden bleibt einmalig teuer, siehe Streaming-Parser in Abschnitt 4 |

---

## 6. Befunde reproduzieren

```bash
npm install                     # Playwright ist exakt gepinnt
npm test                        # = node tools/befunde-repro.mjs
```

Das Skript startet Chromium, lädt `index.html` per `file://`, ruft die globalen Funktionen der App
direkt auf und prüft jeden Befund einzeln. Ausgabe: eine Zeile pro Befund mit Messwerten.

Erwartung: **32 bestanden, 0 auffällig.** Ein `FAIL` bedeutet, dass ein behobener Befund wieder
eingebaut wurde. Die Messwerte in diesem Dokument stammen aus diesem Skript; wer sie zitiert,
sollte sie vorher neu erheben — sie schwanken je nach Maschine um etwa ±50 %.
