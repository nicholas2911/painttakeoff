/* Quick Area on an imperial vector set (townhouse, 1/4"=1'-0" = 1:48). */
import { chromium } from 'playwright-core';
import { openPdf, reopenProject } from './helpers.mjs';
const EXE = 'C:/Users/Nicholas/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe';
const PDF = 'C:/Users/Nicholas/Desktop/coding/paint-takeoff/sample-plans/residential-permit-chicago-townhouse.pdf';
const errors = [];
const check = (n, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}`); if (!ok) errors.push(n); };
const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await page.goto('http://localhost:5199/', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
  await openPdf(page, PDF);
// find a floor-plan page: page 2 usually has plans
await page.fill('.page-input', '5');
await page.locator('.page-input').blur();
await page.waitForTimeout(900);
await page.selectOption('.preset-select', '1:48');
await page.waitForSelector('.modal');
await page.getByRole('button', { name: 'Skip this' }).click();
await page.getByRole('button', { name: 'Quick Area' }).click();
await page.waitForTimeout(500);
const box = await page.locator('.viewer').boundingBox();
// click middle of the sheet (a room area)
await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.62);
await page.waitForSelector('.qa-card, .toast', { timeout: 40000 });
if ((await page.locator('.qa-card').count()) > 0) {
  const floor = parseFloat(await page.locator('.qa-row').nth(1).locator('input').inputValue());
  console.log('  imperial fill floor area:', floor, 'sq ft');
  check('imperial fill produced a sane area (50..3000 sq ft)', floor > 50 && floor < 3000);
  await page.screenshot({ path: 'qa-imperial.png' });
} else {
  const toast = await page.locator('.toast').textContent();
  console.log('  no fill at sheet centre:', toast, '— trying another point');
  await page.mouse.click(box.x + box.width * 0.48, box.y + box.height * 0.55);
  await page.waitForSelector('.qa-card', { timeout: 40000 });
  const floor = parseFloat(await page.locator('.qa-row').nth(1).locator('input').inputValue());
  console.log('  imperial fill floor area:', floor, 'sq ft');
  check('imperial fill produced a sane area (50..3000 sq ft)', floor > 50 && floor < 3000);
  await page.screenshot({ path: 'qa-imperial.png' });
}
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
process.exit(errors.length ? 1 : 0);
