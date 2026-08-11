# CSV-Tool V0.6 — Analyse, Befunde, Weiterentwicklung

**Stand:** 2026-08-11 · **Grundlage:** `index.html` @ 076a0cb, `CSV_Tool_SPEZIFIKATION.md` V0.6

Befunde 01–13 wurden im Browser (Chromium via Playwright) reproduziert, Befund 14 aus dem Code
gelesen. Der Reproduktions-Harness liegt unter `tools/befunde-repro.mjs`.

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

---

### 02 · HOCH — Live-Summe rechnet über ausgeblendete Zeilen
`updateStatus`, **index.html:1189**

```
Spalte „Menge", Filter auf Gruppe A (5 von 10 Zeilen sichtbar)
Statusleiste zeigt:  550
Korrekt wäre:        250
```

Besonders unangenehm, weil die Summe das Werkzeug ist, mit dem man einen Filter auf Plausibilität prüft.

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

---

### 06 · HOCH — JSON-Export verliert Spalten mit gleichem Namen
`buildJSON`, **index.html:1920**

```
Spalten: A, A, B   Werte: 1, 2, 3
JSON:    {"A": 2, "B": 3}   → Spalte 1 fehlt, ohne Warnung
```

**Ansatz:** doppelte Namen beim Export eindeutig machen (`A`, `A_2`) und per Toast informieren;
besser noch beim Laden entschärfen — davon profitieren auch Gruppierung und Filter.

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

---

### 11 · MITTEL — Zweite Datei lässt sich nicht per Drag & Drop laden
window-drop-Handler, **index.html:2680**

`if (empty-state.style.display === 'none') return;` — nach dem ersten Öffnen nimmt das Fenster
keine Dateien mehr an, die Dropzone ist verdeckt. Es bleibt nur Strg+O.

**Ansatz:** Abbruch entfernen, bei `dragenter` mit Dateien eine Overlay-Dropzone einblenden.

---

### 12 · MITTEL — Trennzeichen/Kopfzeile wirken erst „beim nächsten Öffnen"
`showOptsMenu`, **index.html:2539–2540**

Der Dateitext wird nach dem Parsen verworfen. Zusammen mit Befund 11: Trennzeichen umstellen,
Strg+O, Datei erneut heraussuchen.

**Ansatz:** Rohtext (oder das `File`-Handle) behalten und „Neu einlesen" anbieten. Macht auch den
Roadmap-Punkt „Encoding-Auswahl (ISO-8859-1)" erst umsetzbar.

---

### 13 · GERING — Das Suchfeld filtert die Tabelle, statt nur zu markieren
`performSearch`, **index.html:2359**

Setzt `appState.filter = q` und blendet Nicht-Treffer aus (verifiziert: 3 Zeilen → 1 sichtbar).
Die Hilfe nennt es „Suchen" und bietet Trefferzähler mit Vor/Zurück-Navigation — was wenig Sinn
ergibt, wenn ohnehin nur Treffer sichtbar sind.

**Ansatz:** Entscheidung, keine Reparatur — entweder als „Filtern" beschriften und die
Treffernavigation entfernen, oder Suche und Filter trennen (markieren statt ausblenden, mit
Umschalter „nur Treffer zeigen"). Zweiteres passt besser zur Excel-Nähe des Programms.

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

---

## 4. Vorschläge für die Weiterentwicklung

Die Roadmap der Spezifikation ist gut gefüllt. Die folgenden Punkte stehen bewusst davor, weil sie
strukturelle Schwächen beheben, die sonst jede weitere Funktion mitschleppt.

| Priorität | Aufwand | Vorschlag |
|---|---|---|
| Zuerst | klein | **Gemeinsame Funktion `selectedVisibleRows()`** — löst Befunde 01–03 in einem Zug und verhindert, dass der nächste Bearbeitungsbefehl den Fehler erbt. |
| Zuerst | klein | **Testgerüst im Browser.** Die globalen Funktionen machen die App hervorragend fernsteuerbar (siehe `tools/befunde-repro.mjs`). Ein paar Dutzend Zusicherungen zu Parser, Filter, Undo und Export sichern künftige Änderungen ab, ohne den Verzicht auf einen Build-Schritt aufzugeben. |
| Danach | mittel | **`batch`-Befehl in der History** — ein Undo-Schritt pro Nutzeraktion. Beseitigt Befund 10 und ist Voraussetzung für Duplikat-Entfernung, Spaltentransformationen und berechnete Spalten. |
| Danach | mittel | **Index-Karte in `buildViewRows()`** — macht Navigation, Scrollen und Trefferansprung O(1) (Befund 07). |
| Sinnvoll | mittel | **Format und Zahlenschema pro Spalte** — behebt Befund 05, entschärft die `1.234`-Mehrdeutigkeit, Grundlage für die geplante bedingte Formatierung. |
| Sinnvoll | mittel | **Rohtext behalten, „Neu einlesen" anbieten** — behebt Befund 12, macht die geplante Encoding-Auswahl erst umsetzbar. |
| Sinnvoll | klein | **Spaltenstatistik-Panel** (Roadmap) — mit dem vorhandenen Typsystem fast geschenkt: Min, Max, Median, eindeutige Werte, Leeranteil. Schnellster sichtbarer Zugewinn. |
| Sinnvoll | mittel | **Duplikat-Erkennung über ausgewählte Spalten** (Roadmap) — mit `batch` ein einziger Undo-Schritt. |
| Später | groß | **Streaming-Parser im Web Worker** — aktuell liest `readAsText` die ganze Datei in den Speicher und das Parsen blockiert den Hauptthread. Dehnt die 500k-Zusage auf sehr große Dateien aus und macht den Ladebalken echt. |
| Später | mittel | **Mehrspaltige Sortierung und Sitzungspersistenz** (Roadmap) — Sortierung nur von einem Feld auf eine Kriterienliste erweitern; `appState` ist bereits serialisierbar, nur die `Set`-Felder brauchen eine Umwandlung. |

---

## 5. Spezifikation gegen Code

| Zusage | Stand | Anmerkung |
|---|---|---|
| 8 Exportformate | erfüllt | CSV, TSV, Markdown, Jira, JSON, HTML, XLSX + 2 Zwischenablage-Wege |
| Zeilen einfrieren | mit Fehler | funktioniert, bricht aber das virtuelle Scrollen (04) |
| Gruppierung | erfüllt | Kontextmenü-Einträge und Navigation wie beschrieben |
| Zeilenhöhe 20–80 px | erfüllt | Presets und freie Eingabe; überdauert den Dateiwechsel |
| Suchen & Ersetzen | teilweise | Bündelung und Vorschau korrekt; „Ganze Zelle" wirkt nicht mit Regex (09) |
| Undo als ein Schritt je Aktion | teilweise | bei Ersetzen/Einfügen ja, bei drei Sammelaktionen nein (10) |
| Konstante `FROZEN_ROWS_MAX` | fehlt | nur in der Spezifikation, im Code hartcodiert |
| `excluded` als Set | abweichend | als Array umgesetzt — Ursache von 08 |
| 500.000+ Zeilen | teilweise | Laden und Anzeigen ja, flüssige Tastaturbedienung nein (07) |

---

## 6. Befunde reproduzieren

```bash
npm install playwright          # oder global vorhandenes Playwright nutzen
node tools/befunde-repro.mjs
```

Das Skript startet Chromium, lädt `index.html` per `file://`, ruft die globalen Funktionen der App
direkt auf und prüft jeden Befund einzeln. Ausgabe: eine Zeile pro Befund mit Messwerten.
