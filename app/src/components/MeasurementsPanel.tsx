import { useState } from 'react';
import type { Measurement } from '../measure/measureStore';
import { formatLength, type UnitSystem } from '../measure/units';

const SQFT_PER_M2 = 10.7639;

export function formatArea(m2: number, units: UnitSystem): string {
  if (units === 'metric') return `${m2.toFixed(1)} m²`;
  return `${Math.round(m2 * SQFT_PER_M2).toLocaleString()} sq ft`;
}

/** Right-side panel: the current page's measurements with totals. */
export default function MeasurementsPanel(props: {
  items: Measurement[];
  units: UnitSystem;
  selectedId: string | null;
  onSelect(id: string | null): void;
  onRename(id: string, label: string): void;
  onDelete(id: string): void;
  onClose(): void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const lengths = props.items.filter((m) => m.kind === 'length');
  const areas = props.items.filter((m) => m.kind === 'area');
  const totalLength = lengths.reduce((s, m) => s + (m.kind === 'length' ? m.totalMeters : 0), 0);
  const totalFloor = areas.reduce((s, m) => s + (m.kind === 'area' ? m.floorAreaM2 : 0), 0);
  const totalWall = areas.reduce((s, m) => s + (m.kind === 'area' ? m.wallAreaM2 : 0), 0);

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
            <span className="mp-value">
              {m.kind === 'length'
                ? formatLength(m.totalMeters, props.units)
                : `${formatArea(m.floorAreaM2, props.units)} · walls ≈ ${formatArea(m.wallAreaM2, props.units)}`}
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
            <>
              <div className="mp-total-row">
                <span>Total floor area</span>
                <strong>{formatArea(totalFloor, props.units)}</strong>
              </div>
              <div className="mp-total-row">
                <span>Total rough wall area</span>
                <strong>≈ {formatArea(totalWall, props.units)}</strong>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
