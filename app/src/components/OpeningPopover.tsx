import { useState } from 'react';
import type { OpeningSizes, OpeningType } from '../measure/measureStore';
import type { UnitSystem } from '../measure/units';

const SQFT_PER_M2 = 10.7639;

/** Tiny card shown where the user clicked: what kind of opening is this? */
export default function OpeningPopover(props: {
  x: number;
  y: number;
  units: UnitSystem;
  sizes: OpeningSizes;
  onPick(type: OpeningType, customM2?: number): void;
  onCancel(): void;
}) {
  const [custom, setCustom] = useState('');
  const fmt = (m2: number) =>
    props.units === 'metric' ? `${m2.toFixed(1)} m²` : `${Math.round(m2 * SQFT_PER_M2)} sq ft`;

  const btn = (type: OpeningType, label: string) => (
    <button className="tool big-tool" onClick={() => props.onPick(type)}>
      {label}
      <span className="op-size">{fmt(props.sizes[type])}</span>
    </button>
  );

  const customM2 = (() => {
    const x = parseFloat(custom);
    if (!Number.isFinite(x) || x <= 0 || x > 10000) return null;
    return props.units === 'metric' ? x : x / SQFT_PER_M2;
  })();

  return (
    <div
      className="opening-popover"
      style={{ left: Math.min(props.x, window.innerWidth - 260), top: props.y }}
    >
      <div className="op-title">What is this?</div>
      <div className="op-buttons">
        {btn('door', 'Door')}
        {btn('window', 'Window')}
        {btn('slider', 'Slider')}
      </div>
      <div className="op-custom">
        <input
          autoFocus={false}
          placeholder={`Other size (${props.units === 'metric' ? 'm²' : 'sq ft'})`}
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && customM2 !== null) props.onPick('window', customM2);
            if (e.key === 'Escape') props.onCancel();
          }}
        />
        <button
          className="tool"
          disabled={customM2 === null}
          onClick={() => customM2 !== null && props.onPick('window', customM2)}
        >
          Add
        </button>
      </div>
      <button className="op-cancel" onClick={props.onCancel}>
        Cancel (Esc)
      </button>
    </div>
  );
}
