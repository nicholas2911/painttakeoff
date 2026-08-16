import { getDocument } from '../app/node_modules/pdfjs-dist/legacy/build/pdf.mjs';
const PDF = 'C:/Users/Nicholas/Desktop/coding/paint-takeoff/friend-examples/2 Drawings - Architectural.pdf';
const doc = await getDocument({ url: PDF, useSystemFonts: true }).promise;
const page = await doc.getPage(5);
const vp = page.getViewport({ scale: 1 });
const tc = await page.getTextContent();
const items = tc.items.map((i) => {
  const [x, y] = vp.convertToViewportPoint(i.transform[4], i.transform[5]);
  return { s: i.str.trim(), x: Math.round(x), y: Math.round(y) };
}).filter((i) => i.s);
// room labels of interest
for (const i of items) {
  if (/HOBBY|COMMUNITY|OFFICE|CORRIDOR|PARTY|STORAGE|KITCHEN/i.test(i.s))
    console.log(`LABEL "${i.s}" @ (${i.x}, ${i.y})`);
}
console.log('--- dimension strings (3-5 digit) with positions ---');
for (const i of items) {
  if (/^\d{3,5}$/.test(i.s)) console.log(`${i.s} @ (${i.x}, ${i.y})`);
}
await doc.destroy();
