/**
 * Per-page scale state, persisted to localStorage keyed by document
 * fingerprint + page number, so re-opening the same file restores
 * calibration. All math is in PDF-points-per-meter (see presets.ts).
 */

export interface PageScale {
  /** PDF points (1/72") per real-world meter. */
  pointsPerMeter: number;
  verified: boolean;
  method: 'calibrated' | 'preset' | 'auto';
  axisCheckPassed: boolean;
  timestamp: number;
}

export type ScaleMap = Record<number, PageScale>;

const PREFIX = 'pt:v1:scale:';
const UNITS_KEY = 'pt:v1:units';

function storageKey(fingerprint: string, page: number): string {
  return `${PREFIX}${fingerprint}:${page}`;
}

export function loadScales(fingerprint: string): ScaleMap {
  const map: ScaleMap = {};
  const prefix = `${PREFIX}${fingerprint}:`;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(prefix)) continue;
      const page = parseInt(key.slice(prefix.length), 10);
      if (Number.isNaN(page)) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as PageScale;
      if (typeof parsed.pointsPerMeter === 'number') {
        map[page] = parsed;
      }
    }
  } catch {
    // Corrupt or unavailable storage — start empty rather than crash.
  }
  return map;
}

export function saveScale(
  fingerprint: string,
  page: number,
  scale: PageScale,
): void {
  try {
    localStorage.setItem(storageKey(fingerprint, page), JSON.stringify(scale));
  } catch {
    // Storage full/blocked: scale still lives in memory for the session.
  }
}

export function loadUnits(): 'imperial' | 'metric' {
  try {
    return localStorage.getItem(UNITS_KEY) === 'metric' ? 'metric' : 'imperial';
  } catch {
    return 'imperial';
  }
}

export function saveUnits(units: 'imperial' | 'metric'): void {
  try {
    localStorage.setItem(UNITS_KEY, units);
  } catch {
    /* non-fatal */
  }
}
