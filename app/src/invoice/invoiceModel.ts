/**
 * Invoice data: built from a project's quote, fully editable, persisted
 * minimally (a counter + the last draft per project).
 */

export interface InvoiceLine {
  description: string;
  qty: string; // display string, e.g. "241 SF" / "20 LF"
  amount: number; // CAD
}

export interface TaxRow {
  label: string; // free text, e.g. "HST" / "GST" / "PST"
  rate: number; // fraction, e.g. 0.13
  on: boolean;
}

export interface InvoiceDraft {
  invoiceNumber: string;
  date: string; // ISO
  dueDate: string; // ISO
  fromCompany: string;
  projectName: string;
  lines: InvoiceLine[];
  /** Configurable tax rows — nothing is hardcoded. Ships with one HST 13% row. */
  taxRows: TaxRow[];
  notes: string;
  /** Explicit user overrides (flagged in the UI). */
  subtotalOverride: number | null;
  totalOverride: number | null;
}

const COUNTER_KEY = 'pt:v1:invoice-counter';
const DRAFT_PREFIX = 'pt:v1:invoices:';

/** Commit a previewed number (from peekInvoiceNumber) so the NEXT preview
 *  moves past it. Idempotent — re-saving the same invoice (same number)
 *  is a no-op instead of burning another number on every re-save; only
 *  advances the counter the first time a given number is actually used. */
export function commitInvoiceNumber(invoiceNumber: string): void {
  // Only our own INV-#### numbers move the counter — a hand-typed
  // "2026-001" must not parse as 2026 and jump the next one to INV-2027.
  const m = /^INV-(\d+)$/.exec(invoiceNumber.trim());
  if (!m) return;
  const n = parseInt(m[1], 10);
  if (!Number.isFinite(n)) return;
  try {
    const current = parseInt(localStorage.getItem(COUNTER_KEY) ?? '0', 10) || 0;
    if (n > current) localStorage.setItem(COUNTER_KEY, String(n));
  } catch {
    /* non-fatal */
  }
}

export function peekInvoiceNumber(): string {
  try {
    const n = parseInt(localStorage.getItem(COUNTER_KEY) ?? '0', 10) || 0;
    return `INV-${String(n + 1).padStart(4, '0')}`;
  } catch {
    return 'INV-0001';
  }
}

export function loadInvoiceDraft(projectId: string): InvoiceDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_PREFIX + projectId);
    if (!raw) return null;
    const d = JSON.parse(raw) as InvoiceDraft & { hstOn?: boolean; hstRate?: number };
    // Tolerate drafts saved before tax rows existed (single HST checkbox).
    if (!Array.isArray(d.taxRows)) {
      d.taxRows = d.hstOn === false ? [] : [{ label: 'HST', rate: d.hstRate ?? 0.13, on: true }];
    }
    return d;
  } catch {
    return null;
  }
}

export function saveInvoiceDraft(projectId: string, draft: InvoiceDraft): void {
  try {
    localStorage.setItem(DRAFT_PREFIX + projectId, JSON.stringify(draft));
  } catch {
    /* non-fatal */
  }
}

export function invoiceMath(d: InvoiceDraft): {
  subtotal: number;
  taxAmounts: { label: string; rate: number; amount: number }[];
  tax: number;
  total: number;
} {
  const subtotal = d.subtotalOverride ?? d.lines.reduce((s, l) => s + l.amount, 0);
  // Each tax is rounded to the cent as printed, so the printed lines
  // always add up to the printed total.
  const cents = (x: number) => Math.round(x * 100) / 100;
  const taxAmounts = d.taxRows.map((r) => ({
    label: r.label,
    rate: r.rate,
    amount: r.on ? cents(subtotal * r.rate) : 0,
  }));
  const tax = taxAmounts.reduce((s, t) => s + t.amount, 0);
  const total = d.totalOverride ?? cents(subtotal + tax);
  return { subtotal, taxAmounts, tax, total };
}
