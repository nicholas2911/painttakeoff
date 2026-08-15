import { _electron as electron } from 'playwright-core';
const EXE = 'C:/Users/Nicholas/Desktop/coding/paint-takeoff/app/release/win-unpacked/PaintTakeoff.exe';
const PDF = 'C:/Users/Nicholas/Desktop/coding/paint-takeoff/friend-examples/2 Drawings - Architectural.pdf';
const errors = [];
const app = await electron.launch({ executablePath: EXE });
const page = await app.firstWindow();
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(e.message));
await page.waitForSelector('.welcome-title', { timeout: 30000 });
await page.setInputFiles('input[type=file]', PDF);
await page.waitForFunction(() => document.querySelector('.pdf-canvas')?.width > 400, null, { timeout: 60000 });
await page.waitForTimeout(800); // let fit + re-render settle
const info = await page.evaluate(() => {
  const c = document.querySelector('.pdf-canvas').getBoundingClientRect();
  const v = document.querySelector('.viewer').getBoundingClientRect();
  const win = { w: window.innerWidth, h: window.innerHeight };
  return { canvas: { w: Math.round(c.width), h: Math.round(c.height) },
           viewer: { w: Math.round(v.width), h: Math.round(v.height) },
           win, zoom: document.querySelector('.zoom-pct').textContent,
           badge: document.querySelector('.scale-badge').textContent };
});
console.log(JSON.stringify(info, null, 1));
const rw = info.canvas.w / info.viewer.w, rh = info.canvas.h / info.viewer.h;
console.log(`sheet fills ${(rw*100).toFixed(0)}% w, ${(rh*100).toFixed(0)}% h; fit-page: ${Math.max(rw,rh) >= 0.7 && rw <= 1.02 && rh <= 1.02 ? 'PASS' : 'FAIL'}`);
console.log('errors:', errors.length ? errors : 'none');
await app.close();
process.exit(errors.length ? 1 : 0);
