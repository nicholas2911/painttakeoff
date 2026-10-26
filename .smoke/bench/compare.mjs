/* Compare benchmark runs fairly.
 *   node bench/compare.mjs v083 seal current
 * "Trusted" pages = written scale is right (the v0.8.3 baseline's rooms on
 * that page average within ±25% of printed, 3+ rooms, no scale snapping) —
 * the only labels where engines are compared on the same ruler. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CORPUS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../sample-plans/corpus');
const engines = process.argv.slice(2);
if (engines.length < 2) {
  console.log('usage: node bench/compare.mjs <baseline> <engine> [engine…]');
  process.exit(1);
}
const load = (e) => JSON.parse(fs.readFileSync(path.join(CORPUS, `bench-results-${e}.json`), 'utf8'));
const runs = Object.fromEntries(engines.map((e) => [e, load(e)]));
const base = runs[engines[0]];
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[(s.length / 2) | 0] : NaN; };
const snapped = (r) => String(r.scaleSource).startsWith('snapped');

const ks = new Map();
for (const r of base)
  if (r.ok && !snapped(r)) {
    const key = `${r.file}|${r.page}`;
    if (!ks.has(key)) ks.set(key, []);
    ks.get(key).push(Math.sqrt(r.floorAreaM2 / r.truthM2));
  }
const trusted = new Set([...ks].filter(([, v]) => v.length >= 3 && median(v) > 0.8 && median(v) < 1.25).map(([k]) => k));
const idx = base.map((_, i) => i).filter((i) => trusted.has(`${base[i].file}|${base[i].page}`) && engines.every((e) => !snapped(runs[e][i])));

const fmt = (rs) => {
  const ok = rs.filter((r) => r.ok);
  const w = (t) => ok.filter((r) => Math.abs(r.dev) <= t).length;
  return `found ${String(ok.length).padStart(3)}  ≤10% ${String(w(0.1)).padStart(3)}  ≤25% ${String(w(0.25)).padStart(3)}  median miss ${(median(ok.map((r) => Math.abs(r.dev))) * 100).toFixed(1).padStart(5)}%  bias ${(median(ok.map((r) => r.dev)) * 100).toFixed(1).padStart(6)}%  click ${median(ok.map((r) => r.tFill)).toFixed(0)} ms`;
};
console.log(`trusted pages: ${[...trusted].map((k) => k.replace('|', ' p')).join(', ')}\n`);
console.log(`ALL ${base.length} labels`);
for (const e of engines) console.log(`  ${e.padEnd(9)} ${fmt(runs[e])}`);
console.log(`\nTRUSTED ${idx.length} labels`);
for (const e of engines) console.log(`  ${e.padEnd(9)} ${fmt(idx.map((i) => runs[e][i]))}`);
for (const e of engines.slice(1)) {
  let better = 0, worse = 0, lost = 0, gained = 0;
  for (const i of idx) {
    const a = base[i], b = runs[e][i];
    if (a.ok && b.ok) {
      if (Math.abs(b.dev) < Math.abs(a.dev) - 0.03) better++;
      else if (Math.abs(b.dev) > Math.abs(a.dev) + 0.03) worse++;
    }
    if (a.ok && !b.ok) lost++;
    if (!a.ok && b.ok) gained++;
  }
  console.log(`\n${e} vs ${engines[0]} on trusted: better ${better}, worse ${worse} (±3 pts), found only by ${engines[0]} ${lost}, only by ${e} ${gained}`);
}
