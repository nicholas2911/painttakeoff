import { useEffect, useRef, useState } from 'react';
import type { PagePoint, ToolMode, ViewTransform } from '../types';
import { formatLength, pointDistance, type UnitSystem } from '../measure/units';
import type { Measurement } from '../measure/measureStore';

/**
 * OverlayLayer — the interaction/drawing layer above the PDF canvas.
 * Everything is stored in page space (PDF points, top-left origin) so it
 * survives pan/zoom/page switches. Hosts: set-scale picking, double-check
 * picking, chain measuring, finished-measurement rendering + selection,
 * and Quick Area region overlays.
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
  onTwoPoints(kind: 'calibrate' | 'axisCheck', p1: PagePoint, p2: PagePoint): void;
  onFirstPointPlaced(): void;
  onPanBy(dx: number, dy: number): void;
  onCancelIntent(): void;
  onFinishMeasurement(points: PagePoint[]): void;
  onLiveMeasure(info: LiveMeasure | null): void;
  onSelect(id: string | null): void;
  onDeleteMeasurement(id: string): void;
  onQuickAreaClick(p: PagePoint): void;
  /** Bump to clear in-progress interaction (Escape). */
  resetSignal: number;
  /** Bump to finish the current measurement chain (Enter / double-click). */
  finishSignal: number;
}

const CLICK_SLOP = 4; // px: below this a press is a click, above it a drag

export default function Overlay(props: OverlayProps) {
  const { view, size, mode, spaceDown, pointsPerMeter, units } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pending, setPending] = useState<PagePoint | null>(null); // calibrate/axisCheck first click
  const [chain, setChain] = useState<PagePoint[]>([]); // committed measure points
  const [cursor, setCursor] = useState<PagePoint | null>(null);
  const panRef = useRef<{ x: number; y: number } | null>(null);
  const downRef = useRef<{ x: number; y: number } | null>(null);
  const draggingRef = useRef(false);
  const deleteBoxRef = useRef<{ x: number; y: number; w: number; h: number; id: string } | null>(null);

  // Colors readable on white plans in both themes.
  const cScale = '#e15b00'; // set-scale picking
  const cMeasure = props.dark ? '#3ecf7a' : '#0d8a4f'; // finished measurements
  const cActive = '#1a66cc'; // active chain / selection

  const toPage = (sx: number, sy: number): PagePoint => ({
    x: (sx - view.panX) / view.zoom,
    y: (sy - view.panY) / view.zoom,
  });

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
    props.onLiveMeasure(null);
    if (cleaned.length >= 2) props.onFinishMeasurement(cleaned);
  };

  // External reset (Escape / mode change)
  useEffect(() => {
    setPending(null);
    setChain([]);
    setCursor(null);
    props.onLiveMeasure(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.resetSignal, mode]);

  // Enter / double-click finish
  const chainRef = useRef(chain);
  chainRef.current = chain;
  useEffect(() => {
    if (props.finishSignal > 0 && chainRef.current.length >= 2) finishChain(chainRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.finishSignal]);

  // Live measure reporting for the guidance bar
  useEffect(() => {
    if (mode !== 'measure' || chain.length === 0 || !pointsPerMeter) {
      if (mode === 'measure' && chain.length === 0) props.onLiveMeasure(null);
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
  }, [chain, cursor, mode, pointsPerMeter]);

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

    // Quick Area region overlays (active session + accepted rooms)
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
      // Label at the midpoint of the middle segment
      const mid = m.points[Math.floor(m.points.length / 2)];
      const prev = m.points[Math.floor(m.points.length / 2) - 1] ?? m.points[0];
      const lx = (sx(mid) + sx(prev)) / 2;
      const ly = (sy(mid) + sy(prev)) / 2;
      drawLabel(lx, ly, formatLength(m.totalMeters, units), color, selected ? m.id : undefined);
    }

    // Set-scale picking marker
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

    // Active measurement chain
    if (mode === 'measure' && chain.length > 0) {
      ctx.strokeStyle = cActive;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      chain.forEach((p, i) => (i === 0 ? ctx.moveTo(sx(p), sy(p)) : ctx.lineTo(sx(p), sy(p))));
      if (cursor) ctx.lineTo(sx(cursor), sy(cursor));
      ctx.stroke();
      for (const p of chain) drawMarker(p, cActive);
      if (cursor && pointsPerMeter) {
        const seg = pointDistance(chain[chain.length - 1], cursor) / pointsPerMeter;
        const total = chainMeters(chain) + seg;
        const text =
          chain.length >= 1
            ? `${formatLength(seg, units)}  ·  total ${formatLength(total, units)}`
            : formatLength(seg, units);
        drawLabel(sx(cursor), sy(cursor), text, cActive);
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
    const tol = 7 / view.zoom; // 7 screen px
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
    draggingRef.current = false;
    if (e.button === 1 || spaceDown || mode === 'pan') {
      panRef.current = pos;
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const pos = localPos(e);
    if (panRef.current) {
      const dx = pos.x - panRef.current.x;
      const dy = pos.y - panRef.current.y;
      panRef.current = pos;
      props.onPanBy(dx, dy);
      return;
    }
    if (downRef.current && Math.hypot(pos.x - downRef.current.x, pos.y - downRef.current.y) > CLICK_SLOP) {
      draggingRef.current = true;
    }
    if (mode === 'measure' || mode === 'calibrate' || mode === 'axisCheck' || mode === 'quickArea') {
      setCursor(toPage(pos.x, pos.y));
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const pos = localPos(e);
    const wasPanning = panRef.current !== null;
    panRef.current = null;
    const down = downRef.current;
    downRef.current = null;
    if (wasPanning || e.button !== 0 || !down) return;
    const moved = Math.hypot(pos.x - down.x, pos.y - down.y) > CLICK_SLOP;
    const p = toPage(pos.x, pos.y);

    if (mode === 'calibrate' || mode === 'axisCheck') {
      if (moved) {
        // Click-drag: treat press and release as the two points.
        if (!pending) {
          props.onTwoPoints(mode, toPage(down.x, down.y), p);
        } else {
          const p1 = pending;
          setPending(null);
          props.onTwoPoints(mode, p1, p);
        }
        return;
      }
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
      if (!moved) props.onQuickAreaClick(p);
      return;
    }

    if (mode === 'measure' && pointsPerMeter) {
      // Delete affordance on a selected measurement's label
      const del = deleteBoxRef.current;
      if (del && pos.x >= del.x && pos.x <= del.x + del.w && pos.y >= del.y && pos.y <= del.y + del.h) {
        props.onDeleteMeasurement(del.id);
        return;
      }
      if (chain.length === 0) {
        if (moved) {
          // Quick one-segment drag (old habit).
          props.onFinishMeasurement([toPage(down.x, down.y), p]);
          return;
        }
        // Clicking an existing measurement selects it instead of chaining.
        const hit = hitTest(p);
        if (hit) {
          props.onSelect(hit);
          return;
        }
        props.onSelect(null);
        setChain([p]);
        return;
      }
      // Chaining: click adds a point (drags mid-chain are ignored).
      if (!moved) setChain([...chain, p]);
      return;
    }

    if (mode === 'pan') {
      if (moved) return;
      const del = deleteBoxRef.current;
      if (del && pos.x >= del.x && pos.x <= del.x + del.w && pos.y >= del.y && pos.y <= del.y + del.h) {
        props.onDeleteMeasurement(del.id);
        return;
      }
      props.onSelect(hitTest(p));
    }
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    if (mode === 'measure' && chain.length >= 2) {
      e.preventDefault();
      finishChain(chain);
    }
  };

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (mode === 'measure' && chain.length > 0) {
      // Right-click undoes the last point; Esc cancels the whole chain.
      const next = chain.slice(0, -1);
      setChain(next);
      if (next.length === 0) props.onLiveMeasure(null);
      return;
    }
    setPending(null);
    props.onCancelIntent();
  };

  const cursor_ =
    spaceDown || mode === 'pan'
      ? 'grab'
      : mode === 'calibrate' || mode === 'axisCheck' || mode === 'measure' || mode === 'quickArea'
        ? 'crosshair'
        : 'default';

  return (
    <canvas
      ref={canvasRef}
      className="overlay-canvas"
      style={{ width: size.w, height: size.h, cursor: cursor_ }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    />
  );
}
