import { useState } from 'react';
import type { Measurement } from '../measure/measureStore';
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

/** Wall area of any measurement row, honoring per-row heights. */
export function rowWallArea(m: Measurement, defaultHeightM: number): number {
  if (m.kind === 'area') return m.perimeterM * m.wallHeightM;
  return m.totalMeters * (m.wallHeightM ?? defaultHeightM);
}

/** Small inline height editor: shows ft-in or m, accepts anything the
 *  forgiving parser understands (8', 9 ft, 2.4, 2400 mm…). */
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

/** Right-side panel: the current page's measurements with wall areas. */
export default function MeasurementsPanel(props: {
  items: Measurement[];
  units: UnitSystem;
  selectedId: string | null;
  defaultHeightM: number;
  onDefaultHeightChange(meters: number): void;
  onSelect(id: string | null): void;
  onRename(id: string, label: string): void;
  onSetHeight(id: string, meters: number): void;
  onDelete(id: string): void;
  onClose(): void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const lengths = props.items.filter((m) => m.kind === 'length');
  const areas = props.items.filter((m) => m.kind === 'area');
  const totalLength = lengths.reduce((s, m) => s + (m.kind === 'length' ? m.totalMeters : 0), 0);
  const totalFloor = areas.reduce((s, m) => s + (m.kind === 'area' ? m.floorAreaM2 : 0), 0);
  const totalWall = props.items.reduce((s, m) => s + rowWallArea(m, props.defaultHeightM), 0);

  const commitRename = (id: string) => {
    const label = editText.trim();
    if (label) props.onRename(id, label);
    setEditingId(null);
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
          units={props.units}
          onCommit={props.onDefaultHeightChange}
        />
      </div>
      <div className="mp-list">
        {props.items.length === 0 && (
          <div className="mp-empty">
            Nothing measured on this page yet. Use <strong>Measure</strong> or{' '}
            <strong>Quick Area</strong>.
          </div>
        )}
        {props.items.map((m, i) => (
          <div
            key={m.id}
            className={`mp-row ${m.id === props.selectedId ? 'selected' : ''}`}
            onClick={() => props.onSelect(m.id)}
          >
            <span className="mp-num">{i + 1}</span>
            <div className="mp-main">
              {editingId === m.id ? (
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
              )}
              <span className="mp-sub">
                {m.kind === 'length'
                  ? formatLength(m.totalMeters, props.units)
                  : `${formatArea(m.floorAreaM2, props.units)} floor · ~${formatLength(m.perimeterM, props.units)} around`}
              </span>
            </div>
            <HeightInput
              meters={m.kind === 'area' ? m.wallHeightM : (m.wallHeightM ?? props.defaultHeightM)}
              units={props.units}
              onCommit={(h) => props.onSetHeight(m.id, h)}
            />
            <span className="mp-value" title="Wall area = length × height">
              {formatArea(rowWallArea(m, props.defaultHeightM), props.units)}
            </span>
            <button
              className="mp-trash"
              title="Delete this measurement"
              onClick={(e) => {
                e.stopPropagation();
                props.onDelete(m.id);
              }}
            >
              🗑
            </button>
          </div>
        ))}
      </div>
      {props.items.length > 0 && (
        <div className="mp-totals">
          {lengths.length > 0 && (
            <div className="mp-total-row">
              <span>Total length on this page</span>
              <strong>{formatLength(totalLength, props.units)}</strong>
            </div>
          )}
          {areas.length > 0 && (
            <div className="mp-total-row">
              <span>Total floor area</span>
              <strong>{formatArea(totalFloor, props.units)}</strong>
            </div>
          )}
          <div className="mp-total-row grand">
            <span>Total wall area</span>
            <strong>{formatArea(totalWall, props.units)}</strong>
          </div>
        </div>
      )}
    </div>
  );
}
