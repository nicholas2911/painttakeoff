/* Items 2-5: custom scale, chain measure + persistence + panel, Quick Area.
 * Uses the friend set (metric, 1:75 floor plan on page 5).
 */
import { chromium } from 'playwright-core';

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
await page.setInputFiles('input[type=file]', PDF);
await page.waitForFunction(() => document.querySelector('.pdf-canvas')?.width > 400, null, { timeout: 60000 });
await page.waitForTimeout(500);
const box = await page.locator('.viewer').boundingBox();
const cx = box.x + 700, cy = box.y + 380;

// ---------- item 2: custom scale, metric ratio ----------
await page.selectOption('.preset-select', 'custom');
await page.waitForSelector('.modal');
check('custom scale modal', (await page.locator('.modal-title').textContent()) === 'Custom scale');
await page.locator('.custom-scale-metric input').first().fill('75');
check('custom metric preview', (await page.locator('.parse-preview').textContent())?.includes('1:75'));
await page.getByRole('button', { name: 'Use this scale' }).click();
await page.waitForSelector('.modal');
await page.getByRole('button', { name: 'Skip this' }).click();
check('custom 1:75 applied', (await page.locator('.scale-badge').textContent())?.includes('1:75'));

// ---------- item 2: custom scale, imperial fraction ----------
await page.selectOption('.preset-select', 'custom');
await page.waitForSelector('.modal');
await page.locator('.custom-scale-metric input').nth(1).fill('1/4');
check('custom imperial preview', (await page.locator('.parse-preview').textContent())?.includes('1:48'));
await page.getByRole('button', { name: 'Use this scale' }).click();
await page.waitForSelector('.modal');
await page.getByRole('button', { name: 'Skip this' }).click();
check('custom 1/4" -> 1:48 applied', (await page.locator('.scale-badge').textContent())?.includes('1:48'));

// ---------- item 3: chain measure ----------
await page.getByRole('button', { name: 'Measure', exact: true }).click();
await page.mouse.click(cx - 150, cy - 60);
await page.mouse.click(cx - 50, cy - 60);
await page.waitForTimeout(150);
const bar1 = await page.locator('.step-bar').textContent();
check('running total in guidance bar', bar1?.includes('total so far'));
await page.mouse.click(cx - 50, cy + 80);
await page.mouse.click(cx + 90, cy + 80); // last point (double-click finishes)
await page.mouse.dblclick(cx + 90, cy + 80);
await page.waitForTimeout(400);
check('toast after finish', (await page.locator('.toast').textContent())?.includes('Saved Wall 1'));

// a quick drag = one-segment measurement
await page.mouse.move(cx - 150, cy + 160);
await page.mouse.down();
await page.mouse.move(cx + 50, cy + 160, { steps: 5 });
await page.mouse.up();
await page.waitForTimeout(300);

// ---------- item 4: panel ----------
await page.getByRole('button', { name: /Measurements/ }).click();
await page.waitForSelector('.measure-panel');
check('panel lists 2 measurements', (await page.locator('.mp-row').count()) === 2);
const rowVals = await page.locator('.mp-value').allTextContents();
console.log('  rows:', rowVals.join(' | '));
const totalText = await page.locator('.mp-total-row strong').first().textContent();
console.log('  total:', totalText);
const parseFtIn = (s) => {
  const m = /(\d+)' ([\d/ ]+)"/.exec(s.trim());
  return m ? parseInt(m[1], 10) : NaN;
};
const totalRow0 = parseFtIn(await page.locator('.mp-row .mp-value').nth(0).textContent());
const totalRow1 = parseFtIn(await page.locator('.mp-row .mp-value').nth(1).textContent());
const totalPanel = parseFtIn(totalText ?? '');
check('panel total = row1 + row2 (feet, ±1)', Math.abs(totalPanel - (totalRow0 + totalRow1)) <= 1);

// rename row 1
await page.locator('.mp-label').first().click();
await page.locator('.mp-rename').fill('North wall');
await page.keyboard.press('Enter');
check('rename works', (await page.locator('.mp-label').first().textContent()) === 'North wall');

// persistence: page flip and back
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(900);
check('panel empty on page 6', (await page.locator('.mp-row').count()) === 0);
await page.keyboard.press('ArrowLeft');
await page.waitForTimeout(900);
check('measurements restored after page flip', (await page.locator('.mp-row').count()) === 2);

// reload persistence
await page.reload({ waitUntil: 'networkidle' });
await page.setInputFiles('input[type=file]', PDF);
await page.waitForFunction(() => document.querySelector('.pdf-canvas')?.width > 400, null, { timeout: 60000 });
check('measurements restored after reload', (await page.locator('.mp-row').count()) === 2);
check('rename persisted', (await page.locator('.mp-label').first().textContent()) === 'North wall');

// delete one via trash
await page.locator('.mp-trash').nth(1).click();
await page.waitForTimeout(200);
check('trash deletes a row', (await page.locator('.mp-row').count()) === 1);

// delete selected via Delete key: click row then Delete
await page.locator('.mp-row').first().click();
await page.keyboard.press('Delete');
await page.waitForTimeout(200);
check('Delete key removes selected', (await page.locator('.mp-row').count()) === 0);

// ---------- item 5: Quick Area on the 1:75 floor plan (page 5) ---
await page.fill('.page-input', '5');
await page.locator('.page-input').blur();
await page.waitForTimeout(1000);
await page.selectOption('.preset-select', '1:75');
await page.waitForSelector('.modal');
await page.getByRole('button', { name: 'Skip this' }).click();
// switch to imperial for sq ft readout
await page.locator('.unit-toggle button', { hasText: 'ft & in' }).click();
await page.getByRole('button', { name: 'Quick Area' }).click();
const cbox = await page.locator('.pdf-canvas').boundingBox();
// COMMUNITY CENTRE room interior, relative to canvas top-left (from page5-fit.png)
const roomX = cbox.x + 260, roomY = cbox.y + 366;
const t0 = Date.now();
await page.mouse.click(roomX, roomY);
await page.waitForSelector('.qa-card', { timeout: 10000 });
console.log(`  flood fill took ${Date.now() - t0}ms`);
const floorRow = await page.locator('.qa-row').nth(1).locator('input').inputValue();
const floorSf = parseFloat(floorRow);
console.log(`  room floor area: ${floorSf} sq ft`);
check('sane floor area (100..4000 sq ft)', floorSf > 100 && floorSf < 4000);
const wallText = await page.locator('.qa-result').textContent();
console.log('  wall area text:', wallText?.trim().replace(/\s+/g, ' '));
check('rough wall area shown', wallText?.includes('Rough wall area'));
await page.screenshot({ path: 'quickarea-result.png' });

// cut out an obstacle (enclosed hole inside the filled room: a printed
// fixture/dimension pocket — drops its outline from the rough wall length)
const perimBefore = parseFloat(await page.locator('.qa-row').nth(2).locator('input').inputValue());
await page.getByRole('button', { name: 'Cut out an obstacle' }).click();
const cutX = cbox.x + 225, cutY = cbox.y + 416;
await page.mouse.click(cutX, cutY);
await page.waitForTimeout(600);
const perimAfter = parseFloat(await page.locator('.qa-row').nth(2).locator('input').inputValue());
console.log(`  cutout: perimeter ${perimBefore} -> ${perimAfter} ft`);
check('cutout subtracts from rough perimeter', perimAfter < perimBefore && (await page.locator('.qa-cutout').count()) === 1);

// accept -> appears in panel
await page.getByRole('button', { name: 'Keep this room' }).click();
await page.waitForTimeout(400);
check('area measurement in panel', (await page.locator('.mp-row').count()) === 1);
const areaRow = await page.locator('.mp-row .mp-value').textContent();
console.log('  panel row:', areaRow);
check('area row shows sq ft + rough walls', areaRow?.includes('sq ft') && areaRow?.includes('walls ≈'));
check('separate totals (no mixed units)', (await page.locator('.mp-total-row').count()) === 2);

console.log('errors:', errors.length ? errors : 'none');
await browser.close();
process.exit(errors.length ? 1 : 0);
