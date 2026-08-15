import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
const EXE = 'C:/Users/Nicholas/Desktop/coding/paint-takeoff/app/release/win-unpacked/PaintTakeoff.exe';
const LOG = 'C:/Users/Nicholas/AppData/Roaming/PaintTakeoff/painttakeoff-updater.log';
try { fs.unlinkSync(LOG); } catch {}
const errors = [];
const app = await electron.launch({ executablePath: EXE });
const page = await app.firstWindow();
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(e.message));
await page.waitForSelector('.welcome-title', { timeout: 30000 });
await page.waitForTimeout(4000); // let the update check fail against the placeholder owner
check: {
  const ok = fs.existsSync(LOG);
  console.log(ok ? 'PASS  updater log file created' : 'FAIL  no updater log');
  if (ok) console.log('  log contents:', fs.readFileSync(LOG, 'utf8').trim().split('\n').join('\n  '));
}
console.log('app booted fine, banner count:', await page.locator('.update-banner').count());
console.log('errors:', errors.length ? errors : 'none');
await app.close();
