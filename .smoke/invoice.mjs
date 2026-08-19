/* v0.7: invoice maker — prefilled from a seeded quote, configurable tax rows
 * (label + rate + on/off + add/remove) with math asserted to the cent,
 * inline edits, overrides, persistence, and web print. */
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

// same seeded quantities as quote.mjs
const PPU = 37.79527559055118;
const SQFT = 10.7639;
const wallLenM = 378 / PPU;
const heightM = 8 * 0.3048;
const grossSF = wallLenM * heightM * SQFT;
const netSF = grossSF - 21;
const ceilSF = (10000 / (PPU * PPU)) * SQFT;
const trimLF = (61 / PPU) * 3.28084;
// quote math (defaults) — matches quote.mjs
const gallonsW = ((netSF * 2) / 375) * 1.1;
const priceW = ((netSF / 200) * 1.7 * 1.3 * 55 + gallonsW * 32) * 1.3;
const gallonsC = ((ceilSF * 2) / 375) * 1.1;
const priceC = ((ceilSF / 350) * 1.7 * 1.3 * 55 + gallonsC * 32) * 1.3;
const priceT = trimLF * 2.5 * 1.3;
const subtotal = priceW + priceC + priceT;
const hst = subtotal * 0.13;
const total = subtotal + hst;
console.log('  EXPECTED subtotal', subtotal.toFixed(2), 'hst', hst.toFixed(2), 'total', total.toFixed(2));

const money = (s) => { const m = /\$([\d,.]+)/.exec(s ?? ''); return m ? parseFloat(m[1].replace(/,/g, '')) : NaN; };
const totalsRows = (page) => page.locator('.inv-totals .inv-total-row').allTextContents();

const doc = await getDocument({ url: PDF, useSystemFonts: true }).promise;
const fp = doc.fingerprints[0];
await doc.destroy();

const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

await page.goto(APP, { waitUntil: 'networkidle' });
await page.evaluate((seed) => {
  localStorage.clear();
  for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, JSON.stringify(v));
}, {
  [`pt:v1:scale:${fp}:5`]: { pointsPerMeter: PPU, verified: true, method: 'preset', axisCheckPassed: true, timestamp: Date.now() },
  [`pt:v1:measure:${fp}:5`]: [
    { id: 'w1', kind: 'length', purpose: 'wall', label: 'Wall 1', points: [{ x: 0, y: 0 }, { x: 378, y: 0 }], totalMeters: wallLenM, wallHeightM: heightM, createdAt: 1 },
    { id: 'c1', kind: 'ceiling', label: 'Ceiling 1', points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }], areaM2: ceilSF / SQFT, perimeterM: 400 / PPU, createdAt: 2 },
    { id: 't1', kind: 'length', purpose: 'trim', label: 'Trim 1', points: [{ x: 0, y: 0 }, { x: 61, y: 0 }], totalMeters: 61 / PPU, createdAt: 3 },
    { id: 'd1', kind: 'opening', label: 'D1', openType: 'door', point: { x: 50, y: 50 }, sfM2: 21 / SQFT, assignedTo: null, createdAt: 4 },
  ],
});

// create the project through the flow
await page.setInputFiles('input[type=file]', PDF);
await page.waitForSelector('.modal .np-input.big');
await page.fill('.np-input.big', 'Summerville Pines');
await page.locator('.np-input').nth(1).fill('Dundas St GC');
await page.getByRole('button', { name: 'Create project' }).click();
await page.waitForSelector('.picker-modal');
await page.locator('.picker-footer .go-button').click();
await page.waitForFunction(() => document.querySelector('.pdf-canvas')?.width > 400, null, { timeout: 60000 });

// --- quote -> create invoice ---
await page.getByRole('button', { name: 'Quote' }).click();
await page.waitForSelector('.quote-modal');
check('Create invoice button in quote view', await page.getByRole('button', { name: 'Create invoice' }).isVisible());
await page.getByRole('button', { name: 'Create invoice' }).click();
await page.waitForSelector('.invoice-doc');

const invText = await page.locator('.invoice-doc').textContent();
check('invoice header shows company', invText?.includes('Dundas St GC'));
check('invoice shows project name', invText?.includes('Summerville Pines'));
check('invoice number INV-0001', invText?.includes('INV-0001'));
check('walls line prefilled', invText?.includes('Walls — prep & paint'));
const rows = await totalsRows(page);
console.log('  totals rows:', rows.map((r) => r.trim().replace(/\s+/g, ' ')).join(' | '));
check('subtotal to the cent', Math.abs(money(rows[0]) - subtotal) < 0.01);
check('default tax row labelled HST 13%', rows[1]?.includes('HST') && rows[1]?.includes('13%'));
check('HST to the cent', Math.abs(money(rows[1]) - hst) < 0.01);
check('total to the cent', Math.abs(money(rows[2]) - total) < 0.01);
await page.screenshot({ path: 'invoice-preview.png' });

// --- inline edit: change walls line amount to $250 ---
const firstMoney = page.locator('.inv-table tbody tr').first().locator('.inv-money');
await firstMoney.click();
await page.locator('.inv-money-input').fill('250');
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
const rowsAfter = await totalsRows(page);
const newSubtotal = subtotal - Math.round(priceW * 100) / 100 + 250;
console.log(`  subtotal after edit: ${rowsAfter[0].trim()} (expected ≈ ${newSubtotal.toFixed(2)})`);
check('subtotal follows line edit', Math.abs(money(rowsAfter[0]) - newSubtotal) < 0.02);
check('HST follows line edit', Math.abs(money(rowsAfter[1]) - newSubtotal * 0.13) < 0.02);

// --- add + remove a line ---
await page.locator('.inv-add-line').click();
await page.waitForTimeout(200);
check('line added', (await page.locator('.inv-table tbody tr').count()) === 4);
await page.locator('.inv-table .inv-row-del').nth(3).click();
await page.waitForTimeout(200);
check('line removed', (await page.locator('.inv-table tbody tr').count()) === 3);

// --- add a second tax row: PST 7% ---
await page.getByRole('button', { name: '+ Add a tax' }).click();
await page.waitForTimeout(200);
check('tax row added', (await page.locator('.inv-totals .inv-total-row').count()) === 4);
// relabel the new row (row index 2: subtotal, HST, new) to PST
const newTaxRow = page.locator('.inv-totals .inv-total-row').nth(2);
await newTaxRow.locator('.inv-edit').first().click();
await page.locator('.inv-totals .inv-input').fill('PST');
await page.keyboard.press('Enter');
await page.waitForTimeout(200);
// set its rate to 7%
const rateEdit = page.locator('.inv-totals .inv-total-row').nth(2).locator('.inv-edit');
check('new row labelled PST', (await rateEdit.first().textContent()) === 'PST');
await rateEdit.nth(1).click();
await page.locator('.inv-totals .inv-input').fill('7');
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
const rowsWithPst = await totalsRows(page);
console.log('  with PST:', rowsWithPst.map((r) => r.trim().replace(/\s+/g, ' ')).join(' | '));
check('HST to the cent with two rows', Math.abs(money(rowsWithPst[1]) - newSubtotal * 0.13) < 0.02);
check('PST 7% to the cent', Math.abs(money(rowsWithPst[2]) - newSubtotal * 0.07) < 0.02);
check('total = subtotal + HST + PST', Math.abs(money(rowsWithPst[3]) - newSubtotal * 1.2) < 0.03);

// --- toggle HST off: amount drops to $0.00, total follows ---
await page.locator('.inv-totals .inv-total-row').nth(1).locator('input[type=checkbox]').click();
await page.waitForTimeout(300);
const rowsHstOff = await totalsRows(page);
console.log('  HST off:', rowsHstOff.map((r) => r.trim().replace(/\s+/g, ' ')).join(' | '));
check('toggled-off tax shows $0.00', Math.abs(money(rowsHstOff[1])) < 0.01);
check('total follows toggle', Math.abs(money(rowsHstOff[3]) - newSubtotal * 1.07) < 0.03);
// toggle it back on
await page.locator('.inv-totals .inv-total-row').nth(1).locator('input[type=checkbox]').click();
await page.waitForTimeout(300);

// --- delete the PST row ---
await page.locator('.inv-totals .inv-total-row').nth(2).locator('.inv-row-del').click();
await page.waitForTimeout(300);
const rowsAfterDel = await totalsRows(page);
check('tax row deleted', rowsAfterDel.length === 3);
check('total back to subtotal + HST', Math.abs(money(rowsAfterDel[2]) - newSubtotal * 1.13) < 0.03);

// --- override the total -> flagged, then restore ---
const totalCell = page.locator('.inv-total-row.grand .inv-money');
await totalCell.click();
await page.locator('.inv-money-input').fill('400');
await page.keyboard.press('Enter');
await page.waitForTimeout(200);
check('override flagged', (await page.locator('.inv-total-row.grand').textContent())?.includes('(edited)'));
await page.getByRole('button', { name: 'Back to automatic totals' }).click();
await page.waitForTimeout(200);
check('override cleared', !((await page.locator('.inv-total-row.grand').textContent())?.includes('(edited)')));

// --- persistence: close + reopen shows the edited draft (lines AND tax rows) ---
// relabel the remaining tax row to a custom free-text label first
const taxRow = page.locator('.inv-totals .inv-total-row').nth(1);
await taxRow.locator('.inv-edit').first().click();
await page.locator('.inv-totals .inv-input').fill('Sales tax');
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
await page.getByRole('button', { name: 'Close' }).click();
await page.getByRole('button', { name: 'Quote' }).click();
await page.getByRole('button', { name: 'Create invoice' }).click();
await page.waitForSelector('.invoice-doc');
check('draft persisted (edited amount kept)', (await page.locator('.inv-table').textContent())?.includes('$250.00'));
const rowsReopen = await totalsRows(page);
console.log('  reopened:', rowsReopen.map((r) => r.trim().replace(/\s+/g, ' ')).join(' | '));
check('tax row label persisted', rowsReopen[1]?.includes('Sales tax') && rowsReopen[1]?.includes('13%'));
check('tax amount persisted to the cent', Math.abs(money(rowsReopen[1]) - newSubtotal * 0.13) < 0.02);

// --- web save path: window.print gets called ---
await page.evaluate(() => { window.__printed = false; window.print = () => { window.__printed = true; }; });
await page.getByRole('button', { name: 'Save as PDF' }).click();
await page.waitForTimeout(300);
check('web save triggers print', await page.evaluate(() => window.__printed === true));

console.log('errors:', errors.length ? errors : 'none');
await browser.close();
process.exit(errors.length ? 1 : 0);
