import { chromium } from 'playwright-core';

const EXE =
  'C:/Users/Nicholas/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe';
const errors = [];
const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(e.message));

await page.goto('http://localhost:5199/', { waitUntil: 'networkidle' });
await page.setInputFiles('input[type=file]',
  'C:/Users/Nicholas/Desktop/coding/paint-takeoff/sample-plans/residential-permit-chicago-townhouse.pdf');
// wait for a real render: canvas backing store must exceed default 300x150
await page.waitForFunction(() => {
  const c = document.querySelector('.pdf-canvas');
  return c && (c.width > 400 || c.height > 400);
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
  return { w: c.width, h: c.height, nonWhite, pct: (100 * nonWhite / (c.width * c.height)).toFixed(2) };
});
console.log('initial render:', JSON.stringify(info));
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
process.exit(errors.length || info.nonWhite === 0 ? 1 : 0);
