import { chromium } from 'playwright-core';

const EXE =
  'C:/Users/Nicholas/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe';
const errors = [];
const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(e.message));

await page.goto('http://localhost:5199/', { waitUntil: 'networkidle' });

// --- axis-check happy path: calibrate, then verify with a matching value ---
await page.setInputFiles('input[type=file]',
  'C:/Users/Nicholas/paint-takeoff/sample-plans/residential-permit-chicago-townhouse.pdf');
await page.waitForFunction(() => {
  const c = document.querySelector('.pdf-canvas');
  return c && c.width > 400;
}, null, { timeout: 30000 });

const box = await page.locator('.viewer').boundingBox();
const cx = box.x + 700, cy = box.y + 450;
await page.keyboard.press('c');
await page.mouse.click(cx - 100, cy - 80);
await page.mouse.click(cx + 100, cy - 80);
await page.fill('.length-input input', "10'");
await page.click('.modal-actions .primary');
// axis prompt -> measure perpendicular
await page.click('.modal-actions .primary');
await page.mouse.click(cx - 60, cy - 60);
await page.mouse.click(cx - 60, cy + 120);
// vertical 180px vs horizontal 200px at 10' -> expected ~9'
await page.fill('.length-input input', "9'");
await page.click('.modal-actions .primary');
await page.waitForTimeout(300);
const badge = await page.locator('.scale-badge').textContent();
console.log('after axis check badge:', badge);
const toast = await page.locator('.toast').textContent().catch(() => null);
console.log('toast:', toast);

// --- reload: calibration should be restored from localStorage ---
await page.reload({ waitUntil: 'networkidle' });
await page.setInputFiles('input[type=file]',
  'C:/Users/Nicholas/paint-takeoff/sample-plans/residential-permit-chicago-townhouse.pdf');
await page.waitForFunction(() => {
  const c = document.querySelector('.pdf-canvas');
  return c && c.width > 400;
}, null, { timeout: 30000 });
console.log('badge after reload:', await page.locator('.scale-badge').textContent());

// --- stress: 30MB school bid set ---
await page.evaluate(() => localStorage.clear());
const t0 = Date.now();
await page.setInputFiles('input[type=file]',
  'C:/Users/Nicholas/paint-takeoff/sample-plans/commercial-school-bid-set-princeton.pdf');
await page.waitForFunction(() => {
  const c = document.querySelector('.pdf-canvas');
  return c && c.width > 400;
}, null, { timeout: 60000 });
console.log(`school set: loaded+rendered page 1 in ${Date.now() - t0}ms, pages:`,
  await page.locator('.page-count').textContent());

for (const target of [10, 20, 30]) {
  const t = Date.now();
  await page.fill('.page-input', String(target));
  await page.locator('.page-input').blur();
  await page.waitForTimeout(900);
  console.log(`jump to page ${target}: badge=${await page.locator('.scale-badge').textContent()} (${Date.now() - t}ms incl. render)`);
}
// rapid paging: stale renders must be cancelled without errors
for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowRight');
await page.waitForTimeout(1200);
console.log('after rapid paging, page =', await page.locator('.page-input').inputValue(),
  'canvas w =', await page.evaluate(() => document.querySelector('.pdf-canvas').width));
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
process.exit(errors.length ? 1 : 0);
