/* Stage 2 browser harness (bundled by run.mjs). Renders a page exactly like
 * the app's Viewer.getPageRaster (1600 px max side, inherent rotation, white
 * background) and runs the app's own Quick Area engine at page-space points. */
import * as pdfjs from '../../app/node_modules/pdfjs-dist/build/pdf.mjs';
import { fillRoomAt, roomNumbers } from '../../app/src/measure/quickArea';
import { fillRoomAt as fillRoomAtV083 } from './quickArea-v083';
import { fillRoomAt as fillRoomAtSeal } from './quickArea-seal';

pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.mjs';
const RASTER_MAX = 1600; // = Viewer.getPageRaster default

let doc: any = null;
let docUrl = '';
const raster = new Map<number, { canvas: HTMLCanvasElement; img: ImageData; scale: number }>();

async function open(url: string) {
  if (docUrl === url) return;
  if (doc) await doc.destroy();
  raster.clear();
  doc = await pdfjs.getDocument({ url, isEvalSupported: false }).promise;
  docUrl = url;
}

async function pageRaster(n: number) {
  const hit = raster.get(n);
  if (hit) return hit;
  const page = await doc.getPage(n);
  const vp1 = page.getViewport({ scale: 1 });
  const scale = Math.min(RASTER_MAX / vp1.width, RASTER_MAX / vp1.height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(vp1.width * scale));
  canvas.height = Math.max(1, Math.round(vp1.height * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  await page.render({ canvasContext: ctx, viewport: page.getViewport({ scale }), background: '#ffffff' }).promise;
  const r = { canvas, img: ctx.getImageData(0, 0, canvas.width, canvas.height), scale };
  raster.clear(); // one page at a time keeps memory flat on huge sets
  raster.set(n, r);
  return r;
}

/** Try each page-space point in order; the first that lands inside a closed
 *  shape wins. Returns the fill's floor area (m²) and timing. */
async function measure(url: string, pageNum: number, points: { x: number; y: number }[], pointsPerMeter: number, withImage: boolean, engine: 'current' | 'v083' | 'seal' = 'current') {
  await open(url);
  const t0 = performance.now();
  const r = await pageRaster(pageNum);
  const tRender = performance.now() - t0;
  for (let i = 0; i < points.length; i++) {
    const bx = points[i].x * r.scale;
    const by = points[i].y * r.scale;
    if (bx < 0 || by < 0 || bx >= r.img.width || by >= r.img.height) continue;
    const t1 = performance.now();
    const room =
      engine === 'v083'
        ? fillRoomAtV083(r.img, bx, by, 1 / r.scale)
        : engine === 'seal'
          ? fillRoomAtSeal(r.img, bx, by, 1 / r.scale, pointsPerMeter)
          : fillRoomAt(r.img, bx, by, 1 / r.scale, pointsPerMeter);
    const tFill = performance.now() - t1;
    if (!room) continue;
    const nums = roomNumbers({
      base: room.area,
      composite: room.area.data,
      barrier: room.barrier,
      bigBarrier: room.bigBarrier,
      pointsPerMeter,
    });
    let png: string | null = null;
    if (withImage) png = overlay(r, room.area.data, bx, by);
    return { ok: true, pointIndex: i, floorAreaM2: nums.floorAreaM2, perimeterM: nums.perimeterM, sealPx: room.sealPx, tRender, tFill, png };
  }
  return { ok: false, tRender, png: withImage ? overlay(r, null, points[0].x * r.scale, points[0].y * r.scale) : null };
}

/** Crop around the click with the fill tinted blue — for eyeballing failures. */
function overlay(r: { canvas: HTMLCanvasElement; img: ImageData }, fill: Uint8Array | null, bx: number, by: number) {
  const w = r.img.width;
  const h = r.img.height;
  let x0 = bx, x1 = bx, y0 = by, y1 = by;
  if (fill) {
    for (let i = 0; i < fill.length; i++)
      if (fill[i]) {
        const x = i % w, y = (i / w) | 0;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
  }
  const pad = 80;
  x0 = Math.max(0, Math.min(x0, bx) - pad); y0 = Math.max(0, Math.min(y0, by) - pad);
  x1 = Math.min(w, Math.max(x1, bx) + pad); y1 = Math.min(h, Math.max(y1, by) + pad);
  const cw = Math.max(1, Math.round(x1 - x0)), ch = Math.max(1, Math.round(y1 - y0));
  const c = document.createElement('canvas');
  c.width = cw; c.height = ch;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(r.canvas, x0, y0, cw, ch, 0, 0, cw, ch);
  const im = ctx.getImageData(0, 0, cw, ch);
  if (fill)
    for (let y = 0; y < ch; y++)
      for (let x = 0; x < cw; x++) {
        if (!fill[(y + Math.round(y0)) * w + x + Math.round(x0)]) continue;
        const o = (y * cw + x) * 4;
        im.data[o] = im.data[o] * 0.5 + 40; im.data[o + 1] = im.data[o + 1] * 0.5 + 90; im.data[o + 2] = 255;
      }
  ctx.putImageData(im, 0, 0);
  ctx.fillStyle = '#e00';
  ctx.beginPath(); ctx.arc(bx - x0, by - y0, 5, 0, Math.PI * 2); ctx.fill();
  return c.toDataURL('image/png');
}

/** RGBA bytes of a page raster (base64), for offline CPU/identity tests. */
async function dumpRaster(url: string, pageNum: number) {
  await open(url);
  const r = await pageRaster(pageNum);
  const bytes = new Uint8Array(r.img.data.buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { w: r.img.width, h: r.img.height, scale: r.scale, b64: btoa(bin) };
}

(window as any).bench = { measure, dumpRaster };
(window as any).benchReady = true;
