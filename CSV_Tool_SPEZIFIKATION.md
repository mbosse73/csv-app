# CSV-Tool — Spezifikation

**Version:** V0.6.1
**Stand:** 2026-08-11
**Architektur:** Single-File HTML/CSS/JS, offline, ohne Build-Schritt, ohne externe Abhängigkeiten

---

## 1. Zweck

Browserbasierter CSV-Betrachter und -Editor für mittlere bis sehr große Dateien (500.000+ Zeilen). Bedienung Excel-nah: tastatur- und mausfreundlich, mit Undo/Redo, virtuellem Scrollen, Spaltentyp-Erkennung, Pro-Spalte-Filtern, Ansichts-Steuerung (Gruppierung, Einfrieren, Zeilenhöhe), Suchen & Ersetzen und 8 Export-Formaten.

## 2. Versionsübersicht

### V0.1–V0.5.2 — kurz zusammengefasst
- V0.1 Grundgerüst: Import (Drag & Drop, RFC-4180-Parser), Sticky Header, Inline-Editieren, Sortierung, Suche, Zeilen/Spalten hinzufügen/löschen, CSV-Export, Dark/Light-Mode
- V0.2 Mehrfachauswahl, Zwischenablage, Drag & Drop für Zeilen/Spalten, AutoFill, Spaltenbreite, Fixieren, Ausblenden
- V0.3 Virtuelles Scrollen, Undo/Redo (200 Schritte), Toolbar, Suche mit Trefferzähler, Statusleiste mit Live-Summe
- V0.4 Spaltentyp-Erkennung (Text/Zahl/Datum), Pro-Spalte-Filter mit Werte- und Bereichs-Tab
- V0.5 Mehrformat-Export: CSV, TSV, Markdown, XLSX (mit eigenem ZIP-Writer)
- V0.5.1 Markdown in Zwischenablage (`Strg+Shift+M`)
- V0.5.2 Jira/Confluence Wiki-Markup (Datei + Zwischenablage, `Strg+Shift+J`)

### V0.6 — Ansicht, Suchen & Ersetzen, JSON/HTML-Export (NEU)

#### 6.1 Zeilen einfrieren
- Analog zu Spalten-Pin: die **ersten N Zeilen** bleiben beim vertikalen Scrollen sichtbar
- Neuer sticky-Container `grid-frozen-rows` zwischen Header und virtuellem Bereich, hebt sich durch dezenten warmen Ton und blauen Unterrand ab
- Konfiguration: Ansicht-Menü (0 / 1 / 3 / 5 / eigene Zahl bis 20) oder Kontextmenü der Zeile („Bis hier einfrieren")
- Kompatibel mit Gruppierung: eingefrorene Zeile kann auch ein Group-Header sein

#### 6.2 Zeilen gruppieren nach Spalte
- Kollabierbare Gruppierung nach beliebiger Spalte, rein zur Anzeige (keine Aggregation)
- Group-Header-Zeile mit Karotte (▼/▶), Wert und Zeilenzähler
- Klick auf Header klappt Gruppe ein/aus
- Set `appState.collapsedGroups` merkt Zustand pro Session
- Auto-Sortierung nach Gruppierungsspalte (überschreibt manuelle Sortierung nicht, sondern arbeitet lokal auf der visibleIndices-Kopie)
- „Alle ein-/ausklappen" per Ansicht-Menü
- Kontextmenü der Spalte: „Nach dieser Spalte gruppieren" / „Gruppierung aufheben"
- Bei Gruppierung überspringt Tastaturnavigation collapsed Zeilen automatisch

#### 6.3 Manuelle Zeilenhöhe
- Globale Zeilenhöhe, konfigurierbar zwischen `ROW_H_MIN=20` und `ROW_H_MAX=80` px
- Presets: Kompakt (22 px), Normal (28 px), Bequem (36 px), Groß (48 px), Eigene
- Dynamisch über CSS-Variable `--row-h` gesetzt, virtuelles Scrolling nutzt aktuellen Wert für alle Layout-Rechnungen

#### 6.4 Suchen & Ersetzen (`Strg+H`)
- Eigenständiges Modal mit Vorschau
- Optionen: Groß-/Kleinschreibung, Ganze Zelle, **Regex** (mit Backreferences `$1`, `$2`…), Nur in Auswahl, Nur ausgewählte Spalten
- Live-Vorschau der ersten 30 Treffer mit alter/neuer Wert-Diff und Zellposition (Z/S)
- Vorschau zeigt Gesamtanzahl der Treffer und betroffenen Zeilen
- Regex-Fehler werden inline im Modal angezeigt (kein Absturz)
- „Alle ersetzen" bündelt sämtliche Änderungen als **einen** `editCells`-Command in die Undo-History – ein `Strg+Z` macht die gesamte Aktion rückgängig
- Bestätigungsdialog bei > 500 Treffern

#### 6.5 JSON- und HTML-Export
- **JSON**: Array of Objects mit typisierten Werten
  - Zahlen als `number` (nach `parseNumber`), Datum als ISO-8601-String, leere Zellen als `null`, Rest als String
  - Formatiert mit 2 Spaces Einrückung
- **HTML**: eigenständiges Dokument mit inline `<style>`
  - Passt sich an aktives Theme (Light/Dark) an
  - `<thead>` mit sticky Position, Zebra-Streifen, typgerechte Ausrichtung (Zahlen/Datum rechts)
  - Metadaten-Zeile: Zeilenzahl × Spalten × Export-Zeitstempel

---

### V0.6.1 — Fehlerbehebungen (NEU)

Behebt die 14 Befunde aus `ANALYSE.md`. Verhaltensrelevant sind:

| Bereich | Vorher | Jetzt |
|---|---|---|
| `Entf`, Live-Summe, `Strg+A` | wirkten auf den Roh-Indexbereich `r1..r2` | wirken nur auf sichtbare Zeilen und eingeblendete Spalten (`selectedVisibleRows()` / `selectedVisibleCols()`) |
| Zahlenanzeige | `1299.90` → `1.299,9` | `1.299,90` — Nachkommastellen je Spalte (`cols[].decimals`) |
| Suchfeld | filterte die Tabelle | **markiert** Treffer; Ausblenden über den Schalter „Nur Treffer" |
| Trennzeichen / Kopfzeile | „wirkt beim nächsten Öffnen" | liest die Datei sofort neu ein (`reparse()`, Rohtext wird gehalten) |
| Drag & Drop | nur im Leerzustand | jederzeit, mit Overlay-Dropzone |
| Sammelaktionen | mehrere Undo-Schritte | ein Schritt (neuer Befehlstyp `batch`) |
| „Ganze Zelle" + Regex | Anker wurden ignoriert | Muster wird als `^(?:…)$` verankert |
| JSON-Export | doppelte Spaltennamen überschrieben sich | eindeutige Namen (`A`, `A_2`) plus Hinweis-Toast |
| `parseNumber('1.234.567')` | `1.234` | `1234567` (einzelnes `1.234` bleibt bewusst mehrdeutig) |

Nicht verhaltensrelevant, aber spürbar: Tastaturnavigation ist über eine Index-Karte O(1)
statt O(n), Wertefilter nutzen ein `Set` statt `Array.includes`, und Zell-Ereignisse laufen
über Delegation statt über eine Neubindung pro Frame.

---

## 3. Datenmodell (V0.6.1)

```js
appState = {
  fileName, fileSize,
  rawText: String,                 // NEU: Rohtext für reparse()
  headers: String[],
  rows: String[][],
  delimiter, detectedDelimiter, hasHeader,
  parserOpts: { delimiter, header },
  sort: { col, dir },
  filter: String,
  visibleIndices: Number[],        // Datenzeilen nach Filter/Sortierung
  viewRows: [{                     // NEU: flacher Render-Plan
    kind: 'data', rIdx: Number, groupKey?: String
  } | {
    kind: 'group', groupKey: String, groupCol: Number,
    display: String, count: Number, collapsed: Boolean
  }],
  cols: [{
    width, hidden, pinned,
    type: 'auto'|'text'|'number'|'date',
    detectedType: 'text'|'number'|'date',
    decimals: Number,              // NEU: Nachkommastellen der Spalte (0..6)
    filter: null | { kind:'values', excluded: String[] } | { kind:'range', min, max }
  }],
  selection, active, clipboard,
  search: { hits, current, query, onlyHits },   // onlyHits NEU
  history: { past:Command[], future:Command[] },
  frozenRows: Number,              // NEU: 0..20
  groupBy: Number | null,          // NEU: Spaltenindex
  collapsedGroups: Set<String>,    // NEU
  rowH: Number                     // NEU: aktuelle Zeilenhöhe in px
}
```

`viewRows` ist die kanonische Struktur für Rendering und Tastaturnavigation. `visibleIndices` bleibt die Wahrheit für Filter/Sortierung und wird beim Rendern durch `buildViewRows()` in `viewRows` überführt.

`filter.excluded` ist ein **Array**, damit die Historie es serialisieren kann; für die
Auswertung hält `excludedSet()` pro Filterobjekt ein `Set` in einer `WeakMap` vor.
Filterobjekte werden nie mutiert, sondern ersetzt.

**Auswahl:** `selection` ist ein Rechteck über *Roh-Indizes*. Jede auswertende Stelle muss
`selectedVisibleRows()` bzw. `selectedVisibleCols()` benutzen — direkt über `r1..r2` zu
iterieren greift auf ausgefilterte Zeilen zu, die der Nutzer nicht sieht.

**Befehlstypen der Historie:** `batch`, `editCells`, `addRows`, `delRows`, `moveRow`,
`addCol`, `delCols`, `moveCol`, `renameHeader`, `colMeta`, `colFilter`. `batch` bündelt
Teilbefehle; `applyInverse` arbeitet sie rückwärts ab. Eine Nutzeraktion ist genau ein
Undo-Schritt.

---

## 4. Tastenkürzel (V0.6)

| Aktion | Kürzel |
|---|---|
| Datei öffnen / Schnell-Export CSV | `Strg+O` / `Strg+S` |
| **Suchen & Ersetzen** | **`Strg+H`** (NEU) |
| Suchen (markiert Treffer) | `Strg+F` |
| Nur Zeilen mit Treffern zeigen | Schalter „Nur Treffer" im Suchfeld |
| Markdown / Jira in Zwischenablage | `Strg+Shift+M` / `Strg+Shift+J` |
| Rückgängig / Wiederherstellen | `Strg+Z` / `Strg+Y` |
| Kopieren / Ausschneiden / Einfügen | `Strg+C` / `Strg+X` / `Strg+V` |
| Alles auswählen (sichtbar) | `Strg+A` |
| Bearbeiten starten | `F2` / `Enter` / Direkt tippen |
| Auswahl leeren | `Entf` |
| Navigation / Auswahl erweitern | Pfeile / `Tab` / `Enter` (+ `Shift`) |
| Anfang / Ende der Tabelle | `Strg+Home` / `Strg+End` |
| Seitenweise scrollen | `PageUp` / `PageDown` |
| Hilfe öffnen | `?` |

---

## 5. Export-Übersicht (V0.6)

| Format | Datei | Zwischenablage | Typgerecht | Notiz |
|---|---|---|---|---|
| CSV | ✓ (.csv, UTF-8 BOM) | – | – | RFC-4180 |
| TSV | ✓ (.tsv, UTF-8 BOM) | – | – | Excel-kompatibel |
| Markdown | ✓ (.md) | ✓ `Strg+Shift+M` | ✓ (Ausrichtung) | GFM |
| Jira / Confluence | ✓ (.jira.txt) | ✓ `Strg+Shift+J` | – | Wiki-Markup |
| JSON | ✓ (.json) | – | ✓ (Zahlen, Datum) | Array of Objects; doppelte Spaltennamen werden eindeutig (`A`, `A_2`) |
| HTML | ✓ (.html) | – | ✓ (Ausrichtung) | Vollständiges Dokument |
| Excel | ✓ (.xlsx) | – | ✓ (`n`/`d`) | Eigener ZIP-Writer |

Alle Exporte respektieren den aktuell sichtbaren Zustand (Filter, Sortierung, Spaltenreihenfolge, ausgeblendete Spalten, Gruppierung / Einfrieren beeinflusst den Export nicht — es werden immer alle sichtbaren Datenzeilen exportiert, ohne Group-Header).

**Kein verlustfreier Roundtrip:** Markdown, HTML und Jira exportieren die *Anzeigeform*
(`formatValue`), also mit deutscher Zahlenformatierung und den Nachkommastellen der Spalte.
CSV, TSV und XLSX exportieren die Rohwerte bzw. echte Zahlen.

---

## 6. Konstanten

```js
DEFAULT_COL_WIDTH    = 130
ROW_IDX_W            = 60
ROW_H_DEFAULT        = 28
ROW_H_MIN            = 20
ROW_H_MAX            = 80
HEADER_H             = 34
HISTORY_LIMIT        = 200
VIRTUAL_OVERSCAN     = 8
TYPE_DETECT_SAMPLE   = 200
TYPE_DETECT_THRESHOLD= 0.8
FILTER_LIST_MAX      = 2000
FROZEN_ROWS_MAX      = 20
DECIMALS_MAX         = 6
```

---

## 7. Roadmap

- **Multi-Column-Sortierung** (Excel-Style Prioritäten)
- **Spaltenstatistik-Panel** (Min/Max/Median/Unique/Histogramm)
- **Duplikat-Erkennung** und -Entfernung
- **Bedingte Formatierung** pro Spalte
- **Diagramm-Ansicht**
- **XLSX-Import** (analog zum XLSX-Export)
- **Encoding-Auswahl** beim Import (ISO-8859-1)
- **IndexedDB-Persistenz** und „Zuletzt verwendet"-Liste
- **PDF-Export**
- **Text-Transformationen** pro Spalte (Trimmen, Groß/Klein, …)
- **Spalte teilen / zusammenführen**
- **Berechnete Spalten** (schlanke Formelsprache)
- **Diff-Ansicht** zwischen zwei CSVs
- **Zellenkommentare**
- **Streaming-Parser** für Dateien > 200 MB
- **Mehrere disjunkte Auswahlen** (`Strg+Klick`)

---

## 8. Lieferformat

Pro Version werden **beide Dateien** zusammen ausgeliefert:
- `csv-tool.html` — komplette Anwendung
- `CSV_Tool_SPEZIFIKATION.md` — dieses Dokument
