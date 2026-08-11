/**
 * Reproduktion der Befunde aus ANALYSE.md.
 *
 * Startet Chromium, lädt index.html per file:// und ruft die globalen Funktionen
 * der App direkt auf. Jeder Test prüft genau einen Befund.
 *
 *   node tools/befunde-repro.mjs
 *
 * Die Befunde 01-13 sind behoben; alle Zeilen müssen OK zeigen. Wer die Datei
 * ändert und hier ein FAIL sieht, hat einen der Befunde wieder eingebaut.
 */

import { openApp } from './app-harness.mjs';

const results = [];
const check = (id, name, pass, detail) => results.push({ id, name, pass, detail });

const { page, fehler: jsErrors, close } = await openApp();

/* ---------- 01 Entf löscht ausgefilterte Zeilen mit ---------- */
{
  const r = await page.evaluate(() => {
    loadCSVText('Name,Gruppe\nA,X\nB,Y\nC,X\nD,Y\nE,X', 'f.csv', 40);
    appState.cols[1].filter = { kind: 'values', excluded: ['Y'] }; // sichtbar: A, C, E
    rebuildVisible();
    const vis = appState.visibleIndices;
    setSelection('cells', vis[0], 0, vis[vis.length - 1], 1, vis[0], 0); // wie Strg+A
    clearSelectionValues();
    return {
      sichtbar: vis.length,
      ausgeblendeteIntakt: appState.rows[1][0] === 'B' && appState.rows[3][0] === 'D',
      daten: appState.rows.map(x => x.join('|')).join(' , '),
    };
  });
  check('01', 'Entf leert nur sichtbare Zeilen', r.ausgeblendeteIntakt,
    `${r.sichtbar} von 5 sichtbar; Daten danach: ${r.daten}`);
}

/* ---------- 02 Live-Summe rechnet über ausgeblendete Zeilen ---------- */
{
  const r = await page.evaluate(() => {
    const rows = [];
    for (let i = 1; i <= 10; i++) rows.push(`N${i},${i * 10},${i % 2 ? 'A' : 'B'}`);
    loadCSVText('Name,Menge,Gruppe\n' + rows.join('\n'), 's.csv', 0);
    appState.cols[2].filter = { kind: 'values', excluded: ['B'] };
    rebuildVisible();
    selectCol(1);
    updateStatus();
    return {
      angezeigt: document.getElementById('stat-sum-val').textContent.replace(/\./g, ''),
      korrekt: String(appState.visibleIndices.reduce((a, i) => a + +appState.rows[i][1], 0)),
      sichtbar: appState.visibleIndices.length,
    };
  });
  check('02', 'Live-Summe respektiert aktive Filter', r.angezeigt === r.korrekt,
    `angezeigt=${r.angezeigt}, korrekt (nur ${r.sichtbar} sichtbare Zeilen)=${r.korrekt}`);
}

/* ---------- 03 Strg+A wählt ein Rechteck ---------- */
{
  const r = await page.evaluate(() => {
    const rows = [];
    for (let i = 1; i <= 9; i++) rows.push(`N${i},${i % 2 ? 'A' : 'B'}`);
    loadCSVText('Name,Gruppe\n' + rows.join('\n'), 'a.csv', 0);
    appState.cols[1].filter = { kind: 'values', excluded: ['B'] };
    rebuildVisible();
    selectAllVisible();            // genau das, was der Strg+A-Handler aufruft
    updateStatus();
    return {
      gewaehlt: selectedVisibleRows().length,
      sichtbar: appState.visibleIndices.length,
      gesamt: appState.rows.length,
      label: document.getElementById('stat-sel').textContent,
    };
  });
  check('03', 'Strg+A umfasst nur sichtbare Zeilen', r.gewaehlt === r.sichtbar && r.sichtbar < r.gesamt,
    `${r.gewaehlt} Zeilen gewählt, ${r.sichtbar} sichtbar von ${r.gesamt} · Status="${r.label}"`);
}

/* ---------- 04 Virtuelles Scrollen mit eingefrorenen Zeilen ---------- */
{
  const messungen = [];
  for (const cfg of [{ frozen: 0, rowH: 28 }, { frozen: 3, rowH: 28 }, { frozen: 20, rowH: 20 }, { frozen: 20, rowH: 80 }]) {
    messungen.push(await page.evaluate(async ({ frozen, rowH }) => {
      const rows = []; for (let i = 0; i < 5000; i++) rows.push(`Z${i},${i}`);
      loadCSVText('Name,Wert\n' + rows.join('\n'), 'v.csv', 0);
      applyRowHeight(rowH); appState.frozenRows = frozen; renderAll();
      const sc = document.getElementById('grid-scroller');
      sc.scrollTop = 20000;
      await new Promise(r => setTimeout(r, 120));
      const rects = [...document.querySelectorAll('#grid-rows .grid-row')].map(e => e.getBoundingClientRect());
      if (!rects.length) return { frozen, rowH, luecke: 9999 };
      const scR = sc.getBoundingClientRect();
      return { frozen, rowH, luecke: Math.round(scR.bottom - Math.max(...rects.map(r => r.bottom))) };
    }, cfg));
  }
  const schlimmste = Math.max(...messungen.map(m => m.luecke));
  check('04', 'Virtuelles Scrollen deckt den Viewport bis unten ab', schlimmste <= 0,
    messungen.map(m => `frozen=${m.frozen}/rowH=${m.rowH}: ${m.luecke > 0 ? m.luecke + 'px Lücke' : 'ok'}`).join(' · '));
}

/* ---------- 05 Nachkommastellen in der Anzeige ---------- */
{
  const r = await page.evaluate(() => {
    loadCSVText('Artikel,Preis\nLaptop,1299.90\nMaus,24.50\nKabel,79.00', 'p.csv', 0);
    return {
      roh: appState.rows.map(x => x[1]).join(' / '),
      anzeige: appState.rows.map(x => ColumnTypes.formatCell(1, x[1])).join(' / '),
    };
  });
  const stellenErhalten = r.anzeige.split(' / ').every(v => /,\d\d$/.test(v));
  check('05', 'Anzeige behält die Nachkommastellen der Rohwerte', stellenErhalten,
    `roh: ${r.roh}  →  angezeigt: ${r.anzeige}`);
}

/* ---------- 06 JSON-Export bei doppelten Spaltennamen ---------- */
{
  const r = await page.evaluate(() => {
    loadCSVText('A,A,B\n1,2,3', 'd.csv', 0);
    const obj = JSON.parse(buildJSON())[0];
    return { spalten: appState.headers.length, keys: Object.keys(obj).length, objekt: JSON.stringify(obj) };
  });
  check('06', 'JSON-Export behält alle Spalten', r.keys === r.spalten,
    `${r.spalten} Spalten → ${r.keys} JSON-Felder: ${r.objekt}`);
}

/* ---------- 07 Navigations-Performance ---------- */
{
  const r = await page.evaluate(() => {
    const rows = []; for (let i = 0; i < 200000; i++) rows.push(`N${i},${i},2024-01-01,G${i % 7}`);
    const t0 = performance.now();
    loadCSVText('Name,Wert,Datum,Gruppe\n' + rows.join('\n'), 'big.csv', 0);
    const tLoad = performance.now() - t0;
    selectCell(appState.visibleIndices[150000], 0);
    const t1 = performance.now();
    for (let i = 0; i < 20; i++) moveActive(1, 0);
    const tNav = (performance.now() - t1) / 20;
    const t2 = performance.now(); performSearch('N199999'); const tSearch = performance.now() - t2;
    return { tLoad: Math.round(tLoad), tNav: +tNav.toFixed(1), tSearch: Math.round(tSearch) };
  });
  check('07', 'Pfeiltaste bei 200k Zeilen unter 16 ms', r.tNav < 16,
    `Laden=${r.tLoad}ms · Pfeiltaste=${r.tNav}ms · Suche=${r.tSearch}ms`);
}

/* ---------- 08 Wertefilter-Performance ---------- */
{
  const r = await page.evaluate(() => {
    const rows = []; for (let i = 0; i < 100000; i++) rows.push(`N${i},${i % 3000}`);
    loadCSVText('Name,Kat\n' + rows.join('\n'), 'perf.csv', 0);
    const excl = []; for (let i = 0; i < 1500; i++) excl.push(String(i));
    appState.cols[1].filter = { kind: 'values', excluded: excl };
    const t0 = performance.now(); rebuildVisible(); const tArr = performance.now() - t0;
    const s = new Set(excl);
    const t1 = performance.now();
    let n = 0; for (let i = 0; i < appState.rows.length; i++) if (!s.has(appState.rows[i][1])) n++;
    return { tArr: Math.round(tArr), tSet: Math.round(performance.now() - t1) };
  });
  check('08', 'Wertefilter skaliert wie ein Set-Lookup', r.tArr < r.tSet * 5,
    `Array.includes=${r.tArr}ms vs. Set.has=${r.tSet}ms (Faktor ~${Math.round(r.tArr / Math.max(1, r.tSet))}×)`);
}

/* ---------- 09 Regex + "Ganze Zelle" ---------- */
{
  const r = await page.evaluate(() => {
    loadCSVText('Name\nAlpha\nBeta', 'r.csv', 0);
    document.getElementById('sr-find').value = 'lph';
    document.getElementById('sr-repl').value = 'XXX';
    document.getElementById('sr-regex').checked = true;
    document.getElementById('sr-whole').checked = true;
    const opts = srReadOpts(); srCompile(opts);
    const m = srFindMatches(opts, 100);
    document.getElementById('sr-regex').checked = false;
    document.getElementById('sr-whole').checked = false;
    return { treffer: m.length, beispiel: m[0] ? `${m[0].from} → ${m[0].to}` : '–' };
  });
  check('09', '"Ganze Zelle" wirkt auch mit Regex', r.treffer === 0,
    `"lph" mit Regex+GanzeZelle: ${r.treffer} Treffer (${r.beispiel})`);
}

/* ---------- 10 Undo-Bündelung bei Sammelaktionen ---------- */
{
  const r = await page.evaluate(() => {
    loadCSVText('A,B,C\n1,2,3\n4,5,6', 'u.csv', 0);
    appState.cols[1].hidden = true; appState.cols[2].hidden = true;
    appState.history = { past: [], future: [] };
    showAllColumns();
    const spalten = appState.history.past.length;

    appState.cols[0].filter = { kind: 'values', excluded: ['1'] };
    appState.cols[1].filter = { kind: 'values', excluded: ['2'] };
    appState.history = { past: [], future: [] };
    clearAllFilters();
    const filter = appState.history.past.length;

    appState.history = { past: [], future: [] };
    selectCell(0, 0); doPaste('a\tb\nc\td');
    const einfuegen = appState.history.past.length;
    return { spalten, filter, einfuegen };
  });
  check('10', 'Sammelaktionen sind ein einzelner Undo-Schritt', r.spalten === 1 && r.filter === 1,
    `Spalten einblenden=${r.spalten} · Filter zurücksetzen=${r.filter} · Einfügen=${r.einfuegen} (Referenz, korrekt)`);
}

/* ---------- 11 Zweite Datei per Drag & Drop ---------- */
{
  const r = await page.evaluate(async () => {
    loadCSVText('A\n1', 'erste.csv', 0);
    // Echtes Drop-Ereignis auf dem Fenster, wie beim Ziehen aus dem Dateimanager
    const dt = new DataTransfer();
    dt.items.add(new File(['B\n2\n3\n4'], 'zweite.csv', { type: 'text/csv' }));
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    await new Promise(res => setTimeout(res, 400));
    return { datei: appState.fileName, zeilen: appState.rows.length };
  });
  check('11', 'Drag & Drop nimmt auch eine zweite Datei an', r.datei === 'zweite.csv' && r.zeilen === 3,
    `nach dem Ablegen geladen: „${r.datei}" mit ${r.zeilen} Zeilen`);
}

/* ---------- 12 Trennzeichen nachträglich ändern ---------- */
{
  const r = await page.evaluate(() => ({
    // Es gibt keine Funktion, die die geladene Datei neu einliest
    reparseVorhanden: typeof window.reparse === 'function' || typeof window.reloadWithOpts === 'function',
    rohtextGehalten: typeof appState.rawText === 'string',
  }));
  check('12', 'Geladene Datei kann mit anderem Trennzeichen neu eingelesen werden',
    r.reparseVorhanden && r.rohtextGehalten,
    `Rohtext gehalten: ${r.rohtextGehalten} · Reparse-Funktion: ${r.reparseVorhanden}`);
}

/* ---------- 13 Suchfeld filtert statt zu markieren ---------- */
{
  const r = await page.evaluate(() => {
    loadCSVText('Name,Wert\nAlpha,1\nBeta,2\nGamma,3', 'q.csv', 0);
    performSearch('Alpha');
    return { sichtbar: appState.visibleIndices.length, gesamt: appState.rows.length, treffer: appState.search.hits.length };
  });
  check('13', 'Suche markiert Treffer, ohne die Tabelle zu filtern', r.sichtbar === r.gesamt,
    `nach Suche ${r.sichtbar} von ${r.gesamt} Zeilen sichtbar, ${r.treffer} Treffer`);
}

/* ---------- Gegenproben: das soll grün bleiben ---------- */
{
  const xlsx = await page.evaluate(() => {
    loadCSVText('Name,Wert,Datum\nA,1,2024-01-05\nB,2,2024-02-05', 'x.csv', 0);
    const buf = buildXLSX();
    return { sig: String.fromCharCode(buf[0], buf[1]), bytes: buf.length };
  });
  check('––', 'XLSX-Export erzeugt ein gültiges ZIP', xlsx.sig === 'PK', `${xlsx.bytes} Bytes, Signatur ${xlsx.sig}`);

  const undoOk = await page.evaluate(() => {
    loadCSVText('A,B\n1,2\n3,4', 't.csv', 0);
    const vorher = JSON.stringify(appState.rows);
    selectCell(0, 0); doPaste('x\ty\nz\tw\nq\tr');
    const n = appState.history.past.length;
    for (let i = 0; i < n; i++) undo();
    return { ok: JSON.stringify(appState.rows) === vorher, schritte: n };
  });
  check('––', 'Undo stellt zusammengesetztes Einfügen wieder her', undoOk.ok, `${undoOk.schritte} Schritte`);

  const xss = await page.evaluate(() => {
    loadCSVText('A,B\n"<img src=x onerror=window.__pwned=1>",ok', 'xss.csv', 0);
    renderAll();
    return !window.__pwned;
  });
  check('––', 'Zellinhalte werden HTML-escaped', xss, 'kein XSS über Zellwerte');

  const fillSortiert = await page.evaluate(() => {
    loadCSVText('Prio,Wert\n1,A\n5,B\n2,C\n4,D\n3,E', 'fs.csv', 0);
    appState.sort = { col: 0, dir: 1 };          // Anzeige: A C E D B (roh 0,2,4,3,1)
    rebuildVisible();
    const vis = appState.visibleIndices;
    setSelection('cells', vis[0], 1, vis[0], 1, vis[0], 1);
    autoFillOp = { startSel: normalizedSel(), currentR: vis[2] };  // über 3 Zeilen ziehen
    commitAutoFill();
    return appState.visibleIndices.map(i => appState.rows[i][1]).join(' ');
  });
  check('––', 'AutoFill füllt bei Sortierung genau die gezogenen Zeilen', fillSortiert === 'A A A D B',
    `Anzeige nachher: ${fillSortiert} (erwartet: A A A D B)`);

  /* Befund 16/17: dieselbe Fehlerklasse wie 01, nur für Spalten statt Zeilen. */
  const fillVersteckt = await page.evaluate(() => {
    loadCSVText('A,Versteckt,C\n1,schutz1,x\n2,schutz2,y\n,schutz3,\n,schutz4,', 'hf.csv', 0);
    appState.cols[1].hidden = true; renderAll();
    setSelection('cells', 0, 0, 1, 2, 0, 0);       // Auswahl spannt über die versteckte Spalte
    autoFillOp = { startSel: normalizedSel(), currentR: 3 };
    commitAutoFill();
    return { versteckt: appState.rows.map(r => r[1]).join(','), sichtbar: appState.rows.map(r => r[0]).join(',') };
  });
  check('––', 'AutoFill überschreibt keine ausgeblendeten Spalten',
    fillVersteckt.versteckt === 'schutz1,schutz2,schutz3,schutz4',
    `versteckte Spalte: ${fillVersteckt.versteckt} · gefüllte Spalte: ${fillVersteckt.sichtbar}`);

  const delVersteckt = await page.evaluate(() => {
    loadCSVText('A,Versteckt,C,D\n1,schutz,x,9', 'hd.csv', 0);
    appState.cols[1].hidden = true; renderAll();
    setSelection('cols', 0, 0, 0, 2, 0, 0);        // Nutzer sieht und wählt A und C
    deleteSelectedCols();
    return appState.headers.join(',');
  });
  check('––', 'Spalten löschen verschont ausgeblendete Spalten', delVersteckt === 'Versteckt,D',
    `Kopfzeilen nachher: ${delVersteckt}`);

  const batchUndo = await page.evaluate(() => {
    loadCSVText('A,B,C\n1,2,3', 'b.csv', 0);
    appState.cols[1].hidden = true; appState.cols[2].hidden = true;
    appState.history = { past: [], future: [] };
    showAllColumns();
    const schritte = appState.history.past.length;
    undo();
    return { ok: schritte === 1 && appState.cols[1].hidden && appState.cols[2].hidden, schritte };
  });
  check('––', 'Ein Undo nimmt eine ganze Sammelaktion zurück', batchUndo.ok, `${batchUndo.schritte} Schritt(e)`);

  const editor = await page.evaluate(async () => {
    loadCSVText('A,B\n1,2\n3,4', 'e.csv', 0);
    selectCell(0, 0);            // plant einen Frame ein
    beginEditCell(1, 1);         // Editor darf davon nicht weggerendert werden
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    return !!document.querySelector('.gcell.editing .editor');
  });
  check('––', 'Offener Zelleditor überlebt einen eingeplanten Render', editor, 'sonst schließt sich der Editor sofort wieder');

  const listener = await page.evaluate(() => {
    loadCSVText('A,B\n1,2\n3,4', 'l.csv', 0);
    const host = document.getElementById('grid-rows');
    let n = 0;
    const orig = host.addEventListener.bind(host);
    host.addEventListener = (...a) => { n++; return orig(...a); };
    for (let i = 0; i < 30; i++) renderVirtual();
    host.addEventListener = orig;
    return n;
  });
  check('––', 'renderVirtual bindet keine Listener nach', listener === 0, `${listener} Bindungen bei 30 Durchläufen`);

  const nurTreffer = await page.evaluate(() => {
    loadCSVText('Name,Wert\nAlpha,1\nBeta,2\nGamma,3\nAlphaTier,4', 'n.csv', 0);
    performSearch('Alpha');
    const markiert = appState.visibleIndices.length;
    toggleSearchOnlyHits();
    const gefiltert = appState.visibleIndices.length;
    toggleSearchOnlyHits();
    return { markiert, gefiltert, zurueck: appState.visibleIndices.length };
  });
  check('––', '„Nur Treffer" blendet Nicht-Treffer aus und wieder ein',
    nurTreffer.markiert === 4 && nurTreffer.gefiltert === 2 && nurTreffer.zurueck === 4,
    `markiert=${nurTreffer.markiert} · nur Treffer=${nurTreffer.gefiltert} · zurück=${nurTreffer.zurueck}`);

  const trenner = await page.evaluate(() => {
    loadCSVText('A;B;C\n1;2;3', 'semi.csv', 0);
    const auto = appState.headers.length;
    appState.parserOpts.delimiter = ','; reparse();
    const komma = appState.headers.length;
    appState.parserOpts.delimiter = 'auto'; reparse();
    return { auto, komma, zurueck: appState.headers.length };
  });
  check('––', 'Trennzeichenwechsel wirkt sofort', trenner.auto === 3 && trenner.komma === 1 && trenner.zurueck === 3,
    `auto=${trenner.auto} Spalten · Komma=${trenner.komma} · zurück=${trenner.zurueck}`);

  const zahlen = await page.evaluate(() => ({
    gruppen: ColumnTypes.parseNumber('1.234.567'),
    de: ColumnTypes.parseNumber('1.299,90'),
    us: ColumnTypes.parseNumber('1,299.90'),
  }));
  check('––', 'Tausenderpunkte in Gruppen werden erkannt',
    zahlen.gruppen === 1234567 && zahlen.de === 1299.9 && zahlen.us === 1299.9,
    `1.234.567→${zahlen.gruppen} · 1.299,90→${zahlen.de} · 1,299.90→${zahlen.us}`);

  const autofill = await page.evaluate(() => {
    loadCSVText('Wert,Gruppe\n1,X\n99,Y\n2,X\n99,Y\n0,X\n0,X', 'a.csv', 0);
    appState.cols[1].filter = { kind: 'values', excluded: ['Y'] };
    rebuildVisible();
    setSelection('cells', 0, 0, 2, 0, 0, 0);
    autoFillOp = { startSel: normalizedSel(), currentR: 5 };
    commitAutoFill();
    return appState.rows[1][0] === '99' && appState.rows[3][0] === '99';
  });
  check('––', 'AutoFill überspringt ausgefilterte Zeilen', autofill, 'im Gegensatz zur Entf-Taste (Befund 01)');
}

await close();

const breite = 84;
console.log('\n' + '='.repeat(breite));
let fail = 0;
for (const r of results) {
  if (!r.pass) fail++;
  console.log(`[${r.pass ? 'OK  ' : 'FAIL'}] ${r.id}  ${r.name}`);
  if (r.detail) console.log(`            ${r.detail}`);
}
console.log('='.repeat(breite));
console.log(`${results.length - fail} bestanden, ${fail} auffällig`);
if (jsErrors.length) console.log('\nJS-Fehler in der Seite:\n  ' + jsErrors.join('\n  '));
process.exit(0);
