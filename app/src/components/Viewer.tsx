import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import type { PDFPageProxy, RenderTask } from 'pdfjs-dist';
import type { LoadedPlan } from '../pdf/pdfDocument';
import {
  PageRenderCache,
  isRenderingCancelled,
  rectContains,
  renderPageRegion,
  type PageRect,
  type RenderedRegion,
} from '../pdf/pageRenderer';
import type { PagePoint, ToolMode, ViewTransform } from '../types';
import type { UnitSystem } from '../measure/units';
import Overlay, { type AreaOverlay, type LiveMeasure } from './Overlay';
import type { Measurement } from '../measure/measureStore';

export interface PageRaster {
  canvas: HTMLCanvasElement;
  /** Page points per raster pixel. */
  pointsPerPixel: number;
  /** Full page size in page space (PDF points). */
  pageW: number;
  pageH: number;
}

export interface ViewerHandle {
  fitWidth(): void;
  fitPage(): void;
  zoomBy(factor: number): void;
  /** Full-page raster at a working resolution (for Quick Area flood fill). */
  getPageRaster(maxDim?: number): Promise<PageRaster | null>;
}

interface ViewerProps {
  plan: LoadedPlan | null;
  pageNum: number;
  view: ViewTransform;
  onViewChange(v: ViewTransform): void;
  mode: ToolMode;
  spaceDown: boolean;
  dark: boolean;
  pointsPerMeter: number | null;
  units: UnitSystem;
  measurements: Measurement[];
  selectedId: string | null;
  areaOverlays: AreaOverlay[];
  onTwoPoints(kind: 'calibrate' | 'axisCheck', p1: PagePoint, p2: PagePoint): void;
  onFirstPointPlaced(): void;
  onCancelIntent(): void;
  onFinishMeasurement(points: PagePoint[]): void;
  onLiveMeasure(info: LiveMeasure | null): void;
  onSelect(id: string | null): void;
  onDeleteMeasurement(id: string): void;
  onQuickAreaClick(p: PagePoint): void;
  resetSignal: number;
  finishSignal: number;
}

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 16;
/** Max device pixels for one rendered region (visible window + margin). */
const PIXEL_BUDGET = 36_000_000;
const MARGIN = 0.35; // extra rendered beyond each visible edge (fraction)
const OVERPAN = 80; // px the page may be dragged past the container edge

const Viewer = forwardRef<ViewerHandle, ViewerProps>(function Viewer(props, ref) {
  const { plan, pageNum, view, onViewChange } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [pageDims, setPageDims] = useState({ w: 0, h: 0 }); // page space (pt)
  const [committedZoom, setCommittedZoom] = useState(1);
  const pageRef = useRef<PDFPageProxy | null>(null);
  const renderInfo = useRef<RenderedRegion | null>(null);
  const renderSeq = useRef(0);
  const taskSlot = useRef<RenderTask | null>(null);
  const cache = useRef(new PageRenderCache());
  const renderTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const viewRef = useRef(view);
  viewRef.current = view;
  const dimsRef = useRef(pageDims);
  dimsRef.current = pageDims;
  const sizeRef = useRef(size);
  sizeRef.current = size;

  // ---------- view helpers ----------
  const clampPan = useCallback((v: ViewTransform): ViewTransform => {
    const dims = dimsRef.current;
    const s = sizeRef.current;
    if (dims.w === 0 || s.w === 0) return v;
    const pw = dims.w * v.zoom;
    const ph = dims.h * v.zoom;
    let { panX, panY } = v;
    if (pw <= s.w) panX = (s.w - pw) / 2;
    else panX = Math.min(OVERPAN, Math.max(s.w - pw - OVERPAN, panX));
    if (ph <= s.h) panY = (s.h - ph) / 2;
    else panY = Math.min(OVERPAN, Math.max(s.h - ph - OVERPAN, panY));
    return { ...v, panX, panY };
  }, []);

  const applyView = useCallback(
    (v: ViewTransform) => {
      // Any user-driven camera change ends the initial fit-page tracking.
      needsFitRef.current = false;
      onViewChange(clampPan(v));
    },
    [onViewChange, clampPan],
  );

  const zoomAt = useCallback(
    (cx: number, cy: number, targetZoom: number) => {
      const cur = viewRef.current;
      const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, targetZoom));
      const k = zoom / cur.zoom;
      applyView({
        zoom,
        panX: cx - (cx - cur.panX) * k,
        panY: cy - (cy - cur.panY) * k,
      });
    },
    [applyView],
  );

  useImperativeHandle(ref, () => ({
    fitWidth() {
      const dims = dimsRef.current;
      const s = sizeRef.current;
      if (!dims.w || !s.w) return;
      const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, (s.w - 24) / dims.w));
      applyView({ zoom, panX: (s.w - dims.w * zoom) / 2, panY: 12 });
    },
    fitPage() {
      const dims = dimsRef.current;
      const s = sizeRef.current;
      if (!dims.w || !s.w) return;
      const zoom = Math.min(
        MAX_ZOOM,
        Math.max(MIN_ZOOM, Math.min((s.w - 24) / dims.w, (s.h - 24) / dims.h)),
      );
      applyView({
        zoom,
        panX: (s.w - dims.w * zoom) / 2,
        panY: (s.h - dims.h * zoom) / 2,
      });
    },
    zoomBy(factor: number) {
      const s = sizeRef.current;
      zoomAt(s.w / 2, s.h / 2, viewRef.current.zoom * factor);
    },
    async getPageRaster(maxDim = 1600) {
      const page = pageRef.current;
      const dims = dimsRef.current;
      if (!page || dims.w === 0) return null;
      if (rasterCache.current && rasterCache.current.page === pageRef.current) {
        return rasterCache.current.raster;
      }
      const scale = Math.min(maxDim / dims.w, maxDim / dims.h);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(dims.w * scale));
      canvas.height = Math.max(1, Math.round(dims.h * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      await page.render({
        canvasContext: ctx,
        viewport: page.getViewport({ scale }),
        background: '#ffffff',
      }).promise;
      const raster = { canvas, pointsPerPixel: 1 / scale, pageW: dims.w, pageH: dims.h };
      rasterCache.current = { page, raster };
      return raster;
    },
  }));

  // Full-page raster cache for Quick Area (one entry, per page).
  const rasterCache = useRef<{ page: PDFPageProxy; raster: PageRaster } | null>(null);
  useEffect(() => {
    rasterCache.current = null;
  }, [plan, pageNum]);

  // ---------- container sizing ----------
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    const r = el.getBoundingClientRect();
    setSize({ w: r.width, h: r.height });
    return () => ro.disconnect();
  }, []);

  // ---------- page loading ----------
  useEffect(() => {
    let cancelled = false;
    if (!plan) {
      pageRef.current = null;
      setPageDims({ w: 0, h: 0 });
      return;
    }
    plan.doc.getPage(pageNum).then(
      (page) => {
        if (cancelled) return;
        pageRef.current = page;
        const vp = page.getViewport({ scale: 1 });
        setPageDims({ w: vp.width, h: vp.height });
      },
      (err) => console.error('Failed to load page', err),
    );
    return () => {
      cancelled = true;
    };
  }, [plan, pageNum]);

  // New document: clear bitmap cache, and remember to fit the whole page
  // once the page dimensions and container size are known (they arrive
  // asynchronously, after the plan itself).
  const planRef = useRef<LoadedPlan | null>(null);
  const needsFitRef = useRef(false);
  useEffect(() => {
    if (plan !== planRef.current) {
      planRef.current = plan;
      cache.current.clear();
      renderInfo.current = null;
      needsFitRef.current = true;
    }
  }, [plan]);

  // Camera placement: fit the whole page on document open; re-center on
  // page switch. needsFitRef stays set until the user moves the camera
  // themselves (applyView), so late layout shifts (toolbars/bars appearing,
  // window resizes) re-fit instead of leaving a wrongly-framed first page.
  const prevPageRef = useRef(pageNum);
  useEffect(() => {
    if (pageDims.w === 0 || size.w === 0) return;
    if (plan && needsFitRef.current) {
      prevPageRef.current = pageNum;
      const zoom = Math.min(
        MAX_ZOOM,
        Math.max(MIN_ZOOM, Math.min((size.w - 24) / pageDims.w, (size.h - 24) / pageDims.h)),
      );
      onViewChange({
        zoom,
        panX: (size.w - pageDims.w * zoom) / 2,
        panY: (size.h - pageDims.h * zoom) / 2,
      });
    } else if (prevPageRef.current !== pageNum) {
      prevPageRef.current = pageNum;
      const cur = viewRef.current;
      onViewChange(
        clampPan({
          zoom: cur.zoom,
          panX: (size.w - pageDims.w * cur.zoom) / 2,
          panY: 12,
        }),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, pageNum, pageDims, size]);

  // ---------- CSS transform (cheap, runs on every pan/zoom) ----------
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    const k = view.zoom / committedZoom;
    layer.style.transform = `translate3d(${view.panX}px, ${view.panY}px, 0) scale(${k})`;
  }, [view, committedZoom, pageDims]);

  // ---------- rendering ----------
  const visibleRect = useCallback((): PageRect => {
    const v = viewRef.current;
    const s = sizeRef.current;
    return {
      qx: -v.panX / v.zoom,
      qy: -v.panY / v.zoom,
      qw: s.w / v.zoom,
      qh: s.h / v.zoom,
    };
  }, []);

  const expandAndClamp = useCallback((r: PageRect, margin: number): PageRect => {
    const dims = dimsRef.current;
    let { qx, qy, qw, qh } = r;
    qx -= qw * margin;
    qy -= qh * margin;
    qw *= 1 + margin * 2;
    qh *= 1 + margin * 2;
    const x2 = Math.min(qx + qw, dims.w);
    const y2 = Math.min(qy + qh, dims.h);
    qx = Math.max(0, qx);
    qy = Math.max(0, qy);
    return { qx, qy, qw: Math.max(1, x2 - qx), qh: Math.max(1, y2 - qy) };
  }, []);

  const drawRegion = useCallback(
    (region: RenderedRegion) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = region.canvas.width;
      canvas.height = region.canvas.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(region.canvas, 0, 0);
      const cssScale = region.scale / dpr;
      canvas.style.left = `${region.qx * cssScale}px`;
      canvas.style.top = `${region.qy * cssScale}px`;
      canvas.style.width = `${region.qw * cssScale}px`;
      canvas.style.height = `${region.qh * cssScale}px`;
      renderInfo.current = region;
      setCommittedZoom(cssScale);
    },
    [],
  );

  const doRender = useCallback(async () => {
    const page = pageRef.current;
    const currentPlan = planRef.current;
    if (!page || !currentPlan || dimsRef.current.w === 0) return;
    const dpr = window.devicePixelRatio || 1;
    const v = viewRef.current;

    let rect = expandAndClamp(visibleRect(), MARGIN);
    let scale = v.zoom * dpr;
    if (rect.qw * rect.qh * scale * scale > PIXEL_BUDGET) {
      rect = expandAndClamp(visibleRect(), 0);
      if (rect.qw * rect.qh * scale * scale > PIXEL_BUDGET) {
        scale = Math.sqrt(PIXEL_BUDGET / (rect.qw * rect.qh));
      }
    }

    const pageKey = `${currentPlan.fingerprint}:${pageNum}`;
    const cached = cache.current.get(pageKey, scale, rect);
    if (cached) {
      drawRegion(cached);
      return;
    }

    taskSlot.current?.cancel();
    const mySeq = ++renderSeq.current;
    try {
      const { promise } = renderPageRegion(page, rect, scale, taskSlot);
      const region = await promise;
      if (mySeq !== renderSeq.current) return; // superseded while rendering
      cache.current.put(pageKey, region);
      drawRegion(region);
    } catch (err) {
      if (!isRenderingCancelled(err)) console.error('Render failed', err);
    }
  }, [pageNum, visibleRect, expandAndClamp, drawRegion]);

  // Schedule renders: zoom changes settle after 160ms (crisp re-render on
  // zoom end), pans after 90ms, page changes immediately-ish.
  useEffect(() => {
    if (!plan || pageDims.w === 0 || size.w === 0) return;
    const cur = renderInfo.current;
    const zoomSettled =
      cur !== null && Math.abs(view.zoom - committedZoom) / committedZoom < 0.015;
    if (cur && zoomSettled) {
      const curRect: PageRect = { qx: cur.qx, qy: cur.qy, qw: cur.qw, qh: cur.qh };
      if (rectContains(curRect, visibleRect())) return; // already covered
    }
    if (renderTimer.current) clearTimeout(renderTimer.current);
    const delay = zoomSettled ? 90 : 160;
    renderTimer.current = setTimeout(() => {
      void doRender();
    }, delay);
    return () => {
      if (renderTimer.current) clearTimeout(renderTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, pageNum, view, size, pageDims, committedZoom]);

  // ---------- wheel: ctrl+wheel zoom (cursor-centered), wheel pan ----------
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!planRef.current) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      if (e.ctrlKey || e.metaKey) {
        const factor = Math.exp(-e.deltaY * 0.0022);
        zoomAt(cx, cy, viewRef.current.zoom * factor);
      } else {
        const cur = viewRef.current;
        applyView({ ...cur, panX: cur.panX - e.deltaX, panY: cur.panY - e.deltaY });
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt, applyView]);

  const onPanBy = useCallback(
    (dx: number, dy: number) => {
      const cur = viewRef.current;
      applyView({ ...cur, panX: cur.panX + dx, panY: cur.panY + dy });
    },
    [applyView],
  );

  return (
    <div ref={containerRef} className="viewer">
      {plan && (
        <div ref={layerRef} className="page-layer">
          <canvas ref={canvasRef} className="pdf-canvas" />
        </div>
      )}
      {plan && (
        <Overlay
          view={view}
          size={size}
          mode={props.mode}
          spaceDown={props.spaceDown}
          dark={props.dark}
          pointsPerMeter={props.pointsPerMeter}
          units={props.units}
          measurements={props.measurements}
          selectedId={props.selectedId}
          areaOverlays={props.areaOverlays}
          onTwoPoints={props.onTwoPoints}
          onPanBy={onPanBy}
          onFirstPointPlaced={props.onFirstPointPlaced}
          onCancelIntent={props.onCancelIntent}
          onFinishMeasurement={props.onFinishMeasurement}
          onLiveMeasure={props.onLiveMeasure}
          onSelect={props.onSelect}
          onDeleteMeasurement={props.onDeleteMeasurement}
          onQuickAreaClick={props.onQuickAreaClick}
          resetSignal={props.resetSignal}
          finishSignal={props.finishSignal}
        />
      )}
    </div>
  );
});

export default Viewer;
