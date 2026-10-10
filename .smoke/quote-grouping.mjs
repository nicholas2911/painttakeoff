/* v0.7.1: quote breakdowns (whole project / per room / per page) with
 * subtotals summing to the grand total in every mode, custom measurement
 * names flowing into the quote + Excel, double-click rename, the one-time
 * rename tip, and the Excel "Breakdown" sheet matching the grouping. */
import { chromium } from 'playwright-core';
import { getDocument } from '../app/node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import * as XLSX from '../app/node_modules/xlsx/xlsx.mjs';
import fs from 'node:fs';

const EXE =
  'C:/Users/Nicholas/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe';
const APP = 'http://localhost:5199/';
const PDF =
  'C:/Users/Nicholas/Desktop/coding/paint-takeoff/friend-examples/2 Drawings - Architectural.pdf';

const errors = [];
const check = (name, ok) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) errors.push(`check failed: ${name}`);
};

// ---------- seeded quantities ----------
const PPU = 37.79527559055118; // 1:75
const SQFT = 10.7639;
const FTM = 3.28084;
const heightM = 8 * 0.3048;

// page 5: wall 378pt + door (assigned to the wall) + window (page-level) + ceiling + trim
const wallLenM = 378 / PPU;
const gross5SF = wallLenM * heightM * SQFT;
const doorSF = 21;
const windowSF = 15;
const wall5NetSF = gross5SF - doorSF; // door assigned to Wall 1
const ceil5M2 = 10000 / (PPU * PPU);
const ceil5SF = ceil5M2 * SQFT;
const trim5LF = (61 / PPU) * FTM;

// page 6: quick-area room + trim
const roomPerimM = 14;
const roomWallSF = roomPerimM * heightM * SQFT;
const roomFloorM2 = 12;
const trim6M = 2;
const trim6LF = trim6M * FTM;

// price math (price book defaults — same formulas as quote.mjs)
const wallPrice = (netSF) => {
  const gallons = ((netSF * 2) / 375) * 1.1;
  const hours = (netSF / 200) * 1.7 * 1.3;
  return (hours * 55 + gallons * 32) * 1.3;
};
const ceilPrice = (sf) => {
  const gallons = ((sf * 2) / 375) * 1.1;
  const hours = (sf / 350) * 1.7 * 1.3;
  return (hours * 55 + gallons * 32) * 1.3;
};
const trimPrice = (lf) => lf * 2.5 * 1.3;

// per-room groups
const pWall5 = wallPrice(wall5NetSF);
const pLeftover5 = wallPrice(-windowSF); // page-level window, not tied to a room
const pCeil5 = ceilPrice(ceil5SF);
const pTrim5 = trimPrice(trim5LF);
const pRoom6 = wallPrice(roomWallSF);
const pTrim6 = trimPrice(trim6LF);
// per-page groups
const pPage5 = wallPrice(wall5NetSF - windowSF) + pCeil5 + pTrim5;
const pPage6 = pRoom6 + pTrim6;
const grand = pWall5 + pLeftover5 + pCeil5 + pTrim5 + pRoom6 + pTrim6;
console.log('  EXPECTED grand total', grand.toFixed(2), '| page5', pPage5.toFixed(2), '| page6', pPage6.toFixed(2));
console.log('  EXPECTED room groups: wall', pWall5.toFixed(2), 'leftover', pLeftover5.toFixed(2),
  'ceil', pCeil5.toFixed(2), 'trim5', pTrim5.toFixed(2), 'room6', pRoom6.toFixed(2), 'trim6', pTrim6.toFixed(2));

const money = (s) => {
  const m = /(−|-)?\$([\d,.]+)/.exec(s ?? '');
  return m ? parseFloat(m[2].replace(/,/g, '')) * (m[1] ? -1 : 1) : NaN;
};

const doc = await getDocument({ url: PDF, useSystemFonts: true }).promise;
const fp = doc.fingerprints[0];
await doc.destroy();

const seed = {
  [`pt:v1:scale:${fp}:5`]: { pointsPerMeter: PPU, verified: true, method: 'preset', axisCheckPassed: true, timestamp: Date.now() },
  [`pt:v1:scale:${fp}:6`]: { pointsPerMeter: PPU, verified: true, method: 'preset', axisCheckPassed: true, timestamp: Date.now() },
  [`pt:v1:measure:${fp}:5`]: [
    { id: 'w1', kind: 'length', purpose: 'wall', label: 'Wall 1', points: [{ x: 0, y: 0 }, { x: 378, y: 0 }], totalMeters: wallLenM, wallHeightM: heightM, createdAt: 1 },
    { id: 'c1', kind: 'ceiling', label: 'Ceiling 1', points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }], areaM2: ceil5M2, perimeterM: 400 / PPU, createdAt: 2 },
    { id: 't1', kind: 'length', purpose: 'trim', label: 'Trim 1', points: [{ x: 0, y: 0 }, { x: 61, y: 0 }], totalMeters: 61 / PPU, createdAt: 3 },
    { id: 'd1', kind: 'opening', label: 'D1', openType: 'door', point: { x: 50, y: 50 }, sfM2: doorSF / SQFT, assignedTo: 'w1', createdAt: 4 },
    { id: 'w9', kind: 'opening', label: 'W1', openType: 'window', point: { x: 70, y: 50 }, sfM2: windowSF / SQFT, assignedTo: null, createdAt: 5 },
  ],
  [`pt:v1:measure:${fp}:6`]: [
    { id: 'r1', kind: 'area', label: 'Room 1', floorAreaM2: roomFloorM2, perimeterM: roomPerimM, wallHeightM: heightM, wallAreaM2: roomPerimM * heightM, cutouts: [], createdAt: 6 },
    { id: 't2', kind: 'length', purpose: 'trim', label: 'Trim 1', points: [{ x: 0, y: 0 }, { x: 2 * PPU, y: 0 }], totalMeters: trim6M, createdAt: 7 },
  ],
};

const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

await page.goto(APP, { waitUntil: 'networkidle' });
await page.evaluate((s) => {
  localStorage.clear();
  for (const [k, v] of Object.entries(s)) localStorage.setItem(k, JSON.stringify(v));
}, seed);

// create the project through the flow
await page.setInputFiles('input[type=file]', PDF);
await page.waitForSelector('.modal .np-input.big');
await page.fill('.np-input.big', 'Breakdown Test');
await page.locator('.np-input').nth(1).fill('Test Painters Inc');
await page.getByRole('button', { name: 'Create project' }).click();
await page.waitForSelector('.picker-modal');
await page.locator('.picker-footer .go-button').click();
await page.waitForFunction(() => document.querySelector('.pdf-canvas')?.width > 400, null, { timeout: 60000 });

// measurements live on original pages 5 + 6 — go to page 5 first
await page.fill('.page-input', '5');
await page.locator('.page-input').blur();
await page.waitForTimeout(800);

// ---------- rename Wall 1 via DOUBLE-CLICK in the panel ----------
await page.getByRole('button', { name: /Measurements/ }).click();
await page.waitForSelector('.measure-panel');
const label = page.locator('.mp-label', { hasText: 'Wall 1' }).first();
await label.dblclick();
await page.waitForSelector('.mp-rename');
check('rename input has hint placeholder',
  (await page.locator('.mp-rename').getAttribute('placeholder'))?.includes('Name this') ?? false);
await page.screenshot({ path: 'rename-in-progress.png' });
await page.locator('.mp-rename').fill('North wall, office 3');
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
check('panel shows new name', (await page.locator('.measure-panel').textContent())?.includes('North wall, office 3') ?? false);

// ---------- quote: whole project (default) ----------
await page.getByRole('button', { name: 'Quote' }).click();
await page.waitForSelector('.quote-modal');
check('grouping toggle present', await page.getByRole('tab', { name: 'Per room' }).isVisible());
check('whole project is the default', (await page.getByRole('tab', { name: 'Whole project' }).getAttribute('aria-selected')) === 'true');
const grandShown = money(await page.locator('.quote-price strong').textContent());
console.log(`  grand total shown ${grandShown} vs expected ${grand.toFixed(2)}`);
check('grand total to the cent', Math.abs(grandShown - grand) < 0.01);

// ---------- per page ----------
await page.getByRole('tab', { name: 'Per page' }).click();
await page.waitForTimeout(300);
const pageGroups = await page.locator('.quote-group').allTextContents();
console.log('  per-page groups:', pageGroups.map((g) => g.trim().replace(/\s+/g, ' ')).join(' | '));
check('page 5 block', pageGroups.some((g) => g.includes('Page 5')));
check('page 6 block', pageGroups.some((g) => g.includes('Page 6')));
const subtotalOf = (texts, title) => {
  const g = texts.find((t) => t.includes(title));
  if (!g) return NaN;
  const m = /Group subtotal\s*((?:−|-)?\$[\d,.]+)/.exec(g.replace(/\s+/g, ' '));
  return m ? money(m[1]) : NaN;
};
const p5Shown = subtotalOf(pageGroups, 'Page 5');
const p6Shown = subtotalOf(pageGroups, 'Page 6');
check('page 5 subtotal to the cent', Math.abs(p5Shown - pPage5) < 0.01);
check('page 6 subtotal to the cent', Math.abs(p6Shown - pPage6) < 0.01);
check('page subtotals sum to grand total', Math.abs(p5Shown + p6Shown - grandShown) < 0.02);
await page.screenshot({ path: 'quote-per-page.png' });

// ---------- per room ----------
await page.getByRole('tab', { name: 'Per room' }).click();
await page.waitForTimeout(300);
const roomGroups = await page.locator('.quote-group').allTextContents();
console.log('  per-room groups:', roomGroups.map((g) => g.trim().replace(/\s+/g, ' ')).join(' | '));
check('custom name in per-room block', roomGroups.some((g) => g.includes('North wall, office 3')));
check('auto label for unnamed room', roomGroups.some((g) => g.includes('Room 1')));
check('unassigned openings group', roomGroups.some((g) => g.includes('Not tied to a room')));
const rWall = subtotalOf(roomGroups, 'North wall, office 3');
const rLeft = subtotalOf(roomGroups, 'Not tied to a room');
const rCeil = subtotalOf(roomGroups, 'Ceiling 1');
const rRoom6 = subtotalOf(roomGroups, 'Room 1');
check('wall group to the cent', Math.abs(rWall - pWall5) < 0.01);
check('leftover deduction group to the cent', Math.abs(rLeft - pLeftover5) < 0.01);
check('ceiling group to the cent', Math.abs(rCeil - pCeil5) < 0.01);
check('room group to the cent', Math.abs(rRoom6 - pRoom6) < 0.01);
const roomSubtotals = roomGroups.map((g) => {
  const m = /Group subtotal\s*((?:−|-)?\$[\d,.]+)/.exec(g.replace(/\s+/g, ' '));
  return m ? money(m[1]) : NaN;
});
check('all room subtotals parsed', roomSubtotals.every((x) => Number.isFinite(x)));
const sumRooms = roomSubtotals.reduce((a, b) => a + b, 0);
console.log(`  room subtotals: ${roomSubtotals.map((x) => x.toFixed(2)).join(' + ')} = ${sumRooms.toFixed(2)} vs grand ${grandShown}`);
check('room subtotals sum to grand total', Math.abs(sumRooms - grandShown) < 0.02);
await page.screenshot({ path: 'quote-per-room.png' });

// ---------- Excel: Breakdown sheet matches the selected grouping (per room) ----------
const downloadPromise = page.waitForEvent('download', { timeout: 15000 });
await page.getByRole('button', { name: 'Export to Excel' }).click();
const download = await downloadPromise;
const buf = fs.readFileSync(await download.path());
const wb = XLSX.read(buf, { type: 'buffer' });
console.log('  sheets:', wb.SheetNames.join(', '));
check('Breakdown sheet present', wb.SheetNames.includes('Breakdown'));
const bRows = XLSX.utils.sheet_to_json(wb.Sheets['Breakdown'], { header: 1 });
console.log('  breakdown rows:');
for (const r of bRows) if (r.length) console.log('   ', JSON.stringify(r));
const bText = JSON.stringify(bRows);
check('Breakdown shows custom name', bText.includes('North wall, office 3'));
check('Breakdown shows leftover group', bText.includes('Not tied to a room'));
const subtotalPrices = bRows
  .filter((r) => typeof r[0] === 'string' && r[0].endsWith('— subtotal'))
  .map((r) => money(String(r[8])));
const grandRow = bRows.find((r) => r[0] === 'GRAND TOTAL');
const excelGrand = money(String(grandRow?.[8]));
console.log(`  excel: ${subtotalPrices.length} subtotals sum ${subtotalPrices.reduce((a, b) => a + b, 0).toFixed(2)} vs grand row ${excelGrand}`);
check('Breakdown subtotals sum to grand total row',
  subtotalPrices.length === roomSubtotals.length &&
  Math.abs(subtotalPrices.reduce((a, b) => a + b, 0) - excelGrand) < 0.02);
check('Breakdown grand matches quote', Math.abs(excelGrand - grand) < 0.02);
const mRows = XLSX.utils.sheet_to_json(wb.Sheets['Measurements'], { header: 1 });
check('Measurements sheet uses custom name', JSON.stringify(mRows).includes('North wall, office 3'));
await page.getByRole('button', { name: 'Close' }).click();

// ---------- one-time rename tip in the guidance bar (fresh state) ----------
const ctx2 = await browser.newContext({ viewport: { width: 1500, height: 950 } });
const page2 = await ctx2.newPage();
page2.on('pageerror', (e) => errors.push(`pageerror(tip): ${e.message}`));
await page2.goto(APP, { waitUntil: 'networkidle' });
await page2.evaluate(() => localStorage.clear());
await page2.setInputFiles('input[type=file]', PDF);
await page2.waitForSelector('.modal .np-input.big');
await page2.getByRole('button', { name: 'Create project' }).click();
await page2.waitForSelector('.picker-modal');
await page2.locator('.picker-footer .go-button').click();
await page2.waitForFunction(() => document.querySelector('.pdf-canvas')?.width > 400, null, { timeout: 60000 });
await page2.selectOption('.preset-select', '1:75');
await page2.waitForSelector('.modal');
await page2.getByRole('button', { name: 'Skip this' }).click();
await page2.getByRole('button', { name: 'Measure', exact: true }).click();
const box = await page2.locator('.viewer').boundingBox();
await page2.mouse.click(box.x + 400, box.y + 400);
await page2.mouse.click(box.x + 700, box.y + 400);
await page2.mouse.dblclick(box.x + 700, box.y + 400);
await page2.waitForTimeout(500);
// the tip shows once back in idle mode (it never steals the measure bar)
await page2.getByRole('button', { name: 'Move Around' }).click();
await page2.waitForTimeout(300);
const stepText = await page2.locator('.step-bar').textContent();
console.log('  step bar after first measurement:', stepText?.trim().slice(0, 140));
check('rename tip appears after first measurement', /double-click/i.test(stepText ?? '') && stepText?.includes('rename'));
await page2.getByRole('button', { name: 'OK' }).click();
await page2.waitForTimeout(300);
check('tip dismisses', !(await page2.locator('.step-bar').textContent())?.includes('rename'));
await ctx2.close();

console.log('errors:', errors.length ? errors : 'none');
await browser.close();
process.exit(errors.length ? 1 : 0);
