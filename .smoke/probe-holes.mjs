import { chromium } from 'playwright-core';
const EXE = 'C:/Users/Nicholas/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe';
const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
await page.goto('http://localhost:5199/', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.setInputFiles('input[type=file]', 'C:/Users/Nicholas/Desktop/coding/paint-takeoff/friend-examples/2 Drawings - Architectural.pdf');
await page.waitForFunction(() => document.querySelector('.pdf-canvas')?.width > 400, null, { timeout: 60000 });
await page.fill('.page-input', '5');
await page.locator('.page-input').blur();
await page.waitForTimeout(1000);
await page.selectOption('.preset-select', '1:75');
await page.waitForSelector('.modal');
await page.getByRole('button', { name: 'Skip this' }).click();
await page.getByRole('button', { name: 'Quick Area' }).click();
const cbox = await page.locator('.pdf-canvas').boundingBox();
await page.mouse.click(cbox.x + 260, cbox.y + 366);
await page.waitForSelector('.qa-card', { timeout: 10000 });
await page.waitForTimeout(300);
// find tinted pixels on the overlay canvas (accent tint over white paper)
const tintInfo = await page.evaluate(() => {
  const c = document.querySelector('.overlay-canvas');
  const ctx = c.getContext('2d');
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1, count = 0;
  const tinted = (i) => {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    return d[i+3] > 30 && b > 150 && b > r + 60; // bluish tint (unpremultiplied)
  };
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const i = (y * c.width + x) * 4;
      if (tinted(i)) {
        count++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { minX, minY, maxX, maxY, count, canvasW: c.width, canvasH: c.height };
});
console.log('tint bounds (overlay canvas px):', JSON.stringify(tintInfo));
await browser.close();
