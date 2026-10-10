import type { Measurement, OpeningType } from './measureStore';

/**
 * The fixed color language for measurement kinds. The kind is something the
 * user explicitly chose, so colors are never "wrong" — they just make the
 * plan readable at a glance: walls blue, ceilings violet, trim amber,
 * Quick Area rooms green, openings in the red family.
 */

export interface KindColors {
  wall: string;
  ceiling: string;
  trim: string;
  room: string;
  opening: Record<OpeningType, string>;
}

export const KIND_COLORS: { light: KindColors; dark: KindColors } = {
  light: {
    wall: '#1a66cc',
    ceiling: '#8e44ad',
    trim: '#e18a00',
    room: '#0d8a4f',
    opening: { door: '#d64541', window: '#e67e22', slider: '#b03a2e' },
  },
  dark: {
    wall: '#5b9bff',
    ceiling: '#b284dc',
    trim: '#f0b04a',
    room: '#3ecf7a',
    opening: { door: '#ff7a70', window: '#f5a35c', slider: '#e08073' },
  },
};

/** Canvas/panel color for a measurement, honoring the theme. */
export function colorFor(m: Measurement, dark: boolean): string {
  const c = dark ? KIND_COLORS.dark : KIND_COLORS.light;
  if (m.kind === 'opening') return c.opening[m.openType];
  if (m.kind === 'ceiling') return c.ceiling;
  if (m.kind === 'area') return c.room;
  return (m.purpose ?? 'wall') === 'trim' ? c.trim : c.wall;
}

/** Color of the in-progress chain while measuring a given kind. */
export function chainColor(kind: 'wall' | 'trim' | 'ceiling', dark: boolean): string {
  const c = dark ? KIND_COLORS.dark : KIND_COLORS.light;
  return kind === 'trim' ? c.trim : kind === 'ceiling' ? c.ceiling : c.wall;
}
