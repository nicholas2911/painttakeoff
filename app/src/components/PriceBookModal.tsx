import { useEffect } from 'react';
import { ONTARIO_DEFAULTS, type PriceBook } from '../quote/priceBook';

function Num(props: {
  label: string;
  value: number;
  step?: number;
  onChange(v: number): void;
}) {
  return (
    <label className="pb-field">
      <span>{props.label}</span>
      <input
        type="number"
        step={props.step ?? 'any'}
        min="0"
        value={props.value}
        onChange={(e) => {
          const x = parseFloat(e.target.value);
          if (Number.isFinite(x) && x >= 0) props.onChange(x);
        }}
      />
    </label>
  );
}

function Pct(props: { label: string; value: number; onChange(v: number): void }) {
  return (
    <Num
      label={props.label}
      value={Math.round(props.value * 100)}
      onChange={(v) => props.onChange(v / 100)}
    />
  );
}

function Select<T extends string>(props: {
  label: string;
  value: T;
  options: [T, string][];
  onChange(v: T): void;
}) {
  return (
    <label className="pb-field">
      <span>{props.label}</span>
      <select value={props.value} onChange={(e) => props.onChange(e.target.value as T)}>
        {props.options.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Editable quoting rates. Every number here is yours to change. */
export default function PriceBookModal(props: {
  book: PriceBook;
  onChange(book: PriceBook): void;
  onClose(): void;
}) {
  const b = props.book;
  const set = (patch: Partial<PriceBook>) => props.onChange({ ...b, ...patch });
  const setProd = (patch: Partial<PriceBook['production']>) =>
    set({ production: { ...b.production, ...patch } });
  const setCov = (patch: Partial<PriceBook['coverage']>) =>
    set({ coverage: { ...b.coverage, ...patch } });
  const setPaint = (patch: Partial<PriceBook['paintPrice']>) =>
    set({ paintPrice: { ...b.paintPrice, ...patch } });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [props]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="modal pricebook-modal">
        <div className="modal-title">Price Book <span className="pb-sub">your rates, saved on this computer</span></div>

        <div className="pb-grid">
          <div className="pb-group">
            <div className="pb-group-title">Labour</div>
            <Num label="Loaded labour rate ($/hr)" value={b.labourRate} onChange={(v) => set({ labourRate: v })} />
            <Select
              label="How you paint walls"
              value={b.wallMethod}
              options={[
                ['cutRoll', 'Cut & roll'],
                ['rollOnly', 'Roll only'],
                ['spray', 'Spray'],
                ['textured', 'Textured'],
              ]}
              onChange={(v) => set({ wallMethod: v })}
            />
            <Num label="Cut & roll (SF/hr)" value={b.production.cutRoll} onChange={(v) => setProd({ cutRoll: v })} />
            <Num label="Roll only (SF/hr)" value={b.production.rollOnly} onChange={(v) => setProd({ rollOnly: v })} />
            <Num label="Spray (SF/hr)" value={b.production.spray} onChange={(v) => setProd({ spray: v })} />
            <Num label="Textured (SF/hr)" value={b.production.textured} onChange={(v) => setProd({ textured: v })} />
            <Pct label="Second coat time (%)" value={b.secondCoatFactor} onChange={(v) => set({ secondCoatFactor: v })} />
            <Pct label="Prep share of hours (%)" value={b.prepShare} onChange={(v) => set({ prepShare: v })} />
          </div>

          <div className="pb-group">
            <div className="pb-group-title">Paint</div>
            <Num label="Coats" value={b.coats} step={1} onChange={(v) => set({ coats: Math.max(1, Math.round(v)) })} />
            <Select
              label="Coverage"
              value={b.coverageChoice}
              options={[
                ['smooth', 'Smooth drywall'],
                ['textured', 'Textured'],
                ['primer', 'Primer / new drywall'],
              ]}
              onChange={(v) => set({ coverageChoice: v })}
            />
            <Num label="Smooth (SF/gal)" value={b.coverage.smooth} onChange={(v) => setCov({ smooth: v })} />
            <Num label="Textured (SF/gal)" value={b.coverage.textured} onChange={(v) => setCov({ textured: v })} />
            <Num label="Primer (SF/gal)" value={b.coverage.primer} onChange={(v) => setCov({ primer: v })} />
            <Select
              label="Paint grade"
              value={b.paintGrade}
              options={[
                ['contractor', 'Contractor'],
                ['mid', 'Mid'],
                ['premium', 'Premium'],
              ]}
              onChange={(v) => set({ paintGrade: v })}
            />
            <Num label="Contractor ($/gal)" value={b.paintPrice.contractor} onChange={(v) => setPaint({ contractor: v })} />
            <Num label="Mid ($/gal)" value={b.paintPrice.mid} onChange={(v) => setPaint({ mid: v })} />
            <Num label="Premium ($/gal)" value={b.paintPrice.premium} onChange={(v) => setPaint({ premium: v })} />
            <Pct label="Waste, rolled (%)" value={b.wasteRolled} onChange={(v) => set({ wasteRolled: v })} />
            <Pct label="Waste, sprayed (%)" value={b.wasteSprayed} onChange={(v) => set({ wasteSprayed: v })} />
          </div>

          <div className="pb-group">
            <div className="pb-group-title">Extras & margin</div>
            <Num label="Trim rate ($/LF)" value={b.trimRate} onChange={(v) => set({ trimRate: v })} />
            <Pct label="Margin on cost (%)" value={b.margin} onChange={(v) => set({ margin: v })} />
            <label className="pb-check">
              <input
                type="checkbox"
                checked={b.heavyPrep}
                onChange={(e) => set({ heavyPrep: e.target.checked })}
              />
              <span>Heavy prep adder ($/SF)</span>
            </label>
            <Num label="Heavy prep ($/SF)" value={b.heavyPrepAdder} onChange={(v) => set({ heavyPrepAdder: v })} />
            <label className="pb-check">
              <input
                type="checkbox"
                checked={b.highCeiling}
                onChange={(e) => set({ highCeiling: e.target.checked })}
              />
              <span>High ceiling / lift adder</span>
            </label>
            <Pct label="High ceiling labour add (%)" value={b.highCeilingAdder} onChange={(v) => set({ highCeilingAdder: v })} />
          </div>
        </div>

        <div className="modal-actions">
          <button className="tool" onClick={() => props.onChange(structuredClone(ONTARIO_DEFAULTS))}>
            Reset to Ontario defaults
          </button>
          <button className="tool go-button" onClick={props.onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
