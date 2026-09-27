import { resolve } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base keeps the build deployable anywhere (itch.io, subpaths, Capacitor).
  base: './',
  plugins: [{
    name: 'offline-hunt-assets',
    apply: 'build',
    writeBundle(options, bundle) {
      const directory = resolve(options.dir ?? 'dist');
      const files = [
        'index.html', 'index3d.html', 'prepare3d.html', 'shotguns3d.html', 'manifest.webmanifest', 'manifest3d.webmanifest', 'icon-192.png', 'icon-512.png',
        'textures/terrain/prairie-painted.webp',
        'textures/terrain/chukar-dry-ground.webp',
        'textures/terrain/wet-alder-painted.webp',
        ...Object.keys(bundle).filter(name => /\.(js|css)$/.test(name)),
        'models/quail-kit/prop-manifest.json',
        ...['slab', 'split-log', 'fallen-limb'].flatMap(habit => ['high', 'lite'].map(detail => `models/quail-kit/ground-prop-${habit}-${detail}.glb`)),
        'models/quail-kit/tree-manifest.json',
        'models/chukar-kit/manifest.json',
        ...['basalt-brow','weathered-shelf','split-shoulder'].flatMap(name=>['high','lite'].map(detail=>`models/chukar-kit/${name}-${detail}.glb`)),
        ...['upright', 'spreading', 'leaning'].flatMap(habit => ['high', 'lite'].map(detail => `models/quail-kit/field-tree-${habit}-${detail}.glb`)),
        'models/quail-kit/manifest.json',
        ...['open', 'low', 'tall'].flatMap(habit => ['high', 'lite'].map(detail => `models/quail-kit/sand-plum-${habit}-${detail}.glb`)),
        'models/gsp/manifest.json',
        'models/gsp/gsp-liver-white-lod0.glb', 'models/gsp/gsp-liver-white-lod1.glb', 'models/gsp/gsp-liver-white-lod2.glb',
      ];
      const workerSource = readFileSync(resolve(__dirname, 'public/sw.js'), 'utf8');
      // Worker-only fixes need their own cache too; failed staging must never
      // remove an active build that happened to have identical game assets.
      const hash = createHash('sha256').update(workerSource);
      for (const file of files) hash.update(file).update(readFileSync(resolve(directory, file)));
      const build = hash.digest('hex').slice(0, 16);
      writeFileSync(resolve(directory, 'precache.json'), JSON.stringify({ build, files }));
      const worker = workerSource.replace('__BUILD_ID__', build);
      writeFileSync(resolve(directory, 'sw.js'), worker);
    },
  }],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        three: resolve(__dirname, 'index3d.html'),
        preparation: resolve(__dirname, 'prepare3d.html'),
        shotguns: resolve(__dirname, 'shotguns3d.html'),
        poc: resolve(__dirname, 'frame-poc.html'),
      },
    },
  },
});
