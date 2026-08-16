import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { destroyPlan, loadPlan, loadPlanFile, type LoadedPlan } from './pdf/pdfDocument';
import {
  loadScales,
  loadUnits,
  saveScale,
  saveUnits,
  type PageScale,
  type ScaleMap,
} from './measure/scaleStore';
import { pointsPerMeterFromRatio } from './measure/presets';
import { formatLength, pointDistance, type UnitSystem } from './measure/units';
import {
  loadMeasurements,
  loadPanelOpen,
  loadDefaultWallHeight,
  newId,
  saveMeasurements,
  saveDefaultWallHeight,
  savePanelOpen,
  type AreaMeasurement,
  type Measurement,
  type MeasurementMap,
} from './measure/measureStore';
import {
  applyCutouts,
  barrierMap,
  bigBarrierMask,
  floodFill,
  holeFill,
  holeIsInterior,
  maskPixelCount,
  maskToCanvas,
  perimeterEdges,
  polygonToMask,
  type FillMask,
} from './measure/floodfill';
import type { PagePoint, ToolMode, UpdateState, ViewTransform } from './types';
import pkg from '../package.json';
import Toolbar from './components/Toolbar';
import TitleBar from './components/TitleBar';
import Viewer, { type ViewerHandle, type PageRaster } from './components/Viewer';
import StepBar from './components/StepBar';
import Welcome from './components/Welcome';
import MeasurementsPanel, { formatArea } from './components/MeasurementsPanel';
import QuickAreaCard, { type QaValues } from './components/QuickAreaCard';
import type { AreaOverlay, LiveMeasure } from './components/Overlay';
import {
  AxisExpectedModal,
  AxisPromptModal,
  AxisWarningModal,
  CalibrationModal,
  CustomScaleModal,
  ShortcutsModal,
} from './components/Modals';

const AXIS_TOLERANCE = 0.02;
const THEME_KEY = 'pt:v1:theme';

type Theme = 'light' | 'dark';

type Flow =
  | { step: 'idle' }
  | { step: 'enterLength'; p1: PagePoint; p2: PagePoint }
  | { step: 'axisPrompt' }
  | { step: 'axisMeasuring' }
  | { step: 'axisExpected'; measuredMeters: number }
  | { step: 'axisWarning'; measuredMeters: number; expectedMeters: number };

interface QaCutoutEntry {
  kind: 'flood' | 'poly';
  /** flood: the enclosed hole mask. poly: the hand-drawn region ∩ fill. */
  mask: Uint8Array;
  areaM2: number;
}

interface QaSession {
  raster: PageRaster;
  base: FillMask;
  barrier: Uint8Array;
  bigBarrier: Uint8Array;
  cutouts: QaCutoutEntry[];
  sub: 'fill' | 'cutout' | 'draw';
}

function loadTheme(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export default function App() {
  const [plan, setPlan] = useState<LoadedPlan | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [view, setView] = useState<ViewTransform>({ zoom: 1, panX: 0, panY: 0 });
  const [mode, setMode] = useState<ToolMode>('pan');
  const [units, setUnits] = useState<UnitSystem>(() => loadUnits());
  const [theme, setTheme] = useState<Theme>(() => loadTheme());
  const [scales, setScales] = useState<ScaleMap>({});
  const [measurements, setMeasurements] = useState<MeasurementMap>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState<boolean>(() => loadPanelOpen());
  const [flow, setFlow] = useState<Flow>({ step: 'idle' });
  const [customScaleOpen, setCustomScaleOpen] = useState(false);
  const [qa, setQa] = useState<QaSession | null>(null);
  const [qaValues, setQaValues] = useState<QaValues | null>(null);
  const [qaBusy, setQaBusy] = useState(false);
  const [liveMeasure, setLiveMeasure] = useState<LiveMeasure | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [spaceDown, setSpaceDown] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [resetSignal, setResetSignal] = useState(0);
  const [finishSignal, setFinishSignal] = useState(0);
  const [chainUndoSignal, setChainUndoSignal] = useState(0);
  const [defaultHeightM, setDefaultHeightM] = useState<number>(() => loadDefaultWallHeight());
  const [firstPointPlaced, setFirstPointPlaced] = useState(false);
  const [toolHint, setToolHint] = useState<'measure' | 'quickArea' | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [winMaximized, setWinMaximized] = useState(false);
  const [updateState, setUpdateState] = useState<UpdateState | null>(null);
  const isElectron = !!window.painttakeoff?.windowControls;
  const viewerRef = useRef<ViewerHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const imgCache = useRef(new Map<string, HTMLImageElement>());
  const [, setImgVersion] = useState(0);

  const scale = plan ? scales[pageNum] : undefined;
  const pageMeasurements = plan ? measurements[pageNum] ?? [] : [];

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* non-fatal */
    }
  }, [theme]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4500);
  }, []);

  // Auto-update events (packaged Electron builds; absent on the web).
  useEffect(() => {
    const updates = window.painttakeoff?.updates;
    if (!updates) return;
    updates.onState((s) => setUpdateState(s.phase === 'idle' ? null : s));
  }, []);

  /** Click the version number: force an update check with plain-English feedback. */
  const checkUpdatesNow = useCallback(async () => {
    const updates = window.painttakeoff?.updates;
    if (!updates) return;
    showToast('Checking for updates…');
    try {
      const res = await updates.checkNow();
      if (res.busy) return; // a check is already running — it will report itself
      if (!res.ok) showToast('Couldn’t check — no internet connection.');
      else if (res.latest) showToast(`You’re on the latest version (${pkg.version}).`);
      // update found: the flashing "New update" button appears via onState
    } catch {
      showToast('Couldn’t check — no internet connection.');
    }
  }, [showToast]);

  /** Clear any in-progress clicking/dragging. Always safe. */
  const resetInteraction = useCallback(() => {
    setResetSignal((n) => n + 1);
    setFirstPointPlaced(false);
  }, []);

  // ---------- file opening ----------
  const openPlan = useCallback(
    async (next: LoadedPlan) => {
      if (plan) await destroyPlan(plan);
      imgCache.current.clear();
      setPlan(next);
      setScales(loadScales(next.fingerprint));
      setMeasurements(loadMeasurements(next.fingerprint));
      setPageNum(1);
      setMode('pan');
      setFlow({ step: 'idle' });
      setToolHint(null);
      setSelectedId(null);
      setQa(null);
      setQaValues(null);
      resetInteraction();
      showToast(`Opened ${next.name} — ${next.numPages} pages.`);
    },
    [plan, showToast, resetInteraction],
  );

  const openFile = useCallback(
    async (file: File) => {
      setLoading(true);
      try {
        await openPlan(await loadPlanFile(file));
      } catch (err) {
        console.error(err);
        showToast('That file wouldn’t open. Make sure it’s a PDF and try again.');
      } finally {
        setLoading(false);
      }
    },
    [openPlan, showToast],
  );

  // Electron: a PDF path passed on the command line (or file association).
  useEffect(() => {
    const bridge = window.painttakeoff;
    if (!bridge || typeof bridge.onOpenPdfPath !== 'function') return;
    bridge.onOpenPdfPath(async (p) => {
      setLoading(true);
      try {
        const bytes = await bridge.readPdf(p);
        const name = p.split(/[\\/]/).pop() ?? p;
        const data = new Uint8Array(bytes).buffer; // own copy, exact size
        await openPlan(await loadPlan(name, data));
      } catch (err) {
        console.error(err);
        showToast('That file wouldn’t open. Make sure it’s a PDF and try again.');
      } finally {
        setLoading(false);
      }
    });
  }, [openPlan, showToast]);

  // Drag & drop anywhere on the window.
  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer?.types.includes('Files')) setDragging(true);
    };
    const onDragLeave = (e: DragEvent) => {
      if (e.relatedTarget === null) setDragging(false);
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = Array.from(e.dataTransfer?.files ?? []).find(
        (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'),
      );
      if (file) void openFile(file);
      else if ((e.dataTransfer?.files.length ?? 0) > 0)
        showToast('That’s not a PDF. Drop the plan file itself.');
    };
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [openFile, showToast]);

  // ---------- scale management ----------
  const setPageScale = useCallback(
    (s: PageScale) => {
      if (!plan) return;
      setScales((prev) => ({ ...prev, [pageNum]: s }));
      saveScale(plan.fingerprint, pageNum, s);
    },
    [plan, pageNum],
  );

  const handleTwoPoints = useCallback(
    (kind: 'calibrate' | 'axisCheck', p1: PagePoint, p2: PagePoint) => {
      if (kind === 'calibrate') {
        setFlow({ step: 'enterLength', p1, p2 });
      } else {
        if (!scale) return;
        const measuredMeters = pointDistance(p1, p2) / scale.pointsPerMeter;
        setMode('pan');
        setFlow({ step: 'axisExpected', measuredMeters });
      }
      setFirstPointPlaced(false);
    },
    [scale],
  );

  const handleCalibrationSubmit = useCallback(
    (meters: number) => {
      if (flow.step !== 'enterLength') return;
      const pts = pointDistance(flow.p1, flow.p2);
      setPageScale({
        pointsPerMeter: pts / meters,
        verified: false,
        method: 'calibrated',
        axisCheckPassed: false,
        timestamp: Date.now(),
      });
      setFlow({ step: 'axisPrompt' });
      showToast('Scale set! One quick double-check will confirm it.');
    },
    [flow, setPageScale, showToast],
  );

  const applyScaleRatio = useCallback(
    (ratio: number) => {
      setPageScale({
        pointsPerMeter: pointsPerMeterFromRatio(ratio),
        verified: false,
        method: 'preset',
        axisCheckPassed: false,
        timestamp: Date.now(),
      });
      setMode('pan');
      setFlow({ step: 'axisPrompt' });
      showToast(`Scale set to 1:${parseFloat(ratio.toFixed(2))}. Not confirmed yet.`);
    },
    [setPageScale, showToast],
  );

  const startDoubleCheck = useCallback(() => {
    if (!scale) return;
    setFlow({ step: 'axisMeasuring' });
    setMode('axisCheck');
  }, [scale]);

  const handleAxisExpected = useCallback(
    (expectedMeters: number) => {
      if (flow.step !== 'axisExpected' || !scale) return;
      const deviation = Math.abs(flow.measuredMeters - expectedMeters) / expectedMeters;
      if (deviation <= AXIS_TOLERANCE) {
        setPageScale({ ...scale, verified: true, axisCheckPassed: true, timestamp: Date.now() });
        setFlow({ step: 'idle' });
        showToast('Scale confirmed ✓ You’re good to measure.');
      } else {
        setFlow({
          step: 'axisWarning',
          measuredMeters: flow.measuredMeters,
          expectedMeters,
        });
      }
    },
    [flow, scale, setPageScale, showToast],
  );

  const cancelFlow = useCallback(() => {
    setFlow({ step: 'idle' });
    setMode((m) => (m === 'axisCheck' ? 'pan' : m));
    resetInteraction();
  }, [resetInteraction]);

  // ---------- measurements ----------
  const persistMeasurements = useCallback(
    (page: number, items: Measurement[]) => {
      if (!plan) return;
      setMeasurements((prev) => ({ ...prev, [page]: items }));
      saveMeasurements(plan.fingerprint, page, items);
    },
    [plan],
  );

  const handleFinishMeasurement = useCallback(
    (points: PagePoint[]) => {
      if (!scale || !plan) return;
      let pts = 0;
      for (let i = 1; i < points.length; i++) pts += pointDistance(points[i - 1], points[i]);
      const totalMeters = pts / scale.pointsPerMeter;
      if (totalMeters < 0.01) return;
      const items = measurements[pageNum] ?? [];
      const label = `Wall ${items.filter((m) => m.kind === 'length').length + 1}`;
      const next = [
        ...items,
        { id: newId(), kind: 'length' as const, label, points, totalMeters, createdAt: Date.now() },
      ];
      persistMeasurements(pageNum, next);
      showToast(`Saved ${label}: ${formatLength(totalMeters, units)}.`);
    },
    [scale, plan, measurements, pageNum, persistMeasurements, units, showToast],
  );

  const deleteMeasurement = useCallback(
    (id: string) => {
      const items = (measurements[pageNum] ?? []).filter((m) => m.id !== id);
      persistMeasurements(pageNum, items);
      setSelectedId((sel) => (sel === id ? null : sel));
    },
    [measurements, pageNum, persistMeasurements],
  );

  /** Ctrl+Z when not drawing: remove the most recently added measurement. */
  const undoLastMeasurement = useCallback(() => {
    const items = measurements[pageNum] ?? [];
    if (items.length === 0) return;
    const last = items[items.length - 1];
    deleteMeasurement(last.id);
    showToast(`Removed ${last.label}.`);
  }, [measurements, pageNum, deleteMeasurement, showToast]);

  const setMeasurementHeight = useCallback(
    (id: string, meters: number) => {
      const items = (measurements[pageNum] ?? []).map((m) =>
        m.id === id
          ? m.kind === 'area'
            ? { ...m, wallHeightM: meters, wallAreaM2: m.perimeterM * meters }
            : { ...m, wallHeightM: meters }
          : m,
      );
      persistMeasurements(pageNum, items);
    },
    [measurements, pageNum, persistMeasurements],
  );

  const renameMeasurement = useCallback(
    (id: string, label: string) => {
      const items = (measurements[pageNum] ?? []).map((m) => (m.id === id ? { ...m, label } : m));
      persistMeasurements(pageNum, items);
    },
    [measurements, pageNum, persistMeasurements],
  );

  // ---------- Quick Area ----------
  const cancelQa = useCallback(() => {
    setQa(null);
    setQaValues(null);
    setQaBusy(false);
  }, []);

  /** Composite fill: base minus hand-drawn polygon cut-outs (flood holes
   *  were never part of the fill). */
  const qaComposite = useCallback(
    (mask: FillMask, cutouts: QaCutoutEntry[]): FillMask => ({
      ...mask,
      data: applyCutouts(
        mask,
        cutouts.filter((c) => c.kind === 'poly').map((c) => c.mask),
      ),
    }),
    [],
  );

  const qaNumbers = useCallback(
    (mask: FillMask, cutouts: QaCutoutEntry[], barrier: Uint8Array, bigBarrier: Uint8Array) => {
      if (!scale) return { floorAreaM2: 0, perimeterM: 0 };
      const mPerPx = mask.pointsPerPixel / scale.pointsPerMeter;
      const composite = qaComposite(mask, cutouts);
      // Perimeter = outer walls only: big barrier components (walls) count,
      // text/symbol speckle doesn't; cut-out outlines don't either.
      const edges = perimeterEdges({
        fill: composite.data,
        w: mask.width,
        h: mask.height,
        barrier,
        bigBarrier,
        holes: cutouts.filter((c) => c.kind === 'flood').map((c) => c.mask),
        polys: cutouts.filter((c) => c.kind === 'poly').map((c) => c.mask),
      });
      return {
        floorAreaM2: maskPixelCount(composite.data) * mPerPx * mPerPx,
        perimeterM: edges * mPerPx,
      };
    },
    [scale, qaComposite],
  );

  const handleQuickAreaClick = useCallback(
    async (p: PagePoint) => {
      if (!scale || !plan) return;
      setQaBusy(true);
      try {
        const raster = await viewerRef.current?.getPageRaster();
        if (!raster) return;
        const bx = p.x / raster.pointsPerPixel;
        const by = p.y / raster.pointsPerPixel;
        const ctx = raster.canvas.getContext('2d');
        if (!ctx) return;

        if (!qa || qa.sub === 'fill') {
          const img = ctx.getImageData(0, 0, raster.canvas.width, raster.canvas.height);
          const mask = floodFill(img, bx, by);
          if (!mask || maskPixelCount(mask.data) < 200) {
            showToast('Couldn’t find a closed shape there — try the middle of a room.');
            return;
          }
          mask.pointsPerPixel = raster.pointsPerPixel;
          const barrier = barrierMap(img, 2);
          const session: QaSession = {
            raster,
            base: mask,
            barrier,
            // Wall classification runs on the RAW barrier map so dense text
            // doesn't merge into wall-sized blobs.
            bigBarrier: bigBarrierMask(barrierMap(img, 0), mask.width, mask.height),
            cutouts: [],
            sub: qa?.sub === 'cutout' ? 'cutout' : 'fill',
          };
          setQa(session);
          const nums = qaNumbers(mask, [], session.barrier, session.bigBarrier);
          setQaValues((prev) => ({
            name: prev?.name ?? `Room ${pageMeasurements.filter((m) => m.kind === 'area').length + 1}`,
            floorAreaM2: nums.floorAreaM2,
            perimeterM: nums.perimeterM,
            wallHeightM: prev?.wallHeightM ?? defaultHeightM,
          }));
        } else if (qa.sub === 'cutout') {
          // Cut out: the target is a hole the fill went around (island,
          // cabinets, fixtures). Clicking open floor is a mistake — say so.
          const img = ctx.getImageData(0, 0, raster.canvas.width, raster.canvas.height);
          const bi = Math.floor(by) * raster.canvas.width + Math.floor(bx);
          if (qa.base.data[bi]) {
            showToast('That’s open floor — click inside a closed-off obstacle (island, cabinets).');
            return;
          }
          const hole = holeFill(img, qa.base, bx, by);
          const holePx = hole ? maskPixelCount(hole) : 0;
          const fillPx = maskPixelCount(qa.base.data);
          if (!hole || holePx < 2) {
            showToast('Nothing closed-off to cut there — click inside an obstacle like an island.');
            return;
          }
          if (holePx > fillPx * 0.5) {
            showToast('That spot isn’t closed off — it leaks way outside the room.');
            return;
          }
          if (!holeIsInterior(qa.base.data, qa.barrier, hole, qa.base.width, qa.base.height)) {
            showToast('That closed-off spot is outside the measured room.');
            return;
          }
          const mPerPx = qa.base.pointsPerPixel / scale.pointsPerMeter;
          const cutouts: QaCutoutEntry[] = [
            ...qa.cutouts,
            { kind: 'flood', mask: hole, areaM2: holePx * mPerPx * mPerPx },
          ];
          setQa({ ...qa, cutouts });
          const nums = qaNumbers(qa.base, cutouts, qa.barrier, qa.bigBarrier);
          setQaValues((v) => (v ? { ...v, ...nums } : v));
        }
      } finally {
        setQaBusy(false);
      }
    },
    [scale, plan, qa, qaNumbers, pageMeasurements, units, showToast],
  );

  /** Hand-drawn polygon cut-out (Quick Area "Draw a cut-out"). */
  const handleCutoutPolygon = useCallback(
    (points: PagePoint[]) => {
      if (!qa || !scale) return;
      const mask = polygonToMask(
        points,
        qa.base.width,
        qa.base.height,
        qa.base.pointsPerPixel,
      );
      // Only the part inside the filled room counts.
      const composite = qaComposite(qa.base, qa.cutouts);
      const removed = new Uint8Array(mask.length);
      let removedPx = 0;
      for (let i = 0; i < mask.length; i++) {
        if (mask[i] && composite.data[i]) {
          removed[i] = 1;
          removedPx++;
        }
      }
      if (removedPx < 4) {
        showToast('Draw the cut-out inside the shaded room area.');
        return;
      }
      const mPerPx = qa.base.pointsPerPixel / scale.pointsPerMeter;
      const cutouts: QaCutoutEntry[] = [
        ...qa.cutouts,
        { kind: 'poly', mask: removed, areaM2: removedPx * mPerPx * mPerPx },
      ];
      setQa({ ...qa, cutouts });
      const nums = qaNumbers(qa.base, cutouts, qa.barrier, qa.bigBarrier);
      setQaValues((v) => (v ? { ...v, ...nums } : v));
      showToast('Cut-out added.');
    },
    [qa, scale, qaComposite, qaNumbers, showToast],
  );

  const acceptQa = useCallback(() => {
    if (!qa || !qaValues || !scale || !plan) return;
    const composite = qaComposite(qa.base, qa.cutouts);
    const tint: [number, number, number, number] = [26, 102, 204, 70];
    const redTint: [number, number, number, number] = [214, 48, 49, 110];
    const full = maskToCanvas(composite, tint);
    const cutoutUnion = new Uint8Array(qa.base.data.length);
    let hasCutouts = false;
    for (const c of qa.cutouts) {
      for (let i = 0; i < cutoutUnion.length; i++) {
        if (c.mask[i]) {
          cutoutUnion[i] = 1;
          hasCutouts = true;
        }
      }
    }
    const cutCanvas = hasCutouts
      ? maskToCanvas({ ...qa.base, data: cutoutUnion }, redTint)
      : null;
    // Downscale for storage so localStorage stays small.
    const shrink = (src: HTMLCanvasElement) => {
      const scaleDown = Math.min(1, 480 / src.width);
      const small = document.createElement('canvas');
      small.width = Math.round(src.width * scaleDown);
      small.height = Math.round(src.height * scaleDown);
      small.getContext('2d')?.drawImage(src, 0, 0, small.width, small.height);
      return small.toDataURL('image/png');
    };
    const m: AreaMeasurement = {
      id: newId(),
      kind: 'area',
      label: qaValues.name || 'Room',
      floorAreaM2: qaValues.floorAreaM2,
      perimeterM: qaValues.perimeterM,
      wallHeightM: qaValues.wallHeightM,
      wallAreaM2: qaValues.perimeterM * qaValues.wallHeightM,
      cutouts: qa.cutouts.map((c) => ({ areaM2: c.areaM2, kind: c.kind })),
      maskDataUrl: shrink(full),
      cutoutsDataUrl: cutCanvas ? shrink(cutCanvas) : undefined,
      maskRect: { qx: 0, qy: 0, qw: qa.raster.pageW, qh: qa.raster.pageH },
      createdAt: Date.now(),
    };
    persistMeasurements(pageNum, [...(measurements[pageNum] ?? []), m]);
    showToast(`Saved ${m.label}: ${formatArea(m.floorAreaM2, units)}, walls ≈ ${formatArea(m.wallAreaM2, units)}.`);
    cancelQa();
  }, [qa, qaValues, scale, plan, pageNum, measurements, persistMeasurements, units, showToast, cancelQa, qaComposite]);

  // ---------- navigation & modes ----------
  const gotoPage = useCallback(
    (n: number) => {
      if (!plan) return;
      const clamped = Math.min(plan.numPages, Math.max(1, n));
      setPageNum(clamped);
      setSelectedId(null);
    },
    [plan],
  );

  const changeMode = useCallback(
    (m: ToolMode) => {
      setMode((prev) => {
        if (prev === 'quickArea' && m !== 'quickArea') cancelQa();
        return m;
      });
      setToolHint(null);
      resetInteraction();
    },
    [resetInteraction, cancelQa],
  );

  const toggleUnits = useCallback(() => {
    setUnits((u) => {
      const next: UnitSystem = u === 'imperial' ? 'metric' : 'imperial';
      saveUnits(next);
      return next;
    });
  }, []);

  // If the current page loses its scale while measuring, fall back to pan.
  useEffect(() => {
    if ((mode === 'measure' || mode === 'quickArea') && !scale) setMode('pan');
  }, [mode, scale]);

  // ---------- keyboard ----------
  useEffect(() => {
    const isTyping = () => {
      const el = document.activeElement;
      return (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement
      );
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isTyping()) {
        e.preventDefault();
        setSpaceDown(true);
        return;
      }
      if (isTyping()) return;
      // Ctrl+Z: while drawing, undo the last point; otherwise remove the
      // most recent measurement on this page.
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (liveMeasure && liveMeasure.points > 0) setChainUndoSignal((n) => n + 1);
        else undoLastMeasurement();
        return;
      }
      switch (e.key) {
        case 'ArrowLeft':
          gotoPage(pageNum - 1);
          break;
        case 'ArrowRight':
          gotoPage(pageNum + 1);
          break;
        case '+':
        case '=':
          viewerRef.current?.zoomBy(1.2);
          break;
        case '-':
          viewerRef.current?.zoomBy(1 / 1.2);
          break;
        case 'Enter':
          if (mode === 'measure') setFinishSignal((n) => n + 1);
          break;
        case 'Delete':
        case 'Backspace':
          if (selectedId) deleteMeasurement(selectedId);
          break;
        case 'v':
          changeMode('pan');
          break;
        case 'c':
          if (plan) changeMode('calibrate');
          break;
        case 'm':
          if (!plan) break;
          if (scale) changeMode('measure');
          else setToolHint('measure');
          break;
        case 'a':
          if (!plan) break;
          if (scale) changeMode('quickArea');
          else setToolHint('quickArea');
          break;
        case 'Escape':
          setToolHint(null);
          if (flow.step === 'idle') {
            setSelectedId(null);
            resetInteraction();
          }
          // modal Escape is handled inside ModalShell
          break;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceDown(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [pageNum, plan, scale, flow.step, mode, selectedId, liveMeasure, gotoPage, changeMode, resetInteraction, deleteMeasurement, undoLastMeasurement]);

  // ---------- overlay images for Quick Area ----------
  const getImage = useCallback((url: string): HTMLImageElement => {
    const cached = imgCache.current.get(url);
    if (cached) return cached;
    const img = new Image();
    img.onload = () => setImgVersion((v) => v + 1);
    img.src = url;
    imgCache.current.set(url, img);
    return img;
  }, []);

  const areaOverlays = useMemo<AreaOverlay[]>(() => {
    const list: AreaOverlay[] = [];
    for (const m of pageMeasurements) {
      if (m.kind === 'area' && m.maskDataUrl && m.maskRect) {
        list.push({ id: m.id, rect: m.maskRect, source: getImage(m.maskDataUrl) });
        if (m.cutoutsDataUrl) {
          list.push({ id: `${m.id}-cutouts`, rect: m.maskRect, source: getImage(m.cutoutsDataUrl) });
        }
      }
    }
    if (qa) {
      const composite = qaComposite(qa.base, qa.cutouts);
      const tint: [number, number, number, number] =
        theme === 'dark' ? [80, 150, 240, 90] : [26, 102, 204, 70];
      const red: [number, number, number, number] =
        theme === 'dark' ? [240, 100, 90, 120] : [214, 48, 49, 110];
      list.push({
        id: 'qa-active',
        rect: { qx: 0, qy: 0, qw: qa.raster.pageW, qh: qa.raster.pageH },
        source: maskToCanvas(composite, tint),
      });
      if (qa.cutouts.length > 0) {
        const union = new Uint8Array(qa.base.data.length);
        for (const c of qa.cutouts) for (let i = 0; i < union.length; i++) if (c.mask[i]) union[i] = 1;
        list.push({
          id: 'qa-cutouts',
          rect: { qx: 0, qy: 0, qw: qa.raster.pageW, qh: qa.raster.pageH },
          source: maskToCanvas({ ...qa.base, data: union }, red),
        });
      }
    }
    return list;
  }, [pageMeasurements, qa, theme, getImage, qaComposite]);

  // ---------- the guidance bar ----------
  let stepBar = null;
  if (plan && !loading) {
    if (mode === 'calibrate') {
      stepBar = (
        <StepBar kind="action" title={firstPointPlaced ? 'Setting the scale — click 2 of 2' : 'Setting the scale — click 1 of 2'}>
          {firstPointPlaced
            ? 'Now click the other end. Drag moves the plan; Esc starts over.'
            : 'Click one end of something whose length you know — a wall with its length written on it is perfect. Drag moves the plan; Esc cancels.'}
        </StepBar>
      );
    } else if (mode === 'axisCheck') {
      stepBar = (
        <StepBar kind="action" title={firstPointPlaced ? 'Double-check — click 2 of 2' : 'Double-check — click 1 of 2'}>
          {firstPointPlaced
            ? 'Now click the other end. Drag moves the plan; Esc starts over.'
            : 'Click one end of something else whose length you know — pointing the other way if you can. Drag moves the plan; Esc cancels.'}
        </StepBar>
      );
    } else if (mode === 'measure') {
      stepBar = liveMeasure ? (
        <StepBar kind="info" title="Measuring">
          This segment <strong>{liveMeasure.segmentMeters !== null ? formatLength(liveMeasure.segmentMeters, units) : '—'}</strong>
          {' · '}total so far <strong>{formatLength(liveMeasure.totalMeters, units)}</strong>.
          Click to add a point (it snaps to other lines), double-click to finish, Ctrl+Z undoes a
          point, Esc cancels.
        </StepBar>
      ) : (
        <StepBar kind="info" title="Measuring">
          Click to start a line, keep clicking to add segments, double-click to finish. Drag always
          moves the plan. Ctrl+Z undoes.
        </StepBar>
      );
    } else if (mode === 'quickArea') {
      stepBar = (
        <StepBar kind="info" title={qa?.sub === 'cutout' ? 'Cutting out' : qa?.sub === 'draw' ? 'Drawing a cut-out' : 'Quick Area'}>
          {qa?.sub === 'cutout'
            ? 'Click inside an obstacle (island, cabinets, stairs) to subtract it. Esc stops cutting out.'
            : qa?.sub === 'draw'
              ? 'Click the corners of the obstacle, double-click to finish. Ctrl+Z undoes a point, Esc stops.'
              : 'Click inside a room — I’ll fill it in and give you a rough size. Then tweak the numbers on the right.'}
        </StepBar>
      );
    } else if (!scale) {
      stepBar = (
        <StepBar kind="action" title="Step 2 of 3 · Set the scale">
          Click the blue <strong>Set Scale</strong> button above, then click the two ends of
          anything whose length you know. If the plan already says its scale, pick it from{' '}
          <strong>Common scales…</strong> instead.
        </StepBar>
      );
    } else {
      stepBar = (
        <StepBar kind="success" title="Step 3 of 3 · Measure">
          Scale set! Use <strong>Measure</strong> for lengths or <strong>Quick Area</strong> for a
          rough room square footage.
        </StepBar>
      );
    }
  }

  return (
    <div
      className={`app ${dragging ? 'dragging' : ''} ${isElectron ? 'electron' : ''} ${
        winMaximized ? 'maximized' : ''
      }`}
    >
      {isElectron && (
        <TitleBar
          fileName={plan?.name ?? null}
          maximized={winMaximized}
          onMaximizedChange={setWinMaximized}
          update={updateState}
          onCheckUpdates={() => void checkUpdatesNow()}
        />
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void openFile(f);
          e.target.value = '';
        }}
      />
      <Toolbar
        plan={plan}
        pageNum={pageNum}
        numPages={plan?.numPages ?? 0}
        onOpenFile={(f) => void openFile(f)}
        onPageChange={gotoPage}
        zoom={view.zoom}
        onZoomIn={() => viewerRef.current?.zoomBy(1.2)}
        onZoomOut={() => viewerRef.current?.zoomBy(1 / 1.2)}
        onFitWidth={() => viewerRef.current?.fitWidth()}
        onFitPage={() => viewerRef.current?.fitPage()}
        mode={mode}
        onModeChange={changeMode}
        onToolBlocked={(tool) => setToolHint(tool)}
        scale={scale}
        onPresetSelect={applyScaleRatio}
        onCustomScale={() => setCustomScaleOpen(true)}
        onConfirmScale={startDoubleCheck}
        units={units}
        onToggleUnits={toggleUnits}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
        onShowShortcuts={() => setShortcutsOpen(true)}
        measureCount={pageMeasurements.length}
        panelOpen={panelOpen}
        onTogglePanel={() =>
          setPanelOpen((open) => {
            savePanelOpen(!open);
            return !open;
          })
        }
      />
      {stepBar}
      <div className="viewer-wrap">
        <Viewer
          ref={viewerRef}
          plan={plan}
          pageNum={pageNum}
          view={view}
          onViewChange={setView}
          mode={mode}
          spaceDown={spaceDown}
          dark={theme === 'dark'}
          pointsPerMeter={scale?.pointsPerMeter ?? null}
          units={units}
          measurements={pageMeasurements}
          selectedId={selectedId}
          areaOverlays={areaOverlays}
          qaDrawing={qa?.sub === 'draw'}
          onTwoPoints={handleTwoPoints}
          onFirstPointPlaced={() => setFirstPointPlaced(true)}
          onCancelIntent={() => {
            resetInteraction();
            if (qa?.sub === 'cutout') setQa({ ...qa, sub: 'fill' });
            if (qa?.sub === 'draw') setQa({ ...qa, sub: 'fill' });
          }}
          onFinishMeasurement={handleFinishMeasurement}
          onFinishCutoutPolygon={handleCutoutPolygon}
          onLiveMeasure={setLiveMeasure}
          onSelect={setSelectedId}
          onDeleteMeasurement={deleteMeasurement}
          onQuickAreaClick={(p) => void handleQuickAreaClick(p)}
          resetSignal={resetSignal}
          finishSignal={finishSignal}
          chainUndoSignal={chainUndoSignal}
        />
        {!plan && <Welcome onOpen={() => fileInputRef.current?.click()} />}
        {plan && panelOpen && (
          <MeasurementsPanel
            items={pageMeasurements}
            units={units}
            selectedId={selectedId}
            defaultHeightM={defaultHeightM}
            onDefaultHeightChange={(m) => {
              setDefaultHeightM(m);
              saveDefaultWallHeight(m);
            }}
            onSelect={setSelectedId}
            onRename={renameMeasurement}
            onSetHeight={setMeasurementHeight}
            onDelete={deleteMeasurement}
            onClose={() => {
              savePanelOpen(false);
              setPanelOpen(false);
            }}
          />
        )}
        {plan && qa && qaValues && (
          <QuickAreaCard
            values={qaValues}
            cutouts={qa.cutouts.map((c) => ({ areaM2: c.areaM2, kind: c.kind }))}
            units={units}
            cuttingOut={qa.sub === 'cutout'}
            drawingCutout={qa.sub === 'draw'}
            busy={qaBusy}
            onChange={setQaValues}
            onToggleCutout={() =>
              setQa({ ...qa, sub: qa.sub === 'cutout' ? 'fill' : 'cutout' })
            }
            onToggleDrawCutout={() =>
              setQa({ ...qa, sub: qa.sub === 'draw' ? 'fill' : 'draw' })
            }
            onRemoveCutout={(i) => {
              const cutouts = qa.cutouts.filter((_, idx) => idx !== i);
              setQa({ ...qa, cutouts });
              const nums = qaNumbers(qa.base, cutouts, qa.barrier, qa.bigBarrier);
              setQaValues((v) => (v ? { ...v, ...nums } : v));
            }}
            onAccept={acceptQa}
            onCancel={cancelQa}
          />
        )}
      </div>
      <div className="statusbar">
        <span className="hint">{loading ? 'Opening your plan…' : ''}</span>
        {toast && <span className="toast">{toast}</span>}
      </div>
      {dragging && <div className="drop-veil">Drop the PDF anywhere to open it</div>}

      {toolHint && (
        <div className="measure-hint">
          <p>
            <strong>Set the scale first</strong> — it takes about 10 seconds, then{' '}
            {toolHint === 'measure' ? 'measuring' : 'Quick Area'} works.
          </p>
          <div className="modal-actions">
            <button className="tool" onClick={() => setToolHint(null)}>
              Not now
            </button>
            <button
              className="tool go-button"
              onClick={() => {
                setToolHint(null);
                changeMode('calibrate');
              }}
            >
              Set Scale Now
            </button>
          </div>
        </div>
      )}

      {flow.step === 'enterLength' && (
        <CalibrationModal
          units={units}
          onSubmit={handleCalibrationSubmit}
          onCancel={cancelFlow}
          onSwitchUnits={toggleUnits}
        />
      )}
      {flow.step === 'axisPrompt' && (
        <AxisPromptModal
          onMeasure={() => {
            setFlow({ step: 'axisMeasuring' });
            setMode('axisCheck');
          }}
          onSkip={cancelFlow}
        />
      )}
      {flow.step === 'axisExpected' && (
        <AxisExpectedModal
          units={units}
          measuredMeters={flow.measuredMeters}
          onSubmit={handleAxisExpected}
          onCancel={cancelFlow}
          onSwitchUnits={toggleUnits}
        />
      )}
      {flow.step === 'axisWarning' && (
        <AxisWarningModal
          units={units}
          measuredMeters={flow.measuredMeters}
          expectedMeters={flow.expectedMeters}
          onRemeasure={() => {
            setFlow({ step: 'axisMeasuring' });
            setMode('axisCheck');
          }}
          onLeaveUnverified={cancelFlow}
        />
      )}
      {customScaleOpen && (
        <CustomScaleModal
          onSubmit={(ratio) => {
            setCustomScaleOpen(false);
            applyScaleRatio(ratio);
          }}
          onCancel={() => setCustomScaleOpen(false)}
        />
      )}
      {shortcutsOpen && <ShortcutsModal onClose={() => setShortcutsOpen(false)} />}
    </div>
  );
}
