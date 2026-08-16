import { chromium } from 'playwright-core';
const EXE = 'C:/Users/Nicholas/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe';
const PDF = 'C:/Users/Nicholas/Desktop/coding/paint-takeoff/friend-examples/2 Drawings - Architectural.pdf';
const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
page.on('console', (m) => console.log('C:', m.text().slice(0, 200)));
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await page.goto('http://localhost:5199/', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.setInputFiles('input[type=file]', PDF);
await page.waitForFunction(() => document.querySelector('.pdf-canvas')?.width > 400, null, { timeout: 60000 });
await page.fill('.page-input', '5');
await page.locator('.page-input').blur();
await page.waitForTimeout(1000);
await page.selectOption('.preset-select', '1:75');
await page.waitForSelector('.modal');
await page.getByRole('button', { name: 'Skip this' }).click();
await page.getByRole('button', { name: 'Quick Area' }).click();
await page.waitForTimeout(500);
const cb = await page.locator('.pdf-canvas').boundingBox();
console.log('canvas rect:', JSON.stringify(cb));
await page.screenshot({ path: 'preclick.png' });
await page.mouse.click(630, 320);
for (let i = 0; i < 6; i++) {
  await page.waitForTimeout(700);
  const t = await page.locator('.toast').textContent().catch(() => null);
  if (t) { console.log('toast @', i, ':', t); break; }
  if (await page.locator('.qa-card').count()) break;
}
console.log('card:', await page.locator('.qa-card').count());
await page.screenshot({ path: 'postclick.png' });
if (await page.locator('.qa-card').count()) {
  console.log('floor:', await page.locator('.qa-row').nth(1).locator('input').inputValue());
  await page.screenshot({ path: 'office3-dbg.png' });
}
await browser.close();
