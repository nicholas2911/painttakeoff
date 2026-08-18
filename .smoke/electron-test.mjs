/* Drives the packaged PaintTakeoff Electron build and verifies:
 *  - window boots with no console errors (app:// scheme, module scripts OK)
 *  - pdf.js worker renders a real PDF (canvas gets non-white pixels)
 *  - a PDF path passed as a command-line arg auto-opens
 * Run: node electron-test.mjs [path-to-exe]
 */
import { _electron as electron } from 'playwright-core';

const EXE =
  process.argv[2] ??
  'C:/Users/Nicholas/Desktop/coding/paint-takeoff/app/release/win-unpacked/PaintTakeoff.exe';
const PDF =
  process.argv[3] ??
  'C:/Users/Nicholas/Desktop/coding/paint-takeoff/sample-plans/residential-permit-chicago-townhouse.pdf';

const errors = [];
const app = await electron.launch({ executablePath: EXE });
const page = await app.firstWindow();
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text()}`);
});
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

await page.waitForSelector('.dash-greeting', { timeout: 30000 });
console.log('booted: dashboard visible');

// --- open a PDF via the file input ---
await page.setInputFiles('input[type=file]', PDF);
await page.waitForFunction(() => {
  const c = document.querySelector('.pdf-canvas');
  return c && c.width > 400;
}, null, { timeout: 30000 });
await page.waitForTimeout(400);
const info = await page.evaluate(() => {
  const c = document.querySelector('.pdf-canvas');
  const ctx = c.getContext('2d');
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let nonWhite = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] < 240 || d[i + 1] < 240 || d[i + 2] < 240) nonWhite++;
  }
  return { w: c.width, h: c.height, pctNonWhite: (100 * nonWhite / (c.width * c.height)).toFixed(2) };
});
console.log('pdf rendered in Electron:', JSON.stringify(info));
console.log('page count:', await page.locator('.page-label').textContent());

// --- new guided UX flow in the packaged app ---
const flowErrors = [];
try {
  const bar = page.locator('.step-bar');
  if (!((await bar.textContent()) ?? '').includes('Step 2 of 3'))
    flowErrors.push('no step-2 banner');
  await page.locator('button.accent-tool').click(); // toolbar "Set Scale"
  if (!((await bar.textContent()) ?? '').includes('click 1 of 2'))
    flowErrors.push('no click-1 instruction');
  const box = await page.locator('.viewer').boundingBox();
  const cx = box.x + 700, cy = box.y + 450;
  await page.mouse.click(cx - 100, cy);
  await page.mouse.click(cx + 100, cy);
  await page.waitForSelector('.modal');
  if ((await page.locator('.modal-title').textContent()) !== 'Set the scale')
    flowErrors.push('calibration modal missing');
  const boxes = page.locator('.length-box input');
  await boxes.nth(0).fill('10');
  await boxes.nth(1).fill('6');
  const preview = await page.locator('.parse-preview').textContent();
  if (!preview?.includes('= 10 ft 6 in')) flowErrors.push(`bad preview: ${preview}`);
  await page.locator('.modal-actions').getByRole('button', { name: 'Set Scale' }).click();
  await page.waitForSelector('.modal'); // double-check prompt
  await page.getByRole('button', { name: 'Skip this' }).click();
  const badge = await page.locator('.scale-badge').textContent();
  if (!badge?.includes('Scale not confirmed')) flowErrors.push(`bad badge: ${badge}`);
  console.log('guided flow in packaged app: OK (badge =', badge?.trim() + ')');
} catch (e) {
  flowErrors.push(`flow exception: ${e.message}`);
}
errors.push(...flowErrors);
await app.close();

if (info.pctNonWhite === '0.00') {
  errors.push('canvas is blank — pdf.js worker likely failed');
}

// --- command-line arg open ---
const app2 = await electron.launch({ executablePath: EXE, args: [PDF] });
const page2 = await app2.firstWindow();
page2.on('pageerror', (e) => errors.push(`argv pageerror: ${e.message}`));
try {
  await page2.waitForFunction(() => {
    const c = document.querySelector('.pdf-canvas');
    return c && c.width > 400;
  }, null, { timeout: 30000 });
  console.log('argv open: rendered', await page2.locator('.filename').textContent());
} catch {
  errors.push('argv open did not render a PDF');
}
await app2.close();

console.log('errors:', errors.length ? errors : 'none');
process.exit(errors.length ? 1 : 0);
