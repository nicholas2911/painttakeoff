import { chromium } from 'playwright-core';
const EXE = 'C:/Users/Nicholas/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe';
const errors = [];
const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:5199/', { waitUntil: 'networkidle' });
const t0 = Date.now();
await page.setInputFiles('input[type=file]',
  'C:/Users/Nicholas/paint-takeoff/sample-plans/commercial-school-bid-set-princeton.pdf');
await page.waitForFunction(() =>
  document.querySelector('.page-count')?.textContent.includes('36'), null, { timeout: 60000 });
console.log(`school set parsed: ${Date.now() - t0}ms, pages: ${await page.locator('.page-count').textContent()}`);
await page.waitForFunction(() => document.querySelector('.pdf-canvas')?.width > 400, null, { timeout: 60000 });
console.log(`first page rendered: ${Date.now() - t0}ms total`);
// zoom deep into the big sheet and check re-render time
await page.locator('.viewer').hover({ position: { x: 700, y: 450 } });
await page.keyboard.down('Control');
const t1 = Date.now();
await page.mouse.wheel(0, -800);
await page.keyboard.up('Control');
await page.waitForFunction(() => document.querySelector('.pdf-canvas').width > 2500, null, { timeout: 30000 });
console.log(`deep zoom re-render: ${Date.now() - t1}ms, canvas ${await page.evaluate(() => document.querySelector('.pdf-canvas').width)}px`);
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
process.exit(errors.length ? 1 : 0);
