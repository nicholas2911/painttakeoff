const { contextBridge, ipcRenderer } = require('electron');

// Main can push before React has subscribed (a command-line PDF is sent on
// did-finish-load; the first update state right after). Listen from preload
// time and hand over on subscribe, so nothing is dropped — and keep ONE
// listener per channel, so re-subscribing replaces the handler instead of
// stacking listeners (which would open the same PDF twice).
let pdfCb = null;
const pendingPdfs = [];
ipcRenderer.on('open-pdf-path', (_event, p) => {
  if (pdfCb) pdfCb(p);
  else pendingPdfs.push(p);
});
let updateCb = null;
let lastUpdateState = null;
ipcRenderer.on('update-state', (_event, state) => {
  lastUpdateState = state;
  if (updateCb) updateCb(state);
});

contextBridge.exposeInMainWorld('painttakeoff', {
  /** Main pushes a PDF path here (command-line arg / file association). */
  onOpenPdfPath(cb) {
    pdfCb = cb;
    while (pendingPdfs.length) cb(pendingPdfs.shift());
  },
  /** Read a PDF's bytes from disk (validated .pdf-only in main). */
  readPdf(p) {
    return ipcRenderer.invoke('read-pdf', p);
  },
  /** Window controls for the custom (frameless) title bar. */
  windowControls: {
    minimize() {
      ipcRenderer.send('window-minimize');
    },
    toggleMaximize() {
      ipcRenderer.send('window-toggle-maximize');
    },
    close() {
      ipcRenderer.send('window-close');
    },
    isMaximized() {
      return ipcRenderer.invoke('window-is-maximized');
    },
    onMaximizeChange(cb) {
      ipcRenderer.on('window-maximize-change', (_event, maximized) => cb(maximized));
    },
  },
  /** Auto-update events (packaged builds only; manual download flow). */
  updates: {
    onState(cb) {
      updateCb = cb;
      if (lastUpdateState) cb(lastUpdateState);
    },
    download() {
      ipcRenderer.send('update-download');
    },
    restart() {
      ipcRenderer.send('update-restart');
    },
    /** Force an update check now (user clicked the version label). */
    checkNow() {
      return ipcRenderer.invoke('update-check-now');
    },
  },
  /** Print the current view (invoice) to a PDF in Downloads. Returns the path. */
  printPdf(fileName) {
    return ipcRenderer.invoke('print-pdf', fileName);
  },
});
