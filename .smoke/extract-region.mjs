import { getDocument } from '../app/node_modules/pdfjs-dist/legacy/build/pdf.mjs';
const PDF = 'C:/Users/Nicholas/Desktop/coding/paint-takeoff/friend-examples/2 Drawings - Architectural.pdf';
const doc = await getDocument({ url: PDF, useSystemFonts: true }).promise;
const page = await doc.getPage(5);
const vp = page.getViewport({ scale: 1 });
const tc = await page.getTextContent();
for (const i of tc.items) {
  const s = i.str.trim();
  if (!s) continue;
  const [x, y] = vp.convertToViewportPoint(i.transform[4], i.transform[5]);
  if (x >= 250 && x <= 1450 && y >= 200 && y <= 650 && /[A-Za-z]{3,}/.test(s) && !/^\d+$/.test(s))
    console.log(`"${s}" @ (${Math.round(x)}, ${Math.round(y)})`);
}
await doc.destroy();
