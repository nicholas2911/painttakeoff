/* Load the friend's Region of Peel set into the real app: render, flip pages, screenshot. */
import { chromium } from 'playwright-core';

const EXE =
  'C:/Users/Nicholas/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe';
const APP = 'http://localhost:5199/';
const PDF = 'C:/Users/Nicholas/Desktop/coding/paint-takeoff/friend-examples/2 Drawings - Architectural.pdf';
const SHOTS = 'C:/Users/Nicholas/Desktop/coding/paint-takeoff/friend-examples/preview';

const errors = [];
const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

await page.goto(APP, { waitUntil: 'networkidle' });
const t0 = Date.now();
await page.setInputFiles('input[type=file]', PDF);
await page.waitForFunction(() => {
  const c = document.querySelector('.pdf-canvas');
  return c && c.width > 100 && c.height > 100;
}, null, { timeout: 60000 });
console.log('first render in', Date.now() - t0, 'ms');

const info = await page.evaluate(() => {
  const c = document.querySelector('.pdf-canvas');
  // sample non-white pixel ratio
  const ctx = c.getContext('2d');
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let nw = 0;
  for (let i = 0; i < d.length; i += 40) {
    if (d[i] < 245 || d[i + 1] < 245 || d[i + 2] < 245) nw++;
  }
  return { w: c.width, h: c.height, nonWhite: (nw / (d.length / 40) * 100).toFixed(1) };
});
console.log('page 1 canvas:', JSON.stringify(info));
await page.screenshot({ path: `${SHOTS}/app-page1.png` });

// flip to the floor plan (page 5) and elevations (page 7)
for (const target of [5, 7]) {
  for (let i = 1; i < 20; i++) {
    const label = await page.evaluate(() => document.body.innerText.match(/Page\s*\n?\s*(\d+)\s*of\s*(\d+)/)?.[0] || '');
    const m = label.match(/(\d+)\s*of\s*(\d+)/);
    if (m && Number(m[1]) === target) break;
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(700);
  }
  await page.waitForTimeout(1200);
  const lbl = await page.evaluate(() => document.body.innerText.match(/Page[\s\S]{0,12}?of\s*\d+/)?.[0]);
  console.log(`navigated -> ${lbl}`);
  await page.screenshot({ path: `${SHOTS}/app-page${target}.png` });
}

console.log('errors:', errors.length ? errors : 'none');
await browser.close();
