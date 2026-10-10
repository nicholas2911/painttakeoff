/* v0.7.2: kind colors + legend, panel filters, tool presets, page rename,
 * page rotation (overlay stays attached, scale still correct), and
 * click-a-dimension prefill in Set Scale. */
import { chromium } from 'playwright-core';
import { getDocument } from '../app/node_modules/pdfjs-dist/legacy/build/pdf.mjs';

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

const PPU = 37.79527559055118; // 1:75
const SQFT = 10.7639;
const heightM = 8 * 0.3048;

const doc = await getDocument({ url: PDF, useSystemFonts: true }).promise;
const fp = doc.fingerprints[0];
const p5 = await doc.getPage(5);
const vp5 = p5.getViewport({ scale: 1 });
const PW = vp5.width; // 2592 (inherent, includes the PDF's own rotation)
const PH = vp5.height; // 1728
await doc.destroy();
console.log(`  page 5 space: ${PW}x${PH} pt`);

// rotation transform (must mirror the app's Overlay math)
const fwd = (p, rot) =>
  rot === 90 ? { x: PH - p.y, y: p.x }
  : rot === 180 ? { x: PW - p.x, y: PH - p.y }
  : rot === 270 ? { x: p.y, y: PW - p.x }
  : p;
const rotDims = (rot) => (rot === 90 || rot === 270 ? { w: PH, h: PW } : { w: PW, h: PH });

/** Screen position of a page-space point given a fit/recenter camera. */
async function screenPos(page, p, rot, camera) {
  const rect = await page.locator('.viewer').boundingBox();
  const { w, h } = rotDims(rot);
  let zoom, panX, panY;
  if (camera === 'fit') {
    zoom = Math.min((rect.width - 24) / w, (rect.height - 24) / h);
    panX = (rect.width - w * zoom) / 2;
    panY = (rect.height - h * zoom) / 2;
  } else { // 'recenter': page-switch/rotation branch keeps zoom, panY = 12
    zoom = camera.zoom;
    panX = (rect.width - w * zoom) / 2;
    panY = 12;
  }
  const q = fwd(p, rot);
  return { x: rect.x + q.x * zoom + panX, y: rect.y + q.y * zoom + panY, zoom };
}

const sampleOverlay = (page, x, y) =>
  page.evaluate(([px, py]) => {
    const c = document.querySelector('.overlay-canvas');
    if (!c) return null;
    const r = c.getBoundingClientRect();
    const k = c.width / r.width;
    const ctx = c.getContext('2d');
    const d = ctx.getImageData(Math.round((px - r.left) * k), Math.round((py - r.top) * k), 1, 1).data;
    return [d[0], d[1], d[2], d[3]];
  }, [x, y]);

const seed = {
  [`pt:v1:scale:${fp}:5`]: { pointsPerMeter: PPU, verified: true, method: 'preset', axisCheckPassed: true, timestamp: Date.now() },
  [`pt:v1:measure:${fp}:5`]: [
    { id: 'w1', kind: 'length', purpose: 'wall', label: 'Wall 1', points: [{ x: 100, y: 400 }, { x: 478, y: 400 }], totalMeters: 378 / PPU, wallHeightM: heightM, createdAt: 1 },
    { id: 'c1', kind: 'ceiling', label: 'Ceiling 1', points: [{ x: 300, y: 900 }, { x: 400, y: 900 }, { x: 400, y: 1000 }, { x: 300, y: 1000 }], areaM2: 10000 / (PPU * PPU), perimeterM: 400 / PPU, createdAt: 2 },
    { id: 't1', kind: 'length', purpose: 'trim', label: 'Trim 1', points: [{ x: 100, y: 600 }, { x: 161, y: 600 }], totalMeters: 61 / PPU, createdAt: 3 },
    { id: 'd1', kind: 'opening', label: 'D1', openType: 'door', point: { x: 200, y: 500 }, sfM2: 21 / SQFT, assignedTo: 'w1', createdAt: 4 },
  ],
  [`pt:v1:measure:${fp}:6`]: [
    { id: 'r1', kind: 'area', label: 'Room 1', floorAreaM2: 12, perimeterM: 14, wallHeightM: heightM, wallAreaM2: 14 * heightM, cutouts: [], createdAt: 6 },
    { id: 't2', kind: 'length', purpose: 'trim', label: 'Trim 1', points: [{ x: 0, y: 0 }, { x: 75.6, y: 0 }], totalMeters: 2, createdAt: 7 },
  ],
};

const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

await page.goto(APP, { waitUntil: 'networkidle' });
await page.evaluate((s) => {
  localStorage.clear();
  for (const [k, v] of Object.entries(s)) localStorage.setItem(k, JSON.stringify(v));
}, seed);
await page.setInputFiles('input[type=file]', PDF);
await page.waitForSelector('.modal .np-input.big');
await page.getByRole('button', { name: 'Create project' }).click();
await page.waitForSelector('.picker-modal');
await page.locator('.picker-footer .go-button').click();
await page.waitForFunction(() => document.querySelector('.pdf-canvas')?.width > 400, null, { timeout: 60000 });
await page.fill('.page-input', '5');
await page.locator('.page-input').blur();
await page.waitForTimeout(800);
// panel first (it narrows the viewer), then a deterministic fit
await page.getByRole('button', { name: /Measurements/ }).click();
await page.waitForSelector('.measure-panel');
await page.getByRole('button', { name: 'Fit ▾' }).click();
await page.getByRole('button', { name: 'See whole page' }).click();
await page.waitForTimeout(600);

// ---------- A. kind colors + legend ----------
const toScreen = (p) => screenPos(page, p, 0, 'fit');
let s = await toScreen({ x: 100, y: 400 }); // wall vertex
let px = await sampleOverlay(page, s.x, s.y);
console.log('  wall vertex px:', px);
check('wall is blue', px && px[3] > 150 && px[2] > 150 && px[2] > px[0] + 60);
s = await toScreen({ x: 100, y: 600 }); // trim vertex
px = await sampleOverlay(page, s.x, s.y);
console.log('  trim vertex px:', px);
check('trim is amber', px && px[3] > 150 && px[0] > 180 && px[1] > 90 && px[1] < 190 && px[2] < 90);
s = await toScreen({ x: 200, y: 500 }); // door pin
px = await sampleOverlay(page, s.x, s.y);
console.log('  door pin px:', px);
check('opening is red-ish', px && px[3] > 150 && px[0] > 150 && px[0] > px[2] + 50);
s = await toScreen({ x: 350, y: 900 }); // ceiling edge
px = await page.evaluate(([cx, cy]) => {
  const c = document.querySelector('.overlay-canvas');
  if (!c) return null;
  const r = c.getBoundingClientRect();
  const k = c.width / r.width;
  const ctx = c.getContext('2d');
  const x0 = Math.round((cx - r.left) * k);
  const y0 = Math.round((cy - r.top) * k);
  // thin 1.5px stroke: scan a neighborhood for the violet edge pixel
  let best = null;
  for (let dy = -12; dy <= 12; dy++) {
    for (let dx = -12; dx <= 12; dx++) {
      const d = ctx.getImageData(x0 + dx, y0 + dy, 1, 1).data;
      if (d[3] > 30 && d[2] > d[0] && d[0] > d[1]) best = [d[0], d[1], d[2], d[3]];
    }
  }
  return best;
}, [s.x, s.y]);
console.log('  ceiling edge px:', px);
check('ceiling is violet', px !== null);
const legend = await page.locator('.mp-legend').textContent();
check('legend lists all kinds', ['walls', 'ceilings', 'trim', 'rooms', 'openings'].every((w) => legend?.includes(w)));
check('panel dots per kind', (await page.locator('.mp-dot.wall').count()) >= 1 && (await page.locator('.mp-dot.trim').count()) >= 1);
await page.screenshot({ path: 'v072-colors-legend.png' });

// ---------- B. panel filters ----------
await page.locator('.mp-chip', { hasText: 'Trim' }).click();
await page.waitForTimeout(200);
check('trim chip filters rows', (await page.locator('.mp-row').count()) === 1);
check('filtered note', (await page.locator('.mp-filter-note').textContent())?.includes('Showing trim only') ?? false);
check('totals muted while filtering', (await page.locator('.mp-totals.muted').count()) === 1);
await page.getByRole('button', { name: 'All', exact: true }).click();
await page.waitForTimeout(200);
check('all chip restores rows', (await page.locator('.mp-row').count()) === 4);
await page.selectOption('.mp-page-filter', 'all');
await page.waitForTimeout(300);
const xpageText = await page.locator('.mp-list').textContent();
check('all pages shows both pages', (xpageText?.includes('Page 5') && xpageText?.includes('Page 6')) ?? false);
check('cross-page room row', xpageText?.includes('Room 1') ?? false);
await page.locator('.mp-row-x', { hasText: 'Room 1' }).click();
await page.waitForTimeout(800);
check('cross-page row jumps to its page', (await page.locator('.page-input').inputValue()) === '6');
await page.fill('.page-input', '5');
await page.locator('.page-input').blur();
await page.waitForTimeout(800);
await page.screenshot({ path: 'v072-filters.png' });

// ---------- C. tool presets ----------
await page.getByRole('button', { name: 'Measure', exact: true }).click();
await page.getByRole('button', { name: 'Save as preset' }).click();
await page.waitForTimeout(300);
check('preset chip appears with auto name', (await page.locator('.preset-chip').first().textContent())?.includes('Wall · 8') ?? false);
// switch kind, then apply the preset -> back to wall
await page.locator('.kind-picker button', { hasText: 'Trim' }).click();
await page.locator('.preset-chip').first().click();
await page.waitForTimeout(200);
check('preset applies its kind', (await page.locator('.kind-picker button.active').textContent()) === 'Wall');
// rename via double-click
await page.locator('.preset-chip').first().dblclick();
await page.locator('.preset-rename').fill('Office walls');
await page.keyboard.press('Enter');
await page.waitForTimeout(200);
check('preset renamed', (await page.locator('.preset-chip').first().textContent())?.includes('Office walls') ?? false);
await page.screenshot({ path: 'v072-presets.png' });
// persist across reload
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.dash-card', { timeout: 15000 });
await page.locator('.dash-card').first().click();
await page.getByRole('button', { name: 'Open project' }).click();
await page.waitForFunction(() => document.querySelector('.pdf-canvas')?.width > 400, null, { timeout: 60000 });
await page.fill('.page-input', '5'); // scale lives on page 5 — Measure is blocked elsewhere
await page.locator('.page-input').blur();
await page.waitForTimeout(800);
await page.getByRole('button', { name: 'Measure', exact: true }).click();
check('preset persists after reload', (await page.locator('.preset-chip').first().textContent())?.includes('Office walls') ?? false);
// delete
await page.locator('.preset-chip-x').first().click();
await page.waitForTimeout(200);
check('preset deleted', (await page.locator('.preset-chip').count()) === 0);
await page.getByRole('button', { name: 'Move Around' }).click();

// ---------- D. page rename ----------
await page.locator('.page-edit').click();
await page.waitForSelector('.page-rename-modal');
await page.locator('.page-rename-modal input').fill('A3 – Party Room');
await page.getByRole('button', { name: 'Save name' }).click();
await page.waitForTimeout(300);
check('toolbar shows page label', (await page.locator('.page-custom-label').textContent()) === 'A3 – Party Room');
if ((await page.locator('.measure-panel').count()) === 0)
  await page.getByRole('button', { name: /Measurements/ }).click();
await page.waitForSelector('.measure-panel');
const ddText = await page.locator('.mp-page-filter').textContent();
check('panel dropdown shows page label', ddText?.includes('A3 – Party Room') ?? false);
await page.getByRole('button', { name: 'Quote' }).click();
await page.waitForSelector('.quote-modal');
await page.getByRole('tab', { name: 'Per page' }).click();
await page.waitForTimeout(300);
check('per-page quote uses page label', (await page.locator('.quote-modal').textContent())?.includes('A3 – Party Room') ?? false);
await page.getByRole('button', { name: 'Close' }).click();

// ---------- E. rotation ----------
// close the side panel so rotated (right-side) pixels are clickable
await page.locator('.mp-close').click();
await page.waitForTimeout(300);
// deterministic camera first
await page.getByRole('button', { name: 'Fit ▾' }).click();
await page.getByRole('button', { name: 'See whole page' }).click();
await page.waitForTimeout(600);

/** Locate the blue wall pixels on the overlay canvas (self-locating — no
 *  camera math needed). Returns the bbox in SCREEN coords. */
const scanWall = () =>
  page.evaluate(() => {
    const c = document.querySelector('.overlay-canvas');
    if (!c) return null;
    const r = c.getBoundingClientRect();
    const k = c.width / r.width;
    const ctx = c.getContext('2d');
    const img = ctx.getImageData(0, 0, c.width, c.height).data;
    let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1, count = 0;
    for (let y = 0; y < c.height; y += 2) {
      for (let x = 0; x < c.width; x += 2) {
        const i = (y * c.width + x) * 4;
        // wall blue #1a66cc
        if (img[i + 3] > 120 && img[i + 2] > 150 && img[i + 2] > img[i] + 60) {
          count++;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (count === 0) return null;
    return {
      count,
      x1: r.x + minX / k, x2: r.x + maxX / k,
      y1: r.y + minY / k, y2: r.y + maxY / k,
    };
  });

const wallAt0 = await scanWall();
console.log('  wall bbox at 0°:', JSON.stringify(wallAt0));
// rotate 90° twice -> 180
for (let i = 0; i < 2; i++) {
  await page.getByRole('button', { name: 'Fit ▾' }).click();
  await page.getByRole('button', { name: 'Rotate page 90°' }).click();
  await page.waitForTimeout(900);
}
const wallAt180 = await scanWall();
console.log('  wall bbox at 180°:', JSON.stringify(wallAt180));
check('wall moved across the page after 180°',
  !!wallAt0 && !!wallAt180 && Math.abs(wallAt180.x1 - wallAt0.x1) > 200);
await page.screenshot({ path: 'v072-rotated-180.png' });
// click the rotated wall's line (bottom of the bbox — the label floats above)
await page.mouse.click((wallAt180.x1 + wallAt180.x2) / 2, wallAt180.y2 - 2);
await page.waitForTimeout(400);
await page.getByRole('button', { name: /Measurements/ }).click();
await page.waitForSelector('.measure-panel');
check('measurement still attached after 180° (click selects it)',
  (await page.locator('.mp-row.selected').textContent())?.includes('Wall 1') ?? false);
await page.locator('.mp-close').click();
await page.waitForTimeout(200);
// scale still correct: measure along the rotated wall's own endpoints
// (vertex snap makes the chain exactly the wall's length)
await page.getByRole('button', { name: 'Measure', exact: true }).click();
await page.waitForTimeout(200);
const rescan = await scanWall(); // panel closed -> canvas may have resized
const lineY = rescan.y2 - 2; // the line itself (label floats above)
await page.mouse.click(rescan.x1 + 2, lineY);
await page.mouse.click(rescan.x2 - 2, lineY);
await page.mouse.dblclick(rescan.x2 - 2, lineY);
await page.waitForTimeout(500);
const toast = await page.locator('.toast').textContent();
console.log('  measure toast:', toast);
check('scale correct after rotation (378pt ≈ 32\' 9")', toast?.includes("32' 9") ?? false);
// rotate back twice to 0 -> wall returns home
await page.getByRole('button', { name: 'Move Around' }).click();
for (let i = 0; i < 2; i++) {
  await page.getByRole('button', { name: 'Fit ▾' }).click();
  await page.getByRole('button', { name: 'Rotate page 90°' }).click();
  await page.waitForTimeout(900);
}
const wallBack = await scanWall();
console.log('  wall bbox back at 0°:', JSON.stringify(wallBack));
check('wall back home after 360°',
  !!wallBack && Math.abs((wallBack.x1 + wallBack.x2) / 2 - (wallAt0.x1 + wallAt0.x2) / 2) < 8 &&
  Math.abs((wallBack.y1 + wallBack.y2) / 2 - (wallAt0.y1 + wallAt0.y2) / 2) < 8);
check('rotation persisted in pageprops', await page.evaluate((f) => {
  const raw = localStorage.getItem(`pt:v1:pageprops:${f}`);
  return raw !== null; // map exists (rotate back at 0, label set)
}, fp));

// ---------- G. Alt+drag rectangle ceiling (stretch) ----------
await page.getByRole('button', { name: 'Measure', exact: true }).click();
await page.locator('.kind-picker button', { hasText: 'Ceiling' }).click();
const r1 = await screenPos(page, { x: 1500, y: 1150 }, 0, 'fit');
const r2 = await screenPos(page, { x: 1600, y: 1230 }, 0, 'fit');
await page.keyboard.down('Alt');
await page.mouse.move(r1.x, r1.y);
await page.mouse.down();
await page.mouse.move(r2.x, r2.y, { steps: 6 });
await page.mouse.up();
await page.keyboard.up('Alt');
await page.waitForTimeout(500);
const boxToast = await page.locator('.toast').textContent();
console.log('  box toast:', boxToast);
// 100x80 pt = 5.60 m2 ≈ 60 sq ft (mouse steps land within a pt or two)
const boxSF = parseFloat(/([\d.]+) sq ft/.exec(boxToast ?? '')?.[1] ?? 'NaN');
check('alt-drag box becomes a ceiling (≈60 sq ft)',
  !!boxToast?.includes('Ceiling') && Number.isFinite(boxSF) && Math.abs(boxSF - 60) <= 3);
await page.getByRole('button', { name: 'Move Around' }).click();

// ---------- F. click-a-dimension ----------
const ctx2 = await browser.newContext({ viewport: { width: 1500, height: 950 } });
const page2 = await ctx2.newPage();
page2.on('pageerror', (e) => errors.push(`pageerror(dim): ${e.message}`));
await page2.goto(APP, { waitUntil: 'networkidle' });
await page2.evaluate(() => localStorage.clear());
await page2.setInputFiles('input[type=file]', PDF);
await page2.waitForSelector('.modal .np-input.big');
await page2.getByRole('button', { name: 'Create project' }).click();
await page2.waitForSelector('.picker-modal');
await page2.locator('.picker-footer .go-button').click();
await page2.waitForFunction(() => document.querySelector('.pdf-canvas')?.width > 400, null, { timeout: 60000 });
await page2.fill('.page-input', '5');
await page2.locator('.page-input').blur();
await page2.waitForTimeout(800);
await page2.getByRole('button', { name: 'Fit ▾' }).click();
await page2.getByRole('button', { name: 'See whole page' }).click();
await page2.waitForTimeout(600);
await page2.getByRole('button', { name: 'Set Scale' }).click();
// click the printed "12270" (page space 655, 933 inherent)
const dimPos = await screenPos(page2, { x: 655, y: 931 }, 0, 'fit');
await page2.mouse.click(dimPos.x, dimPos.y);
await page2.waitForTimeout(700);
const dimToast = await page2.locator('.toast').textContent();
console.log('  dim toast:', dimToast);
check('dimension read toast', dimToast?.includes('12270') ?? false);
// now the two ends — adaptively: a click that lands on dimension text is a
// read, not a point, so keep trying candidate spots until the bar advances.
const candidates = [
  { x: 700, y: 1150 }, { x: 1000, y: 1150 }, { x: 500, y: 1150 }, { x: 1300, y: 1150 },
  { x: 700, y: 1600 }, { x: 1000, y: 1600 }, { x: 300, y: 1150 }, { x: 1500, y: 1150 },
];
let end1 = null;
for (const c of candidates) {
  const pos = await screenPos(page2, c, 0, 'fit');
  await page2.mouse.click(pos.x, pos.y);
  await page2.waitForTimeout(400);
  const t = await page2.locator('.step-bar-title').textContent();
  if (t?.includes('2 of 2')) { end1 = c; break; }
}
check('first end placed', end1 !== null);
let modalUp = false;
for (const c of candidates) {
  if (end1 && c.x === end1.x && c.y === end1.y) continue;
  const pos = await screenPos(page2, c, 0, 'fit');
  await page2.mouse.click(pos.x, pos.y);
  await page2.waitForTimeout(500);
  if ((await page2.locator('.modal .length-boxes').count()) > 0) { modalUp = true; break; }
}
check('second end opens the length modal', modalUp);
await page2.waitForSelector('.modal .length-boxes', { timeout: 10000 });
const readLine = await page2.locator('.dim-read').textContent();
check('modal notes the dimension read', readLine?.includes('Read') ?? false);
const readMm = /“([\d'".\s/]+)”?/.exec(readLine ?? '')?.[1]?.trim();
await page2.getByRole('button', { name: 'Work in meters instead' }).click();
await page2.waitForTimeout(300);
const mmValue = await page2.locator('.length-box input').inputValue();
console.log('  mm box prefilled:', mmValue, '| modal read:', readLine?.trim());
// the prefill must equal whatever the modal says it read (first read was 12270)
check('read dimension lands in the mm box', mmValue !== '' && readLine?.includes('12270') === true && mmValue === '12270');
check('modal says the read is highlighted', readLine?.includes('(highlighted)') ?? false);

// --- trust: the highlight box is drawn around the read text ---
const scanOrange = () =>
  page2.evaluate(() => {
    const c = document.querySelector('.overlay-canvas');
    if (!c) return null;
    const r = c.getBoundingClientRect();
    const k = c.width / r.width;
    const ctx = c.getContext('2d');
    const img = ctx.getImageData(0, 0, c.width, c.height).data;
    let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1, count = 0;
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        const i = (y * c.width + x) * 4;
        // highlight orange #e15b00 (stroke solid, fill translucent)
        if (img[i + 3] > 15 && img[i] > 170 && img[i + 1] > 40 && img[i + 1] < 160 && img[i + 2] < 90) {
          count++;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (count === 0) return null;
    return { count, cx: r.x + (minX + maxX) / 2 / k, cy: r.y + (minY + maxY) / 2 / k, w: (maxX - minX) / k };
  });
const orange = await scanOrange();
const expectedPos = await screenPos(page2, { x: 664, y: 931 }, 0, 'fit');
console.log('  highlight bbox center:', orange && `${Math.round(orange.cx)},${Math.round(orange.cy)} w=${Math.round(orange.w)}`, '| text at', Math.round(expectedPos.x), Math.round(expectedPos.y));
check('highlight box renders at the read text', !!orange &&
  Math.abs(orange.cx - expectedPos.x) < 25 && Math.abs(orange.cy - expectedPos.y) < 25);
await page2.screenshot({ path: 'v072-dim-highlight.png' });

// --- trust: editing the value clears the highlight and says so ---
await page2.locator('.length-box input').fill('12269');
await page2.waitForTimeout(400);
check('edit switches the line to Edited manually',
  (await page2.locator('.dim-edited').textContent())?.includes('Edited manually') ?? false);
check('edit clears the highlight', (await scanOrange()) === null);
await page2.getByRole('button', { name: 'Cancel' }).click();
await page2.waitForTimeout(300);

// --- trust: digit-ish non-dimensions (grid tags like A3, page numbers) ---
await page2.getByRole('button', { name: 'Set Scale' }).click();
const a3Pos = await screenPos(page2, { x: 491, y: 477 }, 0, 'fit'); // "A3" grid tag
await page2.mouse.click(a3Pos.x, a3Pos.y);
await page2.waitForTimeout(700);
check('A3 click: not-a-dimension toast',
  (await page2.locator('.toast').textContent())?.includes('didn’t look like a dimension') ?? false);
check('A3 click: no prefill, still waiting for point 1',
  (await page2.locator('.step-bar-title').textContent())?.includes('click 1 of 2') ?? false);
await ctx2.close();

// --- trust: implausible value never prefills (synthetic vector PDF) ---
const makePdf = (text) => {
  const content = `BT /F1 24 Tf 100 400 Td (${text}) Tj ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefPos = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  return pdf;
};
const fs2 = await import('node:fs');
const tmpPdf = 'C:/Users/Nicholas/Desktop/coding/paint-takeoff/.smoke/tmp-dimplausible.pdf';
fs2.writeFileSync(tmpPdf, makePdf('250000')); // 250 m — implausible
const ctx3 = await browser.newContext({ viewport: { width: 1500, height: 950 } });
const page3 = await ctx3.newPage();
page3.on('pageerror', (e) => errors.push(`pageerror(implausible): ${e.message}`));
await page3.goto(APP, { waitUntil: 'networkidle' });
await page3.evaluate(() => localStorage.clear());
await page3.setInputFiles('input[type=file]', tmpPdf);
await page3.waitForSelector('.modal .np-input.big');
await page3.getByRole('button', { name: 'Create project' }).click();
await page3.waitForSelector('.picker-modal');
await page3.locator('.picker-footer .go-button').click();
await page3.waitForFunction(() => document.querySelector('.pdf-canvas')?.width > 400, null, { timeout: 60000 });
await page3.getByRole('button', { name: 'Fit ▾' }).click();
await page3.getByRole('button', { name: 'See whole page' }).click();
await page3.waitForTimeout(500);
await page3.getByRole('button', { name: 'Set Scale' }).click();
// text at user space (100,400) on a 612x792 page -> page space (100, 392)
const rect3 = await page3.locator('.viewer').boundingBox();
const zoom3 = Math.min((rect3.width - 24) / 612, (rect3.height - 24) / 792);
const clickX = rect3.x + (rect3.width - 612 * zoom3) / 2 + 140 * zoom3;
const clickY = rect3.y + (rect3.height - 792 * zoom3) / 2 + 392 * zoom3;
await page3.mouse.click(clickX, clickY);
await page3.waitForTimeout(700);
check('implausible 250000: not-a-dimension toast',
  (await page3.locator('.toast').textContent())?.includes('didn’t look like a dimension') ?? false);
// ends -> modal must show the tip, NOT a prefill
await page3.mouse.click(rect3.x + 200, rect3.y + 600);
await page3.mouse.click(rect3.x + 300, rect3.y + 600);
await page3.waitForSelector('.modal .length-boxes', { timeout: 10000 });
check('implausible: modal shows the tip, not a read',
  (await page3.locator('.dim-tip').count()) === 1 && (await page3.locator('.dim-read').count()) === 0);
await page3.getByRole('button', { name: 'Work in meters instead' }).click();
check('implausible: mm box empty', (await page3.locator('.length-box input').inputValue()) === '');
fs2.unlinkSync(tmpPdf);
await ctx3.close();

console.log('errors:', errors.length ? errors : 'none');
await browser.close();
process.exit(errors.length ? 1 : 0);
