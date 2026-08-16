const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('painttakeoff', {
  /** Main pushes a PDF path here (command-line arg / file association). */
  onOpenPdfPath(cb) {
    ipcRenderer.on('open-pdf-path', (_event, p) => cb(p));
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
      ipcRenderer.on('update-state', (_event, state) => cb(state));
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
});
