import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base keeps the build deployable anywhere (itch.io, subpaths, Capacitor).
  base: './',
});
