import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Independent entry, public assets and output keep the priority 3D build intact.
export default defineConfig({
  base: './',
  publicDir: 'public2d',
  cacheDir: '.cache-2d/vite',
  server: { host: '0.0.0.0', port: 4590, strictPort: true },
  build: {
    outDir: 'dist-2d',
    rollupOptions: { input: resolve(__dirname, 'index2d.html') },
  },
});
