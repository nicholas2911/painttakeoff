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
  /** Auto-update events (packaged builds only). */
  updates: {
    onAvailable(cb) {
      ipcRenderer.on('update-available', (_event, version) => cb(version));
    },
    onDownloaded(cb) {
      ipcRenderer.on('update-downloaded', (_event, version) => cb(version));
    },
    restart() {
      ipcRenderer.send('update-restart');
    },
  },
});
