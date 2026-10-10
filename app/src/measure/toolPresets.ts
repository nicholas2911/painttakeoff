/**
 * Tool presets: one-tap chips in Measure mode that recall a kind + (for
 * walls) a ceiling height. Persisted globally (they're habits, not
 * project data). Capped — past the cap the save affordance goes away.
 */

export interface ToolPreset {
  id: string;
  name: string; // auto "Wall · 8 ft", user-renamable
  kind: 'wall' | 'trim' | 'ceiling';
  /** Walls only: the ceiling height to apply. */
  heightM?: number;
}

export const MAX_PRESETS = 8;

const KEY = 'pt:v1:presets';

export function loadPresets(): ToolPreset[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ToolPreset[];
    return Array.isArray(parsed) ? parsed.filter((p) => p && p.id && p.kind) : [];
  } catch {
    return [];
  }
}

export function savePresets(list: ToolPreset[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_PRESETS)));
  } catch {
    /* non-fatal */
  }
}
