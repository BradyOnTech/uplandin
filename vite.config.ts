import { resolve } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { defineConfig } from 'vite';
import { RELEASES_IN_GAME, buildInfo } from './scripts/releases.mjs';

// The version this build is (its commit and that commit's day) and the
// latest release notes (scripts/releases.mjs).
const { builtAt, ...build } = buildInfo({ root: __dirname });
const inGame = { ...build, releases: build.releases.slice(0, RELEASES_IN_GAME) };

export default defineConfig({
  // Relative base keeps the build deployable anywhere (itch.io, subpaths, Capacitor).
  base: './',
  // The game knows its own version, even offline (src/three/gameVersion.ts).
  // Only the commit and its day go in, so a rebuilt commit is the same game.
  define: { __UPLANDIN_BUILD__: JSON.stringify(inGame) },
  plugins: [{
    // What production is running, for anyone to check, and what an update brings.
    // Never cached: the worker passes it through and _headers revalidates it.
    name: 'game-version',
    apply: 'build',
    generateBundle() {
      const { version, commit, releases } = inGame;
      const published = { label: `Version ${version} · ${commit}`, version, commit, builtAt, releases };
      this.emitFile({ type: 'asset', fileName: 'version.json', source: `${JSON.stringify(published, null, 2)}\n` });
    },
  }, {
    name: 'offline-hunt-assets',
    apply: 'build',
    writeBundle(options, bundle) {
      const directory = resolve(options.dir ?? 'dist');
      const files = [
        'index.html', 'home3d.html', 'index3d.html', 'prepare3d.html', 'training3d.html', 'shotguns3d.html', 'manifest.webmanifest', 'manifest3d.webmanifest', 'icon-192.png', 'icon-512.png',
        ...['title-landscape', 'quail-fields', 'pheasant-coverts', 'chukar-ridge', 'sharptail-prairie', 'dogs/gsp', 'dogs/english-setter', 'dogs/gsp-smooth', 'dogs/gsp-faceted', 'dogs/english-setter-smooth', 'dogs/english-setter-faceted', 'dogs/griffon', 'dogs/griffon-smooth', 'dogs/griffon-faceted', 'guns/remington-870', 'guns/semi-auto', 'guns/over-under', 'guns/side-by-side'].map(name => `art/menus3d/${name}.webp`),
        'textures/terrain/prairie-painted.webp',
        'textures/terrain/sharptail-sward-v2.webp',
        'textures/terrain/sharptail-granite-v1.webp',
        'textures/sky/sharptail-cloud-atlas-v1.webp',
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
        home: resolve(__dirname, 'home3d.html'),
        // classic.html (the retired 2D hunt) stays in the repo but is no longer built.
        three: resolve(__dirname, 'index3d.html'),
        preparation: resolve(__dirname, 'prepare3d.html'),
        training: resolve(__dirname, 'training3d.html'),
        shotguns: resolve(__dirname, 'shotguns3d.html'),
        poc: resolve(__dirname, 'frame-poc.html'),
      },
    },
  },
});
