import { chromium } from 'playwright-core';
const EXE = 'C:/Users/Nicholas/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe';
const PDF = 'C:/Users/Nicholas/Desktop/coding/paint-takeoff/friend-examples/2 Drawings - Architectural.pdf';
const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
await page.goto('http://localhost:5199/', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.setInputFiles('input[type=file]', PDF);
await page.waitForFunction(() => document.querySelector('.pdf-canvas')?.width > 400, null, { timeout: 60000 });
await page.fill('.page-input', '5');
await page.locator('.page-input').blur();
await page.waitForTimeout(1000);
// zoom into hobby room
for (let i = 0; i < 3; i++) await page.keyboard.press('+');
await page.waitForTimeout(800);
const viewer = page.locator('.viewer');
const box = await viewer.boundingBox();
// drag to center hobby room (screen 630,320 -> center)
await page.mouse.move(box.x + 630, box.y + 320);
await page.mouse.down();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(900);
await page.screenshot({ path: 'zoom-hobby.png' });
console.log('saved zoom-hobby.png, zoom =', await page.locator('.zoom-pct').textContent());
await browser.close();
