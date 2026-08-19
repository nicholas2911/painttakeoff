import { chromium } from 'playwright-core';
import { openPdf } from './helpers.mjs';
const EXE = 'C:/Users/Nicholas/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe';
const PDF = 'C:/Users/Nicholas/Desktop/coding/paint-takeoff/sample-plans/residential-permit-chicago-townhouse.pdf';
const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await page.goto('http://localhost:5199/', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await openPdf(page, PDF);
console.log('projects after create:', await page.evaluate(() => localStorage.getItem('pt:v1:projects')?.length));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(800);
console.log('projects after reload:', await page.evaluate(() => localStorage.getItem('pt:v1:projects')?.length));
console.log('dash cards:', await page.locator('.dash-card').count());
console.log('greeting:', await page.locator('.dash-greeting').count());
await page.locator('.dash-card').first().click();
try {
  await page.waitForFunction(() => document.querySelector('.pdf-canvas')?.width > 400, null, { timeout: 15000 });
  console.log('reopen OK');
} catch {
  console.log('reopen FAILED');
  console.log('toast:', await page.locator('.toast').textContent().catch(() => 'none'));
}
await browser.close();
