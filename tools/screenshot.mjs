/**
 * Screenshot der laufenden App — zur visuellen Kontrolle nach einer Änderung.
 *
 *   node tools/screenshot.mjs                                  Demodaten, helles Theme
 *   node tools/screenshot.mjs --theme dark                     dunkles Theme
 *   node tools/screenshot.mjs --csv daten.csv                  eigene Datei
 *   node tools/screenshot.mjs --rows 5000 --frozen 20 --rowh 20   virtuelles Scrollen prüfen
 *   node tools/screenshot.mjs --group 4 --scroll 2000 --out /tmp/a.png
 *
 * Schreibt standardmäßig nach tools/out/app.png (gitignoriert).
 */

import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openApp } from './app-harness.mjs';

const HIER = dirname(fileURLToPath(import.meta.url));

const argv = process.argv.slice(2);
const arg = (name, fallback = null) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const theme = arg('theme', 'light');
const out = resolve(arg('out', resolve(HIER, 'out', 'app.png')));
const csvPfad = arg('csv');
const kunstZeilen = +arg('rows', 0);
const frozen = +arg('frozen', 0);
const rowh = +arg('rowh', 28);
const group = arg('group') !== null ? +arg('group') : null;
const scroll = +arg('scroll', 0);

const DEMO = [
  'Produkt,Menge,Preis,Datum,Region',
  'Laptop,12,1299.90,2024-01-15,Nord',
  'Maus,140,24.50,2024-01-18,Süd',
  'Tastatur,88,79.00,2024-02-02,Nord',
  'Monitor,31,349.00,2024-02-14,West',
  'Dock,17,189.99,2024-03-01,Süd',
  'Kabel,420,9.99,2024-03-07,Ost',
  'Headset,64,129.00,2024-03-21,Nord',
].join('\n');

let csv, name;
if (csvPfad) {
  csv = readFileSync(csvPfad, 'utf8');
  name = csvPfad.split('/').pop();
} else if (kunstZeilen > 0) {
  const zeilen = ['Produkt,Menge,Preis,Datum,Region'];
  const regionen = ['Nord', 'Süd', 'West', 'Ost'];
  for (let i = 0; i < kunstZeilen; i++) {
    zeilen.push(`Artikel ${i},${(i * 7) % 500},${((i * 13) % 9000 / 100).toFixed(2)},2024-${String((i % 12) + 1).padStart(2, '0')}-05,${regionen[i % 4]}`);
  }
  csv = zeilen.join('\n');
  name = `synthetisch-${kunstZeilen}.csv`;
} else {
  csv = DEMO;
  name = 'verkauf.csv';
}

const { page, fehler, close } = await openApp({ theme });

await page.evaluate(async ({ csv, name, frozen, rowh, group, scroll }) => {
  loadCSVText(csv, name, csv.length);
  applyRowHeight(rowh);
  appState.frozenRows = frozen;
  appState.groupBy = group;
  if (group !== null) buildViewRows();
  renderAll();
  document.getElementById('grid-scroller').scrollTop = scroll;
  await new Promise(r => setTimeout(r, 150));
}, { csv, name, frozen, rowh, group, scroll });

mkdirSync(dirname(out), { recursive: true });
await page.screenshot({ path: out });
await close();

console.log(`Screenshot: ${out}`);
console.log(`  ${name} · Theme ${theme} · Zeilenhöhe ${rowh}px` +
  (frozen ? ` · ${frozen} eingefroren` : '') +
  (group !== null ? ` · gruppiert nach Spalte ${group}` : '') +
  (scroll ? ` · scrollTop ${scroll}` : ''));
if (fehler.length) console.log('JS-Fehler:\n  ' + fehler.join('\n  '));
