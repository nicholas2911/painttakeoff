import { useState } from 'react';
import type {
  Measurement,
  OpeningMeasurement,
  OpeningSizes,
} from '../measure/measureStore';
import {
  formatLength,
  parseLengthToMeters,
  type UnitSystem,
} from '../measure/units';

const SQFT_PER_M2 = 10.7639;

export function formatArea(m2: number, units: UnitSystem): string {
  if (units === 'metric') return `${m2.toFixed(1)} m²`;
  return `${Math.round(m2 * SQFT_PER_M2).toLocaleString()} sq ft`;
}

/** Gross wall area of a wall/room row, honoring per-row heights. */
export function rowWallArea(m: Measurement, defaultHeightM: number): number {
  if (m.kind === 'area') return m.perimeterM * m.wallHeightM;
  if (m.kind === 'length') return m.totalMeters * (m.wallHeightM ?? defaultHeightM);
  return 0;
}

/** Openings assigned to a given row (or unassigned → page-level). */
export function openingsFor(items: Measurement[], assignedTo: string | null): OpeningMeasurement[] {
  return items.filter(
    (m): m is OpeningMeasurement => m.kind === 'opening' && m.assignedTo === assignedTo,
  );
}

/** Small inline number editor for sq-ft-style values (stored in m²). */
function AreaInput(props: {
  m2: number;
  units: UnitSystem;
  title?: string;
  onCommit(m2: number): void;
}) {
  const shown =
    props.units === 'metric'
      ? props.m2.toFixed(1)
      : String(Math.round(props.m2 * SQFT_PER_M2));
  const [text, setText] = useState<string | null>(null);
  return (
    <input
      className="mp-height"
      title={props.title ?? 'Square feet'}
      value={text ?? shown}
      onFocus={() => setText(shown)}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const x = text !== null ? parseFloat(text) : NaN;
        if (Number.isFinite(x) && x >= 0 && x < 10000) {
          props.onCommit(props.units === 'metric' ? x : x / SQFT_PER_M2);
        }
        setText(null);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') setText(null);
      }}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

/** Small inline height editor (8', 9 ft, 2.4…). */
function HeightInput(props: {
  meters: number;
  units: UnitSystem;
  onCommit(meters: number): void;
}) {
  const shown = formatLength(props.meters, props.units);
  const [text, setText] = useState<string | null>(null);
  return (
    <input
      className="mp-height"
      title="Ceiling height for this row"
      value={text ?? shown}
      onFocus={() => setText(shown)}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        // Untouched (just focused and left) → no commit: that would pin a
        // wall that follows the default and add a history entry.
        const parsed = text !== null && text !== shown ? parseLengthToMeters(text, props.units) : null;
        if (parsed !== null && parsed > 0 && parsed < 100) props.onCommit(parsed);
        setText(null);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') setText(null);
      }}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

interface PanelPage {
  pageNum: number;
  label: string;
  items: Measurement[];
}

type KindFilter = 'all' | 'walls' | 'ceilings' | 'trim' | 'rooms' | 'openings';

interface PanelProps {
  items: Measurement[];
  /** Every project page (1-based, labelled) with its measurements. */
  pages: PanelPage[];
  currentPage: number;
  onGotoPage(pageNum: number): void;
  units: UnitSystem;
  selectedId: string | null;
  defaultHeightM: number;
  openingSizes: OpeningSizes;
  deduct: boolean;
  onDefaultHeightChange(meters: number): void;
  onOpeningSizesChange(s: OpeningSizes): void;
  onToggleDeduct(): void;
  onSelect(id: string | null): void;
  onRename(id: string, label: string): void;
  /** Show measurement names as canvas labels on the plan. */
  showNamesOnPlan: boolean;
  onToggleShowNames(): void;
  onSetHeight(id: string, meters: number): void;
  onSetOpeningSf(id: string, m2: number): void;
  onSetOpeningAssignment(id: string, assignedTo: string | null): void;
  onDelete(id: string): void;
  onClose(): void;
}

function Section(props: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="mp-section">
      <button className="mp-section-header" onClick={() => setOpen(!open)}>
        <span>{open ? '▾' : '▸'}</span>
        <span className="mp-section-title">{props.title}</span>
        <span className="mp-section-count">{props.count}</span>
      </button>
      {open && props.children}
    </div>
  );
}

export default function MeasurementsPanel(props: PanelProps) {
  const { items, units, deduct } = props;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  // Session-only filters. pageChoice null = follow the viewer's page.
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [pageChoice, setPageChoice] = useState<number | 'all' | null>(null);

  const effPage = pageChoice ?? props.currentPage;
  const multiPage = effPage !== props.currentPage;
  const shownPages =
    effPage === 'all'
      ? props.pages.filter((p) => p.items.length > 0)
      : props.pages.filter((p) => p.pageNum === effPage);

  const kindOf = (m: Measurement): Exclude<KindFilter, 'all'> =>
    m.kind === 'opening'
      ? 'openings'
      : m.kind === 'ceiling'
        ? 'ceilings'
        : m.kind === 'area'
          ? 'rooms'
          : (m.purpose ?? 'wall') === 'trim'
            ? 'trim'
            : 'walls';
  const matches = (m: Measurement) => kindFilter === 'all' || kindOf(m) === kindFilter;

  // Grand totals cover everything on the pages in view (unfiltered);
  // the filtered totals below use only the rows that match the chips.
  const shownItems = shownPages.flatMap((p) => p.items);
  const grandOf = (list: Measurement[]) => {
    const ws = list.filter((m) => kindOf(m) === 'walls');
    const ts = list.filter((m) => kindOf(m) === 'trim');
    const cs = list.filter((m) => kindOf(m) === 'ceilings');
    const rs = list.filter((m) => kindOf(m) === 'rooms');
    const os = list.filter((m): m is OpeningMeasurement => m.kind === 'opening');
    const gross = [...ws, ...rs].reduce((s, m) => s + rowWallArea(m, props.defaultHeightM), 0);
    const openM2 = os.reduce((s, m) => s + m.sfM2, 0);
    return {
      gross,
      openM2,
      openCount: os.length,
      net: deduct ? Math.max(0, gross - openM2) : gross,
      trim: ts.reduce((s, m) => s + (m.kind === 'length' ? m.totalMeters : 0), 0),
      ceiling: cs.reduce((s, m) => s + (m.kind === 'ceiling' ? m.areaM2 : 0), 0),
      floor: rs.reduce((s, m) => s + (m.kind === 'area' ? m.floorAreaM2 : 0), 0),
    };
  };
  const grand = grandOf(shownItems);
  const filtered = grandOf(shownItems.filter(matches));

  const walls = items.filter(
    (m) => m.kind === 'length' && (m.purpose ?? 'wall') === 'wall',
  ).filter(matches);
  const trims = items.filter(
    (m) => m.kind === 'length' && m.purpose === 'trim',
  ).filter(matches);
  const ceilings = items.filter((m) => m.kind === 'ceiling').filter(matches);
  const rooms = items.filter((m) => m.kind === 'area').filter(matches);
  const openings = items.filter(
    (m): m is OpeningMeasurement => m.kind === 'opening',
  ).filter(matches);

  const filterNote: string | null =
    kindFilter === 'all'
      ? null
      : kindFilter === 'walls'
        ? `Showing walls only — total wall area ${formatArea(filtered.gross, units)}`
        : kindFilter === 'ceilings'
          ? `Showing ceilings only — ${formatArea(filtered.ceiling, units)} of ceilings`
          : kindFilter === 'trim'
            ? `Showing trim only — ${formatLength(filtered.trim, units)} of trim`
            : kindFilter === 'rooms'
              ? `Showing rooms only — ${formatArea(filtered.floor, units)} of floor`
              : `Showing openings only — ${filtered.openCount} opening${filtered.openCount === 1 ? '' : 's'} (${formatArea(filtered.openM2, units)})`;

  const commitRename = (id: string) => {
    const label = editText.trim();
    if (label) props.onRename(id, label);
    setEditingId(null);
  };

  const labelOf = (m: Measurement) => {
    const startRename = () => {
      setEditingId(m.id);
      setEditText(m.label);
    };
    return editingId === m.id ? (
      <input
        className="mp-rename"
        autoFocus
        placeholder="Name this — e.g. North wall, office 3"
        value={editText}
        onChange={(e) => setEditText(e.target.value)}
        onBlur={() => commitRename(m.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commitRename(m.id);
          if (e.key === 'Escape') setEditingId(null);
        }}
        onClick={(e) => e.stopPropagation()}
      />
    ) : (
      <span
        className="mp-label"
        title="Click or double-click to rename"
        onClick={(e) => {
          e.stopPropagation();
          startRename();
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          startRename();
        }}
      >
        {dotClass(m) !== '' && <span className={`mp-dot ${dotClass(m)}`} aria-hidden />}
        {m.label}
      </span>
    );
  };

  /** Color-dot class per kind — matches the canvas color language. */
  const dotClass = (m: Measurement): string => {
    if (m.kind === 'opening') return ''; // openings already have a typed dot
    if (m.kind === 'ceiling') return 'ceiling';
    if (m.kind === 'area') return 'room';
    return (m.purpose ?? 'wall') === 'trim' ? 'trim' : 'wall';
  };

  /** One-line size for compact (cross-page) rows. */
  const sizeOf = (m: Measurement): string => {
    if (m.kind === 'length')
      return (m.purpose ?? 'wall') === 'trim'
        ? formatLength(m.totalMeters, units)
        : formatArea(m.totalMeters * (m.wallHeightM ?? props.defaultHeightM), units);
    if (m.kind === 'ceiling') return formatArea(m.areaM2, units);
    if (m.kind === 'area') return formatArea(m.floorAreaM2, units);
    return `−${formatArea(m.sfM2, units)}`;
  };

  const rowShell = (m: Measurement, children: React.ReactNode) => (
    <div
      key={m.id}
      className={`mp-row ${m.id === props.selectedId ? 'selected' : ''}`}
      onClick={() => props.onSelect(m.id)}
    >
      <div className="mp-main">{children}</div>
      <button
        className="mp-trash"
        title="Delete"
        onClick={(e) => {
          e.stopPropagation();
          props.onDelete(m.id);
        }}
      >
        🗑
      </button>
    </div>
  );

  /** Wall/room rows with gross → assigned openings → net. */
  const wallLikeRow = (m: Measurement & { kind: 'length' | 'area' }) => {
    const gross = rowWallArea(m, props.defaultHeightM);
    const assigned = openingsFor(items, m.id);
    const openingsM2 = assigned.reduce((s, o) => s + o.sfM2, 0);
    const net = deduct ? Math.max(0, gross - openingsM2) : gross;
    return rowShell(m, (
      <>
        <div className="mp-row-top">
          {labelOf(m)}
          <span className="mp-value">
            {openingsM2 > 0 && deduct ? (
              <>
                <em className="mp-net-note">−{formatArea(openingsM2, units)}</em>{' '}
                {formatArea(net, units)}
              </>
            ) : (
              formatArea(gross, units)
            )}
          </span>
          <HeightInput
            meters={m.kind === 'area' ? m.wallHeightM : (m.wallHeightM ?? props.defaultHeightM)}
            units={units}
            onCommit={(h) => props.onSetHeight(m.id, h)}
          />
        </div>
        <span className="mp-sub">
          {m.kind === 'length'
            ? `${formatLength(m.totalMeters, units)} long`
            : `${formatArea(m.floorAreaM2, units)} floor · ~${formatLength(m.perimeterM, units)} around`}
          {' · wall area'}
        </span>
      </>
    ));
  };

  return (
    <div className="measure-panel">
      <div className="mp-header">
        <span>Measurements on this page</span>
        <button className="mp-close" onClick={props.onClose} title="Close panel">✕</button>
      </div>
      <div className="mp-default-height">
        <span>Default ceiling height</span>
        <HeightInput
          meters={props.defaultHeightM}
          units={units}
          onCommit={props.onDefaultHeightChange}
        />
      </div>
      <label className="mp-names-toggle">
        <input
          type="checkbox"
          checked={props.showNamesOnPlan}
          onChange={props.onToggleShowNames}
        />
        <span>Show names on the plan</span>
      </label>
      <div className="mp-filters">
        <div className="mp-chips">
          {(
            [
              ['all', 'All'],
              ['walls', 'Walls'],
              ['ceilings', 'Ceilings'],
              ['trim', 'Trim'],
              ['rooms', 'Rooms'],
              ['openings', 'Openings'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              className={`mp-chip ${kindFilter === value ? 'active' : ''}`}
              onClick={() => setKindFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <select
          className="mp-page-filter"
          title="Which pages to list"
          value={pageChoice === null ? String(props.currentPage) : String(pageChoice)}
          onChange={(e) =>
            setPageChoice(e.target.value === 'all' ? 'all' : parseInt(e.target.value, 10))
          }
        >
          <option value="all">All pages</option>
          {props.pages.map((p) => (
            <option key={p.pageNum} value={p.pageNum}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      <div className="mp-list">
        {multiPage ? (
          <div className="mp-xpage">
            {shownPages.every((p) => p.items.filter(matches).length === 0) && (
              <div className="mp-empty">Nothing matches here yet.</div>
            )}
            {shownPages.map((p) => {
              const rows = p.items.filter(matches);
              if (rows.length === 0) return null;
              return (
                <div key={p.pageNum} className="mp-xpage-group">
                  <div className="mp-xpage-title">{p.label}</div>
                  {rows.map((m) => (
                    <div
                      key={m.id}
                      className={`mp-row mp-row-x ${m.id === props.selectedId ? 'selected' : ''}`}
                      title="Jump to this measurement"
                      onClick={() => {
                        props.onGotoPage(p.pageNum);
                        props.onSelect(m.id);
                      }}
                    >
                      <span className={`mp-dot ${m.kind === 'opening' ? 'opening' : dotClass(m)}`} />
                      <span className="mp-label-static">{m.label}</span>
                      <span className="mp-value">{sizeOf(m)}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        ) : (
          <>
        {items.length === 0 && (
          <div className="mp-empty">
            Nothing measured on this page yet. Use <strong>Measure</strong>,{' '}
            <strong>Quick Area</strong>, or <strong>Openings</strong>.
          </div>
        )}
        {items.length > 0 && [...walls, ...rooms, ...ceilings, ...trims, ...openings].length === 0 && (
          <div className="mp-empty">Nothing matches this filter on this page.</div>
        )}

        {walls.length > 0 && (
          <Section title="Walls" count={walls.length}>
            {walls.map((m) => wallLikeRow(m as Measurement & { kind: 'length' | 'area' }))}
          </Section>
        )}

        {rooms.length > 0 && (
          <Section title="Rooms (Quick Area)" count={rooms.length}>
            {rooms.map((m) => wallLikeRow(m as Measurement & { kind: 'length' | 'area' }))}
          </Section>
        )}

        {ceilings.length > 0 && (
          <Section title="Ceilings" count={ceilings.length}>
            {ceilings.map((m) =>
              m.kind === 'ceiling'
                ? rowShell(m, (
                    <>
                      <div className="mp-row-top">
                        {labelOf(m)}
                        <span className="mp-value">{formatArea(m.areaM2, units)}</span>
                      </div>
                      <span className="mp-sub">{formatLength(m.perimeterM, units)} around</span>
                    </>
                  ))
                : null,
            )}
          </Section>
        )}

        {trims.length > 0 && (
          <Section title="Trim" count={trims.length}>
            {trims.map((m) =>
              m.kind === 'length'
                ? rowShell(m, (
                    <>
                      <div className="mp-row-top">
                        {labelOf(m)}
                        <span className="mp-value">{formatLength(m.totalMeters, units)}</span>
                      </div>
                      <span className="mp-sub">priced per length</span>
                    </>
                  ))
                : null,
            )}
          </Section>
        )}

        <Section title="Openings (deduct)" count={openings.length}>
          <label className="mp-deduct-toggle" onClick={(e) => e.stopPropagation()}>
            <input type="checkbox" checked={deduct} onChange={props.onToggleDeduct} />
            <span>
              Deduct openings from wall area
              {!deduct && <em> — paused, net = gross</em>}
            </span>
          </label>
          <div className="mp-opening-sizes">
            <span>Default sizes ({units === 'metric' ? 'm²' : 'sq ft'}):</span>
            {(['door', 'window', 'slider'] as const).map((t) => (
              <label key={t}>
                <span className="mp-size-name">{t}</span>
                <AreaInput
                  m2={props.openingSizes[t]}
                  units={units}
                  title={`Default ${t} size`}
                  onCommit={(m2) =>
                    props.onOpeningSizesChange({ ...props.openingSizes, [t]: m2 })
                  }
                />
              </label>
            ))}
          </div>
          {openings.map((m) =>
            rowShell(m, (
              <>
                <div className="mp-row-top">
                  <span className={`mp-opening-dot ${m.openType}`} />
                  {labelOf(m)}
                  <AreaInput
                    m2={m.sfM2}
                    units={units}
                    title="Size of this opening"
                    onCommit={(m2) => props.onSetOpeningSf(m.id, m2)}
                  />
                  <select
                    className="mp-assign"
                    value={m.assignedTo ?? ''}
                    title="What does this opening come out of?"
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) =>
                      props.onSetOpeningAssignment(m.id, e.target.value || null)
                    }
                  >
                    <option value="">Whole page</option>
                    {[...walls, ...rooms].map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.label}
                      </option>
                    ))}
                  </select>
                </div>
                <span className="mp-sub">
                  {m.openType} · subtracts {formatArea(m.sfM2, units)}
                  {m.assignedTo
                    ? ` from ${items.find((w) => w.id === m.assignedTo)?.label ?? 'row'}`
                    : ' from the page total'}
                </span>
              </>
            )),
          )}
        </Section>
          </>
        )}
      </div>

      {shownItems.length > 0 && (
        <div className={`mp-totals ${kindFilter !== 'all' || multiPage ? 'muted' : ''}`}>
          {filterNote && <div className="mp-filter-note">{filterNote}</div>}
          <div className="mp-total-row">
            <span>Gross wall area</span>
            <strong>{formatArea(grand.gross, units)}</strong>
          </div>
          <div className="mp-total-row">
            <span>{deduct ? `Openings (${grand.openCount})` : 'Openings (paused)'}</span>
            <strong>{deduct ? `− ${formatArea(grand.openM2, units)}` : '—'}</strong>
          </div>
          <div className="mp-total-row grand">
            <span>Net wall area</span>
            <strong>{formatArea(grand.net, units)}</strong>
          </div>
          {(grand.trim > 0 || grand.ceiling > 0 || grand.floor > 0) && (
            <div className="mp-total-row mp-total-minor">
              <span>
                {grand.trim > 0 && <>Trim {formatLength(grand.trim, units)}</>}
                {grand.trim > 0 && grand.ceiling > 0 && ' · '}
                {grand.ceiling > 0 && <>Ceiling {formatArea(grand.ceiling, units)}</>}
                {(grand.trim > 0 || grand.ceiling > 0) && grand.floor > 0 && ' · '}
                {grand.floor > 0 && <>Floor {formatArea(grand.floor, units)}</>}
              </span>
            </div>
          )}
        </div>
      )}

      <div className="mp-legend">
        <span><i className="mp-dot wall" /> walls</span>
        <span><i className="mp-dot ceiling" /> ceilings</span>
        <span><i className="mp-dot trim" /> trim</span>
        <span><i className="mp-dot room" /> rooms</span>
        <span><i className="mp-dot opening" /> openings</span>
      </div>
    </div>
  );
}
