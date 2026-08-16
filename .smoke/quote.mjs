/* v0.5 quote engine: seeded measurements with EXACT known quantities ->
 * hand-computed expected quote numbers asserted against the UI.
 * Also: price book edit/persist/reset, cross-metric warning, Excel export.
 */
import { chromium } from 'playwright-core';
import { getDocument } from '../app/node_modules/pdfjs-dist/legacy/build/pdf.mjs';
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
const PPU = 37.79527559055118; // 1:75 points per meter
const SQFT = 10.7639;
const FTM = 3.28084;
const wallLenM = 378 / PPU; // 10.0013 m
const wallLenFt = wallLenM * FTM; // 32.81 ft
const heightM = 8 * 0.3048;
const grossM2 = wallLenM * heightM;
const grossSF = grossM2 * SQFT; // 262.5
const doorM2 = 21 / SQFT;
const netSF = grossSF - 21; // 241.5
const ceilM2 = 10000 / (PPU * PPU);
const ceilSF = ceilM2 * SQFT; // 75.1
const trimLF = (61 / PPU) * FTM; // 5.29

// expected quote math (defaults)
const gallonsW = ((netSF * 2) / 375) * 1.1;
const hoursW = (netSF / 200) * 1.7 * 1.3;
const labourW = hoursW * 55;
const paintW = gallonsW * 32;
const costW = labourW + paintW;
const priceW = costW * 1.3;
const gallonsC = ((ceilSF * 2) / 375) * 1.1;
const hoursC = (ceilSF / 350) * 1.7 * 1.3;
const costC = hoursC * 55 + gallonsC * 32;
const priceC = costC * 1.3;
const costT = trimLF * 2.5;
const priceT = costT * 1.3;
const totalCost = costW + costC + costT;
const totalPrice = priceW + priceC + priceT;
const totalGal = gallonsW + gallonsC;
const totalHours = hoursW + hoursC;
const pricePerFloor = totalPrice / (netSF / 3);
const labourShare = (labourW + hoursC * 55 + costT) / totalPrice;
console.log('  EXPECTED:', JSON.stringify({
  netSF: netSF.toFixed(1), priceW: priceW.toFixed(2), priceC: priceC.toFixed(2),
  priceT: priceT.toFixed(2), totalPrice: totalPrice.toFixed(2),
  totalGal: totalGal.toFixed(2), totalHours: totalHours.toFixed(2),
  pricePerFloor: pricePerFloor.toFixed(2), labourShare: (labourShare * 100).toFixed(0) + '%',
}));

const doc = await getDocument({ url: PDF, useSystemFonts: true }).promise;
const fp = doc.fingerprints[0];
await doc.destroy();
console.log('  fingerprint:', fp);

const seed = {
  [`pt:v1:scale:${fp}:5`]: {
    pointsPerMeter: PPU, verified: true, method: 'preset', axisCheckPassed: true, timestamp: Date.now(),
  },
  [`pt:v1:measure:${fp}:5`]: [
    { id: 'w1', kind: 'length', purpose: 'wall', label: 'Wall 1', points: [{ x: 0, y: 0 }, { x: 378, y: 0 }], totalMeters: wallLenM, wallHeightM: heightM, createdAt: 1 },
    { id: 'c1', kind: 'ceiling', label: 'Ceiling 1', points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }], areaM2: ceilM2, perimeterM: 400 / PPU, createdAt: 2 },
    { id: 't1', kind: 'length', purpose: 'trim', label: 'Trim 1', points: [{ x: 0, y: 0 }, { x: 61, y: 0 }], totalMeters: 61 / PPU, createdAt: 3 },
    { id: 'd1', kind: 'opening', label: 'D1', openType: 'door', point: { x: 50, y: 50 }, sfM2: doorM2, assignedTo: null, createdAt: 4 },
  ],
};

const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

await page.goto(APP, { waitUntil: 'networkidle' });
await page.evaluate((seed) => {
  localStorage.clear();
  for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, JSON.stringify(v));
}, seed);
await page.setInputFiles('input[type=file]', PDF);
await page.waitForFunction(() => document.querySelector('.pdf-canvas')?.width > 400, null, { timeout: 60000 });
await page.fill('.page-input', '5');
await page.locator('.page-input').blur();
await page.waitForTimeout(800);

// ---------- quote view ----------
await page.getByRole('button', { name: 'Quote' }).click();
await page.waitForSelector('.quote-modal');
const quoteText = await page.locator('.quote-modal').textContent();
const priceText = await page.locator('.quote-price strong').textContent();
const priceShown = parseFloat((priceText ?? '0').replace(/[^0-9.]/g, ''));
console.log(`  QUOTE PRICE shown ${priceText} vs expected $${totalPrice.toFixed(2)}`);
check('quote price matches hand math (±$2)', Math.abs(priceShown - totalPrice) <= 2);
check('walls category present', quoteText?.includes('Walls'));
check('gallons ≈ expected', quoteText?.includes(`${totalGal.toFixed(1)} gallons`));
check('hours ≈ expected', quoteText?.includes(`${totalHours.toFixed(1)} hours`));
check('floor cross-metric in band, no warning', !quoteText?.includes('⚠'));
check('labour share shown', quoteText?.includes(`${(labourShare * 100).toFixed(0)}% of price`));
await page.screenshot({ path: 'quote-view.png' });

// ---------- price book: edit -> quote updates -> persists -> reset ----------
await page.getByRole('button', { name: 'Close' }).click();
await page.getByTitle('Your rates — labour, paint, margin').click();
await page.waitForSelector('.pricebook-modal');
await page.screenshot({ path: 'pricebook.png' });
const labourInput = page.locator('.pb-field', { hasText: 'Loaded labour rate' }).locator('input');
await labourInput.fill('60');
await page.getByRole('button', { name: 'Done' }).click();
await page.getByRole('button', { name: 'Quote' }).click();
const price60 = parseFloat((await page.locator('.quote-price strong').textContent() ?? '0').replace(/[^0-9.]/g, ''));
const expected60 = ((hoursW * 60 + paintW) * 1.3) + ((hoursC * 60 + gallonsC * 32) * 1.3) + priceT;
console.log(`  at $60/hr: shown ${price60} vs expected ${expected60.toFixed(2)}`);
check('quote follows edited labour rate (±$2)', Math.abs(price60 - expected60) <= 2);
await page.getByRole('button', { name: 'Close' }).click();
await page.reload({ waitUntil: 'networkidle' });
await page.getByTitle('Your rates — labour, paint, margin').click();
const labourAfter = await page.locator('.pb-field', { hasText: 'Loaded labour rate' }).locator('input').inputValue();
check('price book persists across reload', labourAfter === '60');
await page.getByRole('button', { name: 'Reset to Ontario defaults' }).click();
const labourReset = await page.locator('.pb-field', { hasText: 'Loaded labour rate' }).locator('input').inputValue();
check('reset restores 55', labourReset === '55');
await page.getByRole('button', { name: 'Done' }).click();

// reopen the plan after the reload
await page.setInputFiles('input[type=file]', PDF);
await page.waitForFunction(() => document.querySelector('.pdf-canvas')?.width > 400, null, { timeout: 60000 });
await page.fill('.page-input', '5');
await page.locator('.page-input').blur();
await page.waitForTimeout(600);
await page.getByTitle('Your rates — labour, paint, margin').click();
await page.waitForSelector('.pricebook-modal');

// ---------- cross-metric warning on absurd rate ----------
await labourInput.fill('500');
await page.getByRole('button', { name: 'Done' }).click();
await page.getByRole('button', { name: 'Quote' }).click();
await page.waitForSelector('.quote-warning');
check('absurd rate triggers warning', (await page.locator('.quote-warning').textContent())?.includes('usual Ontario band'));
await page.screenshot({ path: 'quote-warning.png' });
await page.getByRole('button', { name: 'Close' }).click();
// restore defaults for the export
await page.getByTitle('Your rates — labour, paint, margin').click();
await page.getByRole('button', { name: 'Reset to Ontario defaults' }).click();
await page.getByRole('button', { name: 'Done' }).click();

// ---------- Excel export ----------
await page.getByRole('button', { name: 'Quote' }).click();
const downloadPromise = page.waitForEvent('download', { timeout: 15000 });
await page.getByRole('button', { name: 'Export to Excel' }).click();
const download = await downloadPromise;
const path = await download.path();
const buf = fs.readFileSync(path);
console.log(`  download: ${download.suggestedFilename()}, ${buf.length} bytes`);
check('xlsx has a quote filename', /quote-.*\.xlsx$/.test(download.suggestedFilename()));
check('xlsx non-trivial size', buf.length > 4000);
check('xlsx magic bytes PK', buf[0] === 0x50 && buf[1] === 0x4b);
await page.getByRole('button', { name: 'Close' }).click();

console.log('errors:', errors.length ? errors : 'none');
await browser.close();
process.exit(errors.length ? 1 : 0);
