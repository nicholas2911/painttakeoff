/* v0.8.2 audit fixes — pure-logic checks (no browser).
 * Bundled with esbuild and run in node:
 *   node audit-fixes-unit.mjs   (wrapper builds + runs this file)
 * Covers: fraction parsing, dimension pre-fill, invoice tax rounding and
 * numbering, zero rates, partial-room floor metric, ceilings narrative,
 * project delete with a same-PDF sibling. */

// ---- minimal browser shims ----
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
process.on('unhandledRejection', () => {}); // deletePdfBytes → no IndexedDB in node

import { parseMixedNumber, parseLengthToMeters } from '../app/src/measure/units';
import { invoiceMath, commitInvoiceNumber, peekInvoiceNumber, type InvoiceDraft } from '../app/src/invoice/invoiceModel';
import { computeQuote, explainQuote, pageTotals } from '../app/src/quote/quote';
import { ONTARIO_DEFAULTS, type PriceBook } from '../app/src/quote/priceBook';
import { deleteProject, saveProjects, loadProjects, type ProjectMeta } from '../app/src/pdf/projectStore';

const errors: string[] = [];
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) errors.push(name);
};
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps;

// ---- fractions: "15/16" is 0.9375, not 1 + 5/16 ----
check('15/16 → 0.9375', near(parseMixedNumber('15/16')!, 0.9375), String(parseMixedNumber('15/16')));
check('11/16 → 0.6875', near(parseMixedNumber('11/16')!, 0.6875));
check('6 1/2 → 6.5', near(parseMixedNumber('6 1/2')!, 6.5));
check('6-1/2 → 6.5', near(parseMixedNumber('6-1/2')!, 6.5));
check('6+1/2 → 6.5', near(parseMixedNumber('6+1/2')!, 6.5));
check('1/2 → 0.5', near(parseMixedNumber('1/2')!, 0.5));
check('7.25 → 7.25', near(parseMixedNumber('7.25')!, 7.25));

// ---- dimension pre-fill split (same formula as Modals.tsx) ----
let badPrefill = 0;
for (let ft = 1; ft <= 100; ft++) {
  for (const inch of [0, 0.125, 6, 11.875]) {
    const m = (ft * 12 + inch) * 0.0254;
    const eighths = Math.round((m / 0.0254) * 8);
    const f = Math.floor(eighths / 96);
    const i = (eighths % 96) / 8;
    if (f !== ft || i !== inch) badPrefill++;
  }
}
check('dimension pre-fill exact for 1–100 ft (400 cases)', badPrefill === 0, `${badPrefill} wrong`);

// ---- invoice: tax rows rounded so printed parts add up ----
const draft: InvoiceDraft = {
  invoiceNumber: 'INV-0001',
  date: '2026-10-17',
  dueDate: '2026-11-16',
  fromCompany: '',
  projectName: '',
  lines: [{ description: 'x', qty: '', amount: 100.06 }],
  taxRows: [
    { label: 'GST', rate: 0.05, on: true },
    { label: 'PST', rate: 0.08, on: true },
  ],
  notes: '',
  subtotalOverride: null,
  totalOverride: null,
} as InvoiceDraft;
const im = invoiceMath(draft);
const printedSum = Math.round((im.subtotal + im.taxAmounts.reduce((s, t) => s + t.amount, 0)) * 100) / 100;
check('tax rows rounded to cents', im.taxAmounts.every((t) => near(t.amount, Math.round(t.amount * 100) / 100)));
check('printed parts sum to total', near(printedSum, im.total), `${printedSum} vs ${im.total}`);

// ---- invoice numbering ----
store.clear();
const n1 = peekInvoiceNumber();
commitInvoiceNumber(n1);
const n2 = peekInvoiceNumber();
check('reserved number moves the next one on', n1 === 'INV-0001' && n2 === 'INV-0002', `${n1}, ${n2}`);
commitInvoiceNumber('2026-001');
check('hand-typed "2026-001" does not jump the counter', peekInvoiceNumber() === 'INV-0002', peekInvoiceNumber());
commitInvoiceNumber(n1);
check('re-committing the same number is a no-op', peekInvoiceNumber() === 'INV-0002');

// ---- quote: zero production / coverage never gives Infinity ----
const totals = pageTotals(
  [{ id: 'w', kind: 'length', purpose: 'wall', label: 'W', points: [], totalMeters: 10, wallHeightM: 2.44, createdAt: 0 } as any],
  2.44,
  true,
);
const zeroPb: PriceBook = {
  ...ONTARIO_DEFAULTS,
  production: { ...ONTARIO_DEFAULTS.production, [ONTARIO_DEFAULTS.wallMethod]: 0 },
  coverage: { ...ONTARIO_DEFAULTS.coverage, [ONTARIO_DEFAULTS.coverageChoice]: 0 },
};
const qz = computeQuote(totals, zeroPb);
const finite = [qz.totalPrice, qz.totalHours, qz.totalGallons, qz.walls.price].every(Number.isFinite);
check('zero rates → finite totals (no $∞)', finite, `price ${qz.totalPrice}`);

// ---- floor metric: partial rooms fall back to wall ÷ 3 ----
const room = { id: 'r', kind: 'area', label: 'R', perimeterM: 12, wallHeightM: 2.44, floorAreaM2: 9, createdAt: 0 } as any;
const wall = { id: 'w2', kind: 'length', purpose: 'wall', label: 'W', points: [], totalMeters: 60, wallHeightM: 2.44, createdAt: 0 } as any;
const partial = computeQuote(pageTotals([room, wall], 2.44, true), ONTARIO_DEFAULTS);
check('partial rooms → wall ÷ 3 floor estimate', /only some rooms/.test(partial.cross.floorAssumption), partial.cross.floorAssumption);
const full = computeQuote(pageTotals([room], 2.44, true), ONTARIO_DEFAULTS);
check('all walls are rooms → measured floor', /measured room floor/.test(full.cross.floorAssumption), full.cross.floorAssumption);

// ---- ceilings narrative includes waste and matches gallons ----
const ceil = { id: 'c', kind: 'ceiling', label: 'C', points: [], areaM2: 92.903, perimeterM: 40, createdAt: 0 } as any;
const qc = computeQuote(pageTotals([ceil], 2.44, true), ONTARIO_DEFAULTS);
const ceilLine = explainQuote(qc, ONTARIO_DEFAULTS).find((l) => l.startsWith('Ceilings:')) ?? '';
const pb = ONTARIO_DEFAULTS;
const recomputed = (Math.round(qc.ceilings.qty) * Math.max(1, Math.round(pb.coats)) / pb.coverage[pb.coverageChoice]) * (1 + pb.wasteRolled);
check('ceilings narrative shows waste factor', /waste factor/.test(ceilLine), ceilLine.slice(0, 90));
check('narrative math matches shown gallons', near(+recomputed.toFixed(1), +qc.ceilings.gallons.toFixed(1), 0.11), `${recomputed.toFixed(1)} vs ${qc.ceilings.gallons.toFixed(1)}`);

// ---- deleting a project keeps a same-PDF sibling's data ----
store.clear();
const meta = (id: string): ProjectMeta => ({ id, name: id, company: '', notes: '', fingerprint: 'FP', pages: [0], numPages: 1, createdAt: 0, modifiedAt: 0 });
saveProjects([meta('A'), meta('B')]);
localStorage.setItem('pt:v1:measure:FP:1', '[1]');
localStorage.setItem('pt:v1:scale:FP:1', '{}');
localStorage.setItem('pt:v1:pageprops:FP', '{}');
localStorage.setItem('pt:v1:addons:A', '[]');
deleteProject('A');
check('sibling keeps measurements after delete', localStorage.getItem('pt:v1:measure:FP:1') === '[1]');
check("deleted project's own rows removed", localStorage.getItem('pt:v1:addons:A') === null);
deleteProject('B');
check('last project delete wipes PDF data', localStorage.getItem('pt:v1:measure:FP:1') === null && localStorage.getItem('pt:v1:scale:FP:1') === null);
check('last project delete wipes page props', localStorage.getItem('pt:v1:pageprops:FP') === null);
check('no projects left', loadProjects().length === 0);

console.log('errors:', errors.length ? errors : 'none');
process.exit(errors.length ? 1 : 0);
