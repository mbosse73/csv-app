# CSV-Tool — Arbeitsanleitung für Claude Code

Browserbasierter CSV-Betrachter und -Editor. **Die gesamte Anwendung ist `index.html`** —
~2.700 Zeilen, 164 KB, HTML + CSS + JS in einer Datei.

## Harte Rahmenbedingungen

Diese vier Punkte sind die Identität des Projekts. Nicht ohne ausdrückliche Zustimmung aufweichen:

1. **Eine Datei.** Kein Aufsplitten in Module, kein separates CSS/JS.
2. **Kein Build-Schritt.** `index.html` im Browser öffnen muss immer genügen.
3. **Keine Laufzeit-Abhängigkeiten.** Kein React, kein SheetJS, kein PapaParse — Parser, ZIP-Writer
   und Virtual Scrolling sind bewusst selbst geschrieben. `package.json` enthält ausschließlich
   Playwright als *dev*-Abhängigkeit für die Tests; die ausgelieferte Datei bleibt davon unberührt.
4. **Offline.** Keine Netzwerkaufrufe, keine CDN-Fonts, keine Telemetrie.

Weitere Vorgaben:

- **Oberflächentexte sind deutsch.** Auch Toasts, Menüs, Dialoge und `prompt()`-Texte.
  Zahlen und Datumsangaben werden mit `de-DE` formatiert.
- **Code-Kommentare sind deutsch oder englisch** — im Zweifel dem umgebenden Abschnitt folgen.
- **Farben immer über die CSS-Variablen** aus `:root` (Zeile 8 ff.) beziehen, nie als Literal.
  Jede Variable existiert doppelt: hell in `:root`, dunkel in `[data-theme="dark"]`. Wer eine neue
  Farbe braucht, legt sie in **beiden** Blöcken an.

## Aufbau

`index.html` ist in 22 Abschnitte gegliedert, jeweils mit einem Kommentar-Banner. **Navigiere über
diese Banner, nicht über Zeilennummern** — die verschieben sich bei jeder Änderung:

```
grep -n '^   [A-ZÄÖÜ]' index.html      # listet alle Abschnittsüberschriften
```

Reihenfolge: CONSTANTS/STATE · HISTORY · PARSER · COLUMN-TYPES · LOADER · FILTER/SORT · SELECTION ·
RENDER · EDIT · CLIPBOARD · STRUCTURE OPS · AUTOFILL · CONTEXT MENU · FILTER POPUP · ACTIONS ·
EXPORT · SEARCH · SUCHEN & ERSETZEN · OPTIONS MENU · HELPERS · GLOBAL EVENTS · WIRING

### Datenkette — das zentrale Modell

| Ebene | Inhalt | Bedeutung |
|---|---|---|
| `appState.rows` | `String[][]` | Die Wahrheit. Nur über History-Befehle verändern. |
| `appState.visibleIndices` | `Number[]` | Ergebnis von Volltextfilter, Spaltenfiltern, Sortierung. |
| `appState.viewRows` | `{kind:'data'\|'group'}[]` | Flacher Render-Plan inkl. Gruppenköpfe. |

Aufgebaut wird die Kette von `rebuildVisible()` → `buildViewRows()`. Nach **jeder** Datenänderung
`rebuildVisible(); renderAll();` aufrufen.

### Die wichtigste Regel

> **Auswahlbereiche sind Rechtecke über Roh-Indizes (`r1..r2`), nicht Mengen sichtbarer Zeilen.**

Wer die Auswahl auswertet, **muss** über die Hilfsfunktionen gehen — sonst werden ausgefilterte
Zeilen oder ausgeblendete Spalten mitgelesen oder mitgeschrieben
(→ Befunde 01–03, 16 und 17 in `ANALYSE.md`):

```js
const sel  = normalizedSel();
const rows = selectedVisibleRows(sel);   // schneidet gegen visibleIndices
const cols = selectedVisibleCols(sel);   // lässt hidden-Spalten weg
```

Niemals `for (let r = sel.r1; r <= sel.r2; r++)` oder `for (let c = sel.c1; c <= sel.c2; c++)`.
Das ist der Fehler, den dieses Projekt schon sechsmal hatte — zuletzt in `deleteSelectedCols`
(traf ausgeblendete **Spalten**) und in `commitAutoFill` (rechnete bei aktiver Sortierung in
Roh-Indizes statt in **Anzeigereihenfolge** und überschrieb Zeilen außerhalb des Zugbereichs).
Wo die Anzeige*reihenfolge* zählt und nicht nur die Zugehörigkeit, ist `viewRows` die
Bezugsgröße — siehe `autoFillRanges()`.

### Zustandsänderungen laufen über die History

Command-Pattern mit 11 Befehlstypen (`batch`, `editCells`, `addRows`, `delRows`, `moveRow`,
`addCol`, `delCols`, `moveCol`, `renameHeader`, `colMeta`, `colFilter`). Jede Mutation:

```js
pushHistory({ label: 'Beschreibung für den Toast', type: 'editCells', changes });
applyForward({ type: 'editCells', changes });   // oder direkt mutieren, wie im Abschnitt üblich
rebuildVisible(); renderAll();
```

`applyForward` und `applyInverse` müssen **symmetrisch** bleiben — ein neuer Befehlstyp braucht
immer beide Richtungen. Eine Nutzeraktion ist **genau ein** Undo-Schritt; mehrere
`pushHistory`-Aufrufe für eine Aktion sind ein Fehler. Für zusammengesetzte Aktionen gibt es
`batch` (`applyInverse` arbeitet die Teilbefehle rückwärts ab):

```js
const cmds = [ {type:'colMeta', c:0, key:'hidden', from:true, to:false}, /* … */ ];
pushHistory({ label:'…', type:'batch', cmds });
applyForward({ type:'batch', cmds });
```

### Rendering

`renderVirtual()` erzeugt HTML als String und setzt `innerHTML`. Gerendert wird ein Fenster über
`viewRows` plus `VIRTUAL_OVERSCAN` Zeilen. Eingefrorene Zeilen liegen in einem eigenen sticky
Container `#grid-frozen`, der Rest in `#grid-rows`.

- **Listener nicht pro Frame binden.** Zeilen- und Zell-Ereignisse laufen über Delegation
  (`bindGridEvents()`, einmalig). Wer in `renderVirtual` etwas an einen Container hängt, baut
  ein Leck: die Container überleben jeden Frame, die Listener summieren sich.
- **`ROW_H` ist eine Variable**, keine Konstante — von `applyRowHeight()` gesetzt und in die
  CSS-Variable `--row-h` gespiegelt. Jede Layoutrechnung muss den aktuellen Wert lesen.
- **Kopfzeile und eingefrorener Block liegen sticky *über* dem Inhalt.** Beim Fenster-Ausschnitt
  kürzen sich ihre Höhen weg: `floor(scrollTop / ROW_H)`, **nicht** `scrollTop - virtualOffsetTop`.
- **Offener Zelleditor hat Vorrang.** `editingCell` blockiert `renderVirtual`, sonst löscht ein
  eingeplanter Frame den gerade geöffneten Editor weg.

## Arbeiten und Prüfen

Es gibt kein Testframework. Geprüft wird, indem ein echter Browser die App fernsteuert — die App
legt ihren Zustand und ihre Funktionen global ab, deshalb genügt `page.evaluate()`.

```bash
npm test                  # 26 Prüfungen, alle müssen OK sein
npm run shot              # Screenshot nach tools/out/app.png
node tools/screenshot.mjs --theme dark --rows 5000 --frozen 20 --rowh 20 --scroll 20000
```

**Nach jeder inhaltlichen Änderung `npm test` laufen lassen.** Die Suite deckt die 18 behobenen
Befunde plus Gegenproben ab (XLSX, Undo, `batch`-Undo, XSS-Escaping, AutoFill, Zelleditor,
Listener-Anhäufung, Suche, Neu-Einlesen, Zahlenparser). Ein `FAIL` heißt: ein behobener Befund
ist zurück. Neue Funktionen brauchen dort eine neue Prüfung.

Für eine neue Prüfung: `.claude/skills/browser-repro/SKILL.md` enthält das Muster.
Bei sichtbaren Änderungen zusätzlich einen Screenshot machen und anschauen.

`.claude/hooks/session-start.sh` installiert Playwright beim Sitzungsstart. Die Version ist in
`package.json` **exakt gepinnt** (nicht `^`), weil sie zum vorinstallierten Chromium-Build des
Images passen muss. Passt sie einmal nicht, weicht `tools/app-harness.mjs` automatisch auf das
Binary unter `/opt/pw-browsers/chromium` aus — Tests laufen also auch nach einem Image-Wechsel.

## Befunde und nächste Schritte

`ANALYSE.md` ist das Befundprotokoll: 18 Befunde mit Fundstelle, Messwert, Lösungsansatz und
umgesetzter Lösung. **Alle sind behoben** (V0.6.1) — das Dokument bleibt als Begründung dafür
erhalten, warum bestimmte Stellen so aussehen, wie sie aussehen. Abschnitt 4 listet die noch
offenen Weiterentwicklungsvorschläge, die lohnendsten zuerst:

1. **Spaltenstatistik-Panel** — mit dem vorhandenen Typsystem fast geschenkt, größter sichtbarer
   Zugewinn pro Aufwand.
2. **Anzeigeformat pro Spalte** (Währung, Prozent, feste Stellen) — `cols[].decimals` ist der
   Anfang; das entschärft auch die `1.234`-Mehrdeutigkeit im Zahlenparser.
3. **Streaming-Parser im Web Worker** — `readAsText` liest die ganze Datei in den Speicher und
   das Parsen blockiert den Hauptthread.

## Dokumente pflegen

- `CSV_Tool_SPEZIFIKATION.md` ist die Referenz für Funktionsumfang, Datenmodell, Tastenkürzel und
  Konstanten. **Bei Funktionsänderungen mit aktualisieren** — die Spezifikation weicht sonst weiter
  vom Code ab (siehe Abschnitt 5 in `ANALYSE.md`).
- Neue Tastenkürzel gehören an *drei* Stellen: in den `keydown`-Handler, in den Hilfe-Dialog
  (`#help-modal`) und in die Spezifikation.
- Neue Exportformate gehören in `showExportMenu()`, in die Format-Tabelle der Spezifikation und
  sollten `exportedRows()` benutzen, damit Filter, Sortierung und Spaltenreihenfolge respektiert werden.

## Fallstricke

- **`formatValue()` ist reine Anzeige.** CSV, TSV und XLSX exportieren Rohwerte bzw. echte Zahlen;
  Markdown, HTML und Jira benutzen `formatValue` und sind damit kein verlustfreier Roundtrip.
  Für Zellen `ColumnTypes.formatCell(ci, v)` benutzen — das zieht Typ *und* `cols[ci].decimals`.
- **Sortierung verändert `rows` nie** — nur `visibleIndices`. Wer mit `data-rix` aus dem DOM
  arbeitet, hat einen Roh-Index in der Hand, keine Anzeigeposition. `visibleIndices` ist nach dem
  Sortieren **nicht aufsteigend** — keine Binärsuche darauf.
- **`appState.collapsedGroups` ist ein `Set`** und damit nicht JSON-serialisierbar. Relevant, sobald
  Sitzungspersistenz gebaut wird.
- **Drei träge Caches.** `visibleSetCache` (in `rebuildVisible` verworfen), `viewIndexCache` (in
  `buildViewRows` verworfen) und `excludedSetCache` (`WeakMap`, Schlüssel ist das Filterobjekt).
  Deshalb gilt: **Filterobjekte nie mutieren, immer ersetzen.**
- **`appState.rawText` hält die ganze Datei im Speicher** — Preis für `reparse()`. Wer den
  Streaming-Parser baut, muss sich hier etwas überlegen.
- **Zellinhalte immer durch `escapeHTML()`** schicken, Attributwerte durch `escapeAttr()`.
  Kein `innerHTML` mit ungeprüften Daten.
