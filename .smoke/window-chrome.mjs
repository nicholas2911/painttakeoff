/* Verifies the custom window chrome of the packaged Electron app:
 *  - custom title bar present (frameless window)
 *  - minimize / maximize / restore via the custom buttons, icon swap
 *  - rounded root when windowed, square when maximized
 *  - friend plan set loads; fit-page still frames the sheet
 *  - screenshots (windowed + maximized) saved next to this script
 *  - close button exits the process
 * Run: node window-chrome.mjs
 */
import { _electron as electron } from 'playwright-core';

const EXE =
  'C:/Users/Nicholas/Desktop/coding/paint-takeoff/app/release/win-unpacked/PaintTakeoff.exe';
const PDF =
  'C:/Users/Nicholas/Desktop/coding/paint-takeoff/friend-examples/2 Drawings - Architectural.pdf';

const errors = [];
const check = (name, ok) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) errors.push(`check failed: ${name}`);
};

const app = await electron.launch({ executablePath: EXE });
const page = await app.firstWindow();
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

const isMax = () =>
  app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMaximized());
const isMin = () =>
  app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMinimized());

await page.waitForSelector('.titlebar', { timeout: 30000 });
check('custom title bar present', true);
check('three window buttons', (await page.locator('.win-btn').count()) === 3);
check('brand wordmark', (await page.locator('.wordmark').textContent()) === 'PaintTakeoff');
check('windowed root has rounding', await page.evaluate(() =>
  getComputedStyle(document.querySelector('.app')).borderRadius !== '0px'));

// --- load the friend set, verify fit-page still frames the sheet ---
await page.setInputFiles('input[type=file]', PDF);
await page.waitForFunction(() => document.querySelector('.pdf-canvas')?.width > 400, null, { timeout: 60000 });
await page.waitForTimeout(800);
check('file name in title bar', (await page.locator('.tb-file').textContent())?.includes('Architectural'));
const fit = await page.evaluate(() => {
  const c = document.querySelector('.pdf-canvas').getBoundingClientRect();
  const v = document.querySelector('.viewer').getBoundingClientRect();
  return { rw: c.width / v.width, rh: c.height / v.height };
});
console.log(`  sheet fills ${(fit.rw * 100).toFixed(0)}% w, ${(fit.rh * 100).toFixed(0)}% h`);
check('fit-page still frames the sheet', Math.max(fit.rw, fit.rh) >= 0.7 && fit.rw <= 1.02 && fit.rh <= 1.02);
await page.screenshot({ path: 'window-normal.png' });
console.log('  screenshot: .smoke/window-normal.png');

// --- maximize via custom button ---
await page.locator('[data-win="maximize"]').click();
await page.waitForTimeout(700);
check('maximize: isMaximized()', await isMax());
check('maximize: icon swapped to restore', (await page.locator('[data-win="maximize"]').getAttribute('title')) === 'Restore down');
check('maximized root is square', await page.evaluate(() =>
  getComputedStyle(document.querySelector('.app')).borderRadius === '0px'));
await page.waitForTimeout(400);
await page.screenshot({ path: 'window-maximized.png' });
console.log('  screenshot: .smoke/window-maximized.png');

// --- restore ---
await page.locator('[data-win="maximize"]').click();
await page.waitForTimeout(700);
check('restore: isMaximized() false', !(await isMax()));
check('restore: icon back to maximize', (await page.locator('[data-win="maximize"]').getAttribute('title')) === 'Maximize');

// --- minimize / restore ---
await page.locator('[data-win="minimize"]').click();
await page.waitForTimeout(700);
check('minimize: isMinimized()', await isMin());
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].restore());
await page.waitForTimeout(500);
check('restored from minimize', !(await isMin()));

// --- close button exits the app ---
const closed = app.waitForEvent('close', { timeout: 10000 }).then(() => true).catch(() => false);
await page.locator('[data-win="close"]').click();
check('close button exits the process', await closed);

console.log('errors:', errors.length ? errors : 'none');
process.exit(errors.length ? 1 : 0);
