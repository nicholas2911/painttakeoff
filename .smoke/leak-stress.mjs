/* Memory-leak stress test (built app on :5199).
 * Repeats real use — flipping pages, Quick Area clicks, closing/reopening
 * the project, quote + invoice — and after each round forces garbage
 * collection and records JS heap, DOM nodes and event listeners. A leak
 * shows as numbers that keep climbing round after round; healthy code
 * plateaus after the first (warm-up) round. */
import { chromium } from 'playwright-core';
import { getDocument } from '../app/node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'node:fs';


const EXE =
  'C:/Users/Nicholas/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe';
const APP = 'http://localhost:5199/';
const PDF = 'C:/Users/Nicholas/Desktop/coding/paint-takeoff/friend-examples/2 Drawings - Architectural.pdf';

// Playwright's waitForSelector returns element handles that keep DOM alive
// (they showed up as retained nodes). Everything here waits via locators,
// which hold no references.
async function openPdf(page, pdfPath) {
  await page.setInputFiles('input[type=file]', pdfPath);
  await page.locator('.modal .np-input.big').waitFor({ timeout: 15000 });
  await page.getByRole('button', { name: 'Create project' }).click();
  await page.locator('.picker-modal').waitFor({ timeout: 30000 });
  await page.locator('.picker-footer .go-button').click();
  await page.waitForFunction(() => document.querySelector('.pdf-canvas')?.width > 400, null, { timeout: 60000 });
  await page.waitForTimeout(500);
}
async function reopenProject(page) {
  await page.locator('.dash-card').first().waitFor({ timeout: 15000 });
  await page.locator('.dash-card').first().click();
  await page.getByRole('button', { name: 'Open project' }).click();
  await page.waitForFunction(() => document.querySelector('.pdf-canvas')?.width > 400, null, { timeout: 60000 });
  await page.waitForTimeout(500);
}

const errors = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) errors.push(`check failed: ${name}`);
};

const doc = await getDocument({ data: new Uint8Array(fs.readFileSync(PDF)), verbosity: 0 }).promise;
const fp = doc.fingerprints[0];
const numPages = doc.numPages;
await doc.destroy();
const PPU = 37.79527559055118; // 1:75
const seed = { [`pt:v1:scale:${fp}:5`]: { pointsPerMeter: PPU, verified: true, method: 'preset', axisCheckPassed: true, timestamp: 1 } };

const browser = await chromium.launch({ executablePath: EXE, args: ['--js-flags=--expose-gc'] });
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
const cdp = await page.context().newCDPSession(page);
await cdp.send('Performance.enable');

async function measure() {
  for (let i = 0; i < 3; i++) {
    await cdp.send('HeapProfiler.collectGarbage');
    await page.waitForTimeout(150);
  }
  // A heap snapshot forces the full unified (JS + DOM) collection; plain
  // collectGarbage leaves unmounted DOM nodes waiting for Blink's own GC,
  // which reads as a "leak" in the DOM counters when it isn't one.
  const sink = () => {};
  cdp.on('HeapProfiler.addHeapSnapshotChunk', sink);
  await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
  cdp.off('HeapProfiler.addHeapSnapshotChunk', sink);
  const { metrics } = await cdp.send('Performance.getMetrics');
  const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]));
  const dom = await cdp.send('Memory.getDOMCounters');
  return { heapMB: m.JSHeapUsedSize / 1048576, nodes: dom.nodes, listeners: dom.jsEventListeners };
}
const fmt = (r) => `heap ${r.heapMB.toFixed(1)} MB · ${r.nodes} nodes · ${r.listeners} listeners`;

/** Run `round` N times; the steady-state growth is last minus round 1. */
async function scenario(name, rounds, round, { heapMB = 8, nodes = 300, listeners = 30 } = {}) {
  const rows = [];
  for (let i = 0; i < rounds; i++) {
    await round(i);
    rows.push(await measure());
    console.log(`  ${name} round ${i + 1}: ${fmt(rows[i])}`);
  }
  const first = rows[0];
  const last = rows[rows.length - 1];
  const grow = { heapMB: last.heapMB - first.heapMB, nodes: last.nodes - first.nodes, listeners: last.listeners - first.listeners };
  check(`${name}: heap steady (+${grow.heapMB.toFixed(1)} MB over ${rounds - 1} rounds, limit ${heapMB})`, grow.heapMB <= heapMB);
  check(`${name}: DOM nodes steady (+${grow.nodes})`, grow.nodes <= nodes);
  check(`${name}: event listeners steady (+${grow.listeners})`, grow.listeners <= listeners);
}

await page.goto(APP, { waitUntil: 'networkidle' });
await page.evaluate((seed) => {
  localStorage.clear();
  for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, JSON.stringify(v));
}, seed);
await page.reload({ waitUntil: 'networkidle' });
await openPdf(page, PDF);
console.log(`  start: ${fmt(await measure())}`);

const gotoPage = async (n) => {
  await page.fill('.page-input', String(n));
  await page.locator('.page-input').blur();
  await page.waitForFunction(() => document.querySelector('.pdf-canvas')?.width > 400, null, { timeout: 30000 });
  await page.waitForTimeout(250);
};

await scenario('page flipping (all pages)', 3, async () => {
  for (let n = 1; n <= numPages; n++) await gotoPage(n);
});

await gotoPage(5);
await page.getByRole('button', { name: 'Quick Area' }).click();
await scenario('Quick Area click + cancel ×5', 4, async () => {
  for (let k = 0; k < 5; k++) {
    await page.mouse.click(620 + k * 4, 400);
    await page.locator('.qa-card').first().waitFor({ timeout: 30000 });
    await page.getByRole('button', { name: 'Cancel' }).click();
    await page.waitForTimeout(150);
  }
});
await page.keyboard.press('Escape');

await scenario('close + reopen project', 4, async () => {
  await page.getByRole('button', { name: 'Home' }).click();
  await page.locator('.dash-card').first().waitFor({ timeout: 15000 });
  await reopenProject(page);
});

await scenario('quote + invoice open/close ×3', 3, async () => {
  for (let k = 0; k < 3; k++) {
    await page.getByRole('button', { name: 'Quote' }).click();
    await page.locator('.quote-modal').first().waitFor();
    await page.getByRole('button', { name: 'Create invoice' }).click();
    await page.locator('.invoice-modal').first().waitFor();
    await page.getByRole('button', { name: 'Close' }).click();
    await page.waitForTimeout(100);
  }
});

console.log(`  end: ${fmt(await measure())}`);
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
process.exit(errors.length ? 1 : 0);
