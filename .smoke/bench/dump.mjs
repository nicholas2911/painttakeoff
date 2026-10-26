/* Save real page rasters + click points for offline Quick Area CPU/identity
 * tests (perf.ts). Picks varied benchmark pages with real room clicks.
 *   node bench/dump.mjs   → sample-plans/corpus/rasters/ */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '../..');
const CORPUS = path.join(ROOT, 'sample-plans/corpus');
const OUT = path.join(CORPUS, 'rasters');
const EXE =
  'C:/Users/Nicholas/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe';
const POINTS_PER_METER = 72 / 0.0254;

const bundle = path.join(here, '.harness.bundle.js');
execFileSync(process.execPath, [path.join(ROOT, 'app/node_modules/esbuild/bin/esbuild'), path.join(here, 'harness.ts'), '--bundle', '--format=esm', '--platform=browser', '--log-level=warning', `--outfile=${bundle}`], { stdio: 'inherit' });

// Up to 10 pages, 6 clicks each, from the current benchmark results.
const results = JSON.parse(fs.readFileSync(path.join(CORPUS, 'bench-results-current.json'), 'utf8'));
const byPage = new Map();
for (const r of results) {
  const k = `${r.file}|${r.page}`;
  if (!byPage.has(k)) byPage.set(k, []);
  byPage.get(k).push(r);
}
const pages = [...byPage.values()].filter((rs) => rs.some((r) => r.ok)).sort((a, b) => b.length - a.length).slice(0, 10);

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const send = (type, file) => { res.writeHead(200, { 'Content-Type': type }); fs.createReadStream(file).pipe(res); };
  if (u.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end('<!doctype html><script type="module" src="/harness.js"></script>'); }
  if (u.pathname === '/harness.js') return send('text/javascript', bundle);
  if (u.pathname === '/pdf.worker.mjs') return send('text/javascript', path.join(ROOT, 'app/node_modules/pdfjs-dist/build/pdf.worker.min.mjs'));
  if (u.pathname.startsWith('/pdf/')) return send('application/pdf', path.join(CORPUS, path.basename(decodeURIComponent(u.pathname))));
  res.writeHead(404); res.end();
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${server.address().port}/`);
await page.waitForFunction(() => window.benchReady === true);
fs.mkdirSync(OUT, { recursive: true });
const index = [];
for (const rs of pages) {
  const { file, page: pg } = rs[0];
  const r = await page.evaluate(([u, p]) => window.bench.dumpRaster(u, p), [`/pdf/${encodeURIComponent(file)}`, pg]);
  const name = `${file.replace(/\.pdf$/, '')}-p${pg}.rgba`;
  fs.writeFileSync(path.join(OUT, name), Buffer.from(r.b64, 'base64'));
  index.push({
    raster: name, w: r.w, h: r.h, pointsPerPixel: 1 / r.scale,
    clicks: rs.slice(0, 6).map((c) => ({ x: c.points[0].x * r.scale, y: c.points[0].y * r.scale, pointsPerMeter: POINTS_PER_METER / c.ratio, label: c.label })),
  });
  console.log(`saved ${name} ${r.w}x${r.h}`);
}
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index, null, 1));
await browser.close();
server.close();
