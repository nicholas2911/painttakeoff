import { useState } from 'react';
import type { InvoiceDraft, InvoiceLine } from '../invoice/invoiceModel';
import { invoiceMath } from '../invoice/invoiceModel';
import { fmtMoney } from '../quote/quote';

function EditableText(props: {
  value: string;
  className?: string;
  onChange(v: string): void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(props.value);
  if (!editing) {
    return (
      <span
        className={`inv-edit ${props.className ?? ''}`}
        title="Click to edit"
        onClick={() => {
          setText(props.value);
          setEditing(true);
        }}
      >
        {props.value}
      </span>
    );
  }
  return (
    <input
      className={`inv-input ${props.className ?? ''}`}
      autoFocus
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        props.onChange(text);
        setEditing(false);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') setEditing(false);
      }}
    />
  );
}

function EditableMoney(props: { value: number; onChange(v: number): void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  if (!editing) {
    return (
      <span
        className="inv-edit inv-money"
        title="Click to edit"
        onClick={() => {
          setText(props.value.toFixed(2));
          setEditing(true);
        }}
      >
        {fmtMoney(props.value)}
      </span>
    );
  }
  return (
    <input
      className="inv-input inv-money-input"
      autoFocus
      value={text}
      inputMode="decimal"
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const x = parseFloat(text);
        if (Number.isFinite(x) && x >= 0) props.onChange(x);
        setEditing(false);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') setEditing(false);
      }}
    />
  );
}

/** The invoice maker — a preview that IS the editor. */
export default function InvoiceView(props: {
  draft: InvoiceDraft;
  onChange(d: InvoiceDraft): void;
  onSavePdf(): void;
  onClose(): void;
}) {
  const d = props.draft;
  const set = (patch: Partial<InvoiceDraft>) => props.onChange({ ...d, ...patch });
  const { subtotal, taxAmounts, total } = invoiceMath(d);

  const setLine = (i: number, patch: Partial<InvoiceLine>) =>
    set({ lines: d.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) });

  return (
    <div className="modal-backdrop invoice-backdrop">
      <div className="modal invoice-modal">
        <div className="invoice-doc">
          <div className="inv-header">
            <div className="inv-logo-slot">your logo</div>
            <div className="inv-from">
              <EditableText
                className="inv-company"
                value={d.fromCompany || 'Your company name'}
                onChange={(v) => set({ fromCompany: v })}
              />
              <EditableText
                className="inv-project"
                value={d.projectName}
                onChange={(v) => set({ projectName: v })}
              />
            </div>
            <div className="inv-meta">
              <div className="inv-title">INVOICE</div>
              <div className="inv-meta-row">
                <span>Invoice #</span>
                <EditableText value={d.invoiceNumber} onChange={(v) => set({ invoiceNumber: v })} />
              </div>
              <div className="inv-meta-row">
                <span>Date</span>
                <input
                  type="date"
                  className="inv-date"
                  value={d.date}
                  onChange={(e) => set({ date: e.target.value })}
                />
              </div>
              <div className="inv-meta-row">
                <span>Due</span>
                <input
                  type="date"
                  className="inv-date"
                  value={d.dueDate}
                  onChange={(e) => set({ dueDate: e.target.value })}
                />
              </div>
            </div>
          </div>

          <table className="inv-table">
            <thead>
              <tr>
                <th>Description</th>
                <th>Qty</th>
                <th className="inv-right">Amount</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {d.lines.map((l, i) => (
                <tr key={i}>
                  <td>
                    <EditableText value={l.description} onChange={(v) => setLine(i, { description: v })} />
                  </td>
                  <td>
                    <EditableText value={l.qty} onChange={(v) => setLine(i, { qty: v })} />
                  </td>
                  <td className="inv-right">
                    <EditableMoney value={l.amount} onChange={(v) => setLine(i, { amount: v })} />
                  </td>
                  <td>
                    <button
                      className="inv-row-del"
                      title="Remove this line"
                      onClick={() => set({ lines: d.lines.filter((_, j) => j !== i) })}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            className="unit-switch inv-add-line"
            onClick={() => set({ lines: [...d.lines, { description: 'New item', qty: '', amount: 0 }] })}
          >
            + Add a line
          </button>

          <div className="inv-totals">
            <div className="inv-total-row">
              <span>Subtotal{d.subtotalOverride !== null && <em className="inv-flag"> (edited)</em>}</span>
              <EditableMoney
                value={subtotal}
                onChange={(v) => set({ subtotalOverride: v })}
              />
            </div>
            {taxAmounts.map((t, i) => (
              <div className={`inv-total-row${d.taxRows[i].on ? '' : ' off'}`} key={i}>
                <span>
                  <label className="inv-tax-toggle" title={d.taxRows[i].on ? 'Turn this tax off' : 'Turn this tax on'}>
                    <input
                      type="checkbox"
                      checked={d.taxRows[i].on}
                      onChange={(e) =>
                        set({
                          taxRows: d.taxRows.map((r, j) => (j === i ? { ...r, on: e.target.checked } : r)),
                        })
                      }
                    />
                  </label>{' '}
                  <EditableText
                    value={t.label || 'Tax'}
                    onChange={(v) =>
                      set({ taxRows: d.taxRows.map((r, j) => (j === i ? { ...r, label: v } : r)) })
                    }
                  />{' '}
                  <EditableText
                    value={`${+(t.rate * 100).toFixed(2)}%`}
                    onChange={(v) => {
                      const x = parseFloat(v);
                      if (Number.isFinite(x) && x >= 0 && x <= 100)
                        set({ taxRows: d.taxRows.map((r, j) => (j === i ? { ...r, rate: x / 100 } : r)) });
                    }}
                  />{' '}
                  <button
                    className="inv-row-del"
                    title="Remove this tax"
                    onClick={() => set({ taxRows: d.taxRows.filter((_, j) => j !== i) })}
                  >
                    ✕
                  </button>
                </span>
                <span>{fmtMoney(t.amount)}</span>
              </div>
            ))}
            <button
              className="unit-switch inv-add-tax"
              onClick={() => set({ taxRows: [...d.taxRows, { label: 'Tax', rate: 0, on: true }] })}
            >
              + Add a tax
            </button>
            <div className="inv-total-row grand">
              <span>Total{d.totalOverride !== null && <em className="inv-flag"> (edited)</em>}</span>
              <EditableMoney
                value={total}
                onChange={(v) => set({ totalOverride: v })}
              />
            </div>
            {(d.subtotalOverride !== null || d.totalOverride !== null) && (
              <button
                className="unit-switch"
                onClick={() => set({ subtotalOverride: null, totalOverride: null })}
              >
                Back to automatic totals
              </button>
            )}
          </div>

          <div className="inv-notes">
            <EditableText
              value={d.notes}
              onChange={(v) => set({ notes: v })}
            />
          </div>
        </div>

        <div className="modal-actions invoice-actions">
          <button className="tool" onClick={props.onClose}>Close</button>
          <button className="tool go-button" onClick={props.onSavePdf}>Save as PDF</button>
        </div>
      </div>
    </div>
  );
}
