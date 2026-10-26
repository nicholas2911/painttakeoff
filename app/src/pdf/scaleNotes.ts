import { Util } from 'pdfjs-dist';
import type { PDFPageProxy } from 'pdfjs-dist';

/**
 * Read the drawing scale written on a sheet ("1/4" = 1'-0"", "SCALE 1:100",
 * "1:100 @ A1") so the app can offer it with one click instead of the user
 * hunting through Common scales. Only a suggestion: the user still applies
 * it and the double-check still runs.
 *
 * The "@ A1" trap: a note written for A1 paper on a PDF saved at A3 is really
 * twice the ratio (1:100 @ A1 → 1:200 on this page). When the note names a
 * paper size and the PDF is a different one, the suggestion is corrected.
 */

export interface ScaleSuggestion {
  /** Drawing ratio to apply on THIS page (1:ratio). */
  ratio: number;
  /** The note as written, e.g. `1/4" = 1'-0"` or `1:100 @ A1`. */
  note: string;
  /** How many notes on the sheet agree. */
  count: number;
  /** Set when the note was written for another paper size. */
  paper?: { noted: string; actual: string; notedRatio: number };
}

interface Line {
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

// Paper sizes in points (long × short side). ISO A, US ARCH and ANSI.
const PAPERS: [string, number, number][] = [
  ['A0', 3370, 2384], ['A1', 2384, 1684], ['A2', 1684, 1191], ['A3', 1191, 842], ['A4', 842, 595],
  ['ARCH E', 3456, 2592], ['ARCH D', 2592, 1728], ['ARCH C', 1728, 1296], ['ARCH B', 1296, 864],
  ['ANSI E', 3168, 2448], ['ANSI D', 2448, 1584], ['ANSI C', 1584, 1224], ['TABLOID', 1224, 792], ['LETTER', 792, 612],
];

/** Which named paper this page is (within 4%), or null. */
export function paperOf(wPt: number, hPt: number): string | null {
  const long = Math.max(wPt, hPt);
  const short = Math.min(wPt, hPt);
  for (const [name, l, s] of PAPERS) if (Math.abs(long - l) / l < 0.04 && Math.abs(short - s) / s < 0.04) return name;
  return null;
}

const FRAC = String.raw`(\d+\s+\d+\s*\/\s*\d+|\d+\s*\/\s*\d+|\d+(?:\.\d+)?)`;
const IMPERIAL = new RegExp(String.raw`${FRAC}\s*(?:"|”|″|''|in\.?)\s*=\s*1\s*(?:'|’|′|ft\.?)\s*(?:-?\s*0\s*(?:"|”|″|'')?)?`, 'i');
const METRIC = /\b1\s*:\s*(\d{2,4})\b/;
const AT_PAPER = /(?:@|\bAT\b)\s*(A[0-4]|ARCH\s*[B-E]|ANSI\s*[C-E])\b/i;

function fraction(s: string): number {
  const t = s.trim();
  const mixed = /^(\d+)\s+(\d+)\s*\/\s*(\d+)$/.exec(t);
  if (mixed) return +mixed[1] + +mixed[2] / +mixed[3];
  const f = /^(\d+)\s*\/\s*(\d+)$/.exec(t);
  if (f) return +f[1] / +f[2];
  return parseFloat(t);
}

/** Floor plans aren't drawn at detail scales; ignore 1-1/2" = 1'-0" etc. */
const PLAN_MIN_RATIO = 16;

/**
 * Pick the sheet's plan scale from its text lines (page space, scale 1).
 * Pure, so it's unit-tested without a PDF.
 */
export function scaleFromLines(lines: Line[], pageW: number, pageH: number): ScaleSuggestion | null {
  const found: { ratio: number; note: string; paper?: string }[] = [];
  for (const l of lines) {
    const imp = IMPERIAL.exec(l.str);
    if (imp) {
      const inchesPerFoot = fraction(imp[1]);
      if (inchesPerFoot > 0 && inchesPerFoot <= 6) found.push({ ratio: 12 / inchesPerFoot, note: imp[0].trim() });
      continue;
    }
    const met = METRIC.exec(l.str);
    if (met && !/\d\s*:\s*\d{2,4}\s*:/.test(l.str)) {
      const ratio = parseInt(met[1], 10);
      if (ratio >= 10 && ratio <= 2500) {
        const paper = AT_PAPER.exec(l.str)?.[1]?.toUpperCase().replace(/\s+/, ' ');
        found.push({ ratio, note: (paper ? `1:${ratio} @ ${paper}` : `1:${ratio}`), paper });
      }
    }
  }
  let plan = found.filter((f) => f.ratio >= PLAN_MIN_RATIO);
  if (!plan.length) return null;
  // A note that names THIS PDF's paper size ("1:200 @ A3" on an A3 sheet) is
  // the authoritative one — it outranks per-drawing labels repeated more often
  // ("Scale 1:100" under each reduced drawing).
  const actual = paperOf(pageW, pageH);
  const matching = plan.filter((f) => f.paper && f.paper === actual);
  if (matching.length) plan = matching;
  // The most common plan scale on the sheet (title blocks repeat it; details
  // differ and are filtered or outvoted).
  const tally = new Map<number, { n: number; f: (typeof plan)[number] }>();
  for (const f of plan) {
    const t = tally.get(f.ratio);
    if (t) {
      t.n++;
      if (!t.f.paper && f.paper) t.f = f;
    } else tally.set(f.ratio, { n: 1, f });
  }
  const best = [...tally.values()].sort((a, b) => b.n - a.n || a.f.ratio - b.f.ratio)[0];
  const out: ScaleSuggestion = { ratio: best.f.ratio, note: best.f.note, count: best.n };
  const noted = best.f.paper ? PAPERS.find(([name]) => name === best.f.paper) : undefined;
  if (noted && actual && noted[0] !== actual) {
    const here = PAPERS.find(([name]) => name === actual)!;
    out.ratio = Math.round((best.f.ratio * noted[1]) / here[1]);
    out.paper = { noted: noted[0], actual, notedRatio: best.f.ratio };
  }
  return out;
}

/** Text runs on one line that sit close together, merged ("1:100" "@ A1"). */
function mergeLines(items: Line[]): Line[] {
  const toks = items.filter((t) => t.str.trim()).sort((a, b) => a.y - b.y || a.x - b.x);
  const out: Line[] = [];
  for (const t of toks) {
    const last = out[out.length - 1];
    const h = last ? Math.max(last.h, t.h) : t.h;
    if (last && Math.abs(last.y - t.y) < 0.6 * h && t.x >= last.x && t.x - (last.x + last.w) < 1.6 * h) {
      last.str += (t.x - (last.x + last.w) > 0.15 * t.h ? ' ' : '') + t.str;
      last.w = t.x + t.w - last.x;
      last.h = h;
    } else out.push({ ...t });
  }
  return out;
}

/** The sheet's written plan scale, or null (scans, no note, NTS sheets). */
export async function readScaleNote(page: PDFPageProxy): Promise<ScaleSuggestion | null> {
  let tc;
  try {
    tc = await page.getTextContent();
  } catch {
    return null;
  }
  const vp = page.getViewport({ scale: 1 });
  const items: Line[] = [];
  for (const it of tc.items) {
    if (!('str' in it) || !it.str.trim()) continue;
    const t = Util.transform(vp.transform, it.transform);
    const h = Math.hypot(t[2], t[3]) || 6;
    items.push({ str: it.str, x: t[4], y: t[5] - h, w: it.width, h });
  }
  return scaleFromLines(mergeLines(items), vp.width, vp.height);
}
