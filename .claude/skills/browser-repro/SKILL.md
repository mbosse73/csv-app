---
name: browser-repro
description: Verhalten des CSV-Tools im echten Browser prüfen oder einen Fehler reproduzieren. Nutzen, wenn eine Änderung an index.html verifiziert, ein Befund aus ANALYSE.md nachgestellt, eine Messung wiederholt oder ein neuer Regressionstest geschrieben werden soll. Auch für "funktioniert das wirklich", "reproduzier das mal", "miss die Performance", Screenshots der App.
---

# Verhalten im Browser prüfen

Das Projekt hat kein Testframework und braucht keins: `index.html` legt Zustand und Funktionen
global ab, deshalb lässt sich die App mit Playwright direkt ansteuern und auslesen.

## Vorhandenes zuerst nutzen

```bash
npm test        # tools/befunde-repro.mjs — alle Befunde aus ANALYSE.md
npm run shot    # tools/screenshot.mjs — Screenshot nach tools/out/app.png
```

Prüfe, ob der gesuchte Fall dort schon abgedeckt ist, bevor du etwas Neues schreibst.
Wird ein Befund behoben, muss die zugehörige Zeile in `npm test` von `FAIL` auf `OK` springen —
und die vier Gegenproben am Ende müssen grün bleiben.

## Neue Prüfung schreiben

Ergänze einen Block in `tools/befunde-repro.mjs`, wenn es um dauerhaftes Verhalten geht.
Für eine einmalige Untersuchung ein Wegwerf-Skript im Scratchpad anlegen:

```js
import { openApp } from '/home/user/csv-app/tools/app-harness.mjs';

const { page, fehler, close } = await openApp();

const ergebnis = await page.evaluate(() => {
  // Alles hier läuft IN der Seite: appState, loadCSVText, rebuildVisible,
  // renderAll, normalizedSel, selectCell, undo, buildJSON, buildXLSX … sind global.
  loadCSVText('Name,Wert\nA,1\nB,2', 'test.csv', 0);
  appState.cols[1].filter = { kind: 'values', excluded: ['2'] };
  rebuildVisible();
  return { sichtbar: appState.visibleIndices.length, gesamt: appState.rows.length };
});

console.log(ergebnis, fehler);
await close();
```

## Muster, die sich bewährt haben

**Datei laden ohne Dateidialog** — `loadCSVText(text, name, groesse)` direkt aufrufen.
Setzt den Zustand vollständig zurück, eignet sich also als Testfixture.

**Filter setzen** ohne das Popup:
```js
appState.cols[i].filter = { kind: 'values', excluded: ['X'] };   // oder
appState.cols[i].filter = { kind: 'range', min: 10, max: 99 };
rebuildVisible();
```

**Auswahl setzen** wie die App es täte: `selectCell(r, c)`, `selectRow(r)`, `selectCol(c)` oder
`setSelection('cells', r1, c1, r2, c2, ankerR, ankerC)`.

**Rendering abwarten** — `renderVirtual` läuft über `requestAnimationFrame`:
```js
import { nachRender } from './app-harness.mjs';
await nachRender(page);
// oder in evaluate: await new Promise(r => setTimeout(r, 120));
```

**Gerenderte Zeilen messen** statt Zustand raten:
```js
const rects = [...document.querySelectorAll('#grid-rows .grid-row')]
  .map(e => e.getBoundingClientRect());
```
Eingefrorene Zeilen liegen separat in `#grid-frozen`.

**Performance messen** — in `page.evaluate` mit `performance.now()`, und immer eine Gegenprobe
mitmessen (z. B. Set gegen Array), damit die Zahl eine Bezugsgröße hat.

**Exporte prüfen** — `buildJSON()`, `buildMarkdown()`, `buildHTML()`, `buildJira()` liefern Strings;
`buildXLSX()` liefert ein `Uint8Array` (kein Blob). Für XLSX die Bytes auf Platte schreiben und mit
`unzip -t` prüfen — das ist der einzige belastbare Nachweis.

## Regeln

- **Nie behaupten, etwas funktioniere, ohne es ausgeführt zu haben.** Der Wert dieses Vorgehens
  liegt darin, dass Messwerte statt Vermutungen berichtet werden.
- **Seitenfehler mit auswerten.** `openApp()` liefert ein `fehler`-Array; ein leerer Testlauf mit
  JS-Fehlern in der Konsole ist kein bestandener Test.
- **Bei sichtbaren Änderungen einen Screenshot machen und ansehen**, nicht nur den Zustand prüfen.
  Layoutfehler wie die Scroll-Lücke aus Befund 04 fallen nur visuell oder per Geometriemessung auf.
