import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base keeps the build deployable anywhere (itch.io, subpaths, Capacitor).
  base: './',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        three: resolve(__dirname, 'index3d.html'),
        poc: resolve(__dirname, 'frame-poc.html'),
      },
    },
  },
});
