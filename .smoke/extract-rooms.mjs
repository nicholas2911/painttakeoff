/* Finds room labels + positions on the friend set's floor-plan page (5),
 * in app page-space coords (viewport at scale 1, top-left origin).
 * Run: node extract-rooms.mjs
 */
import { getDocument } from '../app/node_modules/pdfjs-dist/legacy/build/pdf.mjs';

const PDF =
  'C:/Users/Nicholas/Desktop/coding/paint-takeoff/friend-examples/2 Drawings - Architectural.pdf';

const doc = await getDocument({ url: PDF, useSystemFonts: true }).promise;
const page = await doc.getPage(5);
const vp = page.getViewport({ scale: 1 });
console.log('page size:', vp.width, 'x', vp.height);
const tc = await page.getTextContent();
for (const item of tc.items) {
  const s = item.str.trim();
  if (!s) continue;
  if (/OFFICE|HOBBY|ROOM|BED|BATH|LIVING|KITCHEN|MEETING|LOUNGE|STAFF|WASH|AREA/i.test(s)) {
    const [x, y] = vp.convertToViewportPoint(item.transform[4], item.transform[5]);
    console.log(`"${s}"  at q=(${x.toFixed(0)}, ${y.toFixed(0)})  w=${item.width.toFixed(0)}`);
  }
}
await doc.destroy();
