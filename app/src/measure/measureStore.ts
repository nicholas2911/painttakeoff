import type { PagePoint } from '../types';

/**
 * Finished measurements, stored per page. Same persistence pattern as the
 * scale store: localStorage keyed by document fingerprint + page number.
 * All values in meters / square meters (page-space points for geometry).
 */

export interface LengthMeasurement {
  id: string;
  kind: 'length';
  /** 'wall' (length × height = wall area) or 'trim' (length only, per LF).
   *  Absent in pre-0.4 data → 'wall'. */
  purpose?: 'wall' | 'trim';
  label: string;
  /** Chain of clicked points in page space (2+ points). */
  points: PagePoint[];
  totalMeters: number;
  /** Ceiling height for this wall run (m). Absent in pre-0.3 data — the
   *  panel's default height is used then. */
  wallHeightM?: number;
  createdAt: number;
}

export interface CeilingMeasurement {
  id: string;
  kind: 'ceiling';
  label: string;
  /** Closed polygon in page space (3+ points). */
  points: PagePoint[];
  areaM2: number;
  perimeterM: number;
  createdAt: number;
}

export type OpeningType = 'door' | 'window' | 'slider';

export interface OpeningMeasurement {
  id: string;
  kind: 'opening';
  label: string; // D1, W2, S1…
  openType: OpeningType;
  point: PagePoint;
  /** Deducted area in m² (defaults: door 21 / window 15 / slider 40 sq ft). */
  sfM2: number;
  /** Measurement id this opening deducts from, or null = whole page. */
  assignedTo: string | null;
  createdAt: number;
}

export interface AreaCutout {
  areaM2: number;
  /** 'flood' (clicked an enclosed obstacle) or 'poly' (hand-drawn). */
  kind?: 'flood' | 'poly';
}

export interface AreaMeasurement {
  id: string;
  kind: 'area';
  label: string;
  floorAreaM2: number;
  perimeterM: number;
  wallHeightM: number;
  wallAreaM2: number;
  cutouts: AreaCutout[];
  /** Tinted overlay of the filled region, and its page-space bounds. */
  maskDataUrl?: string;
  maskRect?: { qx: number; qy: number; qw: number; qh: number };
  /** Red overlay for the cut-out regions (same bounds as maskRect). */
  cutoutsDataUrl?: string;
  createdAt: number;
}

export type Measurement =
  | LengthMeasurement
  | AreaMeasurement
  | CeilingMeasurement
  | OpeningMeasurement;

export type MeasurementMap = Record<number, Measurement[]>;

const PREFIX = 'pt:v1:measure:';
const PANEL_KEY = 'pt:v1:panel-open';
const DEFAULT_HEIGHT_KEY = 'pt:v1:default-height-m';
const OPENING_SIZES_KEY = 'pt:v1:opening-sizes';
const PAGE_SETTINGS_PREFIX = 'pt:v1:pagesettings:';
/** Fallback default ceiling height: 8 ft. */
export const FALLBACK_WALL_HEIGHT_M = 8 * 0.3048;

const SQFT_TO_M2 = 0.09290304;

export interface OpeningSizes {
  door: number;
  window: number;
  slider: number;
}

export const DEFAULT_OPENING_SIZES: OpeningSizes = {
  door: 21 * SQFT_TO_M2,
  window: 15 * SQFT_TO_M2,
  slider: 40 * SQFT_TO_M2,
};

export function loadOpeningSizes(): OpeningSizes {
  try {
    const raw = localStorage.getItem(OPENING_SIZES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<OpeningSizes>;
      return {
        door: parsed.door ?? DEFAULT_OPENING_SIZES.door,
        window: parsed.window ?? DEFAULT_OPENING_SIZES.window,
        slider: parsed.slider ?? DEFAULT_OPENING_SIZES.slider,
      };
    }
  } catch {
    /* fall through */
  }
  return { ...DEFAULT_OPENING_SIZES };
}

export function saveOpeningSizes(sizes: OpeningSizes): void {
  try {
    localStorage.setItem(OPENING_SIZES_KEY, JSON.stringify(sizes));
  } catch {
    /* non-fatal */
  }
}

/** Per-page settings (deductions toggle). Default: deduct ON. */
export function loadDeductOpenings(fingerprint: string, page: number): boolean {
  try {
    const raw = localStorage.getItem(`${PAGE_SETTINGS_PREFIX}${fingerprint}:${page}`);
    if (raw) return (JSON.parse(raw) as { deduct?: boolean }).deduct !== false;
  } catch {
    /* default on */
  }
  return true;
}

export function saveDeductOpenings(
  fingerprint: string,
  page: number,
  deduct: boolean,
): void {
  try {
    localStorage.setItem(
      `${PAGE_SETTINGS_PREFIX}${fingerprint}:${page}`,
      JSON.stringify({ deduct }),
    );
  } catch {
    /* non-fatal */
  }
}

export function loadDefaultWallHeight(): number {
  try {
    const v = parseFloat(localStorage.getItem(DEFAULT_HEIGHT_KEY) ?? '');
    return Number.isFinite(v) && v > 0 ? v : FALLBACK_WALL_HEIGHT_M;
  } catch {
    return FALLBACK_WALL_HEIGHT_M;
  }
}

export function saveDefaultWallHeight(meters: number): void {
  try {
    localStorage.setItem(DEFAULT_HEIGHT_KEY, String(meters));
  } catch {
    /* non-fatal */
  }
}

function storageKey(fingerprint: string, page: number): string {
  return `${PREFIX}${fingerprint}:${page}`;
}

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function loadMeasurements(fingerprint: string): MeasurementMap {
  const map: MeasurementMap = {};
  const prefix = `${PREFIX}${fingerprint}:`;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(prefix)) continue;
      const page = parseInt(key.slice(prefix.length), 10);
      if (Number.isNaN(page)) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as Measurement[];
      if (Array.isArray(parsed)) map[page] = parsed;
    }
  } catch {
    // Corrupt/unavailable storage — start empty.
  }
  return map;
}

export function saveMeasurements(
  fingerprint: string,
  page: number,
  items: Measurement[],
): void {
  try {
    localStorage.setItem(storageKey(fingerprint, page), JSON.stringify(items));
  } catch {
    // Storage full/blocked: measurements still live in memory this session.
  }
}

export function loadPanelOpen(): boolean {
  try {
    return localStorage.getItem(PANEL_KEY) === '1';
  } catch {
    return false;
  }
}

export function savePanelOpen(open: boolean): void {
  try {
    localStorage.setItem(PANEL_KEY, open ? '1' : '0');
  } catch {
    /* non-fatal */
  }
}
