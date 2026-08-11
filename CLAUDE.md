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

Wer die Auswahl auswertet, **muss** gegen `visibleIndices` schneiden — sonst werden ausgefilterte
Zeilen mitgelesen oder mitgeschrieben. Richtig machen es `deleteSelectedRows`, `doCopy`,
`commitAutoFill`; falsch machen es `clearSelectionValues` und `updateStatus`
(→ Befunde 01–03 in `ANALYSE.md`). Muster:

```js
const sel = normalizedSel();
const rows = appState.visibleIndices.filter(r => r >= sel.r1 && r <= sel.r2);
```

### Zustandsänderungen laufen über die History

Command-Pattern mit 11 Befehlstypen (`editCells`, `addRows`, `delRows`, `moveRow`, `addCol`,
`delCols`, `moveCol`, `renameHeader`, `colMeta`, `colFilter`, …). Jede Mutation:

```js
pushHistory({ label: 'Beschreibung für den Toast', type: 'editCells', changes });
applyForward({ type: 'editCells', changes });   // oder direkt mutieren, wie im Abschnitt üblich
rebuildVisible(); renderAll();
```

`applyForward` und `applyInverse` müssen **symmetrisch** bleiben — ein neuer Befehlstyp braucht
immer beide Richtungen. Eine Nutzeraktion sollte ein einzelner Undo-Schritt sein; mehrere
`pushHistory`-Aufrufe für eine Aktion sind ein Fehler (→ Befund 10).

### Rendering

`renderVirtual()` erzeugt HTML als String, setzt `innerHTML` und bindet danach Listener neu.
Gerendert wird ein Fenster über `viewRows` plus `VIRTUAL_OVERSCAN` Zeilen. Eingefrorene Zeilen
liegen in einem eigenen sticky Container `#grid-frozen`, der Rest in `#grid-rows`.

Achtung: `ROW_H` ist eine **Variable**, keine Konstante — sie wird von `applyRowHeight()` gesetzt
und in die CSS-Variable `--row-h` gespiegelt. Jede Layoutrechnung muss den aktuellen Wert lesen.

## Arbeiten und Prüfen

Es gibt kein Testframework. Geprüft wird, indem ein echter Browser die App fernsteuert — die App
legt ihren Zustand und ihre Funktionen global ab, deshalb genügt `page.evaluate()`.

```bash
npm test                  # reproduziert alle Befunde aus ANALYSE.md (13 FAIL erwartet, 4 OK)
npm run shot              # Screenshot nach tools/out/app.png
node tools/screenshot.mjs --theme dark --rows 5000 --frozen 20 --rowh 20 --scroll 20000
```

**Nach jeder inhaltlichen Änderung `npm test` laufen lassen.** Wer einen Befund behebt, dreht die
zugehörige Zeile von `FAIL` auf `OK` — das ist der Nachweis. Die vier Gegenproben am Ende
(XLSX, Undo, XSS-Escaping, AutoFill) müssen grün bleiben.

Für eine neue Prüfung: `.claude/skills/browser-repro/SKILL.md` enthält das Muster.
Bei sichtbaren Änderungen zusätzlich einen Screenshot machen und anschauen.

`.claude/hooks/session-start.sh` installiert Playwright beim Sitzungsstart. Die Version ist in
`package.json` **exakt gepinnt** (nicht `^`), weil sie zum vorinstallierten Chromium-Build des
Images passen muss. Passt sie einmal nicht, weicht `tools/app-harness.mjs` automatisch auf das
Binary unter `/opt/pw-browsers/chromium` aus — Tests laufen also auch nach einem Image-Wechsel.

## Offene Befunde

`ANALYSE.md` beschreibt 14 verifizierte Befunde mit Fundstelle, Messwert und Lösungsansatz sowie
priorisierte Weiterentwicklungsvorschläge. **Vor einer Änderung dort nachsehen** — vieles ist bereits
analysiert. Die drei lohnendsten Einstiege:

1. Gemeinsame Hilfsfunktion `selectedVisibleRows()` → löst Befunde 01, 02 und 03 zusammen.
2. Befehlstyp `batch` in der History → löst Befund 10 und ist Voraussetzung für Sammeloperationen.
3. `Map<rIdx, viewRowIndex>` in `buildViewRows()` → macht die Navigation O(1) (Befund 07).

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
- **Sortierung verändert `rows` nie** — nur `visibleIndices`. Wer mit `data-rix` aus dem DOM
  arbeitet, hat einen Roh-Index in der Hand, keine Anzeigeposition.
- **`appState.collapsedGroups` ist ein `Set`** und damit nicht JSON-serialisierbar. Relevant, sobald
  Sitzungspersistenz gebaut wird.
- **Der Rohtext der Datei wird nach dem Parsen verworfen.** Deshalb wirken Trennzeichen- und
  Kopfzeilen-Option erst beim nächsten Öffnen (Befund 12).
- **Zellinhalte immer durch `escapeHTML()`** schicken, Attributwerte durch `escapeAttr()`.
  Kein `innerHTML` mit ungeprüften Daten.
