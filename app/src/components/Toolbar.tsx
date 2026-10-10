import { useEffect, useRef, useState } from 'react';
import type { LoadedPlan } from '../pdf/pdfDocument';
import type { PageScale } from '../measure/scaleStore';
import { SCALE_PRESETS, formatRatio } from '../measure/presets';
import type { UnitSystem } from '../measure/units';
import type { ToolMode } from '../types';
import {
  AreaIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DollarIcon,
  DoorIcon,
  FitIcon,
  FolderIcon,
  HomeIcon,
  ListIcon,
  MeasureIcon,
  MoonIcon,
  MoveIcon,
  PagesIcon,
  QuestionIcon,
  QuoteIcon,
  RulerIcon,
  SunIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from './icons';

interface ToolbarProps {
  plan: LoadedPlan | null;
  pageNum: number;
  numPages: number;
  onOpenFile(file: File): void;
  onPageChange(n: number): void;
  zoom: number;
  onZoomIn(): void;
  onZoomOut(): void;
  onFitWidth(): void;
  onFitPage(): void;
  mode: ToolMode;
  onModeChange(mode: ToolMode): void;
  /** Measure/Quick Area clicked with no scale set — App shows a friendly hint. */
  onToolBlocked(tool: 'measure' | 'quickArea'): void;
  scale: PageScale | undefined;
  onPresetSelect(ratio: number): void;
  onCustomScale(): void;
  /** Badge click: start the double-check flow for an unconfirmed scale. */
  onConfirmScale(): void;
  units: UnitSystem;
  onToggleUnits(): void;
  theme: 'light' | 'dark';
  onToggleTheme(): void;
  onShowShortcuts(): void;
  measureCount: number;
  panelOpen: boolean;
  onTogglePanel(): void;
  onOpenPriceBook(): void;
  onOpenQuote(): void;
  onOpenPages(): void;
  onGoHome(): void;
  /** Whichever layer is active right now (real, or the scratch overlay). */
  activeCount: number;
  onUndo(): void;
  onClearAll(): void;
  scratchActive: boolean;
  onToggleScratch(): void;
  onOpenHistory(): void;
  /** Custom label for the current page ("" = default "Page N"). */
  pageCustomLabel: string;
  onRenamePage(): void;
  onRotatePage(): void;
}

export default function Toolbar(props: ToolbarProps) {
  const { plan, pageNum, numPages, scale, mode, units, theme } = props;
  const fileRef = useRef<HTMLInputElement>(null);
  const [pageText, setPageText] = useState(String(pageNum));
  const [fitOpen, setFitOpen] = useState(false);
  const fitRef = useRef<HTMLDivElement>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setPageText(String(pageNum)), [pageNum]);

  // Close the Edit menu on any outside click (closing it never cancels the
  // 3s "Clear? Click again" confirm window — that's its own timer).
  useEffect(() => {
    if (!moreOpen) return;
    const close = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [moreOpen]);

  useEffect(() => () => {
    if (clearTimer.current) clearTimeout(clearTimer.current);
  }, []);

  const handleClearClick = () => {
    if (!confirmingClear) {
      setConfirmingClear(true);
      clearTimer.current = setTimeout(() => setConfirmingClear(false), 3000);
      return;
    }
    if (clearTimer.current) clearTimeout(clearTimer.current);
    setConfirmingClear(false);
    props.onClearAll();
  };

  // Close the Fit menu on any outside click.
  useEffect(() => {
    if (!fitOpen) return;
    const close = (e: MouseEvent) => {
      if (fitRef.current && !fitRef.current.contains(e.target as Node)) setFitOpen(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [fitOpen]);

  const commitPageText = () => {
    const n = parseInt(pageText, 10);
    if (!Number.isNaN(n)) props.onPageChange(n);
    else setPageText(String(pageNum));
  };

  const modeButton = (
    m: ToolMode,
    label: string,
    icon: React.ReactNode,
    title: string,
    accent = false,
  ) => (
    <button
      className={`tool big-tool ${mode === m ? 'active' : ''} ${accent ? 'accent-tool' : ''}`}
      title={title}
      onClick={() => {
        if ((m === 'measure' || m === 'quickArea') && !props.scale) props.onToolBlocked(m);
        else props.onModeChange(m);
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  );

  return (
    <div className="toolbar">
      <div className="tb-group">
        <button className="tool" onClick={props.onGoHome} title="Back to your projects">
          <HomeIcon />
          <span>Home</span>
        </button>
        <button className="tool big-tool" onClick={() => fileRef.current?.click()}>
          <FolderIcon />
          <span>Open Plan</span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,.pdf"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) props.onOpenFile(f);
            e.target.value = '';
          }}
        />
        {plan && (
          <span className="filename" title={plan.name}>
            {plan.name}
          </span>
        )}
      </div>

      <div className="tb-group page-nav">
        <button
          className="tool nav-tool"
          disabled={!plan || pageNum <= 1}
          onClick={() => props.onPageChange(pageNum - 1)}
          title="Previous page (←)"
        >
          <ChevronLeftIcon size={22} />
        </button>
        <span className="page-label">
          Page{' '}
          <input
            className="page-input"
            value={pageText}
            disabled={!plan}
            onChange={(e) => setPageText(e.target.value.replace(/[^0-9]/g, ''))}
            onBlur={commitPageText}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
          />{' '}
          of {numPages || '—'}
          {props.pageCustomLabel && <em className="page-custom-label">{props.pageCustomLabel}</em>}
        </span>
        <button
          className="tool nav-tool page-edit"
          disabled={!plan}
          onClick={props.onRenamePage}
          title="Name this page (e.g. A3 – Party Room)"
        >
          ✎
        </button>
        <button
          className="tool nav-tool"
          disabled={!plan || pageNum >= numPages}
          onClick={() => props.onPageChange(pageNum + 1)}
          title="Next page (→)"
        >
          <ChevronRightIcon size={22} />
        </button>
      </div>

      <div className="tb-group">
        {modeButton('pan', 'Move Around', <MoveIcon />, 'Drag to move around the plan (V)')}
        {modeButton('calibrate', 'Set Scale', <RulerIcon />, 'Tell the app a real length on this page (C)', true)}
        {modeButton('measure', 'Measure', <MeasureIcon />, 'Click points to measure lengths and ceilings (M)')}
        {modeButton('quickArea', 'Quick Area', <AreaIcon />, 'Click inside a room for a rough square footage (A)')}
        {modeButton('openings', 'Openings', <DoorIcon />, 'Click doors and windows to deduct them (O)')}
      </div>

      <div className="tb-group">
        <select
          className="preset-select"
          disabled={!plan}
          value=""
          title="If the plan says its scale, pick it here — no measuring needed"
          onChange={(e) => {
            if (e.target.value === 'custom') {
              props.onCustomScale();
              return;
            }
            const preset = SCALE_PRESETS.find((p) => p.id === e.target.value);
            if (preset) props.onPresetSelect(preset.ratio);
          }}
        >
          <option value="" disabled>
            Common scales…
          </option>
          {SCALE_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
          <option value="custom">Custom…</option>
        </select>
        <button
          className={`tool ${props.panelOpen ? 'active' : ''}`}
          disabled={!plan}
          onClick={props.onTogglePanel}
          title="Show the measurements list for this page"
        >
          <ListIcon />
          <span>Measurements{plan ? ` (${props.measureCount})` : ''}</span>
        </button>
        <button className="tool" disabled={!plan} onClick={props.onOpenQuote} title="See your quote">
          <QuoteIcon />
          <span>Quote</span>
        </button>
        <button className="tool" disabled={!plan} onClick={props.onOpenPages} title="Choose which pages to work on">
          <PagesIcon />
          <span>Pages</span>
        </button>
        <button className="tool" onClick={props.onOpenPriceBook} title="Your rates — labour, paint, margin">
          <DollarIcon />
        </button>
      </div>

      <div className="tb-group">
        <div className="fit-wrap" ref={moreRef}>
          <button className="tool" disabled={!plan} onClick={() => setMoreOpen((v) => !v)} title="Undo, clear, or see history for this page">
            <span>Edit ▾</span>
          </button>
          {moreOpen && (
            <div className="fit-menu">
              <button
                disabled={props.activeCount === 0}
                onClick={() => {
                  setMoreOpen(false);
                  props.onUndo();
                }}
                title={props.scratchActive ? 'Undo the last scratch measurement (Ctrl+Z)' : 'Undo the last measurement (Ctrl+Z)'}
              >
                Undo{props.scratchActive ? ' (scratch)' : ''}
              </button>
              <button
                disabled={props.activeCount === 0}
                className={confirmingClear ? 'confirm-danger' : ''}
                onClick={handleClearClick}
                title={props.scratchActive ? 'Clear every scratch measurement on this page' : 'Clear every measurement on this page'}
              >
                {confirmingClear ? 'Clear? Click again' : `Clear${props.scratchActive ? ' (scratch)' : ''}`}
              </button>
              <button
                onClick={() => {
                  setMoreOpen(false);
                  props.onOpenHistory();
                }}
                title="See recent changes and revert"
              >
                History
              </button>
            </div>
          )}
        </div>
        <button
          className={`tool ${props.scratchActive ? 'active' : ''}`}
          disabled={!plan}
          onClick={props.onToggleScratch}
          title="Scratch overlay: measure something on this page without it counting toward the total"
        >
          <span>{props.scratchActive ? 'Overlay ✓' : 'Overlay'}</span>
        </button>
      </div>

      <div className="tb-group zoom-cluster">
        <button className="tool" disabled={!plan} onClick={props.onZoomOut} title="Zoom out (−)">
          <ZoomOutIcon />
        </button>
        <span className="zoom-pct">{plan ? `${Math.round(props.zoom * 100)}%` : '—'}</span>
        <button className="tool" disabled={!plan} onClick={props.onZoomIn} title="Zoom in (+)">
          <ZoomInIcon />
        </button>
        <div className="fit-wrap" ref={fitRef}>
          <button
            className="tool"
            disabled={!plan}
            onClick={() => setFitOpen((v) => !v)}
            title="Fit the page on screen"
          >
            <FitIcon /> <span>Fit ▾</span>
          </button>
          {fitOpen && (
            <div className="fit-menu">
              <button
                onClick={() => {
                  setFitOpen(false);
                  props.onFitPage();
                }}
              >
                See whole page
              </button>
              <button
                onClick={() => {
                  setFitOpen(false);
                  props.onFitWidth();
                }}
              >
                Fit width
              </button>
              <button
                onClick={() => {
                  setFitOpen(false);
                  props.onRotatePage();
                }}
              >
                Rotate page 90°
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="tb-group tb-right">
        {plan &&
          (scale ? (
            scale.verified ? (
              <span className="scale-badge verified" title={`Confirmed scale · ${formatRatio(scale.pointsPerMeter)}`}>
                Scale is set ✓ <em>{formatRatio(scale.pointsPerMeter)}</em>
              </span>
            ) : (
              <button
                className="scale-badge unverified as-button"
                title="Scale is set but not double-checked yet — click to do the quick double-check"
                onClick={props.onConfirmScale}
              >
                ⚠ Scale not confirmed — fix <em>{formatRatio(scale.pointsPerMeter)}</em>
              </button>
            )
          ) : (
            <span className="scale-badge none" title="This page has no scale yet">
              No scale on this page
            </span>
          ))}
        <div className="unit-toggle" title="Units">
          <button
            className={units === 'imperial' ? 'active' : ''}
            onClick={() => units !== 'imperial' && props.onToggleUnits()}
          >
            ft &amp; in
          </button>
          <button
            className={units === 'metric' ? 'active' : ''}
            onClick={() => units !== 'metric' && props.onToggleUnits()}
          >
            meters
          </button>
        </div>
        <button
          className="tool icon-tool"
          onClick={props.onToggleTheme}
          title={theme === 'light' ? 'Switch to dark colors' : 'Switch to light colors'}
        >
          {theme === 'light' ? <MoonIcon /> : <SunIcon />}
        </button>
        <button className="tool icon-tool" onClick={props.onShowShortcuts} title="Shortcuts &amp; tips">
          <QuestionIcon />
        </button>
      </div>
    </div>
  );
}
