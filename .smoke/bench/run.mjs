/* Quick Area accuracy benchmark.
 * For every printed room area found by profile.mjs, "click" on the label
 * with the app's own Quick Area engine (harness.ts, headless Chromium) at
 * the page's printed scale, and compare the fill to the printed area.
 *   node bench/profile.mjs        (once per corpus change)
 *   node bench/run.mjs [--max-per-file 40] [--images 25]
 * Writes sample-plans/corpus/bench-results.json, .smoke/bench/report.md and
 * crops of the worst cases to sample-plans/corpus/debug/. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import http from 'node:http';
import { chromium } from 'playwright-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '../..');
const CORPUS = path.join(ROOT, 'sample-plans/corpus');
const DEBUG = path.join(CORPUS, 'debug');
const EXE =
  'C:/Users/Nicholas/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe';
const arg = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : dflt;
};
const MAX_PER_FILE = parseInt(arg('--max-per-file', '40'), 10);
const ONLY = arg('--only', null); // run just this file (for inspecting)
const N_IMAGES = parseInt(arg('--images', '25'), 10);
// --engine v083 runs the frozen pre-fix engine (the 'before' of an A/B).
const ENGINE = arg('--engine', 'current');
const POINTS_PER_METER = 72 / 0.0254;

// ---- bundle the harness with the app's esbuild ----
const bundle = path.join(here, '.harness.bundle.js');
execFileSync(process.execPath, [
  path.join(ROOT, 'app/node_modules/esbuild/bin/esbuild'),
  path.join(here, 'harness.ts'),
  '--bundle', '--format=esm', '--platform=browser', '--log-level=warning', `--outfile=${bundle}`,
], { stdio: 'inherit' });

// ---- pick cases: each printed area + the scale that governs it ----
const profile = JSON.parse(fs.readFileSync(path.join(CORPUS, 'profile.json'), 'utf8'));
const cases = [];
const skipped = { noScale: 0, capped: 0, table: 0, total: 0 };
for (const f of profile) {
  if (f.error) continue;
  if (ONLY && f.file !== ONLY) continue;
  // Floor plans aren't drawn at detail scales (1-1/2" = 1'-0" and the like).
  const planScales = (p) => p.scales.filter((s) => s.ratio >= 16);
  const fileScales = f.pages.flatMap((p) => planScales(p).map((s) => s.ratio));
  const common = mode(fileScales);
  let n = 0;
  for (const p of f.pages) {
    for (const a of p.areas) {
      // Not a room tag: a cell in an area schedule/table (3+ area labels
      // stacked in one column), or a total/gross/GFA figure.
      const midX = (l) => l.x + l.w / 2;
      const column = p.areas.filter((o) => o !== a && Math.abs(midX(o) - midX(a)) < 1.5 * a.h && Math.abs(o.y - a.y) < 8 * a.h).length;
      if (column >= 2) { skipped.table++; continue; }
      if (/\b(TOTAL|GROSS|GFA|GIA|NET|SITE|LOT|BUILDING|FLOOR AREA|DWELLING|UNIT)\b/i.test(a.text)) { skipped.total++; continue; }
      // The scale note nearest the label on its own sheet; else the file's
      // most common one (marked "inferred").
      let ratio = null;
      let scaleSource = 'page';
      if (planScales(p).length) {
        ratio = planScales(p).reduce((best, s) => (dist(s, a) < dist(best, a) ? s : best)).ratio;
      } else if (common) {
        ratio = common;
        scaleSource = 'inferred';
      }
      if (!ratio) { skipped.noScale++; continue; }
      if (n >= MAX_PER_FILE) { skipped.capped++; continue; }
      n++;
      // Click the label's centre, then just below / above it.
      const cx = a.x + a.w / 2;
      const cy = a.y + a.h / 2;
      cases.push({
        file: f.file, page: p.n, label: a.text, unit: a.unit, value: a.value, truthM2: a.m2, ratio, scaleSource,
        points: [{ x: cx, y: cy }, { x: cx, y: cy + 1.8 * a.h }, { x: cx, y: cy - 1.8 * a.h }],
      });
    }
  }
}
function dist(s, a) { return Math.hypot(s.x - a.x, s.y - a.y); }
function mode(xs) {
  const c = new Map();
  for (const x of xs) c.set(x, (c.get(x) ?? 0) + 1);
  let best = null, bn = 0;
  for (const [x, k] of c) if (k > bn) { best = x; bn = k; }
  return best;
}
console.log(`${cases.length} cases (skipped: ${skipped.table} in tables, ${skipped.total} totals, ${skipped.noScale} no scale, ${skipped.capped} over the per-file cap)`);

// ---- run ----
const browser = await chromium.launch({ executablePath: EXE });
const pageErrors = [];
let page = null;
/** A fresh harness tab (after a renderer crash the old one is dead). */
async function newHarness() {
  if (page && !page.isClosed()) await page.close().catch(() => {});
  page = await browser.newPage();
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(() => window.benchReady === true, null, { timeout: 30000 });
}
// Files come from a local HTTP server (streamed, range-capable via pdf.js
// chunking) — Playwright's route.fulfill pushes the whole body through the
// DevTools pipe, which tops out at 100 MB and kills the browser on big sets.
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const send = (type, file) => {
    const size = fs.statSync(file).size;
    const range = /bytes=(\d+)-(\d*)/.exec(req.headers.range ?? '');
    if (range) {
      const start = +range[1];
      const end = range[2] ? +range[2] : size - 1;
      res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes' });
      fs.createReadStream(file, { start, end }).pipe(res);
    } else {
      res.writeHead(200, { 'Content-Type': type, 'Content-Length': size, 'Accept-Ranges': 'bytes' });
      fs.createReadStream(file).pipe(res);
    }
  };
  if (u.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end('<!doctype html><meta charset="utf-8"><script type="module" src="/harness.js"></script>');
  }
  if (u.pathname === '/harness.js') return send('text/javascript', bundle);
  if (u.pathname === '/pdf.worker.mjs') return send('text/javascript', path.join(ROOT, 'app/node_modules/pdfjs-dist/build/pdf.worker.min.mjs'));
  if (u.pathname.startsWith('/pdf/')) {
    const f = path.join(CORPUS, path.basename(decodeURIComponent(u.pathname)));
    if (fs.existsSync(f)) return send('application/pdf', f);
  }
  res.writeHead(404);
  res.end();
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
await newHarness();
const crashes = [];

async function runCase(c) {
  let r;
  try {
    r = await page.evaluate(
      ([url, pg, pts, ppm, eng]) => window.bench.measure(url, pg, pts, ppm, false, eng),
      [`/pdf/${encodeURIComponent(c.file)}`, c.page, c.points, POINTS_PER_METER / c.ratio, ENGINE],
    );
  } catch (e) {
    const msg = String(e.message ?? e);
    r = { ok: false, error: msg };
    if (/closed|crash/i.test(msg)) {
      crashes.push(`${c.file} p${c.page}`);
      console.log(`  renderer crashed on ${c.file} p${c.page} — restarting harness`);
      await newHarness();
    }
  }
  const dev = r.ok ? (r.floorAreaM2 - c.truthM2) / c.truthM2 : null;
  return { ...c, ...r, png: undefined, dev };
}

const t0 = Date.now();
// Pass 1: the scale written on the sheet.
let results = [];
for (const c of cases) {
  if (results.length % 50 === 0) console.log(`  pass 1  ${results.length}/${cases.length}  ${c.file} p${c.page}`);
  results.push(await runCase(c));
}

// Pass 2: sheets whose written scale is wrong for the PDF (an "@ A1" sheet
// saved at A3, a detail scale picked up) show every room off by the SAME
// linear factor k. Where 3+ rooms on a page agree, snap scale/k to the
// nearest standard scale (within 12%) and re-measure — i.e. assume the user
// calibrated correctly, which is what the app's double-check is for. Pages
// with no clean snap keep pass-1 numbers.
const STANDARD = [16, 20, 24, 25, 32, 40, 48, 50, 64, 75, 96, 100, 125, 128, 150, 192, 200, 250, 384, 500, 1000];
const byPage = new Map();
for (const r of results) if (r.ok) (byPage.get(`${r.file}|${r.page}`) ?? byPage.set(`${r.file}|${r.page}`, []).get(`${r.file}|${r.page}`)).push(r);
const corrected = new Map();
for (const [key, rs] of byPage) {
  if (rs.length < 3) continue;
  const ks = rs.map((r) => Math.sqrt(r.floorAreaM2 / r.truthM2)).sort((a, b) => a - b);
  const k = ks[(ks.length / 2) | 0];
  if (Math.abs(k - 1) < 0.25) continue; // close enough — the written scale is right
  // Only believable mix-ups (A1↔A3 is 2×; 1/4"↔1/8" is 2×), and only when the
  // rooms really differ — identical fills are one leak, not N rooms.
  if (k < 0.3 || k > 3.5) continue;
  if (new Set(rs.map((r) => Math.round(r.floorAreaM2))).size < Math.ceil(rs.length / 2)) continue;
  const want = rs[0].ratio / k;
  const snap = STANDARD.reduce((b, s) => (Math.abs(s - want) < Math.abs(b - want) ? s : b));
  if (Math.abs(snap - want) / want <= 0.12) corrected.set(key, snap);
}
if (corrected.size) {
  console.log(`  pass 2: re-scaling ${corrected.size} page(s) — ${[...corrected].map(([k, s]) => `${k.replace('|', ' p')} → 1:${s}`).join(', ')}`);
  const next = [];
  for (const [i, r] of results.entries()) {
    const snap = corrected.get(`${r.file}|${r.page}`);
    if (!snap) { next.push(r); continue; }
    next.push(await runCase({ ...cases[i], ratio: snap, scaleSource: `snapped from 1:${r.ratio}` }));
  }
  results = next;
}
const elapsed = (Date.now() - t0) / 1000;

// ---- crops of the worst cases, for eyeballing ----
if (!ONLY) fs.rmSync(DEBUG, { recursive: true, force: true });
fs.mkdirSync(DEBUG, { recursive: true });
const worst = [...results].sort((a, b) => Math.abs(b.dev ?? 9) - Math.abs(a.dev ?? 9)).slice(0, N_IMAGES);
for (const [i, c] of worst.entries()) {
  if (c.error) continue;
  const r = await page.evaluate(
    ([url, pg, pts, ppm, eng]) => window.bench.measure(url, pg, pts, ppm, true, eng),
    [`/pdf/${encodeURIComponent(c.file)}`, c.page, c.points, POINTS_PER_METER / c.ratio, ENGINE],
  );
  if (r.png) fs.writeFileSync(path.join(DEBUG, `${ONLY ? 'x' : ''}${String(i + 1).padStart(2, '0')}-${c.file.replace(/\.pdf$/, '')}-p${c.page}.png`), Buffer.from(r.png.split(',')[1], 'base64'));
  c.debugImage = `${String(i + 1).padStart(2, '0')}`;
}
await browser.close();
server.close();

// ---- report ----
if (!ONLY) fs.writeFileSync(path.join(CORPUS, `bench-results-${ENGINE}.json`), JSON.stringify(results, null, 1));
const filled = results.filter((r) => r.ok);
const within = (t) => filled.filter((r) => Math.abs(r.dev) <= t).length;
const pct = (k, n) => (n ? `${((100 * k) / n).toFixed(0)}%` : '—');
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[(s.length / 2) | 0] : NaN; };
const byFile = new Map();
for (const r of results) {
  const e = byFile.get(r.file) ?? { n: 0, ok: 0, w10: 0, w25: 0, devs: [], scale: new Set() };
  e.n++; e.scale.add(r.scaleSource);
  if (r.ok) { e.ok++; e.devs.push(r.dev); if (Math.abs(r.dev) <= 0.1) e.w10++; if (Math.abs(r.dev) <= 0.25) e.w25++; }
  byFile.set(r.file, e);
}
const md = [];
md.push(`# Quick Area accuracy benchmark — engine: ${ENGINE}`, '');
md.push(`Run ${new Date().toISOString().slice(0, 16).replace('T', ' ')} · ${profile.length} files · ${results.length} printed room areas · ${elapsed.toFixed(0)} s`, '');
md.push(`| | count | share |`, `|---|---|---|`);
md.push(`| Room found (fill) | ${filled.length} | ${pct(filled.length, results.length)} |`);
md.push(`| Within 10% of printed area | ${within(0.1)} | ${pct(within(0.1), results.length)} |`);
md.push(`| Within 25% | ${within(0.25)} | ${pct(within(0.25), results.length)} |`);
md.push(`| Median error (filled) | ${(median(filled.map((r) => r.dev)) * 100).toFixed(1)}% | |`);
md.push(`| Median time per click | ${median(filled.map((r) => r.tFill)).toFixed(0)} ms | |`);
md.push('', `Skipped labels: ${skipped.table} in schedules/tables, ${skipped.total} totals (GFA/GIA/gross/unit), ${skipped.noScale} with no readable scale. "No room" means Quick Area found no closed shape (or rejected a whole-sheet leak) — the correct answer when a label isn't inside a room.`, '');
md.push(`## By file`, '', `| file | labels | filled | ≤10% | ≤25% | median error | scale |`, `|---|---|---|---|---|---|---|`);
for (const [f, e] of [...byFile].sort((a, b) => b[1].n - a[1].n))
  md.push(`| ${f} | ${e.n} | ${e.ok} | ${e.w10} | ${e.w25} | ${e.devs.length ? (median(e.devs) * 100).toFixed(0) + '%' : '—'} | ${[...e.scale].join(', ')} |`);
md.push('', `## Worst ${worst.length} (crops in sample-plans/corpus/debug/)`, '', `| # | file · page | label | printed m² | measured m² | error |`, `|---|---|---|---|---|---|`);
for (const [i, c] of worst.entries())
  md.push(`| ${i + 1} | ${c.file} · p${c.page} | ${c.label.replace(/\|/g, '/')} | ${c.truthM2.toFixed(1)} | ${c.ok ? c.floorAreaM2.toFixed(1) : 'no fill'} | ${c.ok ? (c.dev * 100).toFixed(0) + '%' : '—'} |`);
if (crashes.length) md.push('', '## Renderer crashes', '', ...[...new Set(crashes)].map((c) => `- ${c}`));
if (pageErrors.length) md.push('', '## Page errors', '', ...pageErrors.slice(0, 20).map((e) => `- ${e}`));
if (!ONLY) fs.writeFileSync(path.join(here, ENGINE === 'current' ? 'report.md' : `report-${ENGINE}.md`), md.join('\n') + '\n');
console.log(md.slice(0, 12).join('\n'));
console.log(`\nreport: .smoke/bench/report.md`);
