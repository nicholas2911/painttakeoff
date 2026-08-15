/* Repro for the reported scale-verification bug:
 * preset on page 1 -> double-check with matching value -> badge green ->
 * flip to page 2, set a different preset -> back to page 1 -> still green?
 * reload -> still green?
 */
import { chromium } from 'playwright-core';

const EXE =
  'C:/Users/Nicholas/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe';
const APP = 'http://localhost:5199/';
const PDF =
  'C:/Users/Nicholas/Desktop/coding/paint-takeoff/sample-plans/residential-permit-chicago-townhouse.pdf';

const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE ERROR:', m.text()); });
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
const badge = async () => (await page.locator('.scale-badge').textContent())?.trim();

await page.goto(APP, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.setInputFiles('input[type=file]', PDF);
await page.waitForFunction(() => document.querySelector('.pdf-canvas')?.width > 400, null, { timeout: 30000 });

const box = await page.locator('.viewer').boundingBox();
const cx = box.x + 750, cy = box.y + 420;

// pick 1:48 preset on page 1
await page.selectOption('.preset-select', '1:48');
await page.waitForSelector('.modal');
await page.getByRole('button', { name: 'Measure one more thing' }).click();
// double-check: measure 200px, then enter exactly what the modal says it measured
await page.mouse.click(cx - 100, cy);
await page.mouse.click(cx + 100, cy);
await page.waitForSelector('.modal');
const text = await page.locator('.modal-text').first().textContent();
console.log('measured text:', text?.trim());
const m = /measures (\d+)' ([\d ]+)?(\d+\/\d+)?"/.exec(text ?? '');
// parse "24' 6 1/2"" style
let feet = 0, inches = 0;
const m2 = /measures (\d+)' ([\d/ ]+)"/.exec(text ?? '');
if (m2) { feet = parseInt(m2[1], 10); inches = m2[2].trim(); }
console.log(`entering feet=${feet} inches="${inches}"`);
await page.locator('.length-box input').nth(0).fill(String(feet));
await page.locator('.length-box input').nth(1).fill(String(inches));
await page.locator('.modal-actions').getByRole('button', { name: 'Check it' }).click();
await page.waitForTimeout(300);
console.log('page 1 badge after double-check:', await badge());

// flip to page 2, set 1:96 preset, skip check
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(900);
await page.selectOption('.preset-select', '1:96');
await page.waitForSelector('.modal');
await page.getByRole('button', { name: 'Skip this' }).click();
console.log('page 2 badge after preset:', await badge());

// back to page 1
await page.keyboard.press('ArrowLeft');
await page.waitForTimeout(900);
console.log('page 1 badge after page flip:', await badge());

// reload
await page.reload({ waitUntil: 'networkidle' });
await page.setInputFiles('input[type=file]', PDF);
await page.waitForFunction(() => document.querySelector('.pdf-canvas')?.width > 400, null, { timeout: 30000 });
console.log('page 1 badge after reload:', await badge());
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(900);
console.log('page 2 badge after reload:', await badge());

await browser.close();
