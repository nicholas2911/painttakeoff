/* Item 1 regression: scale confirmation.
 *  a) double-check within tolerance -> green badge, persists across page
 *     flips and reload; other pages keep their own scale state.
 *  b) clicking the amber badge re-opens the double-check (the missing path).
 *  c) click-DRAG works for the double-check (field habit).
 */
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
const badge = async () => (await page.locator('.scale-badge').textContent())?.trim();

await page.goto(APP, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.setInputFiles('input[type=file]', PDF);
await page.waitForFunction(() => document.querySelector('.pdf-canvas')?.width > 400, null, { timeout: 30000 });
const box = await page.locator('.viewer').boundingBox();
const cx = box.x + 750, cy = box.y + 420;

/** Complete the double-check by entering exactly the measured value. Uses drag. */
async function doubleCheckWithDrag() {
  await page.mouse.move(cx - 100, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 100, cy, { steps: 6 });
  await page.mouse.up();
  await page.waitForSelector('.modal', { timeout: 8000 });
  const text = await page.locator('.modal-text').first().textContent();
  const m = /measures (\d+)' ([\d/ ]+)"/.exec(text ?? '');
  if (!m) throw new Error(`cannot parse measured text: ${text}`);
  await page.locator('.length-box input').nth(0).fill(m[1]);
  await page.locator('.length-box input').nth(1).fill(m[2].trim());
  await page.locator('.modal-actions').getByRole('button', { name: 'Check it' }).click();
  await page.waitForTimeout(300);
}

// (a) preset on page 1 -> double-check via DRAG -> green
await page.selectOption('.preset-select', '1:48');
await page.waitForSelector('.modal');
await page.getByRole('button', { name: 'Measure one more thing' }).click();
await doubleCheckWithDrag();
check('(c) drag double-check confirms scale', (await badge())?.includes('Scale is set ✓'));

// page 2 gets its own preset, skipped check
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(900);
await page.selectOption('.preset-select', '1:96');
await page.waitForSelector('.modal');
await page.getByRole('button', { name: 'Skip this' }).click();
check('page 2 has own unconfirmed preset', (await badge())?.includes('1:96') && (await badge())?.includes('not confirmed'));

await page.keyboard.press('ArrowLeft');
await page.waitForTimeout(900);
check('(a) page 1 still confirmed after page flips', (await badge())?.includes('Scale is set ✓'));

await page.reload({ waitUntil: 'networkidle' });
await page.setInputFiles('input[type=file]', PDF);
await page.waitForFunction(() => document.querySelector('.pdf-canvas')?.width > 400, null, { timeout: 30000 });
check('(a) page 1 confirmation survives reload', (await badge())?.includes('Scale is set ✓'));
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(900);
check('(a) page 2 preset survives reload, still separate', (await badge())?.includes('1:96'));

// (b) badge click re-opens the double-check on page 2
await page.locator('.scale-badge').click();
check('(b) badge click starts double-check', (await page.locator('.step-bar').textContent())?.includes('Double-check — click 1 of 2'));
await doubleCheckWithDrag();
check('(b) badge-click double-check confirms', (await badge())?.includes('Scale is set ✓'));

console.log('errors:', errors.length ? errors : 'none');
await browser.close();
process.exit(errors.length ? 1 : 0);
