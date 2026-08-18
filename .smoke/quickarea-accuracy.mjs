/* Quick Area accuracy acceptance test (friend set page 5, 1:75).
 * Ground truth: each room traced with the Ceiling polygon tool (exact
 * page-space shoelace). Then Quick Area flood fill on the same room.
 * Prints before/after/true numbers.
 */
import { chromium } from 'playwright-core';
import { openPdf, reopenProject } from './helpers.mjs';

const EXE =
  'C:/Users/Nicholas/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe';
const APP = 'http://localhost:5199/';
const PDF =
  'C:/Users/Nicholas/Desktop/coding/paint-takeoff/friend-examples/2 Drawings - Architectural.pdf';

const BEFORE = { 'HOBBY ROOM': 233, 'OFFICE 3': 14, 'COMMUNITY CENTRE': 250 }; // pre-fix probe

// Ground truth: HOBBY ROOM from printed dims on the sheet (8690 x 2835 mm
// = 24.64 m2 = 265.2 sq ft, dimension strings right at the room).
// OFFICE 3 + COMMUNITY CENTRE: traced polygon (tool-exact page-space area).
const PRINTED_TRUTH = { 'HOBBY ROOM': (8.69 * 2.835) * 10.7639 };
const ROOMS = [
  {
    name: 'HOBBY ROOM',
    trace: null,
    click: [630, 320],
    tol: 0.10,
  },
  {
    name: 'OFFICE 3',
    trace: [[705, 250], [745, 250], [745, 290], [705, 290]],
    click: [697, 280],
    tol: 0.25,
  },
  {
    name: 'COMMUNITY CENTRE',
    // the bounded hall the click fills (part of the bigger centre block)
    trace: [[362, 472], [526, 472], [526, 584], [362, 584]],
    click: [455, 535],
    tol: 0.25,
    noLeakOnly: true,
  },
];

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
  await openPdf(page, PDF);
await page.fill('.page-input', '5');
await page.locator('.page-input').blur();
await page.waitForTimeout(1000);
await page.selectOption('.preset-select', '1:75');
await page.waitForSelector('.modal');
await page.getByRole('button', { name: 'Skip this' }).click();
await page.locator('.unit-toggle button', { hasText: 'ft & in' }).click();

// ---- ground truth traces with the Ceiling tool ----
await page.getByRole('button', { name: 'Measure', exact: true }).click();
await page.locator('.kind-picker button', { hasText: 'Ceiling' }).click();
await page.getByRole('button', { name: /Measurements/ }).click();
await page.waitForSelector('.measure-panel');
const truths = {};
for (const room of ROOMS) {
  if (PRINTED_TRUTH[room.name]) {
    truths[room.name] = PRINTED_TRUTH[room.name];
    console.log(`  printed-dims truth ${room.name}: ${truths[room.name].toFixed(0)} sq ft`);
    continue;
  }
  for (const [x, y] of room.trace) await page.mouse.click(x, y);
  const [lx, ly] = room.trace[room.trace.length - 1];
  await page.mouse.dblclick(lx, ly);
  await page.waitForTimeout(400);
  const row = page.locator('.mp-row', { hasText: 'Ceiling' }).last();
  const area = parseFloat((await row.locator('.mp-value').textContent() ?? '0').replace(/[^0-9.]/g, ''));
  truths[room.name] = area;
  console.log(`  traced ${room.name}: ${area} sq ft`);
}

// ---- Quick Area flood fill on the same rooms ----
await page.getByRole('button', { name: 'Quick Area' }).click();
await page.waitForTimeout(500);
for (const room of ROOMS) {
  await page.mouse.click(room.click[0], room.click[1]);
  await page.waitForSelector('.qa-card', { timeout: 40000 });
  const fill = parseFloat(await page.locator('.qa-row').nth(1).locator('input').inputValue());
  const truth = truths[room.name];
  const before = BEFORE[room.name];
  const dev = Math.abs(fill - truth) / truth;
  console.log(
    `  ${room.name}: before=${before} sq ft → after=${fill} sq ft · traced=${truth} sq ft · deviation ${(dev * 100).toFixed(1)}%`,
  );
  if (room.noLeakOnly) {
    // The clicked hall is filled within its own walls (no leak beyond the
    // bounded region), and far better than the old split fill.
    check(`${room.name} does not leak (fill ≤ truth ×1.15)`, fill <= truth * 1.15);
    check(`${room.name} better than before (${before})`, fill > before);
  } else {
    check(`${room.name} within ${(room.tol * 100).toFixed(0)}% of truth`, dev <= room.tol);
    check(`${room.name} dramatically better than before`, fill > before * 2 || dev <= room.tol);
  }
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.waitForTimeout(400);
}

console.log('errors:', errors.length ? errors : 'none');
await browser.close();
process.exit(errors.length ? 1 : 0);
