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

export function nextInvoiceNumber(): string {
  let n = 0;
  try {
    n = parseInt(localStorage.getItem(COUNTER_KEY) ?? '0', 10) || 0;
    localStorage.setItem(COUNTER_KEY, String(n + 1));
  } catch {
    /* non-fatal */
  }
  return `INV-${String(n + 1).padStart(4, '0')}`;
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
  const taxAmounts = d.taxRows.map((r) => ({
    label: r.label,
    rate: r.rate,
    amount: r.on ? subtotal * r.rate : 0,
  }));
  const tax = taxAmounts.reduce((s, t) => s + t.amount, 0);
  const total = d.totalOverride ?? subtotal + tax;
  return { subtotal, taxAmounts, tax, total };
}
