/**
 * Per-page properties (custom label, rotation), keyed by document
 * fingerprint + ORIGINAL 1-based page number, so they survive page-subset
 * changes. One JSON map per document.
 */

export type PageRotation = 0 | 90 | 180 | 270;

export interface PageProps {
  /** Custom sheet label, e.g. "A3 – Party Room". */
  label?: string;
  /** Extra clockwise rotation in degrees (on top of the PDF's own). */
  rotate?: PageRotation;
}

export type PagePropsMap = Record<number, PageProps>;

const PREFIX = 'pt:v1:pageprops:';

export function loadPageProps(fingerprint: string): PagePropsMap {
  try {
    const raw = localStorage.getItem(PREFIX + fingerprint);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as PagePropsMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function savePageProps(fingerprint: string, map: PagePropsMap): void {
  try {
    localStorage.setItem(PREFIX + fingerprint, JSON.stringify(map));
  } catch {
    /* non-fatal */
  }
}

/** What a page is called everywhere (nav, panel dropdown, quote groups). */
export function pageLabel(map: PagePropsMap, pageNum: number): string {
  const custom = map[pageNum]?.label?.trim();
  return custom || `Page ${pageNum}`;
}

export function pageRotation(map: PagePropsMap, pageNum: number): PageRotation {
  return map[pageNum]?.rotate ?? 0;
}
