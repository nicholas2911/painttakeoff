/* New this session: per-quote paint/heavy-prep/high-ceiling overrides that
 * don't touch the saved Price Book, manual price-book add-ons, the per-coat
 * wall sanity metric, the Simple $/SF wall pricing mode, the "how we got
 * this price" narrative, and the scratch overlay layer (draw without
 * affecting totals, independent Clear/Undo, History revert). */
import { chromium } from 'playwright-core';
import { getDocument } from '../app/node_modules/pdfjs-dist/legacy/build/pdf.mjs';

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

const PPU = 37.79527559055118; // 1:75
const SQFT = 10.7639;
const heightM = 8 * 0.3048;
const wallLenM = 378 / PPU;
const netWallSF = wallLenM * heightM * SQFT; // seeded wall, no openings

const doc = await getDocument({ url: PDF, useSystemFonts: true }).promise;
const fp = doc.fingerprints[0];
await doc.destroy();

const seed = {
  [`pt:v1:scale:${fp}:5`]: { pointsPerMeter: PPU, verified: true, method: 'preset', axisCheckPassed: true, timestamp: Date.now() },
  [`pt:v1:measure:${fp}:5`]: [
    { id: 'w1', kind: 'length', purpose: 'wall', label: 'Wall 1', points: [{ x: 100, y: 400 }, { x: 478, y: 400 }], totalMeters: wallLenM, wallHeightM: heightM, createdAt: 1 },
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
await page.setInputFiles('input[type=file]', PDF);
await page.waitForSelector('.modal .np-input.big');
await page.getByRole('button', { name: 'Create project' }).click();
await page.waitForSelector('.picker-modal');
await page.locator('.picker-footer .go-button').click();
await page.waitForFunction(() => document.querySelector('.pdf-canvas')?.width > 400, null, { timeout: 60000 });
await page.fill('.page-input', '5');
await page.locator('.page-input').blur();
await page.waitForTimeout(800);

// ---------- A. quote options are per-quote, not global ----------
await page.getByRole('button', { name: 'Quote' }).click();
await page.waitForSelector('.quote-modal');
const priceBefore = await page.locator('.quote-price strong').textContent();
console.log('  price before override:', priceBefore);
await page.locator('.quote-opt-field select').selectOption('premium');
await page.waitForTimeout(300);
const priceAfter = await page.locator('.quote-price strong').textContent();
console.log('  price after premium paint override:', priceAfter);
check('premium paint grade raises the price', parseFloat(priceAfter.replace(/[^0-9.]/g, '')) > parseFloat(priceBefore.replace(/[^0-9.]/g, '')));
check('reset-to-defaults link appears once overridden', (await page.locator('.quote-options-reset').count()) === 1);

const pbSnapshotWhileOverridden = await page.evaluate(() => JSON.parse(localStorage.getItem('pt:v1:pricebook') || '{}'));
check('global Price Book untouched by the quote override', (pbSnapshotWhileOverridden.paintGrade ?? 'contractor') === 'contractor');

// ---------- B. per-coat sanity metric ----------
const crossText = await page.locator('.quote-cross').textContent();
check('per-coat sanity row shown in detailed mode', crossText.includes('Per sq ft of wall, per coat'));

// ---------- C. manual add-on ----------
await page.locator('.quote-addon-new select').selectOption('trim');
await page.locator('.quote-addon-new input[type=number]').fill('10');
await page.getByRole('button', { name: 'Add', exact: true }).click();
await page.waitForTimeout(300);
check('add-on row appears', (await page.locator('.quote-addon-row').count()) === 1);
const addOnPrice = await page.locator('.quote-addon-price').textContent();
console.log('  add-on price (10 LF trim):', addOnPrice);
check('add-on priced from the price book (10 * 2.5 * 1.3 = $32.50)', addOnPrice.includes('32.50'));
const priceWithAddOn = await page.locator('.quote-price strong').textContent();
check('grand total includes the add-on', parseFloat(priceWithAddOn.replace(/[^0-9.]/g, '')) > parseFloat(priceAfter.replace(/[^0-9.]/g, '')));

// ---------- D. "how we got this price" narrative ----------
await page.locator('.quote-why-toggle').click();
await page.waitForTimeout(200);
const whyText = await page.locator('.quote-why-body').textContent();
console.log('  narrative:', whyText.slice(0, 160));
check('narrative explains the wall math', whyText.includes('Walls:') && whyText.includes('coat'));
check('narrative explains the add-on', whyText.includes('Trim'));

// reset the override so later checks start clean
await page.locator('.quote-options-reset').click();
await page.waitForTimeout(200);
await page.locator('.quote-addon-remove').click();
await page.waitForTimeout(200);
await page.getByRole('button', { name: 'Close' }).click();

// ---------- E. Simple $/SF wall pricing mode ----------
await page.locator('button[title*="labour, paint, margin"]').click(); // Price Book icon button (no label)
await page.waitForSelector('.pricebook-modal');
await page.getByRole('tab', { name: /Simple/ }).click();
await page.locator('.pb-group-wide input[type=number]').fill('5');
await page.getByRole('button', { name: 'Done' }).click();
await page.waitForTimeout(200);
await page.getByRole('button', { name: 'Quote' }).click();
await page.waitForSelector('.quote-modal');
const simpleCross = await page.locator('.quote-cross').textContent();
check('per-coat metric hidden in Simple mode', !simpleCross.includes('Per sq ft of wall, per coat'));
const simpleWallsRow = (await page.locator('.quote-cat').first().textContent()).replace(/,/g, '');
const expectedSimplePrice = (netWallSF * 5).toFixed(2);
console.log('  simple walls block:', simpleWallsRow, '| expected $' + expectedSimplePrice);
check('walls price = netSF * flat rate in Simple mode', simpleWallsRow.includes(expectedSimplePrice));
await page.getByRole('button', { name: 'Close' }).click();

// put it back to detailed for anyone re-running interactively
await page.locator('button[title*="labour, paint, margin"]').click();
await page.waitForSelector('.pricebook-modal');
await page.getByRole('tab', { name: /Detailed/ }).click();
await page.getByRole('button', { name: 'Done' }).click();
await page.waitForTimeout(200);

// ---------- F. scratch overlay ----------
await page.getByRole('button', { name: /Measurements/ }).click();
await page.waitForSelector('.measure-panel');
check('panel starts with 1 real measurement', (await page.locator('.mp-row').count()) === 1);

await page.getByRole('button', { name: /Overlay/ }).click();
check('scratch banner appears', (await page.locator('.scratch-banner').count()) === 1);

await page.getByRole('button', { name: 'Measure', exact: true }).click();
const rect = await page.locator('.viewer').boundingBox();
await page.mouse.click(rect.x + 300, rect.y + 500);
await page.mouse.click(rect.x + 500, rect.y + 500);
await page.mouse.dblclick(rect.x + 500, rect.y + 500);
await page.waitForTimeout(400);
const scratchToast = await page.locator('.toast').textContent();
console.log('  scratch draw toast:', scratchToast);
check('scratch measurement toast says not counted', scratchToast.includes('not counted'));
check('panel still shows only the 1 real measurement', (await page.locator('.mp-row').count()) === 1);

await page.getByRole('button', { name: 'Quote' }).click();
await page.waitForSelector('.quote-modal');
const priceDuringScratch = await page.locator('.quote-price strong').textContent();
check('quote total unaffected by the scratch draw', priceDuringScratch === priceBefore);
await page.getByRole('button', { name: 'Close' }).click();

// Undo removes only the scratch item
await page.getByRole('button', { name: 'Move Around' }).click();
await page.getByRole('button', { name: 'Undo', exact: true }).click();
await page.waitForTimeout(300);
const undoToast = await page.locator('.toast').textContent();
check('undo toast names the scratch measurement', undoToast.includes('Removed'));

// draw again, then use Clear (two-click confirm)
await page.getByRole('button', { name: 'Measure', exact: true }).click();
await page.mouse.click(rect.x + 300, rect.y + 520);
await page.mouse.click(rect.x + 500, rect.y + 520);
await page.mouse.dblclick(rect.x + 500, rect.y + 520);
await page.waitForTimeout(300);
await page.getByRole('button', { name: 'Move Around' }).click();
await page.getByRole('button', { name: 'Clear', exact: true }).click();
await page.waitForTimeout(100);
await page.getByRole('button', { name: /Clear\? Click again/ }).click();
await page.waitForTimeout(300);
const clearToast = await page.locator('.toast').textContent();
check('clear toast confirms scratch overlay cleared', clearToast.includes('scratch overlay'));

await page.getByRole('button', { name: /Overlay/ }).click();
check('scratch banner gone after exiting overlay', (await page.locator('.scratch-banner').count()) === 0);
check('real measurement still there after scratch session', (await page.locator('.mp-row').count()) === 1);

// ---------- G. history revert (real layer) ----------
await page.getByRole('button', { name: 'Measure', exact: true }).click();
await page.mouse.click(rect.x + 300, rect.y + 540);
await page.mouse.click(rect.x + 450, rect.y + 540);
await page.mouse.dblclick(rect.x + 450, rect.y + 540);
await page.waitForTimeout(300);
await page.getByRole('button', { name: 'Move Around' }).click();
check('panel now shows 2 real measurements', (await page.locator('.mp-row').count()) === 2);

await page.getByRole('button', { name: 'History', exact: true }).click();
await page.waitForSelector('.history-modal');
const historyRows = await page.locator('.history-row').count();
console.log('  history entries:', historyRows);
check('history has at least one entry', historyRows >= 1);
await page.locator('.history-row').last().locator('button').click(); // oldest = before any edits
await page.waitForTimeout(300);
check('revert restores the earlier count', (await page.locator('.mp-row').count()) === 1);

console.log('errors:', errors.length ? errors : 'none');
await browser.close();
process.exit(errors.length ? 1 : 0);
