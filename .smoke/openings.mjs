/* v0.4: measurement kinds (wall/trim/ceiling), ceiling polygon areas,
 * openings pins with gross→net math, assignment, deduction toggle, Ctrl+Z,
 * persistence. Uses the friend set page 5 (1:75).
 */
import { chromium } from 'playwright-core';
import { openPdf, reopenProject } from './helpers.mjs';

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

const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

await page.goto(APP, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
  await openPdf(page, PDF);
await page.fill('.page-input', '5');
await page.locator('.page-input').blur();
await page.waitForTimeout(1000);
await page.selectOption('.preset-select', '1:75');
await page.waitForSelector('.modal');
await page.getByRole('button', { name: 'Skip this' }).click();
await page.locator('.unit-toggle button', { hasText: 'ft & in' }).click();

const zoom = parseInt(await page.locator('.zoom-pct').textContent(), 10) / 100;
const pxToFt = (px) => (px / zoom / 72) * 75 / 12;
const px2ToM2 = (a, b) => ((a / zoom) * (b / zoom)) / (37.795 * 37.795);
const m2ToSf = (m2) => m2 * 10.7639;
const box = await page.locator('.viewer').boundingBox();
const cx = box.x + 650, cy = box.y + 380;
console.log(`  zoom ${zoom}`);

// ---------- kinds: wall (default), trim, ceiling ----------
await page.getByRole('button', { name: 'Measure', exact: true }).click();
check('kind picker shown', (await page.locator('.kind-picker').textContent())?.includes('Trim'));
// wall chain, 200px
await page.mouse.click(cx - 300, cy - 150);
await page.mouse.click(cx - 100, cy - 150);
await page.mouse.dblclick(cx - 100, cy - 150);
await page.waitForTimeout(300);
// trim chain, 150px
await page.locator('.kind-picker button', { hasText: 'Trim' }).click();
await page.mouse.click(cx - 300, cy - 60);
await page.mouse.click(cx - 150, cy - 60);
await page.mouse.dblclick(cx - 150, cy - 60);
await page.waitForTimeout(300);
// ceiling polygon 200x120px
await page.locator('.kind-picker button', { hasText: 'Ceiling' }).click();
await page.mouse.click(cx - 300, cy + 60);
await page.mouse.click(cx - 100, cy + 60);
await page.mouse.click(cx - 100, cy + 180);
await page.mouse.click(cx - 300, cy + 180);
await page.mouse.dblclick(cx - 300, cy + 180);
await page.waitForTimeout(300);

await page.getByRole('button', { name: /Measurements/ }).click();
await page.waitForSelector('.measure-panel');
const sectionTitles = await page.locator('.mp-section-title').allTextContents();
console.log('  sections:', sectionTitles.join(' | '));
check('Walls + Ceilings + Trim sections', ['Walls', 'Ceilings', 'Trim'].every((t) => sectionTitles.includes(t)));
const ceilRow = await page.locator('.mp-row').nth(1).locator('.mp-value').textContent();
const ceilSf = parseFloat((ceilRow ?? '0').replace(/[^0-9.]/g, ''));
const ceilExpected = m2ToSf(px2ToM2(200, 120));
console.log(`  ceiling: shown ${ceilSf} sq ft, expected ≈${ceilExpected.toFixed(0)}`);
check('ceiling polygon area within 5%', Math.abs(ceilSf - ceilExpected) / ceilExpected < 0.05);
const minorRow = await page.locator('.mp-total-row.mp-total-minor').textContent();
check('trim totaled separately', minorRow?.includes('Trim'));

// ---------- openings ----------
const grossBefore = parseFloat((await page.locator('.mp-total-row').first().locator('strong').textContent() ?? '0').replace(/[^0-9.]/g, ''));
console.log(`  gross wall: ${grossBefore} sq ft (wall ≈${(pxToFt(200) * 8).toFixed(0)} + ceiling rows don't count)`);
await page.getByRole('button', { name: 'Openings', exact: true }).click();
await page.mouse.click(cx + 100, cy - 100);
await page.waitForSelector('.opening-popover');
check('opening popover offers Door/Window/Slider', (await page.locator('.opening-popover').textContent())?.includes('Slider'));
await page.locator('.op-buttons button', { hasText: 'Door' }).click();
await page.waitForTimeout(300);
check('door pin toast', (await page.locator('.toast').textContent())?.includes('Added D1'));
await page.mouse.click(cx + 200, cy - 100);
await page.waitForSelector('.opening-popover');
await page.locator('.op-buttons button', { hasText: 'Window' }).click();
await page.waitForTimeout(300);
check('window pin toast', (await page.locator('.toast').textContent())?.includes('Added W1'));

const netAfter = parseFloat((await page.locator('.mp-total-row.grand strong').textContent() ?? '0').replace(/[^0-9.]/g, ''));
console.log(`  net after D1+W1: ${netAfter} (gross ${grossBefore} − 36 expected)`);
check('net = gross − 36 (door 21 + window 15)', Math.abs(netAfter - (grossBefore - 36)) <= 2);

// reassign D1 to the wall row -> row shows its own net
await page.locator('.mp-assign').first().selectOption({ index: 1 });
await page.waitForTimeout(300);
const wallRowText = await page.locator('.mp-row').first().textContent();
console.log('  wall row after assignment:', wallRowText?.trim());
check('assigned opening subtracts from the row', wallRowText?.includes('−21 sq ft'));
const netAfterAssign = parseFloat((await page.locator('.mp-total-row.grand strong').textContent() ?? '0').replace(/[^0-9.]/g, ''));
check('page net unchanged by reassignment', Math.abs(netAfterAssign - netAfter) <= 1);

// deduction toggle off -> net = gross, paused note
await page.locator('.mp-deduct-toggle input').click();
await page.waitForTimeout(300);
const netPaused = parseFloat((await page.locator('.mp-total-row.grand strong').textContent() ?? '0').replace(/[^0-9.]/g, ''));
check('toggle off: net = gross', Math.abs(netPaused - grossBefore) <= 2);
check('paused note shown', (await page.locator('.mp-deduct-toggle').textContent())?.includes('paused'));
await page.locator('.mp-deduct-toggle input').click(); // back on
await page.waitForTimeout(200);

// Ctrl+Z removes the last pin (W1)
await page.keyboard.press('Control+z');
await page.waitForTimeout(300);
check('Ctrl+Z removes last pin', (await page.locator('.toast').textContent())?.includes('Removed W1'));
check('W1 gone from panel', (await page.locator('.measure-panel').textContent())?.includes('D1') &&
  !((await page.locator('.measure-panel').textContent())?.includes('W1')));
await page.screenshot({ path: 'openings-panel.png' });

// ---------- persistence ----------
await page.reload({ waitUntil: 'networkidle' });
  await reopenProject(page);
await page.fill('.page-input', '5');
await page.locator('.page-input').blur();
await page.waitForTimeout(1000);
const panelText = await page.locator('.measure-panel').textContent();
check('wall/trim/ceiling/D1 persist after reload',
  ['Wall 1', 'Trim 1', 'Ceiling 1', 'D1'].every((s) => panelText?.includes(s)));

console.log('errors:', errors.length ? errors : 'none');
await browser.close();
process.exit(errors.length ? 1 : 0);
