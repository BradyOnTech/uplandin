#!/usr/bin/env node
/** Headless plan view of a ground's kit cover map: the far band's colour
 * field (or its near floor, or plain class colours), with the lone woody
 * sites, the sim's cover patches, routes and entries drawn over it, and the
 * share of each class. Loads the game sources through Vite SSR; no browser,
 * no repo writes. For iterating on a cover recipe by looking at it.
 *
 *   node tools3d/cover-map.mjs --area quail-fields --out /tmp/cover/quail.png [--scale 1.5] [--layer color|floor|class] [--margin 40]
 */
import { createServer } from 'vite';
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const arg = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const areaId = arg('--area', 'quail-fields');
const out = resolve(arg('--out', `/tmp/uplandin-cover/${areaId}.png`));
const yardsPerPixel = Number(arg('--scale', '1.5'));
const layer = arg('--layer', 'color');
const margin = Number(arg('--margin', '40'));
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const server = await createServer({ root, configFile: false, cacheDir: '/tmp/uplandin-cover/.vite-cache', logLevel: 'silent', appType: 'custom',
  server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] },
  define: { __UPLANDIN_BUILD__: JSON.stringify({ version: 'map', commit: 'map', releases: [] }) } });
try {
  const { getArea } = await server.ssrLoadModule('/src/game/areas.ts');
  const { LandscapeModel } = await server.ssrLoadModule('/src/game/landscape.ts');
  const { coverMapFor } = await server.ssrLoadModule('/src/three/groundKit/coverRecipes.ts');
  const { groundKitColors, groundKitWoody } = await server.ssrLoadModule('/src/three/groundKit/groundKit.ts');
  const { LandAnalysis } = await server.ssrLoadModule('/src/three/groundKit/coverMap.ts');
  const THREE = await server.ssrLoadModule('three');
  const area = getArea(areaId), landscape = new LandscapeModel(area);
  const started = performance.now();
  const map = coverMapFor(landscape);
  const built = performance.now() - started;
  if (!map) throw new Error(`${areaId} has no cover recipe`);
  const field = groundKitColors(landscape);
  const world = area.world;
  const x0 = world.x - margin, y0 = world.y - margin, W = Math.ceil((world.w + margin * 2) / yardsPerPixel), H = Math.ceil((world.h + margin * 2) / yardsPerPixel);
  const px = new Uint8Array(W * H * 3), color = new THREE.Color();
  const CLASS = [[196, 132, 96], [170, 140, 90], [200, 120, 80], [120, 110, 80], [150, 90, 60], [80, 60, 40], [60, 70, 40], [60, 100, 130]];
  const cell = { cls: 0, density: 0, height: 0, tone: 0, variant: 0 };
  // Land layers: the same analysis the recipe reads, over the cover map.
  const land = ['wetness', 'tpi', 'relief', 'slope', 'convergence'].includes(layer)
    ? new LandAnalysis(map.x0, map.y0, map.cols * map.cell, map.rows * map.cell, (x, y) => landscape.heightAtProperty(x, y)) : null;
  const sample = { height: 0, slope: 0, tpi: 0, relief: 0, wetness: 0, south: 0, west: 0, convergence: 0, channel: 0 };
  const ramp = (t) => [40 + 215 * t, 60 + 120 * (1 - Math.abs(t - .5) * 2), 200 - 180 * t];
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const x = x0 + (i + .5) * yardsPerPixel, y = y0 + (j + .5) * yardsPerPixel;
    let c;
    if (land) {
      land.sample(x, y, sample);
      const v = layer === 'wetness' ? sample.wetness : layer === 'slope' ? sample.slope / .3 : layer === 'convergence' ? sample.convergence
        : layer === 'tpi' ? sample.tpi / 2 + .5 : sample.relief / 8 + .5;
      c = ramp(Math.max(0, Math.min(1, v)));
    } else if (layer === 'class') {
      map.sample(x, y, cell);
      const base = CLASS[cell.cls], k = .7 + cell.variant * .12;
      c = base.map(v => v * k);
    } else {
      if (layer === 'floor' && field.floorSample) field.floorSample(x, y, color);
      else field.sample(x, y, color);
      color.convertLinearToSRGB();
      c = [color.r * 255, color.g * 255, color.b * 255];
    }
    const inside = x >= world.x && x <= world.x + world.w && y >= world.y && y <= world.y + world.h;
    const dim = inside ? 1 : .8;
    const o = (j * W + i) * 3;
    for (let n = 0; n < 3; n++) px[o + n] = Math.max(0, Math.min(255, c[n] * dim));
  }
  const plot = (x, y, rgb, r = 0) => {
    const ci = Math.round((x - x0) / yardsPerPixel), cj = Math.round((y - y0) / yardsPerPixel);
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (di * di + dj * dj > r * r + r) continue;
      const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= W || j >= H) continue;
      const o = (j * W + i) * 3; px[o] = rgb[0]; px[o + 1] = rgb[1]; px[o + 2] = rgb[2];
    }
  };
  const line = (a, b, rgb) => { const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / yardsPerPixel) + 1; for (let s = 0; s <= n; s += 2) plot(a.x + (b.x - a.x) * s / n, a.y + (b.y - a.y) * s / n, rgb); };
  const SITE = [[40, 52, 30], [70, 80, 50], [150, 160, 140], [92, 70, 40], [30, 30, 30], [120, 60, 120]];
  const counts = {};
  for (const site of map.sites) {
    counts[site.group] = (counts[site.group] ?? 0) + 1;
    plot(site.x, site.y, SITE[site.group % SITE.length], site.group <= 2 ? 2 : 1);
  }
  if (!args.includes('--clean')) {
    for (const p of area.patches) {
      line({ x: p.x, y: p.y }, { x: p.x + p.w, y: p.y }, [40, 120, 220]); line({ x: p.x, y: p.y + p.h }, { x: p.x + p.w, y: p.y + p.h }, [40, 120, 220]);
      line({ x: p.x, y: p.y }, { x: p.x, y: p.y + p.h }, [40, 120, 220]); line({ x: p.x + p.w, y: p.y }, { x: p.x + p.w, y: p.y + p.h }, [40, 120, 220]);
    }
    for (const d of area.dropPoints) plot(d.position.x, d.position.y, [30, 60, 220], 5);
    for (const l of area.landmarks) plot(l.position.x, l.position.y, [250, 220, 40], 3);
  }
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let j = 0; j < H; j++) { raw[j * (W * 3 + 1)] = 0; Buffer.from(px.buffer, j * W * 3, W * 3).copy(raw, j * (W * 3 + 1) + 1); }
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = buf => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
  const names = ['bare', 'short', 'crown', 'swale', 'stand', 'shrub', 'tree', 'water'];
  const share = Object.fromEntries(map.classShare().map((v, k) => [names[k], +v.toFixed(3)]));
  const woody = groundKitWoody(areaId);
  const sites = Object.fromEntries(Object.entries(counts).map(([g, n]) => [woody?.sites?.[g]?.map(e => e.species).join('+') ?? g, n]));
  console.log(JSON.stringify({ out, W, H, buildMs: Math.round(built), share, sites }));
  // --probe x,y;x,y prints the cover at points (yards), for staging views.
  for (const point of (arg('--probe', '') || '').split(';').filter(Boolean)) {
    const [px, py] = point.split(',').map(Number);
    map.sample(px, py, cell);
    console.log(`probe ${px},${py}: ${names[cell.cls]} v${cell.variant} density ${cell.density.toFixed(2)} height ${cell.height.toFixed(2)} m`);
  }
} finally { await server.close(); }
