import { chromium } from 'playwright-core';
const EXE = 'C:/Users/Nicholas/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe';
const TOWN = 'C:/Users/Nicholas/Desktop/coding/paint-takeoff/sample-plans/residential-permit-chicago-townhouse.pdf';
const FRIEND = 'C:/Users/Nicholas/Desktop/coding/paint-takeoff/friend-examples/2 Drawings - Architectural.pdf';
const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
await page.goto('http://localhost:5199/', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.setInputFiles('input[type=file]', TOWN);
await page.waitForFunction(() => document.querySelector('.pdf-canvas')?.width > 400, null, { timeout: 30000 });
const box = await page.locator('.viewer').boundingBox();
const cx = box.x + 700, cy = box.y + 400;
await page.selectOption('.preset-select', '1:48');
await page.waitForSelector('.modal');
await page.getByRole('button', { name: 'Skip this' }).click();

// 1. chain measure in progress (2 points + live segment to cursor)
await page.getByRole('button', { name: 'Measure', exact: true }).click();
await page.mouse.click(cx - 200, cy - 100);
await page.mouse.click(cx - 200, cy + 120);
await page.mouse.move(cx + 60, cy + 120);
await page.waitForTimeout(300);
await page.screenshot({ path: 'chain-measure.png' });
// finish this chain and add a quick drag, then open the panel
await page.mouse.click(cx + 60, cy + 120);
await page.mouse.dblclick(cx + 220, cy + 120);
await page.mouse.move(cx - 200, cy + 220);
await page.mouse.down();
await page.mouse.move(cx + 100, cy + 220, { steps: 5 });
await page.mouse.up();
await page.getByRole('button', { name: /Measurements/ }).click();
await page.waitForSelector('.measure-panel');
await page.waitForTimeout(300);
await page.screenshot({ path: 'panel-totals.png' });

// 2. Quick Area on the friend set
await page.setInputFiles('input[type=file]', FRIEND);
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
await page.screenshot({ path: 'quickarea-result.png' });
await browser.close();
console.log('screenshots saved: chain-measure.png, panel-totals.png, quickarea-result.png');
