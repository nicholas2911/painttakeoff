import { chromium } from 'playwright-core';

const EXE =
  'C:/Users/Nicholas/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe';
const HTML = 'file:///C:/Users/Nicholas/Desktop/coding/paint-takeoff/guide/PaintTakeoff-Guide.html';
const PDF = 'C:/Users/Nicholas/Desktop/coding/paint-takeoff/guide/PaintTakeoff-Guide.pdf';
const PNG = 'C:/Users/Nicholas/Desktop/coding/paint-takeoff/guide/guide-preview.png';

const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 900, height: 1200 } });
await page.goto(HTML);
try {
  await page.screenshot({ path: PNG, fullPage: true });
} catch {
  console.log('preview screenshot skipped (non-fatal)');
}
await page.pdf({
  path: PDF,
  format: 'Letter',
  printBackground: true,
  margin: { top: '0.4in', bottom: '0.4in', left: '0.4in', right: '0.4in' },
});
await browser.close();
console.log('PDF + preview written');
