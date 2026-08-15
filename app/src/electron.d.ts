/** Bridge exposed by electron/preload.cjs (absent in the plain web build). */
export interface PaintTakeoffBridge {
  onOpenPdfPath(cb: (path: string) => void): void;
  readPdf(path: string): Promise<Uint8Array>;
  windowControls: {
    minimize(): void;
    toggleMaximize(): void;
    close(): void;
    isMaximized(): Promise<boolean>;
    onMaximizeChange(cb: (maximized: boolean) => void): void;
  };
  updates?: {
    onAvailable(cb: (version: string) => void): void;
    onDownloaded(cb: (version: string) => void): void;
    restart(): void;
  };
}

declare global {
  interface Window {
    painttakeoff?: PaintTakeoffBridge;
  }
}

export {};
