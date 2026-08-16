/* Probe: Quick Area fill area for the three rooms (before-fix numbers). */
import { chromium } from 'playwright-core';
const EXE = 'C:/Users/Nicholas/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe';
const PDF = 'C:/Users/Nicholas/Desktop/coding/paint-takeoff/friend-examples/2 Drawings - Architectural.pdf';
const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
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
const cbox = await page.locator('.pdf-canvas').boundingBox();
const rooms = [
  ['HOBBY ROOM', 630, 320],
  ['OFFICE 3', 713, 300],
  ['COMMUNITY CENTRE', 455, 535],
];
for (const [name, rx, ry] of rooms) {
  await page.mouse.click(rx, ry);
  await page.waitForSelector('.qa-card', { timeout: 20000 });
  const floor = parseFloat(await page.locator('.qa-row').nth(1).locator('input').inputValue());
  console.log(`${name}: fill area = ${floor} sq ft`);
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.waitForTimeout(400);
}
await browser.close();
