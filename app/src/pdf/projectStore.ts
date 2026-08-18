/**
 * Project persistence:
 *  - meta in localStorage (pt:v1:projects): id, name, company, notes,
 *    fingerprint, selected page indices, page count, thumbnail, dates.
 *  - the PDF bytes in IndexedDB (reopens even if the user moves the file).
 * Per-page scales/measurements stay keyed by pdf fingerprint + ORIGINAL
 * page index — untouched by this layer.
 */

export interface ProjectMeta {
  id: string;
  name: string;
  company: string;
  notes: string;
  fingerprint: string;
  /** Original page indices (0-based) selected into the project, in order. */
  pages: number[];
  numPages: number;
  thumbDataUrl?: string;
  createdAt: number;
  modifiedAt: number;
}

const META_KEY = 'pt:v1:projects';
const DB_NAME = 'painttakeoff';
const STORE = 'pdfs';

export function loadProjects(): ProjectMeta[] {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ProjectMeta[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveProjects(projects: ProjectMeta[]): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(projects));
  } catch {
    /* non-fatal */
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function savePdfBytes(id: string, data: ArrayBuffer): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(data, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadPdfBytes(id: string): Promise<ArrayBuffer | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(id);
    req.onsuccess = () => resolve((req.result as ArrayBuffer | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function deletePdfBytes(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Remove a project's per-page data too (scales, measurements, settings). */
export function deleteProjectData(fingerprint: string): void {
  const prefixes = [`pt:v1:scale:${fingerprint}:`, `pt:v1:measure:${fingerprint}:`, `pt:v1:pagesettings:${fingerprint}:`];
  const doomed: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && prefixes.some((p) => key.startsWith(p))) doomed.push(key);
    }
    doomed.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* non-fatal */
  }
}

export function deleteProject(id: string): void {
  const project = loadProjects().find((p) => p.id === id);
  saveProjects(loadProjects().filter((p) => p.id !== id));
  void deletePdfBytes(id);
  if (project) deleteProjectData(project.fingerprint);
}
