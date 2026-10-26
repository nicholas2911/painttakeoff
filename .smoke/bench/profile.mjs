/* Stage 1 of the accuracy benchmark: read every corpus PDF's text and find
 *  - drawing scale notes  (1/4" = 1'-0", 1:100, SCALE 1:50 …)
 *  - printed room areas   (245 SF, 245 S.F., 24.5 m², 24.5 M2 …)
 * with their positions in the app's page space (scale-1 viewport, inherent
 * rotation applied, origin top-left). Pages with no text are flagged as
 * scanned. Writes sample-plans/corpus/profile.json.
 *   node bench/profile.mjs [corpusDir] */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDocument } from '../../app/node_modules/pdfjs-dist/legacy/build/pdf.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const CORPUS = path.resolve(process.argv[2] ?? path.join(here, '../../sample-plans/corpus'));
const MAX_PAGES = 80; // per file — enough to find the plans in big sets

/** Merge text items on one line that sit close together ("245" + "SF"). */
function lines(items) {
  const toks = items
    .filter((t) => t.str && t.str.trim())
    .map((t) => ({ str: t.str, x: t.x, y: t.y, w: t.w, h: t.h }))
    .sort((a, b) => a.y - b.y || a.x - b.x);
  const out = [];
  for (const t of toks) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.y - t.y) < 0.6 * Math.max(last.h, t.h) && t.x - (last.x + last.w) < 1.6 * Math.max(last.h, t.h) && t.x >= last.x) {
      last.str += (t.x - (last.x + last.w) > 0.15 * t.h ? ' ' : '') + t.str;
      last.w = t.x + t.w - last.x;
      last.h = Math.max(last.h, t.h);
    } else out.push({ ...t });
  }
  return out;
}

const FRAC = String.raw`(\d+\s*\/\s*\d+|\d+(?:\.\d+)?|\d+\s+\d+\s*\/\s*\d+)`;
const IMPERIAL_SCALE = new RegExp(String.raw`${FRAC}\s*(?:"|”|″|''|in\.?)\s*=\s*1\s*(?:'|’|′|ft\.?)\s*(?:-?\s*0\s*(?:"|”|″|'')?)?`, 'i');
const METRIC_SCALE = /\b1\s*:\s*(\d{2,4})\b/;
const AREA_IMPERIAL = /(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(?:S\.?\s?F\.?|SQ\.?\s*FT\.?|SQ\.?\s*F\.?|SQUARE\s+FEET|FT²|FT2)(?![A-Z])/i;
const AREA_METRIC = /(\d+(?:[.,]\d+)?)\s*(?:m²|m2|sq\.?\s*m|M²|M2)(?![A-Z0-9])/;

const evalFrac = (s) => {
  s = s.trim();
  const mixed = /^(\d+)\s+(\d+)\s*\/\s*(\d+)$/.exec(s);
  if (mixed) return +mixed[1] + mixed[2] / mixed[3];
  const f = /^(\d+)\s*\/\s*(\d+)$/.exec(s);
  if (f) return f[1] / f[2];
  return parseFloat(s);
};

const files = fs.readdirSync(CORPUS).filter((f) => f.toLowerCase().endsWith('.pdf')).sort();
const profile = [];
for (const file of files) {
  const t0 = Date.now();
  const entry = { file, pages: [], error: null };
  try {
    const data = new Uint8Array(fs.readFileSync(path.join(CORPUS, file)));
    const doc = await getDocument({ data, useSystemFonts: true, isEvalSupported: false, verbosity: 0 }).promise;
    entry.numPages = doc.numPages;
    entry.fingerprint = doc.fingerprints[0];
    for (let n = 1; n <= Math.min(doc.numPages, MAX_PAGES); n++) {
      const page = await doc.getPage(n);
      const vp = page.getViewport({ scale: 1 });
      const tc = await page.getTextContent();
      const items = tc.items.map((it) => {
        const [x, y] = vp.convertToViewportPoint(it.transform[4], it.transform[5]);
        const h = Math.hypot(it.transform[2], it.transform[3]) || it.height || 6;
        // top-left of the run in page space (baseline → top)
        return { str: it.str, x, y: y - h, w: it.width, h };
      });
      const ls = lines(items);
      const scales = [];
      const areas = [];
      for (const l of ls) {
        const mi = IMPERIAL_SCALE.exec(l.str);
        if (mi) {
          const inchesPerFoot = evalFrac(mi[1]);
          if (inchesPerFoot > 0 && inchesPerFoot <= 6) scales.push({ ratio: 12 / inchesPerFoot, text: l.str.slice(0, 80), x: l.x, y: l.y });
        }
        const mm = METRIC_SCALE.exec(l.str);
        if (mm && !/\d\s*:\s*\d{2,4}\s*:/.test(l.str)) {
          const r = parseInt(mm[1], 10);
          if (r >= 10 && r <= 2500) scales.push({ ratio: r, text: l.str.slice(0, 80), x: l.x, y: l.y });
        }
        const ai = AREA_IMPERIAL.exec(l.str);
        if (ai) {
          const sf = parseFloat(ai[1].replace(/,/g, ''));
          if (sf >= 10 && sf <= 50000) areas.push({ unit: 'sf', value: sf, m2: sf * 0.09290304, text: l.str.slice(0, 80), x: l.x, y: l.y, w: l.w, h: l.h });
        }
        const am = AREA_METRIC.exec(l.str);
        if (am) {
          const m2 = parseFloat(am[1].replace(',', '.'));
          if (m2 >= 1 && m2 <= 5000) areas.push({ unit: 'm2', value: m2, m2, text: l.str.slice(0, 80), x: l.x, y: l.y, w: l.w, h: l.h });
        }
      }
      entry.pages.push({
        n,
        w: vp.width,
        h: vp.height,
        rotate: page.rotate,
        textItems: tc.items.length,
        scanned: tc.items.length < 5,
        scales,
        areas,
      });
      page.cleanup();
    }
    await doc.destroy();
  } catch (e) {
    entry.error = String(e?.message ?? e);
  }
  entry.ms = Date.now() - t0;
  const nAreas = entry.pages.reduce((s, p) => s + p.areas.length, 0);
  const nScales = entry.pages.reduce((s, p) => s + p.scales.length, 0);
  console.log(`${file.padEnd(40)} pages ${String(entry.numPages ?? '?').padStart(3)}  scanned ${entry.pages.filter((p) => p.scanned).length}  scales ${nScales}  areas ${nAreas}  ${entry.ms}ms${entry.error ? '  ERROR ' + entry.error : ''}`);
  profile.push(entry);
}
fs.writeFileSync(path.join(CORPUS, 'profile.json'), JSON.stringify(profile, null, 1));
console.log(`\nwrote ${path.join(CORPUS, 'profile.json')}`);
