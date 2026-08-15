/* Headless smoke test for PaintTakeoff M1/M2.
 * Boots the app, loads a sample PDF, exercises calibration + measure,
 * and fails on any console error. Run: node smoke.mjs
 */
import { chromium } from 'playwright-core';

const EXE =
  'C:/Users/Nicholas/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe';
const APP = 'http://localhost:5199/';
const PDF = 'C:/Users/Nicholas/paint-takeoff/sample-plans/residential-permit-chicago-townhouse.pdf';

const errors = [];
const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text()}`);
});
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

await page.goto(APP, { waitUntil: 'networkidle' });
console.log('boot: empty state =', await page.locator('.empty-title').textContent());

// --- load PDF through the (hidden) file input ---
await page.setInputFiles('input[type=file]', PDF);
await page.waitForFunction(() => {
  const c = document.querySelector('.pdf-canvas');
  return c && c.width > 100 && c.height > 100;
}, null, { timeout: 30000 });
const canvasInfo = await page.evaluate(() => {
  const c = document.querySelector('.pdf-canvas');
  return { w: c.width, h: c.height };
});
console.log('pdf rendered:', JSON.stringify(canvasInfo));
console.log('page count label:', await page.locator('.page-count').textContent());

// --- zoom in via Ctrl+wheel, expect re-render at new resolution ---
const before = canvasInfo.w;
const viewer = page.locator('.viewer');
await viewer.hover({ position: { x: 700, y: 450 } });
await page.keyboard.down('Control');
await page.mouse.wheel(0, -600);
await page.keyboard.up('Control');
await page.waitForTimeout(600);
const afterZoom = await page.evaluate(() => document.querySelector('.pdf-canvas').width);
console.log(`zoom re-render: ${before} -> ${afterZoom} (expect larger)`);
console.log('zoom pct:', await page.locator('.zoom-pct').textContent());

// --- calibrate: click two points, enter length ---
await page.keyboard.press('c');
const box = await viewer.boundingBox();
const cx = box.x + 700, cy = box.y + 450;
await page.mouse.click(cx - 100, cy);
await page.mouse.click(cx + 100, cy);
await page.waitForSelector('.modal');
await page.fill('.length-input input', "10'");
await page.click('.modal-actions .primary');
await page.waitForSelector('.modal'); // axis prompt appears
console.log('axis prompt shown:', await page.locator('.modal-title').textContent());
// skip axis check
await page.click('.modal-actions .tool:not(.primary)');
console.log('scale badge:', await page.locator('.scale-badge').textContent());

// --- measure mode reads a real-world length ---
await page.keyboard.press('m');
await page.mouse.move(cx - 100, cy);
await page.mouse.down();
await page.mouse.move(cx + 100, cy, { steps: 5 });
await page.mouse.up();
await page.waitForTimeout(200);
const measureDrawn = await page.evaluate(() => {
  // overlay canvas should have non-empty pixels after a measure drag
  const c = document.querySelector('.overlay-canvas');
  const ctx = c.getContext('2d');
  const data = ctx.getImageData(0, 0, c.width, c.height).data;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 0) return true;
  return false;
});
console.log('measure overlay drawn:', measureDrawn);

// --- preset scale sets unverified badge ---
await page.selectOption('.preset-select', '1:48');
await page.waitForSelector('.modal');
await page.click('.modal-actions .tool:not(.primary)'); // skip verify
console.log('preset badge:', await page.locator('.scale-badge').textContent());

// --- localStorage persistence ---
const stored = await page.evaluate(() =>
  Object.keys(localStorage).filter((k) => k.startsWith('pt:v1:scale:')).length,
);
console.log('persisted scale entries:', stored);

// --- page navigation ---
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(700);
const pageInput = await page.locator('.page-input').inputValue();
console.log('after ArrowRight, page =', pageInput);

console.log('console errors:', errors.length ? errors : 'none');
await browser.close();
process.exit(errors.length ? 1 : 0);
