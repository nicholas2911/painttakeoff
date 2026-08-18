/* Packaged-app verification for the new measurement features:
 * chain measure (click-click-dblclick, persisted), panel, Quick Area on the
 * friend set. Run against release/win-unpacked. Zero console errors required.
 */
import { _electron as electron } from 'playwright-core';

const EXE =
  'C:/Users/Nicholas/Desktop/coding/paint-takeoff/app/release/win-unpacked/PaintTakeoff.exe';
const PDF =
  'C:/Users/Nicholas/Desktop/coding/paint-takeoff/friend-examples/2 Drawings - Architectural.pdf';

const errors = [];
const check = (name, ok) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) errors.push(`check failed: ${name}`);
};

const app = await electron.launch({ executablePath: EXE });
const page = await app.firstWindow();
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

await page.waitForSelector('.dash-greeting', { timeout: 30000 });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.dash-greeting', { timeout: 30000 });
await page.setInputFiles('input[type=file]', PDF);
await page.waitForSelector('.modal .np-input.big', { timeout: 15000 });
await page.getByRole('button', { name: 'Create project' }).click();
await page.waitForSelector('.picker-modal', { timeout: 30000 });
await page.locator('.picker-footer .go-button').click();
await page.waitForFunction(() => document.querySelector('.pdf-canvas')?.width > 400, null, { timeout: 60000 });
await page.waitForTimeout(600);
check('friend set renders', (await page.locator('.page-label').textContent())?.includes('of 11'));

// chain measure on page 5 with the 1:75 preset
await page.fill('.page-input', '5');
await page.locator('.page-input').blur();
await page.waitForTimeout(1000);
await page.selectOption('.preset-select', '1:75');
await page.waitForSelector('.modal');
await page.getByRole('button', { name: 'Skip this' }).click();
await page.getByRole('button', { name: 'Measure', exact: true }).click();
const box = await page.locator('.viewer').boundingBox();
const cx = box.x + 600, cy = box.y + 350;
await page.mouse.click(cx - 150, cy);
await page.mouse.click(cx, cy);
await page.mouse.dblclick(cx + 150, cy);
await page.waitForTimeout(400);
check('chain measure saved in packaged app', (await page.getByRole('button', { name: /Measurements/ }).textContent())?.includes('(1)'));

// quick area
await page.getByRole('button', { name: 'Quick Area' }).click();
const cbox = await page.locator('.pdf-canvas').boundingBox();
const zoom = parseInt(await page.locator('.zoom-pct').textContent(), 10) / 100;
// community-centre hall in page coords (friend set page 5)
await page.mouse.click(cbox.x + 640 * zoom, cbox.y + 850 * zoom);
await page.waitForSelector('.qa-card', { timeout: 10000 });
const floorSf = parseFloat(await page.locator('.qa-row').nth(1).locator('input').inputValue());
console.log('  quick area floor:', floorSf, 'sq ft');
check('quick area sane in packaged app', floorSf > 15 && floorSf < 4000);
await page.getByRole('button', { name: 'Keep this room' }).click();
await page.waitForTimeout(400);
check('room saved to panel', (await page.getByRole('button', { name: /Measurements/ }).textContent())?.includes('(2)'));

console.log('errors:', errors.length ? errors : 'none');
await app.close();
process.exit(errors.length ? 1 : 0);
