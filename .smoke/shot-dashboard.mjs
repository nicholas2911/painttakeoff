import { chromium } from 'playwright-core';
import { openPdf } from './helpers.mjs';
const EXE = 'C:/Users/Nicholas/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe';
const FRIEND = 'C:/Users/Nicholas/Desktop/coding/paint-takeoff/friend-examples/2 Drawings - Architectural.pdf';
const TOWN = 'C:/Users/Nicholas/Desktop/coding/paint-takeoff/sample-plans/residential-permit-chicago-townhouse.pdf';

const browser = await chromium.launch({ executablePath: EXE });

async function seed(page, names) {
  for (const [name, file] of names) {
    await page.setInputFiles('input[type=file]', file);
    await page.waitForSelector('.modal .np-input.big', { timeout: 15000 });
    await page.fill('.np-input.big', name);
    await page.locator('.np-input').nth(1).fill('Dundas St GC');
    await page.getByRole('button', { name: 'Create project' }).click();
    await page.waitForSelector('.picker-modal', { timeout: 30000 });
    await page.locator('.picker-footer .go-button').click();
    await page.waitForFunction(() => document.querySelector('.pdf-canvas')?.width > 400, null, { timeout: 60000 });
    await page.getByRole('button', { name: 'Home', exact: true }).click();
    await page.waitForSelector('.dash-greeting');
  }
}

for (const [w, h, tag] of [[1440, 900, '1440'], [1100, 700, '1100']]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.goto('http://localhost:5199/', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.screenshot({ path: `dash-empty-${tag}.png` });
  await seed(page, [['Summerville Pines', FRIEND], ['Townhouse repaint', TOWN], ['School west wing', FRIEND]]);
  await page.screenshot({ path: `dash-cards-${tag}.png` });
  // dark theme
  await page.locator('.dash-greeting').waitFor();
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `dash-dark-${tag}.png` });
  await page.close();
  console.log('saved', tag);
}
await browser.close();
