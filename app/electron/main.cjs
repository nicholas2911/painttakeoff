/**
 * PaintTakeoff — Electron main process.
 *
 * Packaged mode serves the Vite build from a privileged `app://` scheme
 * instead of file://. That keeps ES-module scripts, the PDF.js module
 * worker, and fetch() behaving exactly like they do over http — file://
 * origins break module workers, which is the classic pdf.js-in-Electron
 * failure.
 */
const { app, BrowserWindow, protocol, net, ipcMain } = require('electron');
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

/** A .pdf path passed on the command line, if any. */
function pdfArg() {
  const args = process.argv.slice(isDev ? 2 : 1);
  const hit = args.find((a) => /\.pdf$/i.test(a) && fs.existsSync(a));
  return hit ? path.resolve(hit) : null;
}

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
    const p = pdfArg();
    if (p) win.webContents.send('open-pdf-path', p);
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
ipcMain.handle('read-pdf', async (_event, p) => {
  if (typeof p !== 'string' || !/\.pdf$/i.test(p)) throw new Error('PDF files only');
  return fsp.readFile(p); // Buffer -> Uint8Array in the renderer
});

// ---------- auto-updates (GitHub Releases) ----------
// Packaged mode only, never in dev. MANUAL flow: the app checks quietly
// (autoDownload=false) and the user drives download + restart from a
// TitleBar button. Main pushes a single state object:
//   { phase: 'available'|'downloading'|'ready'|'error', version?, percent? }
// Check failures (offline, no releases yet) stay silent and are only
// logged to %APPDATA%/PaintTakeoff/painttakeoff-updater.log.
const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours

function initUpdates(win) {
  if (isDev) return;
  let autoUpdater;
  try {
    autoUpdater = require('electron-updater').autoUpdater;
  } catch (err) {
    updateLog('error', `electron-updater failed to load: ${err.message}`);
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

  const send = (next) => {
    state = next;
    if (!win.isDestroyed()) win.webContents.send('update-state', next);
  };

  autoUpdater.on('checking-for-update', () => updateLog('info', 'checking for update'));
  autoUpdater.on('update-available', (info) => {
    updateLog('info', `update available: ${info.version}`);
    send({ phase: 'available', version: info.version });
  });
  autoUpdater.on('update-not-available', () => updateLog('info', 'no update available'));
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
    updateLog('info', 'restart requested by user — quitAndInstall');
    autoUpdater.quitAndInstall();
  });

  const check = () => {
    if (checkInFlight) return; // never stack overlapping checks
    checkInFlight = true;
    updateLog('info', 'update check');
    autoUpdater
      .checkForUpdates()
      .catch((err) => updateLog('warn', `update check failed (offline?): ${err.message}`))
      .finally(() => {
        checkInFlight = false;
      });
  };

  updateLog('info', `updater started (version ${app.getVersion()})`);
  check();
  setInterval(check, UPDATE_CHECK_INTERVAL_MS);
}

app.whenReady().then(() => {
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
