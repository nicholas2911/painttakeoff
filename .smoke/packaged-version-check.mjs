import { _electron as electron } from 'playwright-core';
const EXE = 'C:/Users/Nicholas/Desktop/coding/paint-takeoff/app/release/win-unpacked/PaintTakeoff.exe';
const errors = [];
const check = (name, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) errors.push(name); };
const app = await electron.launch({ executablePath: EXE });
const page = await app.firstWindow();
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(e.message));
await page.waitForSelector('.welcome-title', { timeout: 30000 });
check('version label v0.5.0', (await page.locator('.tb-version').textContent())?.trim() === 'v0.5.0');
await page.locator('.tb-version').click();
await page.waitForTimeout(60);
const earlyToast = (await page.locator('.toast').textContent()) ?? '';
check(
  'immediate feedback toast',
  earlyToast.includes('Checking for updates') || earlyToast.includes('latest version'),
);
// The first click may race the launch check (busy guard). Wait for it to
// settle, then click again — this one always runs a real check.
await page.waitForTimeout(5000);
await page.locator('.tb-version').click();
await page.waitForTimeout(2500);
// Outcome depends on the live feed: either latest-version toast, a New
// update button, or an offline error toast — all are valid plain-English
// end states, and the app must not error.
const toast = (await page.locator('.toast').textContent()) ?? '';
const hasUpdateBtn = (await page.locator('.update-btn').count()) > 0;
console.log('  end state:', toast || '(button: ' + hasUpdateBtn + ')');
check('manual check reaches a plain-English end state',
  toast.includes('latest version') || toast.includes('Couldn’t check') || hasUpdateBtn);
console.log('errors:', errors.length ? errors : 'none');
await app.close();
process.exit(errors.length ? 1 : 0);
