/**
 * Unit math for PaintTakeoff.
 *
 * ALL internal quantities are meters and PDF points. Imperial ft/in values
 * exist only at the parsing/formatting boundary.
 */

export type UnitSystem = 'imperial' | 'metric';

export const METERS_PER_INCH = 0.0254;
export const INCHES_PER_FOOT = 12;
/** PDF user-space points per inch (PDF points are 1/72"). */
export const POINTS_PER_INCH = 72;

/** Parses "6", "6.5", "6 1/2", "1/2" into a number. Returns null on garbage. */
export function parseMixedNumber(text: string): number | null {
  const t = text.trim();
  if (t === '') return 0;
  const frac = /^(\d+(?:\.\d+)?)[\s-]*\+?[\s-]*(\d+)\s*\/\s*(\d+)$/.exec(t);
  if (frac) {
    const denom = parseFloat(frac[3]);
    if (denom === 0) return null;
    return parseFloat(frac[1]) + parseFloat(frac[2]) / denom;
  }
  const pureFrac = /^(\d+)\s*\/\s*(\d+)$/.exec(t);
  if (pureFrac) {
    const denom = parseFloat(pureFrac[2]);
    if (denom === 0) return null;
    return parseFloat(pureFrac[1]) / denom;
  }
  if (!/^\d+(?:\.\d+)?$/.test(t)) return null;
  return parseFloat(t);
}

/**
 * Forgiving length parser. Accepts, for example:
 *   24' 6"   24'6"   24'-6"   24 ft 6 in   24.5 ft   24.5'   6 1/2"
 *   7500 mm  7.5 m   7.5m
 * A bare number is interpreted in `fallback` units (feet for imperial,
 * meters for metric). Returns meters, or null if unparseable.
 */
export function parseLengthToMeters(
  input: string,
  fallback: UnitSystem,
): number | null {
  let s = input.trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/,/g, '').replace(/[–—]/g, '-');

  const mm = /^(\d+(?:\.\d+)?)\s*(mm|millimetres?|millimeters?)$/.exec(s);
  if (mm) return parseFloat(mm[1]) / 1000;
  const meters = /^(\d+(?:\.\d+)?)\s*(m|metres?|meters?)$/.exec(s);
  if (meters) return parseFloat(meters[1]);

  // Normalize word forms to tick marks, then split on the feet mark.
  s = s
    .replace(/feet|foot|ft\.?/g, "'")
    .replace(/inches|inch|in\.?/g, '"');

  if (s.includes("'")) {
    const idx = s.indexOf("'");
    const feetPart = s.slice(0, idx).trim();
    let inchPart = s.slice(idx + 1).trim().replace(/^[-\s]+/, '');
    inchPart = inchPart.replace(/"\s*$/, '').trim();
    const feet = parseMixedNumber(feetPart);
    if (feet === null) return null;
    const inches = inchPart === '' ? 0 : parseMixedNumber(inchPart);
    if (inches === null) return null;
    return (feet * INCHES_PER_FOOT + inches) * METERS_PER_INCH;
  }

  if (s.endsWith('"')) {
    const inches = parseMixedNumber(s.slice(0, -1));
    return inches === null ? null : inches * METERS_PER_INCH;
  }

  const bare = parseMixedNumber(s);
  if (bare === null) return null;
  return fallback === 'metric'
    ? bare
    : bare * INCHES_PER_FOOT * METERS_PER_INCH;
}

function reduceFraction(num: number, denom: number): [number, number] {
  let a = num;
  let b = denom;
  while (b) {
    [a, b] = [b, a % b];
  }
  const g = a || 1;
  return [num / g, denom / g];
}

/** Formats meters as imperial ft-in, inches rounded to the nearest 1/8". */
export function formatImperial(metersValue: number): string {
  const sign = metersValue < 0 ? '-' : '';
  let totalEighths = Math.round((Math.abs(metersValue) / METERS_PER_INCH) * 8);
  const feet = Math.floor(totalEighths / (INCHES_PER_FOOT * 8));
  totalEighths -= feet * INCHES_PER_FOOT * 8;
  const wholeIn = Math.floor(totalEighths / 8);
  const fracEighths = totalEighths - wholeIn * 8;
  let inchStr = `${wholeIn}`;
  if (fracEighths !== 0) {
    const [n, d] = reduceFraction(fracEighths, 8);
    inchStr = wholeIn === 0 ? `${n}/${d}` : `${wholeIn} ${n}/${d}`;
  }
  return `${sign}${feet}' ${inchStr}"`;
}

/** Formats meters per the project unit system. */
export function formatLength(metersValue: number, units: UnitSystem): string {
  if (units === 'metric') {
    return `${metersValue.toFixed(3)} m`;
  }
  return formatImperial(metersValue);
}

/** Plain-words formatting for previews: "24 ft 6 1/2 in" / "7.5 m". */
export function formatLengthWords(metersValue: number, units: UnitSystem): string {
  if (units === 'metric') {
    return `${parseFloat(metersValue.toFixed(3))} m`;
  }
  const sign = metersValue < 0 ? '-' : '';
  let totalEighths = Math.round((Math.abs(metersValue) / METERS_PER_INCH) * 8);
  const feet = Math.floor(totalEighths / (INCHES_PER_FOOT * 8));
  totalEighths -= feet * INCHES_PER_FOOT * 8;
  const wholeIn = Math.floor(totalEighths / 8);
  const fracEighths = totalEighths - wholeIn * 8;
  let inchStr = `${wholeIn}`;
  if (fracEighths !== 0) {
    const [n, d] = reduceFraction(fracEighths, 8);
    inchStr = wholeIn === 0 ? `${n}/${d}` : `${wholeIn} ${n}/${d}`;
  }
  return `${sign}${feet} ft ${inchStr} in`;
}

/** Distance between two page-space points, in PDF points. */
export function pointDistance(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}
