import { formatArea } from './MeasurementsPanel';
import type { UnitSystem } from '../measure/units';

const SQFT_PER_M2 = 10.7639;

export interface QaValues {
  name: string;
  floorAreaM2: number;
  perimeterM: number;
  wallHeightM: number;
}

export interface QaCutout {
  areaM2: number;
  kind?: 'flood' | 'poly';
}

/**
 * The Quick Area result card: rough numbers from the flood fill, with every
 * value editable (user correction path) and cutout management.
 */
export default function QuickAreaCard(props: {
  values: QaValues;
  cutouts: QaCutout[];
  units: UnitSystem;
  cuttingOut: boolean;
  drawingCutout: boolean;
  busy: boolean;
  onChange(v: QaValues): void;
  onToggleCutout(): void;
  onToggleDrawCutout(): void;
  onRemoveCutout(index: number): void;
  onAccept(): void;
  onCancel(): void;
}) {
  const { values: v, units } = props;
  const wallAreaM2 = v.perimeterM * v.wallHeightM;

  const areaToUi = (m2: number) =>
    units === 'metric' ? parseFloat(m2.toFixed(1)) : Math.round(m2 * SQFT_PER_M2);
  const areaFromUi = (x: number) => (units === 'metric' ? x : x / SQFT_PER_M2);
  const lenToUi = (m: number) =>
    units === 'metric' ? parseFloat(m.toFixed(2)) : parseFloat((m / 0.3048).toFixed(1));
  const lenFromUi = (x: number) => (units === 'metric' ? x : x * 0.3048);

  const numInput = (
    value: number,
    onCommit: (x: number) => void,
    width = 90,
  ) => (
    <input
      className="qa-num"
      style={{ width }}
      type="number"
      min="0"
      step="any"
      value={Number.isFinite(value) ? value : 0}
      onChange={(e) => {
        const x = parseFloat(e.target.value);
        if (!Number.isNaN(x)) onCommit(x);
      }}
    />
  );

  return (
    <div className="qa-card">
      <div className="qa-title">Quick Area <span className="qa-rough">rough estimate</span></div>

      <label className="qa-row">
        <span>Name</span>
        <input
          className="qa-name"
          value={v.name}
          onChange={(e) => props.onChange({ ...v, name: e.target.value })}
        />
      </label>

      <label className="qa-row">
        <span>Floor area ({units === 'metric' ? 'm²' : 'sq ft'})</span>
        {numInput(areaToUi(v.floorAreaM2), (x) => props.onChange({ ...v, floorAreaM2: areaFromUi(x) }))}
      </label>
      <label className="qa-row">
        <span>Perimeter, rough ({units === 'metric' ? 'm' : 'ft'})</span>
        {numInput(lenToUi(v.perimeterM), (x) => props.onChange({ ...v, perimeterM: lenFromUi(x) }))}
      </label>
      <label className="qa-row">
        <span>Ceiling height ({units === 'metric' ? 'm' : 'ft'})</span>
        {numInput(lenToUi(v.wallHeightM), (x) => props.onChange({ ...v, wallHeightM: lenFromUi(x) }), 70)}
      </label>

      <div className="qa-result">
        Rough wall area ≈ <strong>{formatArea(wallAreaM2, units)}</strong>
        <div className="qa-result-sub">perimeter × ceiling height</div>
      </div>

      {props.cutouts.length > 0 && (
        <div className="qa-cutouts">
          {props.cutouts.map((c, i) => (
            <div className="qa-cutout" key={i}>
              <span>
                Cut-out {i + 1}
                {c.kind === 'poly' ? ' (hand-drawn)' : ''} ({formatArea(c.areaM2, units)})
              </span>
              <button onClick={() => props.onRemoveCutout(i)} title="Put it back">✕</button>
            </div>
          ))}
        </div>
      )}

      <div className="qa-cutout-buttons">
        <button
          className={`tool ${props.cuttingOut ? 'active' : ''}`}
          onClick={props.onToggleCutout}
          disabled={props.busy}
        >
          {props.cuttingOut ? 'Click inside an obstacle…' : 'Cut out an obstacle'}
        </button>
        <button
          className={`tool ${props.drawingCutout ? 'active' : ''}`}
          onClick={props.onToggleDrawCutout}
          disabled={props.busy}
          title="Trace around an obstacle yourself: click corners, double-click to finish"
        >
          {props.drawingCutout ? 'Drawing cut-out…' : 'Draw a cut-out'}
        </button>
      </div>

      <div className="modal-actions">
        <button className="tool" onClick={props.onCancel}>Cancel</button>
        <button className="tool go-button" onClick={props.onAccept} disabled={props.busy}>
          Keep this room
        </button>
      </div>
      <p className="qa-hint">
        Rough only — odd shapes or open doorways may measure better with the Measure tool.
      </p>
    </div>
  );
}

/** Default ceiling height per unit system. */
export function defaultWallHeight(units: UnitSystem): number {
  return units === 'metric' ? 2.4 : 8 * 0.3048;
}
