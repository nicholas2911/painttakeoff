/** Bridge exposed by electron/preload.cjs (absent in the plain web build). */
import type { UpdateState } from './types';

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
    onState(cb: (state: UpdateState) => void): void;
    download(): void;
    restart(): void;
    checkNow(): Promise<{ ok: boolean; latest?: boolean; busy?: boolean }>;
  };
  printPdf?(fileName: string): Promise<string>;
}

declare global {
  interface Window {
    painttakeoff?: PaintTakeoffBridge;
  }
}

export {};
