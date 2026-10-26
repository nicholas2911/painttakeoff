/* The step bar offers the sheet's written scale and one click applies it.
 * Uses corpus sheets (sample-plans/corpus — local only). Built app on :5199. */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { openPdf } from './helpers.mjs';

const EXE =
  'C:/Users/Nicholas/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe';
const APP = 'http://localhost:5199/';
const CORPUS = 'C:/Users/Nicholas/Desktop/coding/paint-takeoff/sample-plans/corpus/';

const errors = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) errors.push(`check failed: ${name}`);
};

const CASES = [
  // title block "1:200@A3" on an A3 PDF beats eight "Scale 1:100" labels
  { file: 'pleanala-boherboy-type-h.pdf', page: 1, ratio: 200 },
  { file: 'nl-michaelschool-bg.pdf', page: 1, ratio: 100 },
  { file: 'haringey-marlborough-rd.pdf', page: 1, ratio: 50 },
];

const browser = await chromium.launch({ executablePath: EXE });
for (const c of CASES) {
  if (!fs.existsSync(CORPUS + c.file)) {
    console.log(`SKIP  ${c.file} (corpus not downloaded)`);
    continue;
  }
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto(APP, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await openPdf(page, CORPUS + c.file);
  const btn = page.getByRole('button', { name: `Use 1:${c.ratio}` });
  await btn.waitFor({ timeout: 15000 }).catch(() => {});
  const bar = (await page.locator('.step-bar').textContent()) ?? '';
  check(`${c.file}: step bar offers 1:${c.ratio}`, (await btn.count()) === 1, bar.slice(0, 110));
  if (await btn.count()) {
    await btn.click();
    await page.waitForTimeout(400);
    const prompt = await page.locator('.modal-title').allTextContents();
    check(`${c.file}: applying it starts the double-check`, prompt.some((t) => /double-check/i.test(t)), prompt.join(' | '));
    await page.getByRole('button', { name: 'Skip this' }).click().catch(() => {});
    const badge = (await page.locator('.tb-right').textContent()) ?? '';
    check(`${c.file}: scale badge shows 1:${c.ratio}`, badge.includes(`1:${c.ratio}`), badge.slice(0, 60));
    const offered = await page.getByRole('button', { name: /^Use 1:/ }).count();
    check(`${c.file}: offer disappears once a scale is set`, offered === 0);
  }
  await page.close();
}
await browser.close();
console.log('errors:', errors.length ? errors : 'none');
process.exit(errors.length ? 1 : 0);
