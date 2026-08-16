import { useEffect } from 'react';
import type { Quote } from '../quote/quote';
import { fmtMoney } from '../quote/quote';

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
  onExport(): void;
  onClose(): void;
}) {
  const q = props.quote;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [props]);

  const cat = (name: string, unit: string, c: Quote['walls']) =>
    c.qty > 0 ? (
      <div className="quote-cat">
        <div className="quote-cat-title">{name}</div>
        <Row label={`Amount`} value={`${c.qty.toLocaleString('en-CA', { maximumFractionDigits: 0 })} ${unit}`} />
        <Row label="Labour" value={`${c.hours.toFixed(1)} hr · ${fmtMoney(c.labourCost)}`} />
        {c.gallons > 0 && <Row label="Paint" value={`${c.gallons.toFixed(1)} gal · ${fmtMoney(c.materialCost)}`} />}
        <Row label="Cost → price" value={`${fmtMoney(c.cost)} → ${fmtMoney(c.price)}`} strong />
      </div>
    ) : null;

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="modal quote-modal">
        <div className="modal-title">Your quote</div>

        <div className="quote-cats">
          {cat('Walls', 'SF', q.walls)}
          {cat('Ceilings', 'SF', q.ceilings)}
          {cat('Trim', 'LF', q.trim)}
          {q.heavyPrepCost > 0 && (
            <div className="quote-cat">
              <div className="quote-cat-title">Heavy prep</div>
              <Row label="Adder" value={fmtMoney(q.heavyPrepCost)} strong />
            </div>
          )}
          {q.walls.qty === 0 && q.ceilings.qty === 0 && q.trim.qty === 0 && (
            <p className="modal-text">Nothing measured yet — measure some walls first.</p>
          )}
        </div>

        <div className="quote-total">
          <Row label="Paint to buy" value={`${q.totalGallons.toFixed(1)} gallons`} />
          <Row label="Labour" value={`${q.totalHours.toFixed(1)} hours · ${fmtMoney(q.totalLabourCost)}`} />
          <Row label="Materials" value={fmtMoney(q.totalMaterialCost)} />
          <Row label="Total cost" value={fmtMoney(q.totalCost)} />
          <div className="quote-price">
            <span>QUOTE PRICE</span>
            <strong>{fmtMoney(q.totalPrice)}</strong>
          </div>
        </div>

        <div className="quote-cross">
          <div className="quote-cross-title">Sanity check</div>
          {q.cross.pricePerWallSF !== null && (
            <Row label="Per sq ft of wall" value={fmtMoney(q.cross.pricePerWallSF)} />
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

        <div className="modal-actions">
          <button className="tool" onClick={props.onClose}>
            Close
          </button>
          <button className="tool go-button" onClick={props.onExport}>
            Export to Excel
          </button>
        </div>
      </div>
    </div>
  );
}
