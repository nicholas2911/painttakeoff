import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative asset paths so the production build also works when served from
  // a custom protocol (app://) inside Electron.
  base: './',
  plugins: [react()],
  build: {
    // pdf.js ships large chunks; keep the warning quiet, splitting is handled by Rollup.
    chunkSizeWarningLimit: 1500,
  },
});
