/* v0.7: card action sheet — Open / Go to quote / Edit details / Delete. */
import { chromium } from 'playwright-core';
import { openPdf } from './helpers.mjs';

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
await page.reload({ waitUntil: 'networkidle' });

// make a project
await openPdf(page, PDF);
await page.getByRole('button', { name: 'Home', exact: true }).click();
await page.waitForSelector('.dash-card');

// --- action sheet ---
await page.locator('.dash-card').first().click();
await page.waitForSelector('.action-sheet');
const actions = await page.locator('.action-big').allTextContents();
console.log('  actions:', actions.join(' | '));
check('4 actions', actions.length === 4);
check('action labels', ['Open project', 'Go to quote', 'Edit details', 'Delete project'].every((a) => actions.some((t) => t.includes(a))));
await page.screenshot({ path: 'card-actions.png' });

// --- Open project ---
await page.getByRole('button', { name: 'Open project' }).click();
await page.waitForFunction(() => document.querySelector('.pdf-canvas')?.width > 400, null, { timeout: 60000 });
check('open lands in viewer', await page.locator('.toolbar').isVisible());
check('quote view NOT open', (await page.locator('.quote-modal').count()) === 0);

// --- Go to quote ---
await page.getByRole('button', { name: 'Home', exact: true }).click();
await page.waitForSelector('.dash-card');
await page.locator('.dash-card').first().click();
await page.waitForSelector('.action-sheet');
await page.getByRole('button', { name: 'Go to quote' }).click();
await page.waitForSelector('.quote-modal', { timeout: 60000 });
check('go-to-quote lands on Quote view', await page.locator('.quote-modal').isVisible());
await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));

// --- Edit details ---
await page.getByRole('button', { name: 'Home', exact: true }).click();
await page.waitForSelector('.dash-card');
await page.locator('.dash-card').first().click();
await page.getByRole('button', { name: 'Edit details' }).click();
await page.waitForSelector('.np-input.big');
check('edit title', (await page.locator('.modal-title').textContent()) === 'Edit project');
check('name prefilled', (await page.locator('.np-input.big').inputValue()).length > 0);
await page.locator('.np-input.big').fill('Summerville Pines — phase 2');
await page.getByRole('button', { name: 'Save changes' }).click();
await page.waitForTimeout(300);
check('card updated', (await page.locator('.dash-card').first().textContent())?.includes('phase 2'));
await page.screenshot({ path: 'edit-details.png' });

// --- Delete via action sheet ---
await page.locator('.dash-card').first().click();
await page.getByRole('button', { name: 'Delete project' }).click();
await page.waitForSelector('.modal');
check('delete confirm from sheet', (await page.locator('.modal-text').textContent())?.includes('measurements go with it'));
await page.getByRole('button', { name: 'Delete project' }).click();
await page.waitForTimeout(300);
check('deleted', (await page.locator('.dash-card').count()) === 0);

console.log('errors:', errors.length ? errors : 'none');
await browser.close();
process.exit(errors.length ? 1 : 0);
