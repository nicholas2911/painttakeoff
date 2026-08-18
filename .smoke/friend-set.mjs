/* Smoke test against the friend's Region of Peel set (metric, 24x36).
 * Verifies: fit-page on load, page count, mm calibration input on the 1:75
 * floor plan (page 5), sane metric readout, and the 1:75 preset.
 * Run with the dev server on :5199.
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
await openPdf(page, PDF);
await page.waitForTimeout(600);

// --- page count ---
check('page count is 11', (await page.locator('.page-label').textContent())?.includes('of 11'));

// --- fit-page on load: sheet spans most of the viewport, nothing cut off ---
const fit = await page.evaluate(() => {
  const c = document.querySelector('.pdf-canvas').getBoundingClientRect();
  const v = document.querySelector('.viewer').getBoundingClientRect();
  return { cw: c.width, ch: c.height, vw: v.width, vh: v.height };
});
const ratioW = fit.cw / fit.vw;
const ratioH = fit.ch / fit.vh;
console.log(`  sheet fills ${(ratioW * 100).toFixed(0)}% width, ${(ratioH * 100).toFixed(0)}% height`);
check('fit-page: sheet spans most of viewport', Math.max(ratioW, ratioH) >= 0.7 && ratioW <= 1.02 && ratioH <= 1.02);
await page.screenshot({ path: 'fit-page-load.png' });
console.log('  screenshot saved: .smoke/fit-page-load.png');

// --- go to the 1:75 floor plan (page 5) ---
await page.fill('.page-input', '5');
await page.locator('.page-input').blur();
await page.waitForTimeout(900);
check('on page 5', (await page.locator('.page-input').inputValue()) === '5');

// --- switch to metric ---
await page.locator('.unit-toggle button', { hasText: 'meters' }).click();

// --- calibrate with mm input (two clicks, then type the mm as printed) ---
const zoomPct = await page.locator('.zoom-pct').textContent();
const zoom = parseInt(zoomPct, 10) / 100;
const PX = 200;
const mm = Math.round((PX / zoom) * (25.4 / 72) * 75); // what 200px means if the sheet is truly 1:75
console.log(`  zoom ${zoomPct}; calibrating ${PX}px as ${mm} mm`);
await page.locator('button.accent-tool').click(); // Set Scale
const box = await page.locator('.viewer').boundingBox();
const cx = box.x + 750, cy = box.y + 420;
await page.mouse.click(cx - PX / 2, cy);
await page.mouse.click(cx + PX / 2, cy);
await page.waitForSelector('.modal');
const mmBox = page.locator('.length-box input');
check('single mm box in metric mode', (await mmBox.count()) === 1);
check('mm box labeled', (await page.locator('.length-box span').textContent()) === 'Millimetres');
check('mm hint text', (await page.locator('.parse-preview').textContent())?.includes('e.g. 2520'));
await mmBox.fill(String(mm));
const preview = await page.locator('.parse-preview').textContent();
console.log('  preview:', preview);
check('preview shows mm and m', preview?.includes(`= ${mm} mm (`) && preview?.includes(' m)'));
await page.locator('.modal-actions').getByRole('button', { name: 'Set Scale' }).click();

// --- double-check: measure a vertical segment, readout should match the math ---
await page.waitForSelector('.modal');
await page.getByRole('button', { name: 'Measure one more thing' }).click();
const PY = 180;
await page.mouse.click(cx - 150, cy - PY / 2);
await page.mouse.click(cx - 150, cy + PY / 2);
await page.waitForSelector('.modal');
const checkText = await page.locator('.modal-text').first().textContent();
const measuredMatch = /measures ([\d.]+) m/.exec(checkText ?? '');
const expectedM = (PY / zoom) * (25.4 / 72) * 75 / 1000;
console.log(`  double-check readout: ${checkText?.trim()} (expected ≈ ${expectedM.toFixed(2)} m)`);
check('metric readout sane', measuredMatch !== null && Math.abs(parseFloat(measuredMatch[1]) - expectedM) / expectedM < 0.02);
const expectedMm = Math.round(expectedM * 1000);
await page.locator('.length-box input').fill(String(expectedMm));
await page.locator('.modal-actions').getByRole('button', { name: 'Check it' }).click();
await page.waitForTimeout(300);
check('badge: scale is set ✓', (await page.locator('.scale-badge').textContent())?.includes('Scale is set ✓'));

// --- 1:75 preset exists and applies ---
const options = await page.locator('.preset-select option').allTextContents();
check('1:75 preset listed', options.some((o) => o.includes('1:75 (metric floor plans)')));
check('1:25/1:30/1:40 also listed', ['1:25', '1:30', '1:40'].every((s) => options.some((o) => o.includes(s))));
await page.selectOption('.preset-select', '1:75');
await page.waitForSelector('.modal'); // double-check prompt
await page.getByRole('button', { name: 'Skip this' }).click();
const badge = await page.locator('.scale-badge').textContent();
console.log('  after preset:', badge?.trim());
check('1:75 preset applies', badge?.includes('Scale not confirmed') && badge?.includes('1:75'));

console.log('errors:', errors.length ? errors : 'none');
await browser.close();
process.exit(errors.length ? 1 : 0);
