/**
 * Quick Area engine: one click inside a room → the room's floor region and
 * its numbers. Pure (ImageData in, masks out) so the app and the accuracy
 * benchmark (.smoke/bench) run exactly the same code.
 */
import {
  barrierMap,
  bigBarrierMask,
  cleanBarrierMap,
  depthWithin,
  dilateMask,
  dilationDepth,
  erodeMask,
  floodFillFromBarrier,
  growWithin,
  interiorPockets,
  maskPixelCount,
  perimeterEdges,
  type FillMask,
} from './floodfill';

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

/** Deepest doorway seal any click can ask for (2 × the 24 px cap; the
 *  no-scale fallback tops out at 18). */
const SEAL_MAX = 48;

/** Quick Area for one page raster. The work that doesn't depend on where
 *  you click — cleaning the wall map, measuring how far every pixel is from
 *  a wall — is done once here and reused by every click on the page. */
export interface RoomFinder {
  fillAt(bx: number, by: number, pointsPerPixel: number, pointsPerMeter?: number): RoomFill | null;
}

export function prepareRoomFinder(img: ImageData): RoomFinder {
  const w = img.width;
  const h = img.height;
  // Clean the barrier map first: text, tags, fixture outlines and dashes
  // must not act as walls, or the fill splits around them.
  const { cleaned } = cleanBarrierMap(barrierMap(img, 0), w, h);
  // How many dilation passes reach each pixel from a wall: every seal width
  // (and the 2 px barrier) is a threshold of this one map.
  const wallDepth = dilationDepth(cleaned, w, h, SEAL_MAX);
  const barrier = depthWithin(wallDepth, 2);
  const sealed = new Map<number, Uint8Array>();
  const sealedAt = (D: number) => {
    let m = sealed.get(D);
    if (!m) sealed.set(D, (m = depthWithin(wallDepth, D)));
    return m;
  };
  // Thick lines only (3 px+), for the furniture pass — built on first use.
  let thickDepth: Uint8Array | null = null;
  const thickSealedAt = (D: number) => {
    if (!thickDepth) {
      const core = dilateMask(erodeMask(cleaned, w, h, 1), w, h, 1);
      const thick = new Uint8Array(cleaned.length);
      for (let i = 0; i < thick.length; i++) if (cleaned[i] && core[i]) thick[i] = 1;
      thickDepth = dilationDepth(thick, w, h, SEAL_MAX);
    }
    return depthWithin(thickDepth, D);
  };
  let bigBarrier: Uint8Array | null = null;

  return {
    fillAt(bx, by, pointsPerPixel, pointsPerMeter) {
      // Fill against a D-dilated barrier (seals door openings), then grow
      // back below. Escalate only if the result looks like a leak (a huge
      // fraction of the sheet).
      const rasterPx = w * h;
      let mask: FillMask | null = null;
      let sealPx = 0;
      for (const D of sealSteps(pointsPerPixel, pointsPerMeter)) {
        sealPx = D;
        mask = floodFillFromBarrier(sealedAt(D), w, h, bx, by);
        if (!mask || maskPixelCount(mask.data) < rasterPx * 0.25) break;
      }
      if (!mask) return null;
      if (isSheetLeak({ ...mask, pointsPerPixel })) return null;
      mask = { ...mask, data: absorbThinLinePockets(mask.data, thickSealedAt(sealPx), w, h, bx, by) };
      // The fill stopped D px short of every wall (the barrier was thickened
      // to seal doors). Grow it back D px, never across a drawn line, so the
      // area reaches the true wall faces. At a door it can only bulge D px
      // into the opening — the thickened seal still holds.
      const grown = growWithin(mask.data, cleaned, w, h, sealPx);
      // Judge "is this a room" AFTER growing back: a strong seal shrinks a
      // small room (a 2 m² office) to a sliver first.
      const minPx =
        pointsPerMeter && pointsPerMeter > 0 ? Math.max(30, MIN_ROOM_M2 * (pointsPerMeter / pointsPerPixel) ** 2) : MIN_ROOM_PX;
      if (maskPixelCount(grown) < minPx) return null;
      // The room's solid region: the fill plus its interior pockets (text
      // counters, fixture interiors). No wall pixels are added — area stays
      // net of the wall lines.
      const pockets = interiorPockets(grown, barrier, w, h);
      for (let i = 0; i < grown.length; i++) if (pockets[i]) grown[i] = 1;
      bigBarrier ??= bigBarrierMask(cleaned, w, h);
      return {
        area: { ...mask, data: grown, pointsPerPixel },
        barrier,
        bigBarrier,
        cleaned,
        sealPx,
      };
    },
  };
}

/**
 * Flood the room around raster pixel (bx, by). Returns null when the click
 * isn't inside a closed shape (or the fill escaped across the sheet).
 * pointsPerMeter (the page scale) sizes the doorway seal; without it the
 * seal falls back to fixed pixel steps. One-off; for several clicks on a
 * page, keep a prepareRoomFinder(img) and call fillAt.
 */
export function fillRoomAt(
  img: ImageData,
  bx: number,
  by: number,
  pointsPerPixel: number,
  pointsPerMeter?: number,
): RoomFill | null {
  return prepareRoomFinder(img).fillAt(bx, by, pointsPerPixel, pointsPerMeter);
}

/**
 * Furniture, dimension lines and door swings are drawn thin; walls are
 * drawn thick. A sofa or table drawn against a wall joins the wall network,
 * so the fill stops at it and the room comes out short. Re-fill treating only
 * thick lines (3 px+) as barriers: each extra piece that fill reaches was
 * cut off by thin lines alone. Keep the pieces that are small next to the
 * room (furniture footprints, a strip behind a dimension line) and drop big
 * ones — those are a neighbouring room behind a thinly drawn partition.
 */
const THIN_POCKET_MAX = 0.12; // of the room, per piece

function absorbThinLinePockets(
  room: Uint8Array,
  thickSealed: Uint8Array,
  w: number,
  h: number,
  bx: number,
  by: number,
): Uint8Array {
  const wide = floodFillFromBarrier(thickSealed, w, h, bx, by);
  if (!wide || isSheetLeak(wide)) return room;
  let roomPx = 0;
  for (let i = 0; i < room.length; i++) if (room[i]) roomPx++;
  const n = room.length;
  const out = room.slice();
  const seen = new Uint8Array(n);
  const stack = new Int32Array(n);
  const piece: number[] = [];
  for (let i = 0; i < n; i++) {
    if (!wide.data[i] || room[i] || seen[i]) continue;
    piece.length = 0;
    let top = 0;
    stack[top++] = i;
    seen[i] = 1;
    while (top > 0) {
      const j = stack[--top];
      piece.push(j);
      const x = j % w;
      let k: number;
      if (x > 0 && !seen[(k = j - 1)] && wide.data[k] && !room[k]) { seen[k] = 1; stack[top++] = k; }
      if (x < w - 1 && !seen[(k = j + 1)] && wide.data[k] && !room[k]) { seen[k] = 1; stack[top++] = k; }
      if (j >= w && !seen[(k = j - w)] && wide.data[k] && !room[k]) { seen[k] = 1; stack[top++] = k; }
      if (j < n - w && !seen[(k = j + w)] && wide.data[k] && !room[k]) { seen[k] = 1; stack[top++] = k; }
    }
    if (piece.length <= roomPx * THIN_POCKET_MAX) for (const j of piece) out[j] = 1;
  }
  return out;
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
