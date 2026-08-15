import type { PDFPageProxy, RenderTask } from 'pdfjs-dist';

/** A rect in page space (PDF points, top-left origin, at scale 1). */
export interface PageRect {
  qx: number;
  qy: number;
  qw: number;
  qh: number;
}

export interface RenderedRegion extends PageRect {
  canvas: HTMLCanvasElement;
  /** Device pixels per page point used for this render (zoom * dpr, possibly
   *  reduced to stay under the pixel budget). */
  scale: number;
}

export function rectContains(outer: PageRect, inner: PageRect): boolean {
  return (
    inner.qx >= outer.qx &&
    inner.qy >= outer.qy &&
    inner.qx + inner.qw <= outer.qx + outer.qw &&
    inner.qy + inner.qh <= outer.qy + outer.qh
  );
}

/**
 * Renders a sub-region of a page to an offscreen canvas.
 *
 * Uses PageViewport's offsetX/offsetY so only `rect` ends up on the canvas —
 * this is what keeps 36"x48" sheets cheap: we never allocate a full-page
 * high-DPI bitmap, only the visible window (plus margin).
 */
export function renderPageRegion(
  page: PDFPageProxy,
  rect: PageRect,
  scale: number,
  taskSlot: { current: RenderTask | null },
): { promise: Promise<RenderedRegion>; task: RenderTask } {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(rect.qw * scale));
  canvas.height = Math.max(1, Math.round(rect.qh * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d canvas context unavailable');

  const viewport = page.getViewport({
    scale,
    offsetX: -rect.qx * scale,
    offsetY: -rect.qy * scale,
  });
  const task = page.render({
    canvasContext: ctx,
    viewport,
    background: '#ffffff',
  });
  taskSlot.current = task;
  const promise = task.promise.then(() => ({ canvas, scale, ...rect }));
  return { promise, task };
}

export function isRenderingCancelled(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.name === 'RenderingCancelledException' ||
      /cancelled|canceled/i.test(err.message))
  );
}

interface CacheEntry extends RenderedRegion {
  key: string;
  bytes: number;
}

/**
 * Small LRU cache of rendered page regions. Keeps re-render on zoom-end cheap
 * when the user zooms back to a previously rendered window, and keeps memory
 * bounded on huge sheets.
 */
export class PageRenderCache {
  private entries = new Map<string, CacheEntry>();
  private bytes = 0;

  constructor(private maxBytes = 160 * 1024 * 1024) {}

  private static keyOf(pageKey: string, scale: number): string {
    return `${pageKey}@${scale.toFixed(3)}`;
  }

  /** Returns a cached region that fully covers `rect` at ~`scale`, if any. */
  get(pageKey: string, scale: number, rect: PageRect): RenderedRegion | null {
    const key = PageRenderCache.keyOf(pageKey, scale);
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (!rectContains(entry, rect)) return null;
    // LRU touch
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry;
  }

  put(pageKey: string, region: RenderedRegion): void {
    const key = PageRenderCache.keyOf(pageKey, region.scale);
    const existing = this.entries.get(key);
    if (existing) {
      this.bytes -= existing.bytes;
      this.entries.delete(key);
    }
    const bytes = region.canvas.width * region.canvas.height * 4;
    const entry: CacheEntry = { ...region, key, bytes };
    this.entries.set(key, entry);
    this.bytes += bytes;
    while (this.bytes > this.maxBytes && this.entries.size > 0) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined || oldest === key) break;
      const victim = this.entries.get(oldest);
      if (victim) this.bytes -= victim.bytes;
      this.entries.delete(oldest);
    }
  }

  clear(): void {
    this.entries.clear();
    this.bytes = 0;
  }
}
