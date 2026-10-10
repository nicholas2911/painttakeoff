import { Util } from 'pdfjs-dist';
import type { PDFPageProxy } from 'pdfjs-dist';
import type { PagePoint } from '../types';

/**
 * Click-a-dimension: while setting the scale, clicking the WRITTEN dimension
 * on a vector plan reads it via the PDF text layer and offers it as the
 * prefill for the length boxes. The user always confirms — never auto-accept.
 * On scanned PDFs (no text) this silently finds nothing.
 */

/** Parse a dimension string into meters. Returns null for non-dimensions. */
export function parseDimensionText(str: string): number | null {
  const t = str.trim().replace(/[‘’]/g, "'").replace(/[“”″]/g, '"');
  if (!t) return null;
  // Imperial: 24'-6" / 24' 6 / 24'6 1/2"
  const imp = /^(\d+(?:\.\d+)?)\s*'\s*-?\s*(?:(\d+(?:[ .]\d+)?(?:\s*\d+\s*\/\s*\d+)?)\s*(?:"|'')?)?$/.exec(t);
  if (imp) {
    const ft = parseFloat(imp[1]);
    let inches = 0;
    if (imp[2]) {
      const frac = /^(\d+(?:[ .]\d+)?)\s+(\d+)\s*\/\s*(\d+)$/.exec(imp[2].trim());
      inches = frac
        ? parseFloat(frac[1]) + parseInt(frac[2], 10) / parseInt(frac[3], 10)
        : parseFloat(imp[2]);
    }
    const m = (ft * 12 + inches) * 0.3048 / 12;
    return m > 0 ? m : null;
  }
  // Metric with unit: 2520 mm / 2.52 m
  const withUnit = /^(\d+(?:[ .]\d+)?)\s*(mm|millimeters?|m|meters?|metres?)$/i.exec(t);
  if (withUnit) {
    const v = parseFloat(withUnit[1].replace(' ', '.'));
    const unit = withUnit[2].toLowerCase();
    const m = unit === 'm' || unit.startsWith('meter') || unit.startsWith('metre') ? v : v / 1000;
    return m > 0 ? m : null;
  }
  // Bare number: metric plans print mm ("12270"). Three+ digits → mm.
  if (/^\d{3,6}$/.test(t)) return parseInt(t, 10) / 1000;
  return null;
}

/** Plausible for a building dimension: 100 mm … 100 m. */
export function plausibleDimension(meters: number): boolean {
  return meters >= 0.1 && meters <= 100;
}

export interface TextHit {
  text: string;
  /** Parsed dimension in meters, or null when the text isn't a dimension. */
  meters: number | null;
  /** Axis-aligned box around the text in page space (points, scale 1). */
  box: { x: number; y: number; w: number; h: number };
}

/** Nearest text item to a page-space point (inherent orientation, scale 1).
 *  `tolPt` is deliberately tight (~10 pt ≈ a few screen px): deliberate clicks
 *  on text hit, clicks on a dimensioned LINE just below the text still
 *  register as normal points. */
export async function findTextAt(
  page: PDFPageProxy,
  p: PagePoint,
  tolPt = 10,
): Promise<TextHit | null> {
  let tc;
  try {
    tc = await page.getTextContent();
  } catch {
    return null; // scans and broken text layers: stay manual
  }
  const viewport = page.getViewport({ scale: 1 });
  let best: TextHit | null = null;
  let bestD = tolPt;
  for (const item of tc.items) {
    if (!('str' in item) || !item.str.trim()) continue;
    // Baseline in page space: origin (e,f); direction = x-axis of the
    // transform normalized (item.width is already in user-space units).
    const t = Util.transform(viewport.transform, item.transform);
    const fx = Math.hypot(t[0], t[2]) || 1;
    const x0 = t[4];
    const y0 = t[5];
    const x1 = x0 + (t[0] / fx) * item.width;
    const y1 = y0 + (t[2] / fx) * item.width;
    // Distance from the click to the baseline segment.
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len2 = dx * dx + dy * dy;
    let d: number;
    if (len2 === 0) {
      d = Math.hypot(p.x - x0, p.y - y0);
    } else {
      let u = ((p.x - x0) * dx + (p.y - y0) * dy) / len2;
      u = Math.max(0, Math.min(1, u));
      d = Math.hypot(p.x - (x0 + u * dx), p.y - (y0 + u * dy));
    }
    if (d >= bestD) continue;
    // Text quad: baseline + up vector (t[2],t[3], magnitude fh) minus a
    // little descent. Axis-aligned box, 2pt padding.
    const upx = t[2];
    const upy = t[3];
    const xs = [x0, x1, x0 + upx, x1 + upx, x0 - upx * 0.25, x1 - upx * 0.25];
    const ys = [y0, y1, y0 + upy, y1 + upy, y0 - upy * 0.25, y1 - upy * 0.25];
    bestD = d;
    best = {
      text: item.str.trim(),
      meters: parseDimensionText(item.str),
      box: {
        x: Math.min(...xs) - 2,
        y: Math.min(...ys) - 2,
        w: Math.max(...xs) - Math.min(...xs) + 4,
        h: Math.max(...ys) - Math.min(...ys) + 4,
      },
    };
  }
  return best;
}
