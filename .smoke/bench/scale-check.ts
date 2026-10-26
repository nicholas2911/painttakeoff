/* Does the app's scale-note suggestion (app/src/pdf/scaleNotes.ts) match each
 * page's TRUE scale? True scale = the written ratio corrected by the page's
 * room evidence from the v0.8.3 benchmark run (median linear factor k over
 * 3+ rooms, snapped to a standard scale). Run: node bench/scale-check.mjs */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readScaleNote } from '../../app/src/pdf/scaleNotes';

const CORPUS = path.resolve(process.cwd(), '../sample-plans/corpus');
// Loaded at runtime (not bundled) so pdf.js finds its own worker file.
const legacy = pathToFileURL(path.resolve(process.cwd(), '../app/node_modules/pdfjs-dist/legacy/build/pdf.mjs')).href;
const { getDocument } = await import(/* @vite-ignore */ legacy);
const results = JSON.parse(fs.readFileSync(path.join(CORPUS, 'bench-results-v083.json'), 'utf8'));
const STANDARD = [16, 20, 24, 25, 32, 40, 48, 50, 64, 75, 96, 100, 125, 128, 150, 192, 200, 250, 384, 500, 1000];
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[(xs.length / 2) | 0];

const pages = new Map<string, { file: string; page: number; ratio: number; ks: number[] }>();
for (const r of results) {
  if (!r.ok || String(r.scaleSource).startsWith('snapped')) continue;
  const key = `${r.file}|${r.page}`;
  if (!pages.has(key)) pages.set(key, { file: r.file, page: r.page, ratio: r.ratio, ks: [] });
  pages.get(key)!.ks.push(Math.sqrt(r.floorAreaM2 / r.truthM2));
}

let right = 0, wrong = 0, none = 0, unsure = 0;
const docs = new Map<string, any>();
for (const p of pages.values()) {
  if (p.ks.length < 3) continue;
  const k = median(p.ks);
  if (k < 0.3 || k > 3.5) { unsure++; continue; }
  const want = p.ratio / k;
  const truth = STANDARD.reduce((b, s) => (Math.abs(s - want) < Math.abs(b - want) ? s : b));
  if (Math.abs(truth - want) / want > 0.15) { unsure++; continue; }
  if (!docs.has(p.file)) docs.set(p.file, await getDocument({ data: new Uint8Array(fs.readFileSync(path.join(CORPUS, p.file))), verbosity: 0, isEvalSupported: false }).promise);
  const note = await readScaleNote(await docs.get(p.file).getPage(p.page));
  // within 6% = the same scale (1/4\" = 1'-0\" is 1:48; the room estimate snaps to 1:50)
  const verdict = !note ? 'no suggestion' : Math.abs(note.ratio - truth) / truth <= 0.06 ? 'RIGHT' : 'WRONG';
  if (verdict === 'RIGHT') right++;
  else if (verdict === 'WRONG') wrong++;
  else none++;
  console.log(`${verdict.padEnd(13)} ${p.file} p${p.page}: true ≈ 1:${truth} · suggests ${note ? `1:${note.ratio} (“${note.note}”${note.paper ? `, corrected from ${note.paper.noted} to ${note.paper.actual}` : ''})` : '—'}`);
}
console.log(`\nright ${right} · wrong ${wrong} · no suggestion ${none} · true scale unclear ${unsure}`);
