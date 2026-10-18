import { useEffect, useState } from 'react';
import type { AddOnPriced, AddOnSource, ManualAddOn, Quote, QuoteGroup, QuoteGrouping } from '../quote/quote';
import { ADD_ON_SOURCES, explainAddOns, explainQuote, fmtMoney } from '../quote/quote';
import type { PriceBook } from '../quote/priceBook';

function Row(props: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`quote-row ${props.strong ? 'strong' : ''}`}>
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

/** The quote: what all that measuring adds up to. */
export default function QuoteView(props: {
  quote: Quote;
  grouping: QuoteGrouping;
  groups: QuoteGroup[];
  onGroupingChange(g: QuoteGrouping): void;
  onExport(): void;
  onCreateInvoice(): void;
  onClose(): void;
  /** Effective price book for this quote (Price Book defaults + any
   *  per-quote overrides already merged in). */
  priceBook: PriceBook;
  /** Which fields are overridden for this quote only — non-empty enables
   *  the "reset" action. */
  overrides: Partial<PriceBook>;
  onOverrideChange(patch: Partial<PriceBook>): void;
  onResetOverrides(): void;
  addOns: AddOnPriced[];
  onAddAddOn(a: Omit<ManualAddOn, 'id'>): void;
  onUpdateAddOn(id: string, patch: Partial<ManualAddOn>): void;
  onRemoveAddOn(id: string): void;
}) {
  const q = props.quote;
  const pb = props.priceBook;
  const [showWhy, setShowWhy] = useState(false);
  const [newAddOn, setNewAddOn] = useState<{ source: AddOnSource; label: string; qty: string }>({
    source: 'trim',
    label: '',
    qty: '',
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [props]);

  const addOnsCost = props.addOns.reduce((s, a) => s + a.cost, 0);
  const addOnsPrice = props.addOns.reduce((s, a) => s + a.price, 0);
  const grandTotalPrice = q.totalPrice + addOnsPrice;

  const submitAddOn = () => {
    const qty = parseFloat(newAddOn.qty);
    if (!Number.isFinite(qty) || qty === 0) return;
    const sourceLabel = ADD_ON_SOURCES.find(([s]) => s === newAddOn.source)?.[1] ?? newAddOn.source;
    props.onAddAddOn({ source: newAddOn.source, qty, label: newAddOn.label.trim() || sourceLabel });
    setNewAddOn({ source: newAddOn.source, label: '', qty: '' });
  };

  const unitOf = (a: AddOnPriced) => ADD_ON_SOURCES.find(([s]) => s === a.source)?.[2] ?? '';
  const addOnQty = (a: AddOnPriced) => (a.source === 'flat' ? 'flat' : `${a.qty.toLocaleString('en-CA')} ${unitOf(a)}`);

  /** One ledger line: a measured category (skipped when nothing measured). */
  const cat = (name: string, unit: string, c: Quote['walls']) =>
    c.qty > 0 ? (
      <tr className="quote-cat">
        <td>{name}</td>
        <td className="num">{`${c.qty.toLocaleString('en-CA', { maximumFractionDigits: 0 })} ${unit}`}</td>
        <td className="num">{c.hours > 0 ? `${c.hours.toFixed(1)} hr` : '—'}</td>
        <td className="num">{c.gallons > 0 ? `${c.gallons.toFixed(1)} gal` : '—'}</td>
        <td className="num dim">{fmtMoney(c.cost)}</td>
        <td className="num price">{fmtMoney(c.price)}</td>
        <td />
      </tr>
    ) : null;

  const nothingMeasured = q.walls.qty === 0 && q.ceilings.qty === 0 && q.trim.qty === 0;

  /** One group block in per-room / per-page mode. */
  const groupBlock = (g: QuoteGroup) => (
    <div className="quote-group" key={g.id}>
      <div className="quote-group-title">
        {g.title}
        {g.detail && <span className="quote-group-detail">{g.detail}</span>}
      </div>
      {g.walls.qty !== 0 && (
        <Row
          label="Walls (net)"
          value={`${Math.round(g.walls.qty).toLocaleString('en-CA')} SF · ${g.walls.gallons.toFixed(1)} gal · ${g.walls.hours.toFixed(1)} hr`}
        />
      )}
      {g.ceilings.qty !== 0 && (
        <Row
          label="Ceilings"
          value={`${Math.round(g.ceilings.qty).toLocaleString('en-CA')} SF · ${g.ceilings.gallons.toFixed(1)} gal · ${g.ceilings.hours.toFixed(1)} hr`}
        />
      )}
      {g.trim.qty !== 0 && (
        <Row label="Trim" value={`${Math.round(g.trim.qty).toLocaleString('en-CA')} LF`} />
      )}
      {g.heavyPrepCost !== 0 && <Row label="Heavy prep" value={fmtMoney(g.heavyPrepCost)} />}
      <Row label="Cost" value={fmtMoney(g.totalCost)} />
      <Row label="Group subtotal" value={fmtMoney(g.totalPrice)} strong />
    </div>
  );

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="modal quote-modal">
        <div className="quote-head">
          <div className="modal-title quote-title">Your quote</div>

        <div className="quote-grouping" role="tablist" aria-label="Quote breakdown">
          {(
            [
              ['project', 'Whole project'],
              ['room', 'Per room'],
              ['page', 'Per page'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              role="tab"
              aria-selected={props.grouping === value}
              className={props.grouping === value ? 'active' : ''}
              onClick={() => props.onGroupingChange(value)}
            >
              {label}
            </button>
          ))}
        </div>
        </div>

        <div className="quote-options">
          <div className="quote-options-row">
            <span className="quote-options-title" title="Just this quote — your Price Book defaults stay as-is">
              This quote
            </span>
            <label className="quote-opt-field">
              <span>Paint</span>
              <select
                value={pb.paintGrade}
                onChange={(e) => props.onOverrideChange({ paintGrade: e.target.value as PriceBook['paintGrade'] })}
              >
                <option value="contractor">Contractor (${pb.paintPrice.contractor}/gal)</option>
                <option value="mid">Mid (${pb.paintPrice.mid}/gal)</option>
                <option value="premium">Premium (${pb.paintPrice.premium}/gal)</option>
              </select>
            </label>
            <label className="quote-opt-check">
              <input
                type="checkbox"
                checked={pb.heavyPrep}
                onChange={(e) => props.onOverrideChange({ heavyPrep: e.target.checked })}
              />
              <span>Heavy prep (${pb.heavyPrepAdder}/SF)</span>
            </label>
            <label className="quote-opt-check">
              <input
                type="checkbox"
                checked={pb.highCeiling}
                onChange={(e) => props.onOverrideChange({ highCeiling: e.target.checked })}
              />
              <span>Ladders/lift for high ceilings (+{(pb.highCeilingAdder * 100).toFixed(0)}% labour)</span>
            </label>
            {Object.keys(props.overrides).length > 0 && (
              <button className="quote-options-reset" onClick={props.onResetOverrides}>
                Reset to defaults
              </button>
            )}
          </div>
        </div>

        {props.grouping === 'project' ? (
          <table className="quote-ledger">
            <thead>
              <tr>
                <th>Item</th>
                <th className="num">Qty</th>
                <th className="num">Labour</th>
                <th className="num">Paint</th>
                <th className="num">Cost</th>
                <th className="num">Price</th>
                <th aria-label="Remove" />
              </tr>
            </thead>
            <tbody>
              {cat(pb.wallPricingMode === 'simple' ? 'Walls (simple $/SF)' : 'Walls', 'SF', q.walls)}
              {cat('Ceilings', 'SF', q.ceilings)}
              {cat('Trim', 'LF', q.trim)}
              {q.heavyPrepCost > 0 && (
                <tr className="quote-cat">
                  <td>Heavy prep</td>
                  <td className="num">{`${Math.round(q.walls.qty).toLocaleString('en-CA')} SF`}</td>
                  <td className="num">—</td>
                  <td className="num">—</td>
                  <td className="num dim">{fmtMoney(q.heavyPrepCost)}</td>
                  <td className="num price">{fmtMoney(q.heavyPrepCost * (1 + pb.margin))}</td>
                  <td />
                </tr>
              )}
              {props.addOns.map((a) => (
                <tr className="quote-addon-row" key={a.id}>
                  <td>
                    <span className="quote-addon-label">{a.label}</span>
                    <span className="quote-addon-chip">add-on</span>
                  </td>
                  <td className="num quote-addon-qty">{addOnQty(a)}</td>
                  <td className="num">—</td>
                  <td className="num">—</td>
                  <td className="num dim">{fmtMoney(a.cost)}</td>
                  <td className="num price quote-addon-price">{fmtMoney(a.price)}</td>
                  <td>
                    <button className="quote-addon-remove" onClick={() => props.onRemoveAddOn(a.id)} title="Remove">
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
              {nothingMeasured && props.addOns.length === 0 && (
                <tr>
                  <td colSpan={7} className="quote-ledger-empty">
                    Nothing measured yet — measure some walls first.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        ) : (
          <div className="quote-groups">
            {props.groups.length === 0 && (
              <p className="modal-text">Nothing measured yet — measure some walls first.</p>
            )}
            {props.groups.map(groupBlock)}
          </div>
        )}

        <div className="quote-addons">
          <div className="quote-addons-title">
            {props.grouping === 'project' ? 'Add a line from the Price Book' : 'Add-ons (from the Price Book)'}
          </div>
          {props.grouping !== 'project' && props.addOns.length > 0 && (
            <div className="quote-addons-list">
              {props.addOns.map((a) => (
                <div className="quote-addon-row" key={a.id}>
                  <span className="quote-addon-label">{a.label}</span>
                  <span className="quote-addon-qty">{addOnQty(a)}</span>
                  <span className="quote-addon-price">{fmtMoney(a.price)}</span>
                  <button className="quote-addon-remove" onClick={() => props.onRemoveAddOn(a.id)} title="Remove">
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="quote-addon-new">
            <select
              value={newAddOn.source}
              onChange={(e) => setNewAddOn({ ...newAddOn, source: e.target.value as AddOnSource })}
            >
              {ADD_ON_SOURCES.map(([s, label]) => (
                <option key={s} value={s}>
                  {label}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Label (optional)"
              value={newAddOn.label}
              onChange={(e) => setNewAddOn({ ...newAddOn, label: e.target.value })}
            />
            <input
              type="number"
              placeholder={ADD_ON_SOURCES.find(([s]) => s === newAddOn.source)?.[2]}
              value={newAddOn.qty}
              onChange={(e) => setNewAddOn({ ...newAddOn, qty: e.target.value })}
            />
            <button className="tool" onClick={submitAddOn}>
              Add
            </button>
          </div>
        </div>

        <div className="quote-total">
          <div className="quote-price">
            <span>
              Quote price
              <em>
                {q.totalHours.toFixed(1)} hours · {q.totalGallons.toFixed(1)} gallons
              </em>
            </span>
            <strong>{fmtMoney(grandTotalPrice)}</strong>
          </div>
          <div className="quote-costline">
            <span>Labour {fmtMoney(q.totalLabourCost)}</span>
            <span>Materials {fmtMoney(q.totalMaterialCost)}</span>
            {q.heavyPrepCost > 0 && <span>Heavy prep {fmtMoney(q.heavyPrepCost)}</span>}
            {props.addOns.length > 0 && <span>Add-ons {fmtMoney(addOnsCost)}</span>}
            <span>
              <strong>Total cost {fmtMoney(q.totalCost + addOnsCost)}</strong>
            </span>
          </div>
        </div>

        <div className="quote-cross">
          <div className="quote-cross-title">Sanity check</div>
          {q.cross.pricePerWallSF !== null && (
            <Row label="Per sq ft of wall" value={fmtMoney(q.cross.pricePerWallSF)} />
          )}
          {q.cross.pricePerWallSFPerCoat !== null && (
            <Row label="Per sq ft of wall, per coat" value={fmtMoney(q.cross.pricePerWallSFPerCoat)} />
          )}
          {q.cross.pricePerFloorSF !== null && (
            <Row
              label="Per sq ft of floor"
              value={`${fmtMoney(q.cross.pricePerFloorSF)} (${q.cross.floorAssumption})`}
            />
          )}
          {q.cross.labourShare !== null && (
            <Row label="Labour share" value={`${(q.cross.labourShare * 100).toFixed(0)}% of price`} />
          )}
          {q.warnings.map((w, i) => (
            <div className="quote-warning" key={i}>
              ⚠ {w}
            </div>
          ))}
        </div>

        <div className="quote-why">
          <button className="quote-why-toggle" onClick={() => setShowWhy((s) => !s)}>
            {showWhy ? '▾' : '▸'} How we got this price
          </button>
          {showWhy && (
            <div className="quote-why-body">
              {explainQuote(q, pb).map((line, i) => (
                <p key={`q${i}`}>{line}</p>
              ))}
              {explainAddOns(props.addOns).map((line, i) => (
                <p key={`a${i}`}>{line}</p>
              ))}
              <p>
                <strong>
                  Total: {fmtMoney(q.totalCost + addOnsCost)} cost → {fmtMoney(grandTotalPrice)} price.
                </strong>
              </p>
            </div>
          )}
        </div>

        <div className="modal-actions">
          <button className="tool" onClick={props.onClose}>
            Close
          </button>
          <button className="tool" onClick={props.onExport}>
            Export to Excel
          </button>
          <button className="tool go-button" onClick={props.onCreateInvoice}>
            Create invoice
          </button>
        </div>
      </div>
    </div>
  );
}
