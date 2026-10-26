/* Quick Area CPU + identity test on real page rasters (bench/dump.mjs).
 *  - times every stage of the frozen reference engine (bench/ref/)
 *  - times the app's engine (app/src/measure) per click
 *  - requires PIXEL-IDENTICAL output (room area, barriers, seal) for every click
 * Run: node bench/perf.mjs */
import fs from 'node:fs';
import path from 'node:path';
import * as ref from './ref/floodfill';
import { fillRoomAt as refFill } from './ref/quickArea';
import { fillRoomAt as appFill, prepareRoomFinder } from '../../app/src/measure/quickArea';

const DIR = path.resolve(process.cwd(), '../sample-plans/corpus/rasters');
const index = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8'));
const now = () => performance.now();
const same = (a?: Uint8Array, b?: Uint8Array) => {
  if (!a || !b || a.length !== b.length) return a === b;
  for (let i = 0; i < a.length; i++) if (!a[i] !== !b[i]) return false;
  return true;
};

const stages: Record<string, number> = {};
const time = <T>(name: string, f: () => T): T => {
  const t = now();
  const r = f();
  stages[name] = (stages[name] ?? 0) + now() - t;
  return r;
};

let refTotal = 0, appTotal = 0, appFirst = 0, clicks = 0, mismatches = 0;
for (const page of index) {
  const data = new Uint8ClampedArray(fs.readFileSync(path.join(DIR, page.raster)));
  const img = { data, width: page.w, height: page.h, colorSpace: 'srgb' } as ImageData;
  const { w, h } = page;
  // Stage profile of the reference pipeline (first click's work, per page).
  const raw = time('barrierMap', () => ref.barrierMap(img, 0));
  const { cleaned } = time('cleanBarrierMap', () => ref.cleanBarrierMap(raw, w, h));
  time('dilate 2 (barrier)', () => ref.dilateMask(cleaned, w, h, 2));
  time('dilate D (seal, ~10–24)', () => ref.dilateMask(cleaned, w, h, 16));
  const m = time('floodFill', () => ref.floodFillFromBarrier(ref.dilateMask(cleaned, w, h, 2), w, h, page.clicks[0].x, page.clicks[0].y));
  if (m) {
    time('growWithin D', () => ref.growWithin(m.data, cleaned, w, h, 16));
    time('interiorPockets', () => ref.interiorPockets(m.data, ref.dilateMask(cleaned, w, h, 2), w, h));
  }
  time('bigBarrierMask', () => ref.bigBarrierMask(cleaned, w, h));

  const finder = prepareRoomFinder(img);
  for (const [k, c] of page.clicks.entries()) {
    let t = now();
    const a = refFill(img, c.x, c.y, page.pointsPerPixel, c.pointsPerMeter);
    refTotal += now() - t;
    t = now();
    const b = k === 0 ? appFill(img, c.x, c.y, page.pointsPerPixel, c.pointsPerMeter) : finder.fillAt(c.x, c.y, page.pointsPerPixel, c.pointsPerMeter);
    const dt = now() - t;
    appTotal += dt;
    if (k === 0) appFirst += dt;
    clicks++;
    const ok =
      (!a && !b) ||
      (!!a && !!b && a.sealPx === b.sealPx && same(a.area.data, b.area.data) && same(a.barrier, b.barrier) && same(a.bigBarrier, b.bigBarrier) && same(a.cleaned, b.cleaned));
    if (!ok) {
      mismatches++;
      console.log(`MISMATCH ${page.raster} click ${k} (${c.label}): ref ${a ? `seal ${a.sealPx}` : 'null'} vs app ${b ? `seal ${b.sealPx}` : 'null'}`);
    }
  }
}

console.log('\nReference engine — time per page by stage (ms):');
for (const [k, v] of Object.entries(stages).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(26)} ${(v / index.length).toFixed(0).padStart(6)}`);
console.log(`\nper click: reference ${(refTotal / clicks).toFixed(0)} ms · app ${(appTotal / clicks).toFixed(0)} ms (first click on a page ${(appFirst / index.length).toFixed(0)} ms)`);
console.log(`${clicks} clicks on ${index.length} pages · ${mismatches} mismatches`);
console.log('errors:', mismatches ? [`${mismatches} clicks differ from the reference`] : 'none');
process.exit(mismatches ? 1 : 0);
