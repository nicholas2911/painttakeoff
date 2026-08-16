import { useEffect, useRef, useState } from 'react';
import type { PagePoint, ToolMode, ViewTransform } from '../types';
import { formatLength, pointDistance, type UnitSystem } from '../measure/units';
import type { Measurement } from '../measure/measureStore';

/**
 * OverlayLayer — the interaction/drawing layer above the PDF canvas.
 * Everything is stored in page space (PDF points, top-left origin) so it
 * survives pan/zoom/page switches.
 *
 * Interaction model (v0.3):
 *  - Left-DRAG always pans, in every mode. A press released within ~5px is
 *    a CLICK (tool action); beyond that it's a pan.
 *  - Measure / cut-out drawing: click adds a point, double-click (or Enter)
 *    finishes, Ctrl+Z undoes a point, Esc cancels.
 *  - Chain points snap to existing measurement vertices within ~10px.
 */

export interface AreaOverlay {
  id: string;
  rect: { qx: number; qy: number; qw: number; qh: number };
  source: HTMLCanvasElement | HTMLImageElement;
}

export interface LiveMeasure {
  segmentMeters: number | null;
  totalMeters: number;
  points: number;
}

interface OverlayProps {
  view: ViewTransform;
  size: { w: number; h: number };
  mode: ToolMode;
  spaceDown: boolean;
  dark: boolean;
  pointsPerMeter: number | null;
  units: UnitSystem;
  measurements: Measurement[];
  selectedId: string | null;
  areaOverlays: AreaOverlay[];
  /** Quick Area: polygon cut-out drawing is active. */
  qaDrawing: boolean;
  onTwoPoints(kind: 'calibrate' | 'axisCheck', p1: PagePoint, p2: PagePoint): void;
  onFirstPointPlaced(): void;
  onPanBy(dx: number, dy: number): void;
  onCancelIntent(): void;
  onFinishMeasurement(points: PagePoint[]): void;
  onFinishCutoutPolygon(points: PagePoint[]): void;
  onLiveMeasure(info: LiveMeasure | null): void;
  onSelect(id: string | null): void;
  onDeleteMeasurement(id: string): void;
  onQuickAreaClick(p: PagePoint): void;
  /** Bump to clear in-progress interaction (Escape). */
  resetSignal: number;
  /** Bump to finish the current chain (Enter / double-click). */
  finishSignal: number;
  /** Bump to remove the last chain point (Ctrl+Z). */
  chainUndoSignal: number;
}

const CLICK_SLOP = 5; // px: below this a press is a click, beyond it a pan
const SNAP_PX = 10; // screen px snap radius

export default function Overlay(props: OverlayProps) {
  const { view, size, mode, spaceDown, pointsPerMeter, units } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pending, setPending] = useState<PagePoint | null>(null); // calibrate/axisCheck first click
  const [chain, setChain] = useState<PagePoint[]>([]); // committed chain points
  const [cursor, setCursor] = useState<PagePoint | null>(null);
  const [snapped, setSnapped] = useState<PagePoint | null>(null);
  const panRef = useRef<{ x: number; y: number } | null>(null);
  const downRef = useRef<{ x: number; y: number } | null>(null);
  const deleteBoxRef = useRef<{ x: number; y: number; w: number; h: number; id: string } | null>(null);

  const cScale = '#e15b00'; // set-scale picking
  const cMeasure = props.dark ? '#3ecf7a' : '#0d8a4f'; // finished measurements
  const cActive = '#1a66cc'; // active chain / selection

  /** Chain drawing is used by Measure and by Quick Area's polygon cut-out. */
  const chainMode = mode === 'measure' || (mode === 'quickArea' && props.qaDrawing);

  const toPage = (sx: number, sy: number): PagePoint => ({
    x: (sx - view.panX) / view.zoom,
    y: (sy - view.panY) / view.zoom,
  });

  // ---------- snapping ----------
  const snapTo = (p: PagePoint): PagePoint | null => {
    if (!chainMode) return null;
    const tol = SNAP_PX / view.zoom;
    let best: PagePoint | null = null;
    let bestD = tol;
    // Close the loop: snap to the chain's own first point.
    if (mode === 'measure' && chain.length >= 2) {
      const d = pointDistance(p, chain[0]);
      if (d < bestD) {
        bestD = d;
        best = chain[0];
      }
    }
    for (const m of props.measurements) {
      if (m.kind !== 'length') continue;
      for (const v of m.points) {
        const d = pointDistance(p, v);
        if (d < bestD) {
          bestD = d;
          best = v;
        }
      }
    }
    return best;
  };

  const chainMeters = (pts: PagePoint[]): number => {
    if (!pointsPerMeter) return 0;
    let sum = 0;
    for (let i = 1; i < pts.length; i++) sum += pointDistance(pts[i - 1], pts[i]);
    return sum / pointsPerMeter;
  };

  const finishChain = (pts: PagePoint[]) => {
    // Drop trailing duplicate points (double-click adds one at the same spot).
    const cleaned = pts.filter((p, i) => i === 0 || pointDistance(p, pts[i - 1]) * view.zoom > 2);
    setChain([]);
    setCursor(null);
    setSnapped(null);
    props.onLiveMeasure(null);
    if (mode === 'quickArea') {
      if (cleaned.length >= 3) props.onFinishCutoutPolygon(cleaned);
    } else if (cleaned.length >= 2) {
      props.onFinishMeasurement(cleaned);
    }
  };

  // External reset (Escape / mode change)
  useEffect(() => {
    setPending(null);
    setChain([]);
    setCursor(null);
    setSnapped(null);
    props.onLiveMeasure(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.resetSignal, mode]);

  // Enter / double-click finish
  const chainRef = useRef(chain);
  chainRef.current = chain;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  useEffect(() => {
    if (props.finishSignal > 0 && chainRef.current.length >= 2) finishChain(chainRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.finishSignal]);

  // Ctrl+Z removes the last chain point
  useEffect(() => {
    if (props.chainUndoSignal > 0) {
      setChain((prev) => {
        const next = prev.slice(0, -1);
        if (next.length === 0) props.onLiveMeasure(null);
        return next;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.chainUndoSignal]);

  // Live measure reporting for the guidance bar
  useEffect(() => {
    if (!chainMode || chain.length === 0 || !pointsPerMeter) {
      if (chainMode && chain.length === 0) props.onLiveMeasure(null);
      return;
    }
    const committed = chainMeters(chain);
    const seg =
      cursor && chain.length > 0
        ? pointDistance(chain[chain.length - 1], cursor) / pointsPerMeter
        : null;
    props.onLiveMeasure({
      segmentMeters: seg,
      totalMeters: committed + (seg ?? 0),
      points: chain.length,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chain, cursor, chainMode, pointsPerMeter]);

  // ---------- drawing ----------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(size.w * dpr));
    canvas.height = Math.max(1, Math.round(size.h * dpr));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);
    deleteBoxRef.current = null;

    const sx = (p: PagePoint) => p.x * view.zoom + view.panX;
    const sy = (p: PagePoint) => p.y * view.zoom + view.panY;

    const drawMarker = (p: PagePoint, color: string) => {
      const x = sx(p);
      const y = sy(p);
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x - 9, y);
      ctx.lineTo(x + 9, y);
      ctx.moveTo(x, y - 9);
      ctx.lineTo(x, y + 9);
      ctx.stroke();
    };

    const drawLabel = (x: number, y: number, text: string, color: string, withDelete?: string) => {
      ctx.font = '600 13px "Segoe UI", system-ui, sans-serif';
      const pad = 7;
      const tw = ctx.measureText(text).width;
      const delW = withDelete ? 20 : 0;
      const bx = x - (tw + delW) / 2 - pad;
      const by = y - 32;
      ctx.fillStyle = props.dark ? 'rgba(28,34,43,0.94)' : 'rgba(255,255,255,0.95)';
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(bx, by, tw + delW + pad * 2, 24, 5);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = props.dark ? '#e8ecf1' : '#1c2634';
      ctx.fillText(text, bx + pad, by + 16);
      if (withDelete) {
        const dx = bx + pad + tw + 4;
        ctx.strokeStyle = '#c0352f';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(dx + 4, by + 7);
        ctx.lineTo(dx + 12, by + 15);
        ctx.moveTo(dx + 12, by + 7);
        ctx.lineTo(dx + 4, by + 15);
        ctx.stroke();
        deleteBoxRef.current = { x: dx, y: by + 3, w: 18, h: 18, id: withDelete };
      }
    };

    // Quick Area region overlays (active session + accepted rooms, incl. red cutouts)
    for (const ov of props.areaOverlays) {
      ctx.drawImage(
        ov.source,
        ov.rect.qx * view.zoom + view.panX,
        ov.rect.qy * view.zoom + view.panY,
        ov.rect.qw * view.zoom,
        ov.rect.qh * view.zoom,
      );
    }

    // Finished measurements
    for (const m of props.measurements) {
      if (m.kind !== 'length') continue;
      const selected = m.id === props.selectedId;
      const color = selected ? cActive : cMeasure;
      ctx.strokeStyle = color;
      ctx.lineWidth = selected ? 3 : 2;
      ctx.beginPath();
      m.points.forEach((p, i) => (i === 0 ? ctx.moveTo(sx(p), sy(p)) : ctx.lineTo(sx(p), sy(p))));
      ctx.stroke();
      for (const p of m.points) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(sx(p), sy(p), selected ? 4 : 3, 0, Math.PI * 2);
        ctx.fill();
      }
      const mid = m.points[Math.floor(m.points.length / 2)];
      const prev = m.points[Math.floor(m.points.length / 2) - 1] ?? m.points[0];
      drawLabel(
        (sx(mid) + sx(prev)) / 2,
        (sy(mid) + sy(prev)) / 2,
        formatLength(m.totalMeters, units),
        color,
        selected ? m.id : undefined,
      );
    }

    // Set-scale picking marker + rubber band
    if (pending && (mode === 'calibrate' || mode === 'axisCheck')) {
      drawMarker(pending, cScale);
      if (cursor) {
        ctx.strokeStyle = cScale;
        ctx.setLineDash([6, 4]);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(sx(pending), sy(pending));
        ctx.lineTo(sx(cursor), sy(cursor));
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Active chain (measure or polygon cut-out)
    if (chainMode && chain.length > 0) {
      ctx.strokeStyle = cActive;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      chain.forEach((p, i) => (i === 0 ? ctx.moveTo(sx(p), sy(p)) : ctx.lineTo(sx(p), sy(p))));
      const live = snapped ?? cursor;
      if (live) ctx.lineTo(sx(live), sy(live));
      ctx.stroke();
      for (const p of chain) drawMarker(p, cActive);
      if (mode === 'measure' && live && pointsPerMeter) {
        const seg = pointDistance(chain[chain.length - 1], live) / pointsPerMeter;
        const total = chainMeters(chain) + seg;
        drawLabel(sx(live), sy(live), `${formatLength(seg, units)}  ·  total ${formatLength(total, units)}`, cActive);
      }
      // Snap indicator ring
      if (snapped) {
        ctx.strokeStyle = cActive;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(sx(snapped), sy(snapped), 9, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(sx(snapped), sy(snapped), 3, 0, Math.PI * 2);
        ctx.fillStyle = cActive;
        ctx.fill();
      }
    }
  });

  // ---------- hit testing ----------
  const distToSegment = (p: PagePoint, a: PagePoint, b: PagePoint): number => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return pointDistance(p, a);
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    return pointDistance(p, { x: a.x + t * dx, y: a.y + t * dy });
  };

  const hitTest = (p: PagePoint): string | null => {
    const tol = 7 / view.zoom;
    let best: string | null = null;
    let bestD = tol;
    for (const m of props.measurements) {
      if (m.kind !== 'length') continue;
      for (let i = 1; i < m.points.length; i++) {
        const d = distToSegment(p, m.points[i - 1], m.points[i]);
        if (d < bestD) {
          bestD = d;
          best = m.id;
        }
      }
    }
    return best;
  };

  // ---------- pointer handling ----------
  const localPos = (e: React.PointerEvent): { x: number; y: number } => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    const pos = localPos(e);
    downRef.current = pos;
    if (e.button === 1 || spaceDown) {
      // middle mouse / spacebar: immediate pan (extras — left-drag pans too)
      panRef.current = pos;
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const pos = localPos(e);
    const down = downRef.current;
    // Left-drag becomes a pan once it moves past the click slop — any mode.
    if (!panRef.current && down && (e.buttons & 1) !== 0) {
      if (Math.hypot(pos.x - down.x, pos.y - down.y) > CLICK_SLOP) {
        panRef.current = { x: down.x, y: down.y };
      }
    }
    if (panRef.current) {
      const dx = pos.x - panRef.current.x;
      const dy = pos.y - panRef.current.y;
      panRef.current = pos;
      props.onPanBy(dx, dy);
      return;
    }
    if (mode === 'measure' || mode === 'calibrate' || mode === 'axisCheck' || mode === 'quickArea') {
      const p = toPage(pos.x, pos.y);
      setCursor(p);
      setSnapped(snapTo(p));
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const pos = localPos(e);
    const wasPanning = panRef.current !== null;
    panRef.current = null;
    const down = downRef.current;
    downRef.current = null;
    if (wasPanning || e.button !== 0 || !down) return;
    // Released within slop = a click (tool action).
    const p = toPage(pos.x, pos.y);

    if (mode === 'calibrate' || mode === 'axisCheck') {
      if (!pending) {
        setPending(p);
        props.onFirstPointPlaced();
      } else {
        const kind = mode;
        const p1 = pending;
        setPending(null);
        props.onTwoPoints(kind, p1, p);
      }
      return;
    }

    if (mode === 'quickArea') {
      if (props.qaDrawing) {
        const sp = snapTo(p);
        setChain([...chain, sp ?? p]);
      } else {
        props.onQuickAreaClick(p);
      }
      return;
    }

    if (mode === 'measure' && pointsPerMeter) {
      const del = deleteBoxRef.current;
      if (del && pos.x >= del.x && pos.x <= del.x + del.w && pos.y >= del.y && pos.y <= del.y + del.h) {
        props.onDeleteMeasurement(del.id);
        return;
      }
      const sp = snapTo(p);
      setChain([...chain, sp ?? p]);
      return;
    }

    if (mode === 'pan') {
      const del = deleteBoxRef.current;
      if (del && pos.x >= del.x && pos.x <= del.x + del.w && pos.y >= del.y && pos.y <= del.y + del.h) {
        props.onDeleteMeasurement(del.id);
        return;
      }
      props.onSelect(hitTest(p));
    }
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    if (chainMode && chain.length >= 2) {
      e.preventDefault();
      finishChain(chain);
    }
  };

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    // Right-click is never required; treat it as a plain cancel.
    setPending(null);
    props.onCancelIntent();
  };

  const cursorStyle =
    spaceDown || mode === 'pan'
      ? 'grab'
      : mode === 'calibrate' || mode === 'axisCheck' || mode === 'measure' || mode === 'quickArea'
        ? 'crosshair'
        : 'default';

  return (
    <canvas
      ref={canvasRef}
      className="overlay-canvas"
      style={{ width: size.w, height: size.h, cursor: cursorStyle }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    />
  );
}
