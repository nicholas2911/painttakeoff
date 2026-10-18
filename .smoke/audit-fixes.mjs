/* v0.8.2 audit fixes — in-app checks (built app on :5199).
 *  - removed pages don't count in the quote
 *  - manual add-ons reach the invoice; a stale invoice offers "Update from quote"
 *  - Price Book percents keep decimals (12.5 stays 12.5)
 *  - new walls pin their height (changing the default doesn't re-price them)
 *  - clicking the same spot twice can't set a 1:Infinity scale
 *  - changing page drops a half-done scale click
 *  - rotated 270°: the opening popover and pin land at the click
 */
import { chromium } from 'playwright-core';
import { getDocument } from '../app/node_modules/pdfjs-dist/legacy/build/pdf.mjs';

const EXE =
  'C:/Users/Nicholas/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe';
const APP = 'http://localhost:5199/';
const PDF =
  'C:/Users/Nicholas/Desktop/coding/paint-takeoff/friend-examples/2 Drawings - Architectural.pdf';

const errors = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) errors.push(`check failed: ${name}`);
};
const money = (t) => parseFloat((t ?? '').replace(/[^0-9.-]/g, ''));

// Same seed as quote.mjs (page 5 → $319.36), plus a big wall on page 6
// that must NOT count once page 6 is left out of the project.
const PPU = 37.79527559055118; // 1:75
const SQFT = 10.7639;
const heightM = 8 * 0.3048;
const doc = await getDocument({ url: PDF, useSystemFonts: true }).promise;
const fp = doc.fingerprints[0];
await doc.destroy();
const scale = { pointsPerMeter: PPU, verified: true, method: 'preset', axisCheckPassed: true, timestamp: 1 };
const seed = {
  [`pt:v1:scale:${fp}:5`]: scale,
  [`pt:v1:scale:${fp}:6`]: scale,
  [`pt:v1:measure:${fp}:5`]: [
    { id: 'w1', kind: 'length', purpose: 'wall', label: 'Wall 1', points: [{ x: 0, y: 0 }, { x: 378, y: 0 }], totalMeters: 378 / PPU, wallHeightM: heightM, createdAt: 1 },
    { id: 'c1', kind: 'ceiling', label: 'Ceiling 1', points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }], areaM2: 10000 / (PPU * PPU), perimeterM: 400 / PPU, createdAt: 2 },
    { id: 't1', kind: 'length', purpose: 'trim', label: 'Trim 1', points: [{ x: 0, y: 0 }, { x: 61, y: 0 }], totalMeters: 61 / PPU, createdAt: 3 },
    { id: 'd1', kind: 'opening', label: 'D1', openType: 'door', point: { x: 50, y: 50 }, sfM2: 21 / SQFT, assignedTo: null, createdAt: 4 },
  ],
  [`pt:v1:measure:${fp}:6`]: [
    { id: 'w6', kind: 'length', purpose: 'wall', label: 'Wall 6', points: [{ x: 0, y: 0 }, { x: 3780, y: 0 }], totalMeters: 100, wallHeightM: heightM, createdAt: 5 },
  ],
};

const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

await page.goto(APP, { waitUntil: 'networkidle' });
await page.evaluate((seed) => {
  localStorage.clear();
  for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, JSON.stringify(v));
}, seed);
await page.reload({ waitUntil: 'networkidle' });

// open with page 6 left OUT of the project
await page.setInputFiles('input[type=file]', PDF);
await page.getByRole('button', { name: 'Create project' }).click();
await page.waitForSelector('.picker-modal');
await page.locator('.picker-card').nth(5).click();
check('page 6 deselected', !(await page.locator('.picker-card').nth(5).getAttribute('class')).includes('selected'));
await page.locator('.picker-footer .go-button').click();
await page.waitForFunction(() => document.querySelector('.pdf-canvas')?.width > 400, null, { timeout: 60000 });
await page.fill('.page-input', '5');
await page.locator('.page-input').blur();
await page.waitForTimeout(800);

// ---------- quote ignores removed page 6 ----------
await page.getByRole('button', { name: 'Quote' }).click();
await page.waitForSelector('.quote-modal');
const price = money(await page.locator('.quote-price strong').textContent());
check('removed page left out of quote', Math.abs(price - 319.36) < 0.02, `$${price}`);

// ---------- add-on → invoice ----------
const addFlat = async (label, amount) => {
  await page.locator('.quote-addon-new select').selectOption('flat');
  await page.locator('.quote-addon-new input').nth(0).fill(label);
  await page.locator('.quote-addon-new input').nth(1).fill(String(amount));
  await page.locator('.quote-addon-new button').click();
  await page.waitForTimeout(200);
};
await addFlat('Disposal', 500);
const withAddOn = money(await page.locator('.quote-price strong').textContent());
check('quote includes add-on', Math.abs(withAddOn - 819.36) < 0.02, `$${withAddOn}`);
await page.getByRole('button', { name: 'Create invoice' }).click();
await page.waitForSelector('.invoice-modal');
const invText = await page.locator('.invoice-doc').textContent();
check('invoice lists the add-on line', invText.includes('Disposal'));
const subtotal = money(await page.locator('.inv-total-row').first().locator('.inv-money').first().textContent());
check('invoice subtotal = quote price', Math.abs(subtotal - 819.36) < 0.02, `$${subtotal}`);
check('fresh invoice is not flagged stale', (await page.locator('.invoice-stale').count()) === 0);
const invNo = await page.evaluate(() => localStorage.getItem('pt:v1:invoice-counter'));
check('invoice number reserved when the draft is made', invNo === '1', `counter ${invNo}`);
await page.getByRole('button', { name: 'Close' }).click();

// change the quote → reopening the invoice offers a rebuild
await page.getByRole('button', { name: 'Quote' }).click();
await page.waitForSelector('.quote-modal');
await addFlat('Travel', 100);
await page.getByRole('button', { name: 'Create invoice' }).click();
await page.waitForSelector('.invoice-modal');
check('stale invoice shows the banner', (await page.locator('.invoice-stale').count()) === 1);
await page.getByRole('button', { name: 'Update from quote' }).click();
await page.waitForTimeout(200);
const sub2 = money(await page.locator('.inv-total-row').first().locator('.inv-money').first().textContent());
check('update from quote rebuilds lines', Math.abs(sub2 - 919.36) < 0.02 && (await page.locator('.invoice-stale').count()) === 0, `$${sub2}`);
await page.getByRole('button', { name: 'Close' }).click();

// ---------- price book percent keeps decimals ----------
await page.getByTitle('Your rates — labour, paint, margin').click();
await page.waitForSelector('.pricebook-modal');
const margin = page.locator('.pb-field', { hasText: 'Margin on cost' }).locator('input');
await margin.fill('12.5');
await margin.blur();
check('margin 12.5% stays 12.5', (await margin.inputValue()) === '12.5', await margin.inputValue());
await page.getByRole('button', { name: 'Reset to Ontario defaults' }).click();
await page.getByRole('button', { name: 'Done' }).click();

// ---------- new wall pins its height ----------
await page.getByRole('button', { name: 'Measure', exact: true }).click();
await page.locator('.kind-picker button', { hasText: 'Wall' }).click();
await page.mouse.click(500, 700);
await page.mouse.click(620, 700);
await page.mouse.dblclick(620, 700);
await page.waitForTimeout(300);
const readWall = () =>
  page.evaluate((fp) => {
    const items = JSON.parse(localStorage.getItem(`pt:v1:measure:${fp}:5`) ?? '[]');
    return items.filter((m) => m.kind === 'length' && m.label === 'Wall 2').map((m) => m.wallHeightM)[0];
  }, fp);
const h1 = await readWall();
check('new wall stores its height', Math.abs(h1 - heightM) < 1e-6, String(h1));
if (!(await page.locator('.measure-panel').count())) await page.getByRole('button', { name: /Measurements/ }).click();
const defBox = page.locator('.mp-default-height input, .measure-panel input.mp-height').first();
await defBox.click();
await defBox.fill(`10'`);
await defBox.press('Enter');
await page.waitForTimeout(300);
const defNow = await page.evaluate(() => localStorage.getItem('pt:v1:default-height-m'));
const h2 = await readWall();
check('default height changed', Math.abs(parseFloat(defNow) - 3.048) < 1e-3, defNow);
check('existing wall keeps its height', Math.abs(h2 - heightM) < 1e-6, String(h2));

// ---------- same-spot double click can't make a scale ----------
await page.keyboard.press('Escape');
await page.fill('.page-input', '4');
await page.locator('.page-input').blur();
await page.waitForTimeout(800);
await page.locator('button.accent-tool').click();
await page.mouse.click(600, 500);
await page.mouse.click(600, 500);
await page.waitForTimeout(300);
const toast1 = (await page.locator('.toast').textContent()) ?? '';
check('same-spot clicks rejected with a toast', toast1.includes('same spot'), toast1);
check('no scale dialog opened', (await page.locator('.modal').count()) === 0);
const s4 = await page.evaluate((fp) => localStorage.getItem(`pt:v1:scale:${fp}:4`), fp);
check('no scale saved for page 4', s4 === null, String(s4));

// ---------- page change drops a half-done scale ----------
await page.locator('button.accent-tool').click();
await page.mouse.click(600, 500);
await page.fill('.page-input', '3');
await page.locator('.page-input').blur();
await page.waitForTimeout(800);
await page.mouse.click(800, 500);
await page.waitForTimeout(300);
check('second click on a new page does not finish the scale', (await page.locator('.modal').count()) === 0);
await page.keyboard.press('Escape');

// ---------- 270° rotation: opening popover + pin at the click ----------
await page.fill('.page-input', '5');
await page.locator('.page-input').blur();
await page.waitForTimeout(800);
for (let i = 0; i < 3; i++) {
  await page.getByRole('button', { name: /^Fit/ }).click();
  await page.getByRole('button', { name: 'Rotate page 90°' }).click();
  await page.waitForTimeout(500);
}
const rot = await page.evaluate((fp) => JSON.parse(localStorage.getItem(`pt:v1:pageprops:${fp}`) ?? '{}')['5']?.rotate, fp);
check('page 5 rotated to 270°', rot === 270, String(rot));
await page.getByTitle(/Click doors and windows/).click();
const cx = 700, cy = 520;
await page.mouse.click(cx, cy);
await page.waitForSelector('.opening-popover');
const pop = await page.locator('.opening-popover').boundingBox();
check('popover appears at the click', Math.abs(pop.x - (cx + 14)) < 40 && Math.abs(pop.y - (cy - 10)) < 60, `${Math.round(pop.x)},${Math.round(pop.y)}`);
await page.locator('.opening-popover button').first().click();
await page.waitForTimeout(400);
// the pin is drawn where the user clicked (stored point → displayed point round trip)
const pin = await page.evaluate(({ cx, cy }) => {
  const c = [...document.querySelectorAll('canvas')].find((el) => !el.classList.contains('pdf-canvas') && el.width > 400);
  const r = c.getBoundingClientRect();
  const sx = c.width / r.width, sy = c.height / r.height;
  const d = c.getContext('2d').getImageData(Math.round((cx - r.left) * sx) - 6, Math.round((cy - r.top) * sy) - 6, 13, 13).data;
  let reddish = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 100 && d[i] > 150 && d[i + 1] < 120) reddish++;
  return reddish;
}, { cx, cy });
check('opening pin drawn at the click', pin > 5, `${pin} red px`);

console.log('errors:', errors.length ? errors : 'none');
await browser.close();
process.exit(errors.length ? 1 : 0);
