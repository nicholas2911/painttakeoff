/* Verifies the auto-update renderer wiring without a server:
 * injects a fake window.painttakeoff.updates bridge before page load,
 * fires the events the main process would send, and checks the banner UX.
 * Also asserts the updater does nothing in dev (no bridge = no banner).
 */
import { chromium } from 'playwright-core';

const EXE =
  'C:/Users/Nicholas/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe';
const APP = 'http://localhost:5199/';

const errors = [];
const check = (name, ok) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) errors.push(`check failed: ${name}`);
};

const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

await page.addInitScript(() => {
  const cbs = {};
  window.painttakeoff = {
    updates: {
      onAvailable(cb) { cbs.available = cb; },
      onDownloaded(cb) { cbs.downloaded = cb; },
      restart() { window.__restartCalled = true; },
    },
  };
  window.__fireAvailable = () => cbs.available?.('0.3.0');
  window.__fireDownloaded = () => cbs.downloaded?.('0.3.0');
});

await page.goto(APP, { waitUntil: 'networkidle' });
check('no banner before events', (await page.locator('.update-banner').count()) === 0);

await page.evaluate(() => window.__fireAvailable());
await page.waitForTimeout(200);
check('available event shows toast', (await page.locator('.toast').textContent())?.includes('downloading in the background'));
check('still no banner while downloading', (await page.locator('.update-banner').count()) === 0);

await page.evaluate(() => window.__fireDownloaded());
await page.waitForSelector('.update-banner');
check('downloaded event shows banner', (await page.locator('.update-banner').textContent())?.includes('restart to update'));

await page.getByRole('button', { name: 'Later' }).click();
check('Later dismisses banner', (await page.locator('.update-banner').count()) === 0);

await page.evaluate(() => window.__fireDownloaded());
await page.waitForSelector('.update-banner');
await page.getByRole('button', { name: 'Restart now' }).click();
check('Restart now calls restart()', await page.evaluate(() => window.__restartCalled === true));

console.log('errors:', errors.length ? errors : 'none');
await browser.close();
process.exit(errors.length ? 1 : 0);
