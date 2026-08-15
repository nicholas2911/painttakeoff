import { chromium } from 'playwright-core';
const EXE = 'C:/Users/Nicholas/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe';
const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
await page.goto('http://localhost:5199/', { waitUntil: 'networkidle' });
await page.setInputFiles('input[type=file]', 'C:/Users/Nicholas/Desktop/coding/paint-takeoff/friend-examples/2 Drawings - Architectural.pdf');
await page.waitForFunction(() => document.querySelector('.pdf-canvas')?.width > 400, null, { timeout: 60000 });
await page.fill('.page-input', '5');
await page.locator('.page-input').blur();
await page.waitForTimeout(1200);
const info = await page.evaluate(() => {
  const c = document.querySelector('.pdf-canvas').getBoundingClientRect();
  return { x: c.x, y: c.y, w: c.width, h: c.height, zoom: document.querySelector('.zoom-pct').textContent };
});
console.log(JSON.stringify(info));
await page.screenshot({ path: 'page5-fit.png' });
await browser.close();
