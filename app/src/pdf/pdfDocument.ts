import * as pdfjs from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export interface LoadedPlan {
  doc: PDFDocumentProxy;
  /** Stable id used to key persisted per-page state (scale calibration). */
  fingerprint: string;
  name: string;
  numPages: number;
}

export async function loadPlan(name: string, data: ArrayBuffer): Promise<LoadedPlan> {
  const task = pdfjs.getDocument({ data });
  const doc = await task.promise;
  const fingerprints = (doc as { fingerprints?: string[] | null }).fingerprints;
  const fingerprint =
    fingerprints && fingerprints.length > 0
      ? fingerprints[0]
      : `${name}:${data.byteLength}`;
  return { doc, fingerprint, name, numPages: doc.numPages };
}

export async function loadPlanFile(file: File): Promise<LoadedPlan> {
  return loadPlan(file.name, await file.arrayBuffer());
}

export async function destroyPlan(plan: LoadedPlan): Promise<void> {
  await plan.doc.destroy();
}
