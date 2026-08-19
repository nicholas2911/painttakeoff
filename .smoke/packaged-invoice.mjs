/* Packaged: invoice creation + real printToPDF in Electron. */
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const EXE =
  'C:/Users/Nicholas/Desktop/coding/paint-takeoff/app/release/win-unpacked/PaintTakeoff.exe';
const PDF =
  'C:/Users/Nicholas/Desktop/coding/paint-takeoff/friend-examples/2 Drawings - Architectural.pdf';
const DOWNLOADS = 'C:/Users/Nicholas/Downloads';

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

// create a project with a quick wall measurement
await page.setInputFiles('input[type=file]', PDF);
await page.waitForSelector('.modal .np-input.big');
await page.fill('.np-input.big', 'Invoice test job');
await page.locator('.np-input').nth(1).fill('Test Painters Inc');
await page.getByRole('button', { name: 'Create project' }).click();
await page.waitForSelector('.picker-modal');
await page.locator('.picker-footer .go-button').click();
await page.waitForFunction(() => document.querySelector('.pdf-canvas')?.width > 400, null, { timeout: 60000 });
await page.waitForTimeout(500);
await page.selectOption('.preset-select', '1:75');
await page.waitForSelector('.modal');
await page.getByRole('button', { name: 'Skip this' }).click();
await page.getByRole('button', { name: 'Measure', exact: true }).click();
const box = await page.locator('.viewer').boundingBox();
await page.mouse.click(box.x + 400, box.y + 400);
await page.mouse.click(box.x + 700, box.y + 400);
await page.mouse.dblclick(box.x + 700, box.y + 400);
await page.waitForTimeout(400);

// quote -> invoice
await page.getByRole('button', { name: 'Quote' }).click();
await page.waitForSelector('.quote-modal');
await page.getByRole('button', { name: 'Create invoice' }).click();
await page.waitForSelector('.invoice-doc');
check('invoice opens prefilled', (await page.locator('.invoice-doc').textContent())?.includes('Test Painters Inc'));

// save as PDF via the bridge (writes to Downloads)
const before = new Set(fs.readdirSync(DOWNLOADS).filter((f) => f.includes('invoice')));
await page.getByRole('button', { name: 'Save as PDF' }).click();
await page.waitForTimeout(2500);
const after = fs.readdirSync(DOWNLOADS).filter((f) => f.includes('invoice'));
const created = after.filter((f) => !before.has(f));
console.log('  created:', created);
check('invoice PDF written to Downloads', created.length === 1);
if (created.length === 1) {
  const buf = fs.readFileSync(path.join(DOWNLOADS, created[0]));
  console.log(`  ${created[0]}: ${buf.length} bytes`);
  check('PDF magic bytes', buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46); // %PDF
  check('PDF non-trivial', buf.length > 8000);
  fs.unlinkSync(path.join(DOWNLOADS, created[0])); // clean up
}

console.log('errors:', errors.length ? errors : 'none');
await app.close();
process.exit(errors.length ? 1 : 0);
