import { chromium } from 'playwright-core';
const EXE = 'C:/Users/Nicholas/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe';
const PDF = 'C:/Users/Nicholas/Desktop/coding/paint-takeoff/sample-plans/residential-permit-chicago-townhouse.pdf';
const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
await page.goto('http://localhost:5199/', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.setInputFiles('input[type=file]', PDF);
await page.waitForFunction(() => document.querySelector('.pdf-canvas')?.width > 400, null, { timeout: 30000 });
await page.selectOption('.preset-select', '1:48');
await page.waitForSelector('.modal');
await page.getByRole('button', { name: 'Skip this' }).click();
const box = await page.locator('.viewer').boundingBox();
const cx = box.x + 650, cy = box.y + 380;
await page.getByRole('button', { name: 'Measure', exact: true }).click();
// three walls
await page.mouse.click(cx - 220, cy - 120); await page.mouse.click(cx + 40, cy - 120); await page.mouse.dblclick(cx + 40, cy + 40);
await page.mouse.click(cx + 48, cy + 44); await page.mouse.dblclick(cx + 220, cy + 44); // snaps near corner
await page.mouse.click(cx - 220, cy + 140); await page.mouse.dblclick(cx + 180, cy + 140);
await page.waitForTimeout(300);
await page.getByRole('button', { name: /Measurements/ }).click();
await page.waitForSelector('.measure-panel');
// set row 2 height to 10 ft to show different heights
await page.locator('.mp-row .mp-height').nth(1).click();
await page.locator('.mp-row .mp-height').nth(1).fill("10'");
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
await page.screenshot({ path: 'panel-heights.png' });
console.log('saved panel-heights.png');
await browser.close();
