/* v0.3 interaction model: drag always pans, click acts, Ctrl+Z undo, snapping. */
import { chromium } from 'playwright-core';

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
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.setInputFiles('input[type=file]', PDF);
await page.waitForFunction(() => document.querySelector('.pdf-canvas')?.width > 400, null, { timeout: 30000 });
await page.selectOption('.preset-select', '1:48');
await page.waitForSelector('.modal');
await page.getByRole('button', { name: 'Skip this' }).click();

const box = await page.locator('.viewer').boundingBox();
const cx = box.x + 700, cy = box.y + 400;
const layerTransform = () => page.locator('.page-layer').evaluate((el) => el.style.transform);

// --- 1. left-drag pans in Measure mode (zoom in first so the page is
// bigger than the viewport and panning isn't clamped) ---
await page.getByRole('button', { name: 'Measure', exact: true }).click();
for (let i = 0; i < 6; i++) await page.keyboard.press('+');
await page.waitForTimeout(700);
const before = await layerTransform();
await page.mouse.move(cx, cy);
await page.mouse.down();
await page.mouse.move(cx - 160, cy - 90, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(200);
const after = await layerTransform();
check('left-drag pans in Measure mode', before !== after);
check('drag did not start a measurement', (await page.locator('.toast').count()) === 0 ||
  !((await page.locator('.toast').textContent()) ?? '').includes('Saved'));

// --- 2. click adds points; Ctrl+Z removes the last point ---
await page.mouse.click(cx - 200, cy - 100);
await page.mouse.click(cx - 200, cy + 60);
await page.waitForTimeout(150);
const total2pts = await page.locator('.step-bar').textContent();
check('chain running total shown', total2pts?.includes('total so far'));
await page.mouse.click(cx - 60, cy + 60);
await page.waitForTimeout(150);
const total3pts = await page.locator('.step-bar').textContent();
await page.keyboard.press('Control+z');
// park the cursor on the new last point so the live segment is ~0
await page.mouse.move(cx - 200, cy + 60);
await page.waitForTimeout(150);
const totalAfterUndo = await page.locator('.step-bar').textContent();
const grab = (s) => {
  const m = /total so far (\d+)' ([\d/ ]+)"/.exec(s ?? '');
  return m ? parseInt(m[1], 10) + eval(m[2].trim().replace(' ', '+')) / 12 : -1;
};
console.log('  totals:', grab(total3pts).toFixed(2), '->', grab(totalAfterUndo).toFixed(2));
check('Ctrl+Z removes last chain point', grab(totalAfterUndo) < grab(total3pts) && grab(totalAfterUndo) >= 0);

// finish with double-click
await page.mouse.dblclick(cx - 60, cy + 60);
await page.waitForTimeout(300);
check('chain finished', (await page.locator('.toast').textContent())?.includes('Saved Wall 1'));

// --- 3. Ctrl+Z not drawing removes the latest measurement ---
await page.keyboard.press('Control+z');
await page.waitForTimeout(300);
check('Ctrl+Z removes measurement with toast', (await page.locator('.toast').textContent())?.includes('Removed Wall 1'));
check('panel count back to 0', (await page.getByRole('button', { name: /Measurements/ }).textContent())?.includes('(0)'));

// --- 4. snapping: start a new chain 8px off an existing endpoint ---
// first measurement: A=(cx-100,cy+150) B=(cx+100,cy+150)
await page.mouse.click(cx - 100, cy + 150);
await page.mouse.click(cx + 100, cy + 150);
await page.mouse.dblclick(cx + 100, cy + 150);
await page.waitForTimeout(300);
// second chain: starts 8px off B (snaps onto B), ends 150px left along the
// same line — snapped length is exactly 150px; unsnapped would be ~158px.
await page.mouse.move(cx + 108, cy + 155);
await page.waitForTimeout(250);
await page.screenshot({ path: 'snap-indicator.png' }); // snap ring visible near B
await page.mouse.click(cx + 108, cy + 155);
await page.mouse.dblclick(cx - 50, cy + 150);
await page.waitForTimeout(300);
const zoomPct = parseInt(await page.locator('.zoom-pct').textContent(), 10) / 100;
const pxToFt = (px) => px / zoomPct / 18; // pt -> in -> 1:48 -> ft
const snappedFt = pxToFt(150);
const unsnappedFt = pxToFt(Math.hypot(158, 5));
console.log(`  zoom ${zoomPct}, snapped≈${snappedFt.toFixed(2)} ft, unsnapped≈${unsnappedFt.toFixed(2)} ft`);
await page.getByRole('button', { name: /Measurements/ }).click();
await page.waitForSelector('.measure-panel');
const sub = await page.locator('.mp-row .mp-sub').nth(1).textContent();
const m = /(\d+)' ([\d/ ]+)"/.exec(sub ?? '');
const toFeet = m ? parseInt(m[1], 10) + eval(m[2].trim().replace(' ', '+')) / 12 : NaN;
console.log('  second chain reads:', sub, '=', toFeet?.toFixed?.(2), 'ft');
check('chain snapped to existing endpoint', Math.abs(toFeet - snappedFt) < 0.15 && Math.abs(toFeet - unsnappedFt) > 0.3);

console.log('errors:', errors.length ? errors : 'none');
await browser.close();
process.exit(errors.length ? 1 : 0);
