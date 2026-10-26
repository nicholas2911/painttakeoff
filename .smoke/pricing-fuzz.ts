/* Randomized pricing-math checks: thousands of random price books and
 * random projects pushed through the real quote code (app/src/quote).
 * Prices are anyone's call — this only proves the WIRING: every total is
 * the sum of its parts, every grouping adds back to the grand total,
 * cost → price follows the margin, and nothing goes NaN / Infinity.
 *   node pricing-fuzz.mjs [iterations] [seed] */

const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() {
    return store.size;
  },
};

import { computeQuote, computeGroups, pageTotals, priceAddOn, ADD_ON_SOURCES, type QuotePageInput } from '../app/src/quote/quote';
import { ONTARIO_DEFAULTS, type PriceBook } from '../app/src/quote/priceBook';
import { invoiceMath, type InvoiceDraft } from '../app/src/invoice/invoiceModel';
import { formatImperial, formatLength, parseLengthToMeters } from '../app/src/measure/units';
import type { Measurement } from '../app/src/measure/measureStore';

const N = parseInt(process.argv[2] ?? '5000', 10);
let seed = parseInt(process.argv[3] ?? '20261024', 10);
// mulberry32 — reproducible: a failure prints the iteration to replay.
const rnd = () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const between = (a: number, b: number) => a + rnd() * (b - a);
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)];
const maybe = (p: number) => rnd() < p;
/** Mostly realistic, sometimes 0 (the edge a typo creates). */
const rate = (lo: number, hi: number) => (maybe(0.05) ? 0 : between(lo, hi));

const failures = new Map<string, { count: number; example: string }>();
let checks = 0;
const fail = (name: string, detail: string) => {
  const f = failures.get(name);
  if (f) f.count++;
  else failures.set(name, { count: 1, example: detail });
};
const close = (a: number, b: number) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));
const expectClose = (name: string, a: number, b: number, ctx: string) => {
  checks++;
  if (!close(a, b)) fail(name, `${ctx}: ${a} vs ${b}`);
};
const expect = (name: string, ok: boolean, ctx: string) => {
  checks++;
  if (!ok) fail(name, ctx);
};
const allFinite = (o: unknown, path = ''): string | null => {
  if (typeof o === 'number') return Number.isFinite(o) ? null : `${path}=${o}`;
  if (o && typeof o === 'object') {
    for (const [k, v] of Object.entries(o)) {
      const bad = allFinite(v, `${path}.${k}`);
      if (bad) return bad;
    }
  }
  return null;
};

const randomPriceBook = (): PriceBook => ({
  ...ONTARIO_DEFAULTS,
  labourRate: rate(20, 120),
  production: { cutRoll: rate(80, 400), rollOnly: rate(100, 600), spray: rate(300, 1500), textured: rate(50, 250) },
  wallMethod: pick(['cutRoll', 'rollOnly', 'spray', 'textured'] as const),
  secondCoatFactor: between(0, 1),
  prepShare: between(0, 0.8),
  coverage: { smooth: rate(250, 450), textured: rate(150, 350), primer: rate(200, 400) },
  coverageChoice: pick(['smooth', 'textured', 'primer'] as const),
  paintPrice: { contractor: rate(15, 50), mid: rate(30, 80), premium: rate(50, 140) },
  paintGrade: pick(['contractor', 'mid', 'premium'] as const),
  coats: pick([0, 1, 1.4, 2, 2, 3, 4]),
  wasteRolled: between(0, 0.3),
  wasteSprayed: between(0, 0.5),
  heavyPrep: maybe(0.4),
  heavyPrepAdder: rate(0.2, 4),
  highCeiling: maybe(0.3),
  highCeilingAdder: between(0, 0.8),
  trimRate: rate(0.5, 8),
  margin: maybe(0.1) ? 0 : between(0, 1.2),
  wallPricingMode: maybe(0.25) ? 'simple' : 'detailed',
  simpleWallRate: rate(0.5, 8),
});

let idn = 0;
const id = () => `m${++idn}`;
const randomPage = (pageNum: number): QuotePageInput => {
  const items: Measurement[] = [];
  const nWalls = Math.floor(between(0, 6));
  for (let i = 0; i < nWalls; i++)
    items.push({
      id: id(), kind: 'length', purpose: 'wall', label: `Wall ${i + 1}`, points: [],
      totalMeters: maybe(0.05) ? 0 : between(0.3, 40),
      ...(maybe(0.7) ? { wallHeightM: between(2, 6) } : {}),
      createdAt: 0,
    } as Measurement);
  for (let i = 0; i < Math.floor(between(0, 3)); i++)
    items.push({ id: id(), kind: 'length', purpose: 'trim', label: `Trim ${i + 1}`, points: [], totalMeters: between(0, 60), createdAt: 0 } as Measurement);
  for (let i = 0; i < Math.floor(between(0, 3)); i++)
    items.push({ id: id(), kind: 'ceiling', label: `Ceiling ${i + 1}`, points: [], areaM2: between(0, 200), perimeterM: between(0, 60), createdAt: 0 } as Measurement);
  for (let i = 0; i < Math.floor(between(0, 3)); i++)
    items.push({
      id: id(), kind: 'area', label: `Room ${i + 1}`, floorAreaM2: between(2, 120), perimeterM: between(6, 50),
      wallHeightM: between(2, 5), wallAreaM2: 0, cutouts: [], createdAt: 0,
    } as Measurement);
  // Openings: assigned to a random wall/room, or page-level; sometimes far
  // bigger than what they're cut from (forces the clamp paths).
  const hosts = items.filter((m) => (m.kind === 'length' && m.purpose === 'wall') || m.kind === 'area');
  for (let i = 0; i < Math.floor(between(0, 5)); i++)
    items.push({
      id: id(), kind: 'opening', label: `D${i + 1}`, openType: pick(['door', 'window', 'slider'] as const), point: { x: 0, y: 0 },
      sfM2: maybe(0.1) ? between(50, 400) : between(0.5, 4),
      assignedTo: hosts.length && maybe(0.6) ? pick(hosts).id : null,
      createdAt: 0,
    } as Measurement);
  return { pageNum, items, defaultHeightM: between(2, 5), deduct: maybe(0.8) };
};

for (let iter = 0; iter < N; iter++) {
  const pb = randomPriceBook();
  const pages = Array.from({ length: Math.floor(between(1, 5)) }, (_, i) => randomPage(i + 1));
  const ctx = `iter ${iter}`;

  // Same aggregation the app does (App.tsx): sum page totals, then price.
  const totals = pages
    .map((p) => pageTotals(p.items, p.defaultHeightM, p.deduct))
    .reduce((a, t) => ({
      wallsGrossM2: a.wallsGrossM2 + t.wallsGrossM2,
      openingsM2: a.openingsM2 + t.openingsM2,
      netWallM2: a.netWallM2 + t.netWallM2,
      trimM: a.trimM + t.trimM,
      ceilingM2: a.ceilingM2 + t.ceilingM2,
      floorM2: a.floorM2 + t.floorM2,
      roomWallsGrossM2: a.roomWallsGrossM2 + t.roomWallsGrossM2,
    }));
  const q = computeQuote(totals, pb);

  const bad = allFinite(q);
  expect('quote has no NaN/Infinity', bad === null, `${ctx} ${bad}`);
  expect('net wall area never negative', q.netWallSF >= 0, `${ctx} ${q.netWallSF}`);

  const m = 1 + pb.margin;
  expectClose('total price = Σ category prices + heavy prep × margin',
    q.totalPrice, q.walls.price + q.ceilings.price + q.trim.price + q.heavyPrepCost * m, ctx);
  expectClose('total cost = Σ category costs + heavy prep', q.totalCost, q.walls.cost + q.ceilings.cost + q.trim.cost + q.heavyPrepCost, ctx);
  expectClose('total gallons = walls + ceilings', q.totalGallons, q.walls.gallons + q.ceilings.gallons, ctx);
  expectClose('heavy prep = net SF × adder (when on)', q.heavyPrepCost, pb.heavyPrep ? q.netWallSF * pb.heavyPrepAdder : 0, ctx);

  for (const [name, c] of [['walls', q.walls], ['ceilings', q.ceilings], ['trim', q.trim]] as const) {
    expect(`${name}: no negative quantities`, c.qty >= -1e-9 && c.gallons >= -1e-9 && c.hours >= -1e-9, `${ctx} ${JSON.stringify(c)}`);
    if (name === 'walls' && pb.wallPricingMode === 'simple') {
      expectClose('simple walls = net SF × all-in rate', c.price, c.qty * pb.simpleWallRate, ctx);
      continue;
    }
    expectClose(`${name}: price = cost × (1 + margin)`, c.price, c.cost * m, ctx);
    expectClose(`${name}: cost = labour + materials`, c.cost, c.labourCost + c.materialCost, ctx);
    if (name !== 'trim') {
      expectClose(`${name}: labour = hours × rate`, c.labourCost, c.hours * pb.labourRate, ctx);
      expectClose(`${name}: materials = gallons × paint price`, c.materialCost, c.gallons * pb.paintPrice[pb.paintGrade], ctx);
    } else {
      expectClose('trim: cost = LF × trim rate', c.cost, c.qty * pb.trimRate, ctx);
    }
  }

  // Every breakdown adds back to the same grand total.
  for (const g of ['project', 'room', 'page'] as const) {
    const groups = computeGroups(pages, pb, g);
    expect(`${g} groups: no NaN/Infinity`, allFinite(groups) === null, `${ctx} ${allFinite(groups)}`);
    expectClose(`${g} groups sum to total price`, groups.reduce((s, x) => s + x.totalPrice, 0), q.totalPrice, ctx);
    expectClose(`${g} groups sum to total cost`, groups.reduce((s, x) => s + x.totalCost, 0), q.totalCost, ctx);
  }

  // More labour per hour never makes the job cheaper.
  const pricier = computeQuote(totals, { ...pb, labourRate: pb.labourRate + 10 });
  expect('higher labour rate never lowers the price', pricier.totalPrice >= q.totalPrice - 1e-9, ctx);

  // Add-ons: flat is the dollar amount; everything else is cost × margin.
  for (const [source] of ADD_ON_SOURCES) {
    const qty = between(0, 50);
    const a = priceAddOn({ id: 'a', label: 'x', source, qty }, pb);
    expect('add-on finite', Number.isFinite(a.cost) && Number.isFinite(a.price), `${ctx} ${source}`);
    if (source === 'flat') expectClose('flat add-on price = amount', a.price, qty, `${ctx}`);
    else expectClose(`add-on (${source}) price = cost × (1 + margin)`, a.price, a.cost * m, ctx);
  }

  // Invoice: printed parts always add up to the printed total.
  const lines = Array.from({ length: Math.floor(between(1, 8)) }, () => ({ description: 'x', qty: '', amount: Math.round(between(0, 5000) * 100) / 100 }));
  const taxRows = Array.from({ length: Math.floor(between(0, 3)) }, (_, i) => ({ label: `T${i}`, rate: pick([0.05, 0.07, 0.08, 0.13, 0.15, between(0, 0.2)]), on: maybe(0.85) }));
  const inv = invoiceMath({ lines, taxRows, subtotalOverride: null, totalOverride: null } as unknown as InvoiceDraft);
  const cents = (x: number) => Math.round(x * 100) / 100;
  expect('invoice taxes are whole cents', inv.taxAmounts.every((t) => close(t.amount, cents(t.amount))), ctx);
  expectClose('invoice total = subtotal + printed taxes', inv.total, cents(inv.subtotal + inv.taxAmounts.reduce((s, t) => s + t.amount, 0)), ctx);
  expectClose('invoice subtotal = Σ lines', inv.subtotal, lines.reduce((s, l) => s + l.amount, 0), ctx);
}

// Length text round-trips: what the app shows parses back to the same length.
for (let i = 0; i < N; i++) {
  const meters = between(0, 120);
  const imp = parseLengthToMeters(formatImperial(meters), 'imperial');
  expect('imperial text round-trips within 1/16"', imp !== null && Math.abs(imp - meters) <= 0.0254 / 16 + 1e-12, `${meters} → ${formatImperial(meters)} → ${imp}`);
  const met = parseLengthToMeters(formatLength(meters, 'metric'), 'metric');
  expect('metric text round-trips within 0.5 mm', met !== null && Math.abs(met - meters) <= 0.0005 + 1e-12, `${meters} → ${formatLength(meters, 'metric')} → ${met}`);
}

console.log(`${checks.toLocaleString()} checks over ${N.toLocaleString()} random projects`);
for (const [name, f] of failures) console.log(`FAIL  ${name}  ×${f.count}  e.g. ${f.example}`);
console.log('errors:', failures.size ? [...failures.keys()] : 'none');
process.exit(failures.size ? 1 : 0);
