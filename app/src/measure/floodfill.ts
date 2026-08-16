/**
 * Quick Area: pragmatic flood-fill room detection (the "Dynamic Fill"
 * approach). Works on a downscaled raster of the page; dark pixels are
 * treated as boundaries. Not a neural net — results are "rough" by design.
 *
 * Coordinates: the working buffer covers the whole page; `pointsPerPixel`
 * maps buffer pixels to page space (PDF points).
 */

export interface FillMask {
  /** width*height bytes, 1 = filled. */
  data: Uint8Array;
  width: number;
  height: number;
  /** Page points per buffer pixel. */
  pointsPerPixel: number;
}

/** BFS flood fill from (sx, sy) over non-boundary pixels. */
export function floodFill(img: ImageData, sx: number, sy: number): FillMask | null {
  const w = img.width;
  const h = img.height;
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return null;
  // Two dilation passes: small gaps in door swings / broken lines shouldn't
  // leak the fill into the next room.
  const barrier = barrierMap(img, 2);

  const start = Math.floor(sy) * w + Math.floor(sx);
  if (barrier[start]) {
    // Clicked exactly on a line — nudge to a nearby open pixel.
    let found = -1;
    outer: for (let r = 1; r <= 6; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const nx = Math.floor(sx) + dx;
          const ny = Math.floor(sy) + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          if (!barrier[ny * w + nx]) {
            found = ny * w + nx;
            break outer;
          }
        }
      }
    }
    if (found === -1) return null;
    return fillFrom(barrier, w, h, found);
  }
  return fillFrom(barrier, w, h, start);
}

function fillFrom(barrier: Uint8Array, w: number, h: number, start: number): FillMask | null {
  const n = w * h;
  const mask = new Uint8Array(n);
  const stack = new Int32Array(n);
  let top = 0;
  stack[top++] = start;
  mask[start] = 1;
  while (top > 0) {
    const i = stack[--top];
    const x = i % w;
    // 4-way neighbours
    if (x > 0 && !barrier[i - 1] && !mask[i - 1]) { mask[i - 1] = 1; stack[top++] = i - 1; }
    if (x < w - 1 && !barrier[i + 1] && !mask[i + 1]) { mask[i + 1] = 1; stack[top++] = i + 1; }
    if (i >= w && !barrier[i - w] && !mask[i - w]) { mask[i - w] = 1; stack[top++] = i - w; }
    if (i < n - w && !barrier[i + w] && !mask[i + w]) { mask[i + w] = 1; stack[top++] = i + w; }
  }
  const pointsPerPixel = 1; // caller adjusts
  return { data: mask, width: w, height: h, pointsPerPixel };
}

/**
 * Cutout flood: from (sx, sy), flood the connected region of pixels that
 * are NOT barriers and NOT filled (an enclosed hole inside the fill —
 * e.g. a fixture or island the room-fill went around). Nudges a few px if
 * the click lands exactly on a line. Returns the hole mask, or null.
 */
export function holeFill(
  barrier: Uint8Array,
  filled: FillMask,
  sx: number,
  sy: number,
): Uint8Array | null {
  const w = filled.width;
  const h = filled.height;
  const n = w * h;
  const isOpen = (i: number) => !barrier[i] && !filled.data[i];
  let start = Math.floor(sy) * w + Math.floor(sx);
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return null;
  if (!isOpen(start)) {
    let found = -1;
    outer: for (let r = 1; r <= 5; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const nx = Math.floor(sx) + dx;
          const ny = Math.floor(sy) + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const i = ny * w + nx;
          if (isOpen(i)) {
            found = i;
            break outer;
          }
        }
      }
    }
    if (found === -1) return null;
    start = found;
  }
  const mask = new Uint8Array(n);
  const stack = [start];
  mask[start] = 1;
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w;
    if (x > 0 && isOpen(i - 1) && !mask[i - 1]) { mask[i - 1] = 1; stack.push(i - 1); }
    if (x < w - 1 && isOpen(i + 1) && !mask[i + 1]) { mask[i + 1] = 1; stack.push(i + 1); }
    if (i >= w && isOpen(i - w) && !mask[i - w]) { mask[i - w] = 1; stack.push(i - w); }
    if (i < n - w && isOpen(i + w) && !mask[i + w]) { mask[i + w] = 1; stack.push(i + w); }
  }
  return mask;
}

/** Dark-pixel barrier map with dilation (bridges small gaps in outlines). */
export function barrierMap(img: ImageData, dilationPasses: number): Uint8Array {
  const w = img.width;
  const h = img.height;
  const n = w * h;
  const barrier = new Uint8Array(n);
  const px = img.data;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const lum = px[o] * 0.299 + px[o + 1] * 0.587 + px[o + 2] * 0.114;
    if (lum < 150) barrier[i] = 1;
  }
  return dilationPasses > 0 ? dilateMask(barrier, w, h, dilationPasses) : barrier;
}

/**
 * Clean the barrier map so the fill covers whole rooms. Strategy:
 *  1. Dilate the raw barrier 1px (re-attaches door hardware split by
 *     anti-aliasing), then find connected components.
 *  2. Anything connected to a MAJOR component (the wall network), or
 *     within 2px of it, is kept — walls, door panels, frame nibs, swings.
 *  3. Disconnected components are removed — letters, tags, fixture and
 *     symbol outlines, hatching, dashes, dimension lines, speckle — EXCEPT
 *     elongated segments whose BOTH ends continue into the wall network
 *     (thin partition-wall segments broken by overprinted text).
 * Kept components are restored to their RAW pixels so line thickness is
 * unchanged; the caller re-dilates for gap bridging.
 */
export interface BarrierStats {
  rawPx: number;
  keptPx: number;
  removedPx: number;
  removedComponents: number;
  keptComponents: number;
}

const CLEAN_MAJOR_PX = 300; // wall-network component size
const CLEAN_SEG_MIN_DIM = 25; // wall-segment rescue: minimum length
const CLEAN_SEG_ASPECT = 3; // …and elongation
const CLEAN_SEG_REACH = 5; // px from an endpoint to the network counts

export function cleanBarrierMap(
  raw: Uint8Array,
  w: number,
  h: number,
): { cleaned: Uint8Array; stats: BarrierStats } {
  const n = w * h;
  const attached = raw; // no pre-dilation: keeps letters small so they die
  const labels = new Int32Array(n).fill(-1);
  interface Comp {
    px: number;
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  }
  const comps: Comp[] = [];
  const stack: number[] = [];
  for (let i = 0; i < n; i++) {
    if (!attached[i] || labels[i] !== -1) continue;
    const id = comps.length;
    const c: Comp = { px: 0, minX: w, maxX: -1, minY: h, maxY: -1 };
    stack.push(i);
    labels[i] = id;
    while (stack.length) {
      const j = stack.pop()!;
      c.px++;
      const x = j % w;
      const y = (j / w) | 0;
      if (x < c.minX) c.minX = x;
      if (x > c.maxX) c.maxX = x;
      if (y < c.minY) c.minY = y;
      if (y > c.maxY) c.maxY = y;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const k = ny * w + nx;
          if (attached[k] && labels[k] === -1) {
            labels[k] = id;
            stack.push(k);
          }
        }
      }
    }
    comps.push(c);
  }

  // pass 1: majors
  const keep = new Uint8Array(comps.length);
  comps.forEach((c, id) => {
    if (c.px >= CLEAN_MAJOR_PX) keep[id] = 1;
  });
  const network = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (labels[i] !== -1 && keep[labels[i]]) network[i] = 1;
  }
  const networkReach = dilateMask(network, w, h, 2);
  const touches = new Uint8Array(comps.length);
  for (let i = 0; i < n; i++) {
    if (labels[i] !== -1 && !keep[labels[i]] && networkReach[i]) touches[labels[i]] = 1;
  }

  // Wall-segment rescue: does each end of this elongated component reach
  // the network within a few px?
  const endpointTouches = (c: Comp, id: number): boolean => {
    const horizontal = c.maxX - c.minX >= c.maxY - c.minY;
    const span = (horizontal ? c.maxX - c.minX : c.maxY - c.minY) + 1;
    const cap = Math.max(2, Math.round(span * 0.15));
    const endA = new Uint8Array(n);
    const endB = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      if (labels[i] !== id) continue;
      const x = i % w;
      const y = (i / w) | 0;
      if (horizontal) {
        if (x <= c.minX + cap) endA[i] = 1;
        if (x >= c.maxX - cap) endB[i] = 1;
      } else {
        if (y <= c.minY + cap) endA[i] = 1;
        if (y >= c.maxY - cap) endB[i] = 1;
      }
    }
    const reachA = dilateMask(endA, w, h, CLEAN_SEG_REACH);
    const reachB = dilateMask(endB, w, h, CLEAN_SEG_REACH);
    let a = false;
    let b = false;
    for (let i = 0; i < n; i++) {
      if (reachA[i] && network[i]) a = true;
      if (reachB[i] && network[i]) b = true;
      if (a && b) return true;
    }
    return false;
  };

  comps.forEach((c, id) => {
    if (keep[id]) return;
    const bw = c.maxX - c.minX + 1;
    const bh = c.maxY - c.minY + 1;
    const maxDim = Math.max(bw, bh);
    const aspect = maxDim / Math.max(1, Math.min(bw, bh));
    // Compact door hardware / nibs that touch the network survive at
    // wall-like sizes — notes and labels leaning on a wall still die.
    if (touches[id] && c.px >= 35 && aspect < 3) {
      keep[id] = 1;
      return;
    }
    if (maxDim >= CLEAN_SEG_MIN_DIM && aspect >= CLEAN_SEG_ASPECT && endpointTouches(c, id)) {
      keep[id] = 1;
    }
  });

  const cleaned = new Uint8Array(n);
  const stats: BarrierStats = { rawPx: 0, keptPx: 0, removedPx: 0, removedComponents: 0, keptComponents: 0 };
  for (let i = 0; i < n; i++) {
    if (!raw[i]) continue;
    stats.rawPx++;
    if (keep[labels[i]]) {
      cleaned[i] = 1;
      stats.keptPx++;
    } else {
      stats.removedPx++;
    }
  }
  comps.forEach((_c, id) => {
    if (keep[id]) stats.keptComponents++;
    else stats.removedComponents++;
  });
  return { cleaned, stats };
}

/** BFS flood fill over a precomputed barrier map. */
export function floodFillFromBarrier(
  barrier: Uint8Array,
  w: number,
  h: number,
  sx: number,
  sy: number,
): FillMask | null {
  const first = tryFill(barrier, w, h, Math.floor(sx), Math.floor(sy));
  if (first && countMask(first.data) >= 200) return first;
  // Bad start (inside a tiny pocket like a letter counter): retry from
  // nearby open pixels until a real region is found.
  let best = first;
  outer: for (let r = 2; r <= 16; r += 2) {
    for (let dy = -r; dy <= r; dy += 2) {
      for (let dx = -r; dx <= r; dx += 2) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; // ring only
        const m = tryFill(barrier, w, h, Math.floor(sx) + dx, Math.floor(sy) + dy);
        if (m) {
          const c = countMask(m.data);
          if (c >= 200) return m;
          if (!best || c > countMask(best.data)) best = m;
        }
      }
    }
    if (best && countMask(best.data) >= 200) break outer;
  }
  return best;
}

function countMask(m: Uint8Array): number {
  let c = 0;
  for (let i = 0; i < m.length; i++) if (m[i]) c++;
  return c;
}

function tryFill(
  barrier: Uint8Array,
  w: number,
  h: number,
  sx: number,
  sy: number,
): FillMask | null {
  const n = w * h;
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return null;
  let start = sy * w + sx;
  if (barrier[start]) {
    // Clicked on a line/wall mass — nudge to a nearby open pixel.
    let found = -1;
    outer: for (let r = 1; r <= 12; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const nx = sx + dx;
          const ny = sy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          if (!barrier[ny * w + nx]) {
            found = ny * w + nx;
            break outer;
          }
        }
      }
    }
    if (found === -1) return null;
    start = found;
  }
  const mask = new Uint8Array(n);
  const stack = new Int32Array(n);
  let top = 0;
  stack[top++] = start;
  mask[start] = 1;
  // 8-connectivity: lets the fill flow around dense junk islands (letters,
  // symbols) without being walled in by them; real walls are dilated far
  // thicker than a 1px diagonal gap, so this doesn't leak through them.
  while (top > 0) {
    const i = stack[--top];
    const x = i % w;
    const y = (i / w) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (!barrier[j] && !mask[j]) {
          mask[j] = 1;
          stack[top++] = j;
        }
      }
    }
  }
  return { data: mask, width: w, height: h, pointsPerPixel: 1 };
}

/**
 * Union mask of enclosed open pockets INSIDE the fill (text counters,
 * fixture interiors) — the regions hole-filling adds back into the floor
 * area. Pockets anywhere else (other rooms, outside) are excluded by the
 * interior test.
 */
export function interiorPockets(fill: Uint8Array, barrier: Uint8Array, w: number, h: number): Uint8Array {
  const n = w * h;
  const labels = new Int32Array(n).fill(-1);
  const out = new Uint8Array(n);
  const stack: number[] = [];
  let nextLabel = 0;
  for (let i = 0; i < n; i++) {
    if (fill[i] || barrier[i] || labels[i] !== -1) continue;
    // Flood one open-space component
    const members: number[] = [];
    stack.push(i);
    labels[i] = nextLabel;
    while (stack.length) {
      const j = stack.pop()!;
      members.push(j);
      const x = j % w;
      if (x > 0 && !fill[j - 1] && !barrier[j - 1] && labels[j - 1] === -1) { labels[j - 1] = nextLabel; stack.push(j - 1); }
      if (x < w - 1 && !fill[j + 1] && !barrier[j + 1] && labels[j + 1] === -1) { labels[j + 1] = nextLabel; stack.push(j + 1); }
      if (j >= w && !fill[j - w] && !barrier[j - w] && labels[j - w] === -1) { labels[j - w] = nextLabel; stack.push(j - w); }
      if (j < n - w && !fill[j + w] && !barrier[j + w] && labels[j + w] === -1) { labels[j + w] = nextLabel; stack.push(j + w); }
    }
    // (a) genuine interior holes are small (text counters, fixture
    // interiors) — big "pockets" are swing wedges and open space that
    // happens to be enclosed, which must not inflate the area.
    if (members.length > 150) continue;
    // (b) must touch the fill within 2px — kills the exterior background
    // and distant sealed rooms, which can never inflate the area.
    let nearFill = false;
    for (const m of members) {
      const x = m % w;
      const y = (m / w) | 0;
      for (let dy = -2; dy <= 2 && !nearFill; dy++) {
        for (let dx = -2; dx <= 2 && !nearFill; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          if (fill[ny * w + nx]) nearFill = true;
        }
      }
      if (nearFill) break;
    }
    if (!nearFill) continue;
    // (b) interior test: everything within 3px of the pocket must be fill,
    // barrier, or the pocket itself.
    const pocket = new Uint8Array(n);
    for (const m of members) pocket[m] = 1;
    if (holeIsInterior(fill, barrier, pocket, w, h)) {
      for (const m of members) out[m] = 1;
    }
    nextLabel++;
  }
  return out;
}

export function maskPixelCount(mask: Uint8Array): number {
  let count = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i]) count++;
  return count;
}

/** Rough perimeter: count filled↔empty 4-neighbour edges. Overestimates on
 *  diagonal edges — that's why the UI always says "rough". */
export function maskBoundaryEdges(mask: FillMask): number {
  const { data, width: w, height: h } = mask;
  let edges = 0;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const i = row + x;
      if (!data[i]) continue;
      if (x === 0 || !data[i - 1]) edges++;
      if (x === w - 1 || !data[i + 1]) edges++;
      if (y === 0 || !data[i - w]) edges++;
      if (y === h - 1 || !data[i + w]) edges++;
    }
  }
  return edges;
}

/** 4-neighbour dilation of a mask by `passes` pixels. */
export function dilateMask(m: Uint8Array, w: number, h: number, passes: number): Uint8Array {
  let cur = m;
  for (let p = 0; p < passes; p++) {
    const out = cur.slice();
    for (let y = 1; y < h - 1; y++) {
      const row = y * w;
      for (let x = 1; x < w - 1; x++) {
        const i = row + x;
        if (cur[i]) continue;
        if (cur[i - 1] || cur[i + 1] || cur[i - w] || cur[i + w]) out[i] = 1;
      }
    }
    cur = out;
  }
  return cur;
}

/** 4-neighbour erosion of a mask by `passes` pixels. */
export function erodeMask(m: Uint8Array, w: number, h: number, passes: number): Uint8Array {
  let cur = m;
  for (let p = 0; p < passes; p++) {
    const out = cur.slice();
    for (let y = 1; y < h - 1; y++) {
      const row = y * w;
      for (let x = 1; x < w - 1; x++) {
        const i = row + x;
        if (cur[i] && !(cur[i - 1] && cur[i + 1] && cur[i - w] && cur[i + w])) out[i] = 0;
      }
    }
    cur = out;
  }
  return cur;
}

/**
 * Morphological closing (dilate → erode): seals gaps up to ~2×k px wide —
 * door openings with swings/panels — while restoring line thickness
 * afterwards, unlike plain dilation which fattens every wall.
 */
export function morphClose(m: Uint8Array, w: number, h: number, k: number): Uint8Array {
  return erodeMask(dilateMask(m, w, h, k), w, h, k);
}

/**
 * A hole counts as INSIDE the measured region only if it is fully wrapped
 * by the fill (looking through the barrier lines that enclose it).
 * Pockets outside the room fail this test.
 */
export function holeIsInterior(
  fill: Uint8Array,
  barrier: Uint8Array,
  hole: Uint8Array,
  w: number,
  h: number,
): boolean {
  const ring = dilateMask(hole, w, h, 3);
  for (let i = 0; i < ring.length; i++) {
    if (ring[i] && !hole[i] && !fill[i] && !barrier[i]) return false;
  }
  return true;
}

/**
 * Rough perimeter edges of the fill. An edge counts when a filled pixel
 * borders:
 *   - open empty space, or
 *   - a "big" barrier component (walls), or
 *   - the raster edge.
 * Small barrier components (room labels, PT codes, symbols — text punches
 * holes in the fill) contribute ZERO. Barrier edges near a user cutout hole
 * stop counting (that's the point of cutting an obstacle), and manual
 * polygon cutout regions never count (island outlines aren't walls).
 */
export function perimeterEdges(opts: {
  fill: Uint8Array;
  w: number;
  h: number;
  barrier: Uint8Array;
  bigBarrier: Uint8Array;
  holes?: Uint8Array[];
  polys?: Uint8Array[];
}): number {
  const { fill, w, h, barrier, bigBarrier, holes = [], polys = [] } = opts;
  let holeSkip: Uint8Array | null = null;
  if (holes.length > 0) {
    holeSkip = new Uint8Array(w * h);
    for (const c of holes) for (let i = 0; i < holeSkip.length; i++) if (c[i]) holeSkip[i] = 1;
    holeSkip = dilateMask(holeSkip, w, h, 8); // cover the hole's outline stroke
  }
  let polyUnion: Uint8Array | null = null;
  if (polys.length > 0) {
    polyUnion = new Uint8Array(w * h);
    for (const c of polys) for (let i = 0; i < polyUnion.length; i++) if (c[i]) polyUnion[i] = 1;
  }
  let edges = 0;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const i = row + x;
      if (!fill[i]) continue;
      const neighbors = [
        x > 0 ? i - 1 : -1,
        x < w - 1 ? i + 1 : -1,
        y > 0 ? i - w : -1,
        y < h - 1 ? i + w : -1,
      ];
      for (const j of neighbors) {
        if (j === -1) {
          edges++;
          continue;
        }
        if (fill[j]) continue;
        if (polyUnion && polyUnion[j]) continue;
        if (holeSkip && holeSkip[j]) continue;
        if (barrier[j]) {
          if (bigBarrier[j]) edges++;
        } else {
          edges++;
        }
      }
    }
  }
  return edges;
}

/**
 * Connected-component labeling of a barrier map; returns a mask of the
 * "big" components (walls), dilated by 2px to cover the gap-bridging skirt
 * the fill was computed with. IMPORTANT: pass the RAW barrier map
 * (barrierMap(img, 0)) — on the dilated map, dense text merges into blobs
 * big enough to look like walls. Text, symbols and hatch fragments are
 * small raw components and get filtered out.
 */
export function bigBarrierMask(
  barrier: Uint8Array,
  w: number,
  h: number,
  minSize = 60,
): Uint8Array {
  const n = w * h;
  const labels = new Int32Array(n).fill(-1);
  const sizes: number[] = [];
  const stack: number[] = [];
  for (let i = 0; i < n; i++) {
    if (!barrier[i] || labels[i] !== -1) continue;
    const label = sizes.length;
    let size = 0;
    stack.push(i);
    labels[i] = label;
    while (stack.length) {
      const j = stack.pop()!;
      size++;
      const x = j % w;
      if (x > 0 && barrier[j - 1] && labels[j - 1] === -1) { labels[j - 1] = label; stack.push(j - 1); }
      if (x < w - 1 && barrier[j + 1] && labels[j + 1] === -1) { labels[j + 1] = label; stack.push(j + 1); }
      if (j >= w && barrier[j - w] && labels[j - w] === -1) { labels[j - w] = label; stack.push(j - w); }
      if (j < n - w && barrier[j + w] && labels[j + w] === -1) { labels[j + w] = label; stack.push(j + w); }
    }
    sizes.push(size);
  }
  const big = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (labels[i] !== -1 && sizes[labels[i]] >= minSize) big[i] = 1;
  }
  return dilateMask(big, w, h, 2);
}

/** Rasterize a page-space polygon into a working-buffer mask (even-odd). */
export function polygonToMask(
  points: { x: number; y: number }[],
  w: number,
  h: number,
  pointsPerPixel: number,
): Uint8Array {
  const px = points.map((p) => ({ x: p.x / pointsPerPixel, y: p.y / pointsPerPixel }));
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const yc = y + 0.5;
    const xs: number[] = [];
    for (let i = 0; i < px.length; i++) {
      const a = px[i];
      const b = px[(i + 1) % px.length];
      if (a.y === b.y) continue;
      if (yc >= Math.min(a.y, b.y) && yc < Math.max(a.y, b.y)) {
        xs.push(a.x + ((yc - a.y) / (b.y - a.y)) * (b.x - a.x));
      }
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x0 = Math.max(0, Math.round(xs[k]));
      const x1 = Math.min(w - 1, Math.round(xs[k + 1]));
      for (let x = x0; x <= x1; x++) mask[y * w + x] = 1;
    }
  }
  return mask;
}

/** Composite mask: base minus all cutouts. */
export function applyCutouts(base: FillMask, cutouts: Uint8Array[]): Uint8Array {
  const out = base.data.slice();
  for (const c of cutouts) {
    for (let i = 0; i < out.length; i++) if (c[i]) out[i] = 0;
  }
  return out;
}

/** Render a mask as a tinted image for overlay drawing / persistence. */
export function maskToCanvas(mask: FillMask, rgba: [number, number, number, number]): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = mask.width;
  canvas.height = mask.height;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(mask.width, mask.height);
  for (let i = 0; i < mask.data.length; i++) {
    if (!mask.data[i]) continue;
    const o = i * 4;
    img.data[o] = rgba[0];
    img.data[o + 1] = rgba[1];
    img.data[o + 2] = rgba[2];
    img.data[o + 3] = rgba[3];
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}
