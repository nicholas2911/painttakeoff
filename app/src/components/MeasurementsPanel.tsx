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
        const parsed = text !== null ? parseLengthToMeters(text, props.units) : null;
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

interface PanelProps {
  items: Measurement[];
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

  const walls = items.filter(
    (m) => m.kind === 'length' && (m.purpose ?? 'wall') === 'wall',
  );
  const trims = items.filter(
    (m) => m.kind === 'length' && m.purpose === 'trim',
  );
  const ceilings = items.filter((m) => m.kind === 'ceiling');
  const rooms = items.filter((m) => m.kind === 'area');
  const openings = items.filter(
    (m): m is OpeningMeasurement => m.kind === 'opening',
  );

  const grossWall = [...walls, ...rooms].reduce(
    (s, m) => s + rowWallArea(m, props.defaultHeightM),
    0,
  );
  const openingsTotal = openings.reduce((s, m) => s + m.sfM2, 0);
  const netWall = deduct ? Math.max(0, grossWall - openingsTotal) : grossWall;
  const totalTrim = trims.reduce((s, m) => s + (m.kind === 'length' ? m.totalMeters : 0), 0);
  const totalCeiling = ceilings.reduce((s, m) => s + (m.kind === 'ceiling' ? m.areaM2 : 0), 0);
  const totalFloor = rooms.reduce((s, m) => s + (m.kind === 'area' ? m.floorAreaM2 : 0), 0);

  const commitRename = (id: string) => {
    const label = editText.trim();
    if (label) props.onRename(id, label);
    setEditingId(null);
  };

  const labelOf = (m: Measurement) =>
    editingId === m.id ? (
      <input
        className="mp-rename"
        autoFocus
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
        title="Click the name to rename"
        onClick={(e) => {
          e.stopPropagation();
          setEditingId(m.id);
          setEditText(m.label);
        }}
      >
        {m.label}
      </span>
    );

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
      <div className="mp-list">
        {items.length === 0 && (
          <div className="mp-empty">
            Nothing measured on this page yet. Use <strong>Measure</strong>,{' '}
            <strong>Quick Area</strong>, or <strong>Openings</strong>.
          </div>
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
      </div>

      {items.length > 0 && (
        <div className="mp-totals">
          <div className="mp-total-row">
            <span>Gross wall area</span>
            <strong>{formatArea(grossWall, units)}</strong>
          </div>
          <div className="mp-total-row">
            <span>{deduct ? `Openings (${openings.length})` : 'Openings (paused)'}</span>
            <strong>{deduct ? `− ${formatArea(openingsTotal, units)}` : '—'}</strong>
          </div>
          <div className="mp-total-row grand">
            <span>Net wall area</span>
            <strong>{formatArea(netWall, units)}</strong>
          </div>
          {(totalTrim > 0 || totalCeiling > 0 || totalFloor > 0) && (
            <div className="mp-total-row mp-total-minor">
              <span>
                {totalTrim > 0 && <>Trim {formatLength(totalTrim, units)}</>}
                {totalTrim > 0 && totalCeiling > 0 && ' · '}
                {totalCeiling > 0 && <>Ceiling {formatArea(totalCeiling, units)}</>}
                {(totalTrim > 0 || totalCeiling > 0) && totalFloor > 0 && ' · '}
                {totalFloor > 0 && <>Floor {formatArea(totalFloor, units)}</>}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
