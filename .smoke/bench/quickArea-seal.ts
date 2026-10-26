/* FROZEN copy of the engine before the thin-line (furniture) pass: scale-aware
 * seal + sheet-leak rejection. Benchmark "before" for that A/B. Do not edit. */
// @ts-nocheck
/**
 * Quick Area engine: one click inside a room → the room's floor region and
 * its numbers. Pure (ImageData in, masks out) so the app and the accuracy
 * benchmark (.smoke/bench) run exactly the same code.
 */
import {
  barrierMap,
  bigBarrierMask,
  cleanBarrierMap,
  dilateMask,
  floodFillFromBarrier,
  growWithin,
  interiorPockets,
  maskPixelCount,
  perimeterEdges,
  type FillMask,
} from '../../app/src/measure/floodfill';

export interface RoomFill {
  /** The room's solid floor region (fill + interior pockets), in raster px. */
  area: FillMask;
  /** Wall lines thickened 2 px — what cut-out floods stop against. */
  barrier: Uint8Array;
  /** Big connected barrier runs = real walls (for the perimeter). */
  bigBarrier: Uint8Array;
  /** Cleaned barrier map (text/symbols removed) — for diagnostics. */
  cleaned: Uint8Array;
  /** Barrier thickening (px) that sealed the room off from its doorways. */
  sealPx: number;
}

/** Smaller than this = nothing enclosed at the click (a gap between lines).
 *  In m² when the scale is known, else raster pixels. */
const MIN_ROOM_M2 = 0.3;
const MIN_ROOM_PX = 200;
/** Doorways up to this wide (m) get sealed, so a fill stays in its room.
 *  Typical doors are 0.8–0.9 m; corridors (1.1 m+) stay open. */
const DOOR_SEAL_M = 0.9;

/** Seal radii (px) to try, smallest first. With a known scale the first try
 *  closes a real doorway at this page's zoom; without one, fixed steps. */
function sealSteps(pointsPerPixel: number, pointsPerMeter?: number): number[] {
  if (!pointsPerMeter || !(pointsPerMeter > 0)) return [6, 12, 18];
  const pxPerM = pointsPerMeter / pointsPerPixel;
  const d = Math.min(24, Math.max(4, Math.round((DOOR_SEAL_M / 2) * pxPerM)));
  return [d, Math.round(d * 1.5), d * 2];
}

/** A fill covering a quarter of the sheet and spanning most of it escaped
 *  the building (open plan edge, site diagram) — not a room. */
function isSheetLeak(m: FillMask): boolean {
  let n = 0;
  let x0 = m.width, x1 = 0, y0 = m.height, y1 = 0;
  for (let i = 0; i < m.data.length; i++) {
    if (!m.data[i]) continue;
    n++;
    const x = i % m.width;
    const y = (i / m.width) | 0;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return n >= m.width * m.height * 0.25 && (x1 - x0 >= m.width * 0.8 || y1 - y0 >= m.height * 0.8);
}

/**
 * Flood the room around raster pixel (bx, by). Returns null when the click
 * isn't inside a closed shape (or the fill escaped across the sheet).
 * pointsPerMeter (the page scale) sizes the doorway seal; without it the
 * seal falls back to fixed pixel steps.
 */
export function fillRoomAt(
  img: ImageData,
  bx: number,
  by: number,
  pointsPerPixel: number,
  pointsPerMeter?: number,
): RoomFill | null {
  const w = img.width;
  const h = img.height;
  // Clean the barrier map first: text, tags, fixture outlines and dashes
  // must not act as walls, or the fill splits around them.
  const raw = barrierMap(img, 0);
  const { cleaned } = cleanBarrierMap(raw, w, h);
  const barrier = dilateMask(cleaned, w, h, 2);
  // Fill against a D-dilated barrier (seals door openings), then grow back
  // below. Escalate only if the result looks like a leak (a huge fraction
  // of the sheet).
  const rasterPx = w * h;
  let mask: FillMask | null = null;
  let sealPx = 0;
  for (const D of sealSteps(pointsPerPixel, pointsPerMeter)) {
    sealPx = D;
    mask = floodFillFromBarrier(dilateMask(cleaned, w, h, D), w, h, bx, by);
    if (!mask || maskPixelCount(mask.data) < rasterPx * 0.25) break;
  }
  if (!mask) return null;
  if (isSheetLeak({ ...mask, pointsPerPixel })) return null;
  // The fill stopped D px short of every wall (the barrier was thickened to
  // seal doors). Grow it back D px, never across a drawn line, so the area
  // reaches the true wall faces. At a door it can only bulge D px into the
  // opening — the thickened seal still holds.
  const grown = growWithin(mask.data, cleaned, w, h, sealPx);
  // Judge "is this a room" AFTER growing back: a strong seal shrinks a small
  // room (a 2 m² office) to a sliver first.
  const minPx =
    pointsPerMeter && pointsPerMeter > 0 ? Math.max(30, MIN_ROOM_M2 * (pointsPerMeter / pointsPerPixel) ** 2) : MIN_ROOM_PX;
  if (maskPixelCount(grown) < minPx) return null;
  // The room's solid region: the fill plus its interior pockets (text
  // counters, fixture interiors). No wall pixels are added — area stays net
  // of the wall lines.
  const pockets = interiorPockets(grown, barrier, w, h);
  const solid = grown.slice();
  for (let i = 0; i < solid.length; i++) if (pockets[i]) solid[i] = 1;
  return {
    area: { ...mask, data: solid, pointsPerPixel },
    barrier,
    bigBarrier: bigBarrierMask(cleaned, w, h),
    cleaned,
    sealPx,
  };
}

/** Floor area and outer-wall perimeter of a filled room, in metres. */
export function roomNumbers(opts: {
  /** The room's solid region before cut-outs. */
  base: FillMask;
  /** base minus any cut-outs (what the area counts). */
  composite: Uint8Array;
  barrier: Uint8Array;
  bigBarrier: Uint8Array;
  holes?: Uint8Array[];
  polys?: Uint8Array[];
  pointsPerMeter: number;
}): { floorAreaM2: number; perimeterM: number } {
  const mPerPx = opts.base.pointsPerPixel / opts.pointsPerMeter;
  // Perimeter = outer walls only: big barrier components (walls) count,
  // text/symbol speckle doesn't; cut-out outlines don't either.
  const edges = perimeterEdges({
    fill: opts.base.data,
    w: opts.base.width,
    h: opts.base.height,
    barrier: opts.barrier,
    bigBarrier: opts.bigBarrier,
    holes: opts.holes ?? [],
    polys: opts.polys ?? [],
  });
  return {
    floorAreaM2: maskPixelCount(opts.composite) * mPerPx * mPerPx,
    perimeterM: edges * mPerPx,
  };
}
