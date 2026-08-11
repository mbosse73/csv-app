/**
 * Gemeinsame Basis für alle Browser-Werkzeuge dieses Projekts.
 *
 *   import { openApp } from './app-harness.mjs';
 *   const { page, close } = await openApp();
 *   await page.evaluate(() => loadCSVText('A,B\n1,2', 'test.csv', 0));
 *
 * Die App legt ihre Funktionen und ihren Zustand global ab (`appState`,
 * `loadCSVText`, `rebuildVisible`, `renderAll`, …). Deshalb lässt sie sich
 * mit `page.evaluate()` direkt ansteuern und auslesen — ohne Testframework
 * und ohne Änderung am Produktionscode.
 */

import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const HIER = dirname(fileURLToPath(import.meta.url));
export const APP_URL = pathToFileURL(resolve(HIER, '..', 'index.html')).href;

/** Vorinstalliertes Chromium im Remote-Image (stabiler Symlink auf das Binary). */
const VORINSTALLIERT = '/opt/pw-browsers/chromium';

/** Playwright lokal (node_modules) und global auflösen — beides als Kandidat. */
export function ladePlaywright() {
  const require = createRequire(import.meta.url);
  const kandidaten = [];
  try { kandidaten.push(require('playwright')); } catch { /* nicht installiert */ }
  try {
    const globalRoot = execSync('npm root -g', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    kandidaten.push(require(resolve(globalRoot, 'playwright')));
  } catch { /* global nicht vorhanden */ }
  if (!kandidaten.length) {
    console.error('Playwright nicht gefunden. Bitte "npm install" ausführen.');
    process.exit(1);
  }
  return kandidaten;
}

/**
 * Startet Chromium und übersteht dabei den häufigsten Stolperstein:
 * Die installierte Playwright-Version erwartet einen Browser-Build, den das
 * Image nicht hat. Reihenfolge: jeder Kandidat normal, dann mit dem
 * vorinstallierten Binary, zuletzt der nächste Kandidat.
 */
async function starteChromium() {
  const fehler = [];
  for (const pw of ladePlaywright()) {
    try {
      return await pw.chromium.launch();
    } catch (e) { fehler.push(e.message.split('\n')[0]); }
    if (existsSync(VORINSTALLIERT)) {
      try {
        return await pw.chromium.launch({ executablePath: VORINSTALLIERT });
      } catch (e) { fehler.push(e.message.split('\n')[0]); }
    }
  }
  console.error('Chromium konnte nicht gestartet werden:\n  ' + fehler.join('\n  '));
  process.exit(1);
}

/**
 * Startet Chromium, öffnet index.html und sammelt Seitenfehler ein.
 * @returns {Promise<{page: import('playwright').Page, fehler: string[], close: () => Promise<void>}>}
 */
export async function openApp({ viewport = { width: 1400, height: 900 }, theme } = {}) {
  const browser = await starteChromium();
  const page = await browser.newPage({ viewport });

  const fehler = [];
  page.on('pageerror', e => fehler.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') fehler.push('console: ' + m.text()); });

  await page.goto(APP_URL);
  if (theme) await page.evaluate(t => applyTheme(t), theme);

  return { page, fehler, close: () => browser.close() };
}

/** Wartet, bis das virtuelle Rendering einen Frame durch ist. */
export async function nachRender(page) {
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
}
