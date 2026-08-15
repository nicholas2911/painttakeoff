import { METERS_PER_INCH, POINTS_PER_INCH } from './units';

export interface ScalePreset {
  id: string;
  label: string;
  /** Drawing ratio denominator N for "1:N" (paper unit : real unit). */
  ratio: number;
}

export const SCALE_PRESETS: ScalePreset[] = [
  // Imperial
  { id: '1:48', label: '1/4 inch = 1 foot (most house plans)', ratio: 48 },
  { id: '1:96', label: '1/8 inch = 1 foot (bigger buildings)', ratio: 96 },
  { id: '1:24', label: '1/2 inch = 1 foot (detail drawings)', ratio: 24 },
  { id: '1:64', label: '3/16 inch = 1 foot', ratio: 64 },
  // Metric, ascending ratio
  { id: '1:20', label: '1:20 (metric details)', ratio: 20 },
  { id: '1:25', label: '1:25 (metric details)', ratio: 25 },
  { id: '1:30', label: '1:30 (metric elevations)', ratio: 30 },
  { id: '1:40', label: '1:40 (metric details)', ratio: 40 },
  { id: '1:50', label: '1:50 (metric commercial)', ratio: 50 },
  { id: '1:75', label: '1:75 (metric floor plans)', ratio: 75 },
  { id: '1:100', label: '1:100 (metric commercial)', ratio: 100 },
  { id: '1:200', label: '1:200 (metric site plans)', ratio: 200 },
];

/**
 * Scale is stored as PDF points per real-world meter.
 * At ratio 1:N, one paper inch (= 72 pt) represents N real inches.
 */
export function pointsPerMeterFromRatio(ratio: number): number {
  return POINTS_PER_INCH / (ratio * METERS_PER_INCH);
}

export function ratioFromPointsPerMeter(pointsPerMeter: number): number {
  return POINTS_PER_INCH / (pointsPerMeter * METERS_PER_INCH);
}

/** Short display form, e.g. "1:48" or "1:47.8" for a calibrated scale. */
export function formatRatio(pointsPerMeter: number): string {
  const ratio = ratioFromPointsPerMeter(pointsPerMeter);
  const rounded = Math.round(ratio);
  if (Math.abs(ratio - rounded) < 0.05) return `1:${rounded}`;
  return `1:${ratio.toFixed(1)}`;
}
