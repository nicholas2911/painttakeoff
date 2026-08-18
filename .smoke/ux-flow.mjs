/* End-to-end smoke test for the redesigned UX flow:
 * welcome → open PDF → step bar → measure blocked hint → set scale via
 * Feet/Inches boxes → double-check → measure → persistence across reload.
 * Run with the dev server on :5199. Fails on any console error.
 */
import { chromium } from 'playwright-core';
import { openPdf, reopenProject } from './helpers.mjs';

const EXE =
  'C:/Users/Nicholas/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe';
const APP = 'http://localhost:5199/';
const PDF =
  'C:/Users/Nicholas/Desktop/coding/paint-takeoff/sample-plans/residential-permit-chicago-townhouse.pdf';

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

// --- 1. dashboard (start screen) ---
check('greeting renders', /Good (morning|afternoon|evening)/.test((await page.locator('.dash-greeting').textContent()) ?? ''));
check('3 numbered steps', (await page.locator('.dash-howto-item').count()) === 3);
check('big open button', await page.locator('.big-open-button').isVisible());
check('light theme default', (await page.evaluate(() => document.documentElement.dataset.theme)) === 'light');

// --- 2. open a plan ---
await openPdf(page, PDF);
const barText = async () => page.locator('.step-bar').textContent();
check('step 2 banner after open', (await barText())?.includes('Step 2 of 3'));
check('badge: no scale', (await page.locator('.scale-badge').textContent())?.includes('No scale'));

// --- 3. measure without scale -> friendly hint, not an error ---
await page.getByRole('button', { name: 'Measure', exact: true }).click();
check('measure hint popover', await page.locator('.measure-hint').isVisible());
await page.getByRole('button', { name: 'Set Scale Now' }).click();
check('hint jumps into set-scale mode', (await barText())?.includes('click 1 of 2'));

// --- 4. two-click calibration ---
const viewer = page.locator('.viewer');
const box = await viewer.boundingBox();
const cx = box.x + 750, cy = box.y + 450;
await page.mouse.click(cx - 100, cy - 60);
check('after first click: click 2 of 2', (await barText())?.includes('click 2 of 2'));
await page.mouse.click(cx + 100, cy - 60);
await page.waitForSelector('.modal');
check('calibration modal title', (await page.locator('.modal-title').textContent()) === 'Set the scale');

// feet/inches boxes: 10 ft 6 in
const boxes = page.locator('.length-box input');
check('two imperial boxes', (await boxes.count()) === 2);
await boxes.nth(0).fill('10');
await boxes.nth(1).fill('6');
const preview = await page.locator('.parse-preview').textContent();
check('plain-English preview', preview?.includes('= 10 ft 6 in'));
await page.locator('.modal-actions').getByRole('button', { name: 'Set Scale' }).click();

// --- 5. double-check flow ---
await page.waitForSelector('.modal');
check('double-check prompt', (await page.locator('.modal-title').textContent())?.includes('Double-check'));
await page.getByRole('button', { name: 'Measure one more thing' }).click();
check('axis instruction bar', (await barText())?.includes('Double-check — click 1 of 2'));
await page.mouse.click(cx - 60, cy - 100);
await page.mouse.click(cx - 60, cy + 110);
await page.waitForSelector('.modal');
// measured vertical 210px vs horizontal 200px at 10.5 ft -> expected ~11 ft
const boxes2 = page.locator('.length-box input');
await boxes2.nth(0).fill('11');
await boxes2.nth(1).fill('0');
await page.getByRole('button', { name: 'Check it' }).click();
await page.waitForTimeout(300);
check('badge: scale is set ✓', (await page.locator('.scale-badge').textContent())?.includes('Scale is set ✓'));
check('step 3 banner', (await barText())?.includes('Step 3 of 3'));

// --- 6. measure (click-click, double-click finishes) ---
await page.getByRole('button', { name: 'Measure', exact: true }).click();
check('measure instruction bar', (await barText())?.includes('Measuring'));
await page.mouse.click(cx - 100, cy + 150);
await page.mouse.click(cx + 100, cy + 150);
await page.mouse.dblclick(cx + 100, cy + 150);
await page.waitForTimeout(300);
const drawn = await page.evaluate(() => {
  const c = document.querySelector('.overlay-canvas');
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 0) return true;
  return false;
});
check('measure line drawn with label', drawn);
check('measurement counted on toggle', (await page.getByRole('button', { name: /Measurements/ }).textContent())?.includes('(1)'));

// --- 7. finished measurements persist; delete via the panel ---
await page.getByRole('button', { name: /Measurements/ }).click();
await page.waitForSelector('.measure-panel');
check('panel shows the measurement', (await page.locator('.mp-row').count()) === 1);
await page.locator('.mp-trash').first().click();
await page.waitForTimeout(300);
const cleared = await page.evaluate(() => {
  const c = document.querySelector('.overlay-canvas');
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 0) return false;
  return true;
});
check('panel trash removes the line', cleared);
await page.locator('.mp-close').click();

// --- 8. shortcuts modal + theme toggle + presets label ---
await page.getByTitle('Shortcuts & tips').click();
check('shortcuts modal', (await page.locator('.modal-title').textContent())?.includes('Handy shortcuts'));
check('shortcut rows', (await page.locator('.shortcut-row').count()) >= 6);
await page.getByRole('button', { name: 'Got it' }).click();
await page.getByTitle('Switch to dark colors').click();
check('dark theme toggles', (await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark');
await page.getByTitle('Switch to light colors').click();
const presetFirst = await page.locator('.preset-select option').nth(1).textContent();
check('trade-language preset', presetFirst?.includes('1/4 inch = 1 foot'));

// --- 9. persistence across reload ---
await page.reload({ waitUntil: 'networkidle' });
  await reopenProject(page);
check('badge restored after reload', (await page.locator('.scale-badge').textContent())?.includes('Scale is set ✓'));
check('theme persisted', (await page.evaluate(() => document.documentElement.dataset.theme)) === 'light');

console.log('errors:', errors.length ? errors : 'none');
await browser.close();
process.exit(errors.length ? 1 : 0);
