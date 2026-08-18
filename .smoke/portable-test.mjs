/* Verifies the electron-builder PORTABLE exe: launches it with a remote
 * debugging port (args pass through the self-extractor), attaches via CDP,
 * loads a real PDF, and checks for console errors.
 * Run: node portable-test.mjs
 */
import { spawn, execSync } from 'node:child_process';
import { chromium } from 'playwright-core';

const EXE = 'C:/Users/Nicholas/Desktop/coding/paint-takeoff/app/release/PaintTakeoff-0.1.0-portable.exe';
const PDF = process.argv[2] ?? 'C:/Users/Nicholas/Desktop/coding/paint-takeoff/sample-plans/residential-permit-chicago-townhouse.pdf';
const PORT = 9223;

function killAll() {
  try { execSync('taskkill //IM "PaintTakeoff.exe" //F //T 2>/dev/null'); } catch { /* none */ }
  try { execSync('taskkill //IM "PaintTakeoff-0.1.0-portable.exe" //F //T 2>/dev/null'); } catch { /* none */ }
}

killAll();
const child = spawn(EXE, [`--remote-debugging-port=${PORT}`], {
  detached: true,
  stdio: 'ignore',
  env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1' },
});
child.unref();

// wait for the CDP endpoint (portable exe self-extracts first — be patient)
let browser = null;
const deadline = Date.now() + 90000;
while (Date.now() < deadline) {
  try {
    browser = await chromium.connectOverCDP(`http://localhost:${PORT}`);
    break;
  } catch {
    await new Promise((r) => setTimeout(r, 1500));
  }
}
if (!browser) {
  console.log('FATAL: could not attach to portable exe via CDP');
  killAll();
  process.exit(1);
}
console.log('attached to portable exe via CDP');

const context = browser.contexts()[0];
const page = context.pages()[0] ?? (await context.waitForEvent('page'));
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

await page.waitForSelector('.dash-greeting', { timeout: 30000 });
console.log('booted: dashboard visible, title =', await page.title());

await page.setInputFiles('input[type=file]', PDF);
await page.waitForFunction(() => {
  const c = document.querySelector('.pdf-canvas');
  return c && c.width > 400;
}, null, { timeout: 30000 });
await page.waitForTimeout(400);
const info = await page.evaluate(() => {
  const c = document.querySelector('.pdf-canvas');
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let nonWhite = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] < 240 || d[i + 1] < 240 || d[i + 2] < 240) nonWhite++;
  }
  return { w: c.width, h: c.height, pctNonWhite: (100 * nonWhite / (c.width * c.height)).toFixed(2) };
});
console.log('pdf rendered in portable exe:', JSON.stringify(info));
console.log('page count:', await page.locator('.page-label').textContent());

await browser.close();
killAll();
if (info.pctNonWhite === '0.00') errors.push('canvas blank — worker failed');
console.log('errors:', errors.length ? errors : 'none');
process.exit(errors.length ? 1 : 0);
