/* Targeted checks for 3 bug fixes the rest of the suite doesn't cover:
 * project-delete leaving orphaned localStorage rows, the invoice counter
 * double-advancing on re-save, and the opening-popover custom-size field
 * always typing as 'window'. */
import { chromium } from 'playwright-core';
import { openPdf, reopenProject } from './helpers.mjs';

const EXE =
  'C:/Users/Nicholas/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe';
const APP = 'http://localhost:5199/';
const PDF =
  'C:/Users/Nicholas/Desktop/coding/paint-takeoff/friend-examples/2 Drawings - Architectural.pdf';

const errors = [];
const check = (name, ok) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) errors.push(`check failed: ${name}`);
};

const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

await page.goto(APP, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await openPdf(page, PDF);
await page.waitForTimeout(500);

// ---------- A. invoice counter doesn't double-advance on re-save ----------
await page.selectOption('.preset-select', '1:75');
await page.waitForSelector('.modal');
await page.getByRole('button', { name: 'Skip this' }).click();
await page.getByRole('button', { name: 'Measure', exact: true }).click();
const rect = await page.locator('.viewer').boundingBox();
await page.mouse.click(rect.x + 300, rect.y + 400);
await page.mouse.click(rect.x + 500, rect.y + 400);
await page.mouse.dblclick(rect.x + 500, rect.y + 400);
await page.waitForTimeout(300);
await page.getByRole('button', { name: 'Move Around' }).click();
await page.getByRole('button', { name: 'Quote' }).click();
await page.waitForSelector('.quote-modal');
await page.getByRole('button', { name: 'Create invoice' }).click();
await page.waitForSelector('.invoice-doc');
const draftBefore = await page.evaluate(() => {
  const raw = Object.keys(localStorage).find((k) => k.startsWith('pt:v1:invoices:'));
  return raw ? JSON.parse(localStorage.getItem(raw)).invoiceNumber : null;
});
console.log('  invoice number on the draft:', draftBefore);
await page.getByRole('button', { name: 'Save as PDF', exact: true }).click();
await page.waitForTimeout(500);
await page.getByRole('button', { name: 'Save as PDF', exact: true }).click(); // re-save the SAME draft
await page.waitForTimeout(500);
const counterAfterTwoSaves = await page.evaluate(() => localStorage.getItem('pt:v1:invoice-counter'));
console.log('  counter after 2 saves of the same draft:', counterAfterTwoSaves);
check('counter advances by 1, not 2, across two saves of one draft', counterAfterTwoSaves === '1');
await page.getByRole('button', { name: 'Close', exact: true }).click();

// ---------- B. opening popover custom size respects the chosen type ----------
await page.getByRole('button', { name: 'Openings', exact: true }).click();
await page.mouse.click(rect.x + 400, rect.y + 300);
await page.waitForSelector('.opening-popover');
await page.locator('.op-custom-type button', { hasText: 'Slider' }).click();
await page.locator('.op-custom input').fill('40');
await page.getByRole('button', { name: 'Add', exact: true }).click();
await page.waitForTimeout(300);
const addToast = await page.locator('.toast').textContent();
console.log('  custom-size add toast:', addToast);
check('custom size with Slider selected adds an S-labeled pin, not W', /\bS1\b/.test(addToast ?? '') && !/\bW1\b/.test(addToast ?? ''));

// ---------- C. deleting a project clears today's new storage prefixes too ----------
await page.evaluate(() => {
  const proj = JSON.parse(localStorage.getItem('pt:v1:projects') ?? '[]')[0];
  if (!proj) return;
  localStorage.setItem(`pt:v1:quoteoverrides:${proj.id}`, JSON.stringify({ paintGrade: 'premium' }));
  localStorage.setItem(`pt:v1:addons:${proj.id}`, JSON.stringify([{ id: 'x', label: 'test', source: 'flat', qty: 5 }]));
  const fp = proj.fingerprint;
  localStorage.setItem(`pt:v1:scratch:${fp}:1`, JSON.stringify([{ id: 'y', kind: 'opening' }]));
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.dash-card', { timeout: 15000 });
await page.locator('.dash-delete').first().click();
await page.waitForSelector('.modal-text');
await page.getByRole('button', { name: 'Delete project' }).click();
await page.waitForTimeout(400);
const leftoverKeys = await page.evaluate(() =>
  Object.keys(localStorage).filter(
    (k) => k.startsWith('pt:v1:quoteoverrides:') || k.startsWith('pt:v1:addons:') || k.startsWith('pt:v1:scratch:'),
  ),
);
console.log('  leftover keys after delete:', leftoverKeys);
check('delete clears quote-override/add-on/scratch rows too', leftoverKeys.length === 0);

console.log('errors:', errors.length ? errors : 'none');
await browser.close();
process.exit(errors.length ? 1 : 0);
