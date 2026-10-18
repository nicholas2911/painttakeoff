/**
 * PaintTakeoff — Electron main process.
 *
 * Packaged mode serves the Vite build from a privileged `app://` scheme
 * instead of file://. That keeps ES-module scripts, the PDF.js module
 * worker, and fetch() behaving exactly like they do over http — file://
 * origins break module workers, which is the classic pdf.js-in-Electron
 * failure.
 */
const { app, BrowserWindow, protocol, net, ipcMain, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const { pathToFileURL } = require('node:url');

const isDev = !app.isPackaged;
const DEV_URL = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
const DIST = path.join(__dirname, '..', 'dist');

// ---------- update logging ----------
// Plain append-only log in userData so the tester can email it back when an
// update misbehaves.
function updateLogPath() {
  return path.join(app.getPath('userData'), 'painttakeoff-updater.log');
}
function updateLog(level, msg) {
  try {
    fs.appendFileSync(
      updateLogPath(),
      `${new Date().toISOString()} [${level}] ${msg}\n`,
    );
  } catch {
    /* logging must never break the app */
  }
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
]);

/** Map a URL path onto dist/, refusing escapes. */
function distFile(urlPath) {
  const rel = path.normalize(decodeURIComponent(urlPath)).replace(/^([/\\])+/, '');
  const full = path.join(DIST, rel);
  if (!full.startsWith(DIST)) return null;
  return full;
}

/**
 * A .pdf path in a command line, if any. Dev runs as `electron . file.pdf`,
 * so the first two argv entries are skipped there; packaged only the exe.
 * Used for the startup argv and for a second instance's argv.
 */
function pdfArg(argv) {
  const args = argv.slice(isDev ? 2 : 1);
  const hit = args.find((a) => /\.pdf$/i.test(a) && fs.existsSync(a));
  return hit ? path.resolve(hit) : null;
}

// read-pdf only ever serves paths main itself validated off a command line
// (startup CLI arg / file association, plus any a second instance hands
// over) — never whatever the renderer sends.
const cliPdfPath = pdfArg(process.argv);
const allowedPdfPaths = new Set(cliPdfPath ? [cliPdfPath] : []);

// One running copy: double-clicking a PDF while the app is open hands the
// file to the existing window instead of starting a second app.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

let mainWin = null;

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    // Frameless: the renderer draws the title bar (src/components/TitleBar).
    // backgroundColor matches the default light theme so the startup flash
    // and the rounded-corner pixels don't show a dark edge.
    frame: false,
    backgroundColor: '#e8ecf1',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Keep the renderer's maximize/restore button icon in sync.
  win.on('maximize', () => win.webContents.send('window-maximize-change', true));
  win.on('unmaximize', () => win.webContents.send('window-maximize-change', false));

  win.webContents.on('did-finish-load', () => {
    if (cliPdfPath) win.webContents.send('open-pdf-path', cliPdfPath);
  });
  mainWin = win;
  win.on('closed', () => {
    if (mainWin === win) mainWin = null;
  });

  if (isDev) {
    win.loadURL(DEV_URL);
  } else {
    win.loadURL('app://painttakeoff/index.html');
  }
}

// ---------- window controls for the custom title bar ----------
function winFrom(event) {
  return BrowserWindow.fromWebContents(event.sender);
}

ipcMain.on('window-minimize', (e) => winFrom(e)?.minimize());
ipcMain.on('window-toggle-maximize', (e) => {
  const win = winFrom(e);
  if (!win) return;
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
});
ipcMain.on('window-close', (e) => winFrom(e)?.close());
ipcMain.handle('window-is-maximized', (e) => winFrom(e)?.isMaximized() ?? false);

// Renderer asks for the bytes of a PDF path (command-line open / association).
// The only legitimate caller round-trips main's own validated CLI-arg path
// straight back (see onOpenPdfPath in preload.cjs / App.tsx) — so this
// never needs to serve an arbitrary renderer-chosen path.
ipcMain.handle('read-pdf', async (_event, p) => {
  if (typeof p !== 'string' || !/\.pdf$/i.test(p)) throw new Error('PDF files only');
  const full = path.resolve(p);
  if (!allowedPdfPaths.has(full)) throw new Error('Not the opened PDF');
  return fsp.readFile(full); // Buffer -> Uint8Array in the renderer
});

// A second launch (e.g. double-clicking another PDF) lands here: bring the
// running window forward and open its PDF, if it passed one.
app.on('second-instance', (_event, argv) => {
  const win = mainWin;
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  const p = pdfArg(argv);
  if (p) {
    allowedPdfPaths.add(p);
    win.webContents.send('open-pdf-path', p);
  }
});

// Print the invoice view to a PDF in the user's Downloads folder.
ipcMain.handle('print-pdf', async (event, fileName) => {
  const win = winFrom(event);
  if (!win) throw new Error('no window');
  const data = await win.webContents.printToPDF({
    pageSize: 'Letter',
    printBackground: true,
    margins: { marginType: 'none' },
  });
  // Anchored (^...$) — unanchored would accept a path-separator-laden
  // string like "../../evil.pdf" as long as its tail matched, letting a
  // free-text field (the invoice number) steer the save outside Downloads.
  // Spaces are allowed (the project-name half of this filename allows
  // them too) but '/', '\', and '.' outside the extension are not.
  const name = typeof fileName === 'string' && /^[\w \-]+\.pdf$/i.test(fileName) ? fileName : 'invoice.pdf';
  const outPath = path.join(app.getPath('downloads'), name);
  await fsp.writeFile(outPath, data);
  return outPath;
});

// ---------- auto-updates (GitHub Releases) ----------
// Packaged mode only, never in dev. MANUAL flow: the app checks quietly
// (autoDownload=false) and the user drives download + restart from a
// TitleBar button. Main pushes a single state object:
//   { phase: 'available'|'downloading'|'ready'|'error', version?, percent? }
// Check failures (offline, no releases yet) stay silent and are only
// logged to %APPDATA%/PaintTakeoff/painttakeoff-updater.log.
const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours
const RELEASES_API = 'https://api.github.com/repos/nicholas2911/painttakeoff/releases/latest';
const RELEASES_PAGE = 'https://github.com/nicholas2911/painttakeoff/releases/latest';

/** Compare 'x.y.z' versions (leading 'v' and -prerelease ignored). >0 if a is newer. */
function compareVersions(a, b) {
  const parts = (v) =>
    String(v).replace(/^v/i, '').split('-')[0].split('.').map((n) => parseInt(n, 10) || 0);
  const pa = parts(a);
  const pb = parts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * Portable exe: electron-updater would "update" it by installing a separate
 * NSIS copy while the portable exe itself never changes. So the portable
 * build only asks GitHub for the latest release tag, and the update button
 * opens the release page for a manual download instead.
 */
function initPortableUpdates(win) {
  let state = { phase: 'idle' };
  let checkInFlight = false;
  let timer = null;

  const send = (next) => {
    state = next;
    if (!win.isDestroyed()) win.webContents.send('update-state', next);
  };

  // One GitHub round-trip; throws on network / API failure.
  const fetchLatest = async () => {
    const res = await net.fetch(RELEASES_API, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) throw new Error(`GitHub API ${res.status}`);
    const tag = (await res.json()).tag_name;
    if (typeof tag !== 'string') throw new Error('no tag_name in latest release');
    const latest = tag.replace(/^v/i, '');
    if (compareVersions(latest, app.getVersion()) > 0) {
      updateLog('info', `portable: update available: ${latest}`);
      send({ phase: 'available', version: latest });
      // Nothing more to find once an update is showing.
      if (timer) clearInterval(timer);
      timer = null;
    } else {
      updateLog('info', 'portable: no update available');
      if (state.phase !== 'available') send({ phase: 'uptodate', version: app.getVersion() });
    }
  };

  const check = () => {
    if (checkInFlight) return;
    checkInFlight = true;
    updateLog('info', 'portable: update check');
    if (state.phase === 'idle') send({ phase: 'checking', version: state.version });
    fetchLatest()
      .catch((err) => {
        updateLog('warn', `portable: update check failed (offline?): ${err.message}`);
        if (state.phase === 'checking') send({ phase: 'idle', version: undefined });
      })
      .finally(() => {
        checkInFlight = false;
      });
  };

  // "Download" on a portable build = open the release page (hard-coded https).
  ipcMain.on('update-download', () => {
    if (state.phase !== 'available') return;
    updateLog('info', `portable: opening release page (version ${state.version})`);
    shell.openExternal(RELEASES_PAGE).catch((err) => {
      updateLog('error', `openExternal failed: ${err.message}`);
    });
  });
  // Never reaches 'ready' on a portable build — nothing to install.
  ipcMain.on('update-restart', () => {});

  ipcMain.handle('update-check-now', async () => {
    if (checkInFlight) return { ok: true, busy: true };
    checkInFlight = true;
    updateLog('info', 'portable: manual update check (user clicked the version)');
    try {
      if (state.phase === 'idle') send({ phase: 'checking', version: state.version });
      await fetchLatest();
      return { ok: true, latest: state.phase === 'idle' || state.phase === 'uptodate' };
    } catch (err) {
      updateLog('warn', `portable: manual update check failed: ${err.message}`);
      if (state.phase === 'checking') send({ phase: 'idle', version: undefined });
      return { ok: false };
    } finally {
      checkInFlight = false;
    }
  });

  updateLog('info', `portable updater started (version ${app.getVersion()})`);
  check();
  timer = setInterval(check, UPDATE_CHECK_INTERVAL_MS);
}

function initUpdates(win) {
  if (isDev) return;
  if (process.env.PORTABLE_EXECUTABLE_FILE) {
    initPortableUpdates(win);
    return;
  }
  let autoUpdater;
  try {
    autoUpdater = require('electron-updater').autoUpdater;
  } catch (err) {
    updateLog('error', `electron-updater failed to load: ${err.message}`);
    // Manual checks still get an answer: { ok: false } is the only
    // failure shape the renderer toasts ("Couldn't check"), which beats
    // a silent no-op or a false "you're on the latest version".
    ipcMain.handle('update-check-now', async () => ({ ok: false }));
    return;
  }
  autoUpdater.logger = {
    info: (m) => updateLog('info', String(m)),
    warn: (m) => updateLog('warn', String(m)),
    error: (m) => updateLog('error', String(m)),
    debug: (m) => updateLog('debug', String(m)),
  };
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  let state = { phase: 'idle' };
  let downloading = false;
  let checkInFlight = false;
  let timer = null;

  const send = (next) => {
    state = next;
    // Downloaded and waiting for a restart — no point checking again.
    if (next.phase === 'ready' && timer) {
      clearInterval(timer);
      timer = null;
    }
    if (!win.isDestroyed()) win.webContents.send('update-state', next);
  };

  autoUpdater.on('checking-for-update', () => updateLog('info', 'checking for update'));
  autoUpdater.on('update-available', (info) => {
    updateLog('info', `update available: ${info.version}`);
    // A re-check mid-download (or after it finished) must not knock the
    // button back to "New update".
    if (state.phase === 'downloading' || state.phase === 'ready') return;
    send({ phase: 'available', version: info.version });
  });
  autoUpdater.on('update-not-available', () => {
    updateLog('info', 'no update available');
    // A re-check mid-download (or after it) must not drop the user back
    // to the "Latest version" pill.
    if (state.phase === 'downloading' || state.phase === 'ready') return;
    send({ phase: 'uptodate', version: app.getVersion() });
  });
  autoUpdater.on('download-progress', (p) => {
    send({
      phase: 'downloading',
      version: state.version,
      percent: Math.max(0, Math.min(100, Math.round(p.percent))),
    });
  });
  autoUpdater.on('update-downloaded', (info) => {
    downloading = false;
    updateLog('info', `update downloaded: ${info.version}`);
    send({ phase: 'ready', version: info.version });
  });
  autoUpdater.on('error', (err) => {
    updateLog('error', `updater error: ${err.message}`);
    // Only surface errors to the user when they asked for a download.
    // Check failures (offline etc.) stay silent.
    if (downloading) {
      downloading = false;
      send({ phase: 'error', version: state.version });
    }
  });

  ipcMain.on('update-download', () => {
    if (state.phase !== 'available' && state.phase !== 'error') return;
    updateLog('info', `download requested by user (version ${state.version})`);
    downloading = true;
    send({ phase: 'downloading', version: state.version, percent: 0 });
    autoUpdater.downloadUpdate().catch((err) => {
      updateLog('error', `downloadUpdate failed: ${err.message}`);
    });
  });
  ipcMain.on('update-restart', () => {
    if (state.phase !== 'ready') return;
    updateLog('info', 'restart requested by user — quitAndInstall');
    autoUpdater.quitAndInstall();
  });

  const check = () => {
    if (checkInFlight) return;
    checkInFlight = true;
    updateLog('info', 'update check');
    // Tell the UI a check is running — but only from a blank slate; an
    // existing status (pill or update button) stays up during re-checks,
    // so a failed re-check never clobbers the last known state.
    if (state.phase === 'idle') {
      send({ phase: 'checking', version: state.version });
    }
    autoUpdater
      .checkForUpdates()
      .catch((err) => updateLog('warn', `update check failed (offline?): ${err.message}`))
      .finally(() => {
        checkInFlight = false;
      });
  };

  // Manual "click the version number" check. Returns a result the renderer
  // turns into plain-English toast feedback. Errors surface HERE only —
  // automatic checks (launch + timer) stay silent.
  ipcMain.handle('update-check-now', async () => {
    if (checkInFlight) return { ok: true, busy: true };
    checkInFlight = true;
    updateLog('info', 'manual update check (user clicked the version)');
    try {
      if (state.phase === 'idle') {
        send({ phase: 'checking', version: state.version });
      }
      await autoUpdater.checkForUpdates();
      // If the check found (or had already found) an update, the state
      // machine already shows it — nothing more to say.
      return {
        ok: true,
        latest: state.phase === 'idle' || state.phase === 'uptodate',
      };
    } catch (err) {
      updateLog('warn', `manual update check failed: ${err.message}`);
      // Manual check failing from a blank slate: back to nothing-shown.
      if (state.phase === 'checking') send({ phase: 'idle', version: undefined });
      return { ok: false };
    } finally {
      checkInFlight = false;
    }
  });

  updateLog('info', `updater started (version ${app.getVersion()})`);
  check();
  timer = setInterval(check, UPDATE_CHECK_INTERVAL_MS);
}

if (gotLock) app.whenReady().then(() => {
  if (!isDev) {
    protocol.handle('app', (req) => {
      const u = new URL(req.url);
      const file = distFile(u.pathname === '/' ? '/index.html' : u.pathname);
      if (!file) return new Response('Not found', { status: 404 });
      return net.fetch(pathToFileURL(file).toString());
    });
  }
  createWindow();
  if (!isDev) {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) initUpdates(win);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
