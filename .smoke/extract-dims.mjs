/* Extracts dimension-like strings per page from the friend's plan set,
 * to find the 1:75 floor-plan page and a concrete printed dimension.
 * Run: node extract-dims.mjs
 */
import { getDocument } from '../app/node_modules/pdfjs-dist/legacy/build/pdf.mjs';

const PDF =
  'C:/Users/Nicholas/Desktop/coding/paint-takeoff/friend-examples/2 Drawings - Architectural.pdf';

const doc = await getDocument({ url: PDF, useSystemFonts: true }).promise;
console.log('pages:', doc.numPages);

for (let p = 1; p <= doc.numPages; p++) {
  const page = await doc.getPage(p);
  const vp = page.getViewport({ scale: 1 });
  const tc = await page.getTextContent();
  const strings = tc.items.map((i) => i.str.trim()).filter(Boolean);
  const dims = strings.filter((s) => /^\d{3,5}(\[.*\])?$/.test(s));
  const scales = strings.filter((s) => /1\s*:\s*\d+/.test(s));
  const titles = strings.filter((s) => /FLOOR|ELEV|DETAIL|PLAN|SECTION|A-\d/i.test(s)).slice(0, 8);
  console.log(`\n--- page ${p} (${Math.round(vp.width)}x${Math.round(vp.height)} pt) ---`);
  console.log('scales:', scales.slice(0, 6).join(' | ') || 'none');
  console.log('titles:', titles.join(' | ') || 'none');
  console.log(`dims (${dims.length}):`, dims.slice(0, 25).join(' '));
}
await doc.destroy();
