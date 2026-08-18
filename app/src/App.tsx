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
  loadOpeningSizes,
  loadDeductOpenings,
  newId,
  saveMeasurements,
  saveDefaultWallHeight,
  saveOpeningSizes,
  saveDeductOpenings,
  savePanelOpen,
  type AreaMeasurement,
  type Measurement,
  type MeasurementMap,
  type OpeningSizes,
  type OpeningType,
} from './measure/measureStore';
import {
  barrierMap,
  bigBarrierMask,
  cleanBarrierMap,
  dilateMask,
  floodFillFromBarrier,
  interiorPockets,
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
import Dashboard from './components/Dashboard';
import NewProjectModal from './components/NewProjectModal';
import PagePickerModal from './components/PagePickerModal';
import MeasurementsPanel, { formatArea } from './components/MeasurementsPanel';
import {
  deleteProject,
  loadProjects,
  loadPdfBytes,
  savePdfBytes,
  saveProjects,
  type ProjectMeta,
} from './pdf/projectStore';
import QuickAreaCard, { type QaValues } from './components/QuickAreaCard';
import OpeningPopover from './components/OpeningPopover';
import PriceBookModal from './components/PriceBookModal';
import QuoteView from './components/QuoteView';
import { loadPriceBook, savePriceBook, type PriceBook } from './quote/priceBook';
import { computeQuote, pageTotals } from './quote/quote';
import { exportQuoteXlsx } from './quote/excel';
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
  const [measureKind, setMeasureKind] = useState<'wall' | 'trim' | 'ceiling'>('wall');
  const [pendingOpening, setPendingOpening] = useState<PagePoint | null>(null);
  const [openingSizes, setOpeningSizes] = useState<OpeningSizes>(() => loadOpeningSizes());
  const [deduct, setDeduct] = useState(true);
  const [priceBook, setPriceBook] = useState<PriceBook>(() => loadPriceBook());
  const [priceBookOpen, setPriceBookOpen] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);
  // ---------- projects / dashboard ----------
  const [projects, setProjects] = useState<ProjectMeta[]>(() => loadProjects());
  const [currentProject, setCurrentProject] = useState<ProjectMeta | null>(null);
  const [selectedPages, setSelectedPages] = useState<number[]>([]); // original 0-based indices
  const [newProjectFile, setNewProjectFile] = useState<File | null>(null);
  const [showNewProject, setShowNewProject] = useState(false);
  const [pendingPlan, setPendingPlan] = useState<LoadedPlan | null>(null);
  const [showPagePicker, setShowPagePicker] = useState<'create' | 'edit' | null>(null);
  const [deletingProject, setDeletingProject] = useState<ProjectMeta | null>(null);
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

  // Per-page settings (deductions toggle) follow the current page.
  useEffect(() => {
    if (plan) setDeduct(loadDeductOpenings(plan.fingerprint, pageNum));
  }, [plan, pageNum]);

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

  // ---------- file opening / project flow ----------
  const openPlan = useCallback(
    async (next: LoadedPlan, pages: number[], project: ProjectMeta | null) => {
      if (plan) await destroyPlan(plan);
      imgCache.current.clear();
      setPlan(next);
      setScales(loadScales(next.fingerprint));
      setMeasurements(loadMeasurements(next.fingerprint));
      setSelectedPages(pages);
      setCurrentProject(project);
      setPageNum((pages[0] ?? 0) + 1);
      setMode('pan');
      setFlow({ step: 'idle' });
      setToolHint(null);
      setSelectedId(null);
      setQa(null);
      setQaValues(null);
      resetInteraction();
      showToast(`Opened ${next.name} — ${pages.length} of ${next.numPages} pages.`);
    },
    [plan, showToast, resetInteraction],
  );

  /** Any incoming PDF (picker, drop, argv) starts the new-project flow. */
  const startProjectFlow = useCallback((file: File) => {
    setNewProjectFile(file);
    setShowNewProject(true);
  }, []);

  const openFile = startProjectFlow;

  /** Step A done → load the PDF and go to the page picker. */
  const createProjectDetails = useCallback(
    async (name: string, company: string, notes: string) => {
      if (!newProjectFile) return;
      setLoading(true);
      try {
        const next = await loadPlanFile(newProjectFile);
        setPendingPlan(next);
        (window as unknown as { __npMeta?: object }).__npMeta = { name, company, notes };
        setShowNewProject(false);
        setShowPagePicker('create');
      } catch (err) {
        console.error(err);
        showToast('That file wouldn’t open. Make sure it’s a PDF and try again.');
      } finally {
        setLoading(false);
      }
    },
    [newProjectFile, showToast],
  );

  /** Page picker confirmed → create the project, store the PDF, open it. */
  const confirmPagePicker = useCallback(
    async (pages: number[]) => {
      if (showPagePicker === 'create' && pendingPlan) {
        const meta = (window as unknown as { __npMeta?: { name: string; company: string; notes: string } }).__npMeta;
        if (!meta) return;
        setLoading(true);
        try {
          const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
          // thumbnail: first selected page, small
          let thumbDataUrl: string | undefined;
          try {
            const page = await pendingPlan.doc.getPage(pages[0] + 1);
            const vp0 = page.getViewport({ scale: 1 });
            const sc = 320 / vp0.width;
            const c = document.createElement('canvas');
            c.width = 320;
            c.height = Math.round(vp0.height * sc);
            const ctx = c.getContext('2d');
            if (ctx) {
              await page.render({ canvasContext: ctx, viewport: page.getViewport({ scale: sc }), background: '#ffffff' }).promise;
              thumbDataUrl = c.toDataURL('image/jpeg', 0.7);
            }
          } catch { /* thumb optional */ }
          const project: ProjectMeta = {
            id,
            name: meta.name,
            company: meta.company,
            notes: meta.notes,
            fingerprint: pendingPlan.fingerprint,
            pages,
            numPages: pendingPlan.numPages,
            thumbDataUrl,
            createdAt: Date.now(),
            modifiedAt: Date.now(),
          };
          // keep the bytes safe regardless of where the original file moves
          const bytes = await pendingPlan.doc.getData();
          await savePdfBytes(id, bytes.buffer as ArrayBuffer);
          const next = [...loadProjects(), project];
          saveProjects(next);
          setProjects(next);
          setShowPagePicker(null);
          setPendingPlan(null);
          setNewProjectFile(null);
          await openPlan(pendingPlan, pages, project);
        } catch (err) {
          console.error(err);
          showToast('Something went wrong creating that project. Try again.');
        } finally {
          setLoading(false);
        }
      } else if (showPagePicker === 'edit' && plan && currentProject) {
        // Change the page subset mid-project — scales/measurements are keyed
        // by ORIGINAL page index, so nothing is disturbed.
        const sorted = [...pages].sort((a, b) => a - b);
        const updated = { ...currentProject, pages: sorted, modifiedAt: Date.now() };
        const next = loadProjects().map((p) => (p.id === updated.id ? updated : p));
        saveProjects(next);
        setProjects(next);
        setCurrentProject(updated);
        setSelectedPages(sorted);
        if (!sorted.includes(pageNum - 1)) setPageNum(sorted[0] + 1);
        setShowPagePicker(null);
        resetInteraction();
        showToast(`Now showing ${sorted.length} of ${plan.numPages} pages.`);
      }
    },
    [showPagePicker, pendingPlan, plan, currentProject, pageNum, openPlan, showToast, resetInteraction],
  );

  /** Back to the dashboard — everything is persisted, so no confirm. */
  const [homeTick, setHomeTick] = useState(0);
  const goHome = useCallback(async () => {
    if (plan) await destroyPlan(plan);
    setPlan(null);
    setCurrentProject(null);
    setSelectedPages([]);
    setMode('pan');
    setFlow({ step: 'idle' });
    setToolHint(null);
    setSelectedId(null);
    setQa(null);
    setQaValues(null);
    setPendingOpening(null);
    setHomeTick((n) => n + 1); // dashboard stats recompute from storage
    resetInteraction();
  }, [plan, resetInteraction]);

  /** Reopen a project from the dashboard: bytes come from IndexedDB. */
  const openProject = useCallback(
    async (id: string) => {
      const project = loadProjects().find((p) => p.id === id);
      if (!project) return;
      setLoading(true);
      try {
        const bytes = await loadPdfBytes(id);
        if (!bytes) throw new Error('PDF bytes missing');
        await openPlan(await loadPlan(project.name + '.pdf', bytes), project.pages, project);
      } catch (err) {
        console.error(err);
        showToast('Couldn’t reopen that project — its PDF data is missing.');
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
    bridge.onOpenPdfPath((p) => {
      const name = p.split(/[\\/]/).pop() ?? p;
      // Reuse the flow with a File built from disk bytes.
      bridge
        .readPdf(p)
        .then((bytes) => {
          const data = new Uint8Array(bytes).buffer;
          startProjectFlow(new File([data], name, { type: 'application/pdf' }));
        })
        .catch((err) => {
          console.error(err);
          showToast('That file wouldn’t open. Make sure it’s a PDF and try again.');
        });
    });
  }, [startProjectFlow, showToast]);

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
      if (file) openFile(file);
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
      const ppu = scale.pointsPerMeter;
      const items = measurements[pageNum] ?? [];

      if (measureKind === 'ceiling') {
        if (points.length < 3) return;
        let twice = 0;
        for (let i = 0; i < points.length; i++) {
          const p = points[i];
          const q = points[(i + 1) % points.length];
          twice += p.x * q.y - q.x * p.y;
        }
        const areaM2 = Math.abs(twice / 2) / (ppu * ppu);
        if (areaM2 < 0.01) return;
        let perimeterM = 0;
        for (let i = 0; i < points.length; i++) {
          perimeterM += pointDistance(points[i], points[(i + 1) % points.length]);
        }
        perimeterM /= ppu;
        const n = items.filter((m) => m.kind === 'ceiling').length + 1;
        const next = [
          ...items,
          {
            id: newId(),
            kind: 'ceiling' as const,
            label: `Ceiling ${n}`,
            points,
            areaM2,
            perimeterM,
            createdAt: Date.now(),
          },
        ];
        persistMeasurements(pageNum, next);
        showToast(`Saved Ceiling ${n}: ${formatArea(areaM2, units)}.`);
        return;
      }

      let pts = 0;
      for (let i = 1; i < points.length; i++) pts += pointDistance(points[i - 1], points[i]);
      const totalMeters = pts / ppu;
      if (totalMeters < 0.01) return;
      const isWall = measureKind === 'wall';
      const n = items.filter(
        (m) => m.kind === 'length' && (m.purpose ?? 'wall') === measureKind,
      ).length + 1;
      const label = isWall ? `Wall ${n}` : `Trim ${n}`;
      const next = [
        ...items,
        {
          id: newId(),
          kind: 'length' as const,
          purpose: measureKind,
          label,
          points,
          totalMeters,
          createdAt: Date.now(),
        },
      ];
      persistMeasurements(pageNum, next);
      showToast(`Saved ${label}: ${formatLength(totalMeters, units)}.`);
    },
    [scale, plan, measurements, pageNum, persistMeasurements, units, showToast, measureKind],
  );

  // ---------- openings ----------
  const pickOpening = useCallback(
    (type: OpeningType, customM2?: number) => {
      if (!pendingOpening || !plan) return;
      const items = measurements[pageNum] ?? [];
      const n = items.filter((m) => m.kind === 'opening' && m.openType === type).length + 1;
      const letter = type === 'door' ? 'D' : type === 'window' ? 'W' : 'S';
      const sfM2 = customM2 ?? openingSizes[type];
      const next = [
        ...items,
        {
          id: newId(),
          kind: 'opening' as const,
          label: `${letter}${n}`,
          openType: type,
          point: pendingOpening,
          sfM2,
          assignedTo: null,
          createdAt: Date.now(),
        },
      ];
      persistMeasurements(pageNum, next);
      setPendingOpening(null);
      showToast(`Added ${letter}${n} — subtracts ${formatArea(sfM2, units)} from the page total.`);
    },
    [pendingOpening, plan, measurements, pageNum, persistMeasurements, openingSizes, units, showToast],
  );

  const setOpeningSf = useCallback(
    (id: string, m2: number) => {
      const items = (measurements[pageNum] ?? []).map((m) =>
        m.id === id && m.kind === 'opening' ? { ...m, sfM2: m2 } : m,
      );
      persistMeasurements(pageNum, items);
    },
    [measurements, pageNum, persistMeasurements],
  );

  const setOpeningAssignment = useCallback(
    (id: string, assignedTo: string | null) => {
      const items = (measurements[pageNum] ?? []).map((m) =>
        m.id === id && m.kind === 'opening' ? { ...m, assignedTo } : m,
      );
      persistMeasurements(pageNum, items);
    },
    [measurements, pageNum, persistMeasurements],
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

  /** Display/area mask: the room's solid region (fill + interior holes +
   *  their outlines, eroded back to the true wall face), minus cut-outs. */
  const qaComposite = useCallback((sess: QaSession): FillMask => {
    const n = sess.base.data.length;
    const out = sess.base.data.slice();
    for (const c of sess.cutouts) {
      for (let i = 0; i < n; i++) if (c.mask[i]) out[i] = 0;
    }
    return { ...sess.base, data: out };
  }, []);

  const qaNumbers = useCallback(
    (sess: QaSession) => {
      if (!scale) return { floorAreaM2: 0, perimeterM: 0 };
      const mPerPx = sess.base.pointsPerPixel / scale.pointsPerMeter;
      const composite = qaComposite(sess);
      // Perimeter = outer walls only: big barrier components (walls) count,
      // text/symbol speckle doesn't; cut-out outlines don't either.
      const edges = perimeterEdges({
        fill: sess.base.data,
        w: sess.base.width,
        h: sess.base.height,
        barrier: sess.barrier,
        bigBarrier: sess.bigBarrier,
        holes: sess.cutouts.filter((c) => c.kind === 'flood').map((c) => c.mask),
        polys: sess.cutouts.filter((c) => c.kind === 'poly').map((c) => c.mask),
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
          // Clean the barrier map first: text, tags, fixture outlines and
          // dashes must not act as walls, or the fill splits around them.
          const raw = barrierMap(img, 0);
          const { cleaned, stats } = cleanBarrierMap(raw, raster.canvas.width, raster.canvas.height);
          console.debug(
            `[qa] barrier: kept ${stats.keptPx}px in ${stats.keptComponents} runs; ` +
              `removed ${stats.removedPx}px in ${stats.removedComponents} fragments`,
          );
          const barrier = dilateMask(cleaned, raster.canvas.width, raster.canvas.height, 2);
          // Diagnostics: stash the cleaned barrier + fill as images for tuning.
          {
            const dbg = document.createElement('canvas');
            dbg.width = raster.canvas.width;
            dbg.height = raster.canvas.height;
            const dctx = dbg.getContext('2d');
            if (dctx) {
              dctx.drawImage(raster.canvas, 0, 0);
              const im = dctx.getImageData(0, 0, dbg.width, dbg.height);
              for (let i = 0; i < cleaned.length; i++) {
                if (cleaned[i]) {
                  const o = i * 4;
                  im.data[o] = 255;
                  im.data[o + 1] = 0;
                  im.data[o + 2] = 200;
                  im.data[o + 3] = 160;
                }
              }
              dctx.putImageData(im, 0, 0);
            }
            (window as unknown as { __qaBarrier?: HTMLCanvasElement }).__qaBarrier = dbg;
          }
          // Fill against a D-dilated barrier (seals door openings). Doors
          // are ~10px wide at 1:75 but ~33px at 1:48, and sealing costs
          // area accuracy (the fill stops D px inside the wall faces) —
          // so start small and only dilate harder if the result looks like
          // a leak (a huge fraction of the sheet filled).
          const rasterPx = raster.canvas.width * raster.canvas.height;
          let mask: FillMask | null = null;
          for (const D of [6, 12, 18]) {
            mask = floodFillFromBarrier(
              dilateMask(cleaned, raster.canvas.width, raster.canvas.height, D),
              raster.canvas.width,
              raster.canvas.height,
              bx,
              by,
            );
            console.debug('[qa] try D =', D, '→ mask', mask ? maskPixelCount(mask.data) : 'null');
            if (!mask || maskPixelCount(mask.data) < rasterPx * 0.25) break;
          }
          console.debug('[qa] click at buffer', Math.round(bx), Math.round(by), 'mask:', mask ? maskPixelCount(mask.data) : 'null');
          if (mask) {
            const dbg = (window as unknown as { __qaBarrier?: HTMLCanvasElement }).__qaBarrier;
            if (dbg) {
              const dctx = dbg.getContext('2d');
              if (dctx) {
                const im = dctx.getImageData(0, 0, dbg.width, dbg.height);
                for (let i = 0; i < mask.data.length; i++) {
                  if (mask.data[i]) {
                    const o = i * 4;
                    im.data[o] = Math.round(im.data[o] * 0.6 + 40);
                    im.data[o + 1] = Math.round(im.data[o + 1] * 0.6 + 90);
                    im.data[o + 2] = 255;
                    im.data[o + 3] = 255;
                  }
                }
                dctx.putImageData(im, 0, 0);
              }
            }
          }
          if (!mask || maskPixelCount(mask.data) < 200) {
            showToast('Couldn’t find a closed shape there — try the middle of a room.');
            return;
          }
          mask.pointsPerPixel = raster.pointsPerPixel;
          // The room's solid region: the fill plus its interior pockets
          // (text counters, fixture interiors). No wall pixels are added —
          // area stays net of the wall lines.
          const pockets = interiorPockets(mask.data, barrier, mask.width, mask.height);
          const solid = mask.data.slice();
          for (let i = 0; i < solid.length; i++) {
            if (pockets[i]) solid[i] = 1;
          }
          const areaMask: FillMask = {
            ...mask,
            data: solid,
          };
          const session: QaSession = {
            raster,
            base: areaMask,
            barrier,
            // Wall classification runs on the CLEANED barrier map — text is
            // already gone, walls are the big connected runs.
            bigBarrier: bigBarrierMask(cleaned, mask.width, mask.height),
            cutouts: [],
            sub: qa?.sub === 'cutout' ? 'cutout' : 'fill',
          };
          setQa(session);
          const nums = qaNumbers(session);
          setQaValues((prev) => ({
            name: prev?.name ?? `Room ${pageMeasurements.filter((m) => m.kind === 'area').length + 1}`,
            floorAreaM2: nums.floorAreaM2,
            perimeterM: nums.perimeterM,
            wallHeightM: prev?.wallHeightM ?? defaultHeightM,
          }));
        } else if (qa.sub === 'cutout') {
          // Cut out: flood the non-barrier region at the click; whatever of
          // it lies inside the measured room is subtracted.
          const composite = qaComposite(qa);
          const compositePx = maskPixelCount(composite.data);
          const region = floodFillFromBarrier(qa.barrier, qa.base.width, qa.base.height, bx, by);
          if (!region) {
            showToast('Nothing closed-off to cut there — click inside an obstacle like an island.');
            return;
          }
          const regionPx = maskPixelCount(region.data);
          if (regionPx > compositePx * 0.5) {
            showToast('That spot isn’t closed off — it leaks way outside the room.');
            return;
          }
          const removed = new Uint8Array(region.data.length);
          let removedPx = 0;
          for (let i = 0; i < region.data.length; i++) {
            if (region.data[i] && composite.data[i]) {
              removed[i] = 1;
              removedPx++;
            }
          }
          if (removedPx < 4) {
            showToast('That’s outside the shaded room area — click inside an obstacle in the room.');
            return;
          }
          const mPerPx = qa.base.pointsPerPixel / scale.pointsPerMeter;
          const cutouts: QaCutoutEntry[] = [
            ...qa.cutouts,
            { kind: 'flood', mask: removed, areaM2: removedPx * mPerPx * mPerPx },
          ];
          setQa({ ...qa, cutouts });
          const nums = qaNumbers({ ...qa, cutouts });
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
      // Only the part inside the measured room counts.
      const composite = qaComposite(qa);
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
      const nums = qaNumbers({ ...qa, cutouts });
      setQaValues((v) => (v ? { ...v, ...nums } : v));
      showToast('Cut-out added.');
    },
    [qa, scale, qaComposite, qaNumbers, showToast],
  );

  const acceptQa = useCallback(() => {
    if (!qa || !qaValues || !scale || !plan) return;
    const composite = qaComposite(qa);
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
      // Page numbers navigate the SELECTED subset (1-based position).
      if (selectedPages.length > 0) {
        const pos = Math.min(selectedPages.length, Math.max(1, n));
        setPageNum(selectedPages[pos - 1] + 1);
      } else {
        const clamped = Math.min(plan.numPages, Math.max(1, n));
        setPageNum(clamped);
      }
      setSelectedId(null);
      setPendingOpening(null);
    },
    [plan, selectedPages],
  );

  // prev/next move within the selected subset, in original order
  const pageOffset = useCallback(
    (delta: number) => {
      if (!plan) return;
      const pages = selectedPages.length > 0 ? selectedPages : Array.from({ length: plan.numPages }, (_, i) => i);
      const pos = pages.indexOf(pageNum - 1);
      const next = pos === -1 ? 0 : Math.min(pages.length - 1, Math.max(0, pos + delta));
      setPageNum(pages[next] + 1);
      setSelectedId(null);
      setPendingOpening(null);
    },
    [plan, selectedPages, pageNum],
  );

  const changeMode = useCallback(
    (m: ToolMode) => {
      setMode((prev) => {
        if (prev === 'quickArea' && m !== 'quickArea') cancelQa();
        return m;
      });
      setToolHint(null);
      setPendingOpening(null);
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
      if (isTyping()) {
        // Ctrl+Z still works when a non-text control (checkbox, select,
        // button) has focus — only real text editing swallows it.
        const el = document.activeElement;
        const textEditing =
          el instanceof HTMLTextAreaElement ||
          (el instanceof HTMLInputElement &&
            !['checkbox', 'radio', 'button', 'submit', 'range'].includes(el.type));
        if (!textEditing && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
          e.preventDefault();
          if (liveMeasure && liveMeasure.points > 0) setChainUndoSignal((n) => n + 1);
          else undoLastMeasurement();
        }
        return;
      }
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
          pageOffset(-1);
          break;
        case 'ArrowRight':
          pageOffset(1);
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
        case 'o':
          if (plan) changeMode('openings');
          break;
        case 'Escape':
          setToolHint(null);
          setPendingOpening(null);
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
  }, [pageNum, plan, scale, flow.step, mode, selectedId, liveMeasure, gotoPage, pageOffset, changeMode, resetInteraction, deleteMeasurement, undoLastMeasurement]);

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

  // ---------- dashboard project stats (net wall area per project) ----------
  const projectStats = useMemo(() => {
    const out: Record<string, string | null> = {};
    for (const p of projects) {
      const map = loadMeasurements(p.fingerprint);
      let netM2 = 0;
      for (const [pg, items] of Object.entries(map)) {
        const pageIdx = parseInt(pg, 10) - 1; // measurements keyed 1-based
        if (!p.pages.includes(pageIdx)) continue;
        netM2 += pageTotals(items, defaultHeightM, loadDeductOpenings(p.fingerprint, parseInt(pg, 10))).netWallM2;
      }
      out[p.id] = netM2 > 0 ? `${formatArea(netM2, units)} net walls` : null;
    }
    return out;
  }, [projects, defaultHeightM, units, homeTick]);

  // dashboard: just the project count — everything else was removed per user.
  const dashStats = useMemo(() => ({ projects: projects.length }), [projects]);

  // "What's new" card: show once per version change (not on first install)
  const [whatsNew, setWhatsNew] = useState<boolean>(() => {
    try {
      const seen = localStorage.getItem('pt:v1:last-seen-version');
      return seen !== null && seen !== pkg.version;
    } catch {
      return false;
    }
  });
  const dismissWhatsNew = useCallback(() => {
    setWhatsNew(false);
    try {
      localStorage.setItem('pt:v1:last-seen-version', pkg.version);
    } catch { /* non-fatal */ }
  }, []);

  // ---------- quote ----------
  const quotePages = useMemo(() => {
    if (!plan) return [];
    return Object.entries(measurements)
      .map(([p, items]) => ({
        pageNum: parseInt(p, 10),
        items,
        defaultHeightM,
        deduct: loadDeductOpenings(plan.fingerprint, parseInt(p, 10)),
      }))
      .filter((pg) => pg.items.length > 0);
  }, [plan, measurements, defaultHeightM]);

  const quote = useMemo(() => {
    const totals = quotePages.reduce(
      (acc, pg) => {
        const t = pageTotals(pg.items, pg.defaultHeightM, pg.deduct);
        return {
          wallsGrossM2: acc.wallsGrossM2 + t.wallsGrossM2,
          openingsM2: acc.openingsM2 + t.openingsM2,
          netWallM2: acc.netWallM2 + t.netWallM2,
          trimM: acc.trimM + t.trimM,
          ceilingM2: acc.ceilingM2 + t.ceilingM2,
          floorM2: acc.floorM2 + t.floorM2,
        };
      },
      { wallsGrossM2: 0, openingsM2: 0, netWallM2: 0, trimM: 0, ceilingM2: 0, floorM2: 0 },
    );
    return computeQuote(totals, priceBook);
  }, [quotePages, priceBook]);

  const handleExportQuote = useCallback(() => {
    if (!plan) return;
    const base = plan.name.replace(/\.pdf$/i, '').replace(/[^a-z0-9-_ ]/gi, '').trim() || 'quote';
    const date = new Date().toISOString().slice(0, 10);
    exportQuoteXlsx({
      fileName: `${base}-quote-${date}.xlsx`,
      pages: quotePages,
      quote,
      priceBook,
    });
    showToast('Quote spreadsheet downloaded.');
  }, [plan, quotePages, quote, priceBook, showToast]);

  const areaOverlays = useMemo<AreaOverlay[]>(() => {    const list: AreaOverlay[] = [];
    for (const m of pageMeasurements) {
      if (m.kind === 'area' && m.maskDataUrl && m.maskRect) {
        list.push({ id: m.id, rect: m.maskRect, source: getImage(m.maskDataUrl) });
        if (m.cutoutsDataUrl) {
          list.push({ id: `${m.id}-cutouts`, rect: m.maskRect, source: getImage(m.cutoutsDataUrl) });
        }
      }
    }
    if (qa) {
      const composite = qaComposite(qa);
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
          <span className="kind-picker">
            {(['wall', 'trim', 'ceiling'] as const).map((k) => (
              <button
                key={k}
                className={measureKind === k ? 'active' : ''}
                onClick={() => setMeasureKind(k)}
              >
                {k === 'wall' ? 'Wall' : k === 'trim' ? 'Trim' : 'Ceiling'}
              </button>
            ))}
          </span>
          {measureKind === 'ceiling'
            ? 'Click the corners of the ceiling, double-click to close it. Drag moves the plan.'
            : measureKind === 'trim'
              ? 'Click along the baseboard or casing, double-click to finish. Drag moves the plan.'
              : 'Click to start a line, keep clicking to add segments, double-click to finish. Drag always moves the plan. Ctrl+Z undoes.'}
        </StepBar>
      );
    } else if (mode === 'openings') {
      stepBar = (
        <StepBar kind="info" title="Openings">
          Click on a door or window on the plan — I’ll ask what it is and subtract it from the
          wall area. Esc cancels.
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
      {plan && (
      <Toolbar
        plan={plan}
        pageNum={plan && selectedPages.length > 0 ? selectedPages.indexOf(pageNum - 1) + 1 : pageNum}
        numPages={plan && selectedPages.length > 0 ? selectedPages.length : (plan?.numPages ?? 0)}
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
        onOpenPriceBook={() => setPriceBookOpen(true)}
        onOpenQuote={() => setQuoteOpen(true)}
        onOpenPages={() => setShowPagePicker('edit')}
        onGoHome={() => void goHome()}
      />
      )}
      {plan && stepBar}
      {plan && (
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
          onOpeningClick={(p) => setPendingOpening(p)}
          resetSignal={resetSignal}
          finishSignal={finishSignal}
          chainUndoSignal={chainUndoSignal}
        />
        {pendingOpening && (
          <OpeningPopover
            x={pendingOpening.x * view.zoom + view.panX + 14}
            y={pendingOpening.y * view.zoom + view.panY - 10}
            units={units}
            sizes={openingSizes}
            onPick={pickOpening}
            onCancel={() => setPendingOpening(null)}
          />
        )}
        {plan && panelOpen && (
          <MeasurementsPanel
            items={pageMeasurements}
            units={units}
            selectedId={selectedId}
            defaultHeightM={defaultHeightM}
            openingSizes={openingSizes}
            deduct={deduct}
            onDefaultHeightChange={(m) => {
              setDefaultHeightM(m);
              saveDefaultWallHeight(m);
            }}
            onOpeningSizesChange={(s) => {
              setOpeningSizes(s);
              saveOpeningSizes(s);
            }}
            onToggleDeduct={() => {
              if (!plan) return;
              const next = !deduct;
              setDeduct(next);
              saveDeductOpenings(plan.fingerprint, pageNum, next);
            }}
            onSelect={setSelectedId}
            onRename={renameMeasurement}
            onSetHeight={setMeasurementHeight}
            onSetOpeningSf={setOpeningSf}
            onSetOpeningAssignment={setOpeningAssignment}
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
              const nums = qaNumbers({ ...qa, cutouts });
              setQaValues((v) => (v ? { ...v, ...nums } : v));
            }}
            onAccept={acceptQa}
            onCancel={cancelQa}
          />
        )}
      </div>
      )}
      {!plan && (
        <Dashboard
          projects={projects}
          projectStats={projectStats}
          stats={dashStats}
          whatsNew={whatsNew}
          onDismissWhatsNew={dismissWhatsNew}
          onNewProject={() => {
            setNewProjectFile(null);
            setShowNewProject(true);
          }}
          onOpenProject={(id) => void openProject(id)}
          onDeleteProject={(id) => {
            const p = projects.find((x) => x.id === id);
            if (p) setDeletingProject(p);
          }}
        />
      )}
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
      {showNewProject && (
        <NewProjectModal
          file={newProjectFile}
          onPickFile={() => fileInputRef.current?.click()}
          onCancel={() => {
            setShowNewProject(false);
            setNewProjectFile(null);
          }}
          onCreate={(name, company, notes) => void createProjectDetails(name, company, notes)}
        />
      )}
      {showPagePicker && (pendingPlan || plan) && (
        <PagePickerModal
          doc={showPagePicker === 'create' ? pendingPlan!.doc : plan!.doc}
          initial={showPagePicker === 'create' ? new Set(Array.from({ length: (pendingPlan ?? plan)!.numPages }, (_, i) => i)) : new Set(selectedPages)}
          title={showPagePicker === 'create' ? 'Which pages do you need?' : 'Pages in this project'}
          confirmLabel={showPagePicker === 'create' ? 'Start with {n} of {total} pages' : 'Show {n} of {total} pages'}
          onConfirm={(pages) => void confirmPagePicker(pages)}
          onCancel={() => setShowPagePicker(null)}
        />
      )}
      {deletingProject && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setDeletingProject(null)}>
          <div className="modal">
            <div className="modal-title">Delete project?</div>
            <p className="modal-text">
              “{deletingProject.name}” and its measurements go with it. This can’t be undone.
            </p>
            <div className="modal-actions">
              <button className="tool" onClick={() => setDeletingProject(null)}>
                Cancel
              </button>
              <button
                className="tool danger-button"
                onClick={() => {
                  deleteProject(deletingProject.id);
                  setProjects(loadProjects());
                  setDeletingProject(null);
                  showToast('Project deleted.');
                }}
              >
                Delete project
              </button>
            </div>
          </div>
        </div>
      )}
      {priceBookOpen && (
        <PriceBookModal
          book={priceBook}
          onChange={(b) => {
            setPriceBook(b);
            savePriceBook(b);
          }}
          onClose={() => setPriceBookOpen(false)}
        />
      )}
      {quoteOpen && (
        <QuoteView
          quote={quote}
          onExport={handleExportQuote}
          onClose={() => setQuoteOpen(false)}
        />
      )}
    </div>
  );
}
