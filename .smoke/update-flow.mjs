/* Verifies the MANUAL update flow (autoDownload:false, button-driven):
 * simulated bridge -> "New update: 0.3.0" flashing button in the title bar
 * -> click starts download -> progress % -> "Restart to update" -> restart()
 * -> error path shows "Update failed — try again" and retries.
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
  let stateCb = null;
  window.__downloads = 0;
  window.__restarts = 0;
  window.__checks = 0;
  window.__checkResult = { ok: true, latest: true };
  window.painttakeoff = {
    onOpenPdfPath() {},
    readPdf: async () => new Uint8Array(),
    windowControls: {
      minimize() {},
      toggleMaximize() {},
      close() {},
      isMaximized: async () => false,
      onMaximizeChange() {},
    },
    updates: {
      onState(cb) { stateCb = cb; },
      download() { window.__downloads++; },
      restart() { window.__restarts++; },
      async checkNow() {
        window.__checks++;
        await new Promise((r) => setTimeout(r, 350)); // simulate network latency
        const r = window.__checkResult;
        if (r.ok && !r.latest) stateCb?.({ phase: 'available', version: '0.4.0' });
        return r;
      },
    },
  };
  window.__fire = (s) => stateCb?.(s);
});

await page.goto(APP, { waitUntil: 'networkidle' });
check('title bar renders (fake bridge)', await page.locator('.titlebar').isVisible());
check('no update button before events', (await page.locator('.update-btn').count()) === 0);

// available -> flashing "New update: 0.3.0"
await page.evaluate(() => window.__fire({ phase: 'available', version: '0.3.0' }));
await page.waitForSelector('.update-btn');
const btn = page.locator('.update-btn');
check('button says New update: 0.3.0', (await btn.textContent())?.includes('New update: 0.3.0'));
check('button pulses', await btn.evaluate((el) => getComputedStyle(el).animationName !== 'none'));
await page.screenshot({ path: 'update-button.png', clip: { x: 980, y: 0, width: 520, height: 44 } });
console.log('  screenshot: .smoke/update-button.png');

// click -> download starts
await btn.click();
check('click called download()', await page.evaluate(() => window.__downloads === 1));

// progress events
await page.evaluate(() => window.__fire({ phase: 'downloading', version: '0.3.0', percent: 42 }));
await page.waitForTimeout(150);
check('progress text', (await page.locator('.update-btn').textContent())?.includes('Downloading update… 42%'));
check('no pulse while downloading', await page.locator('.update-btn').evaluate((el) => getComputedStyle(el).animationName === 'none'));
check('button disabled while downloading', await page.locator('.update-btn').isDisabled());

// downloaded -> green restart
await page.evaluate(() => window.__fire({ phase: 'ready', version: '0.3.0' }));
await page.waitForTimeout(150);
check('Restart to update shown', (await page.locator('.update-btn').textContent())?.includes('Restart to update'));
await page.locator('.update-btn').click();
check('click called restart()', await page.evaluate(() => window.__restarts === 1));

// error path
await page.evaluate(() => window.__fire({ phase: 'error', version: '0.3.0' }));
await page.waitForTimeout(150);
check('error shows try-again', (await page.locator('.update-btn').textContent())?.includes('Update failed — try again'));
await page.locator('.update-btn').click();
check('try again retries download', await page.evaluate(() => window.__downloads === 2));

// ---------- click-to-check via the version label ----------
check('version label shows v0.3.1', (await page.locator('.tb-version').textContent())?.trim() === 'v0.3.1');

// latest path: toast sequence Checking… -> latest version
await page.evaluate(() => { window.__checkResult = { ok: true, latest: true }; });
await page.locator('.tb-version').click();
await page.waitForTimeout(150);
check('checking toast', (await page.locator('.toast').textContent())?.includes('Checking for updates'));
await page.waitForTimeout(400);
check('latest-version toast', (await page.locator('.toast').textContent())?.includes('latest version (0.3.1)'));
check('checkNow IPC called once', await page.evaluate(() => window.__checks === 1));

// available path: flashing New update button appears
await page.locator('.update-btn').click().catch(() => {}); // clear any prior state if visible
await page.evaluate(() => { window.__checkResult = { ok: true, latest: false }; });
await page.locator('.tb-version').click();
await page.waitForTimeout(600);
check('available -> New update button', (await page.locator('.update-btn').textContent())?.includes('New update: 0.4.0'));

// error path
await page.evaluate(() => { window.__checkResult = { ok: false }; });
await page.evaluate(() => window.__fire({ phase: 'idle' }));
await page.locator('.tb-version').click();
await page.waitForTimeout(600);
check('error toast', (await page.locator('.toast').textContent())?.includes('Couldn’t check'));

await page.screenshot({ path: 'titlebar-version.png', clip: { x: 0, y: 0, width: 700, height: 44 } });
console.log('  screenshot: .smoke/titlebar-version.png');

console.log('errors:', errors.length ? errors : 'none');
await browser.close();
process.exit(errors.length ? 1 : 0);
