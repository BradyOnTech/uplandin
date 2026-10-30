#!/usr/bin/env node
/** Headless plan view of a ground's authoritative landform: hillshade and
 * elevation tint, slope, rimrock, habitat classes, hunt areas, trails and
 * entries. Loads the game sources through Vite SSR; no browser, no repo
 * writes. For iterating on feature-authored landforms by looking at them.
 *
 *   node tools3d/landform-map.mjs --area chukar-ridge --out /tmp/uplandin-landform/chukar.png [--scale 2] [--layer habitat] [--margin 300]
 */
import { createServer } from 'vite';
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const arg = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const areaId = arg('--area', 'chukar-ridge');
const out = resolve(arg('--out', `/tmp/uplandin-landform/${areaId}.png`));
const yardsPerPixel = Number(arg('--scale', '2'));
const layer = arg('--layer', 'habitat');
const margin = Number(arg('--margin', '0'));
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const server = await createServer({ root, configFile: false, cacheDir: '/tmp/uplandin-landform/.vite-cache', logLevel: 'silent', appType: 'custom',
  server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] },
  define: { __UPLANDIN_BUILD__: JSON.stringify({ version: 'map', commit: 'map', releases: [] }) } });
try {
  const { getArea } = await server.ssrLoadModule('/src/game/areas.ts');
  const { LandscapeModel } = await server.ssrLoadModule('/src/game/landscape.ts');
  let huntAreas = null, habitat = null;
  try { huntAreas = await server.ssrLoadModule('/src/game/huntAreas.ts'); } catch {}
  try { habitat = await server.ssrLoadModule('/src/game/landHabitat.ts'); } catch {}
  const area = getArea(areaId), landscape = new LandscapeModel(area);
  const world = area.world;
  const x0 = world.x - margin, y0 = world.y - margin, W = Math.ceil((world.w + margin * 2) / yardsPerPixel), H = Math.ceil((world.h + margin * 2) / yardsPerPixel);
  const px = new Uint8Array(W * H * 3);
  const heights = new Float32Array((W + 1) * (H + 1));
  let lo = Infinity, hi = -Infinity;
  for (let j = 0; j <= H; j++) for (let i = 0; i <= W; i++) {
    const h = landscape.heightAtProperty(x0 + i * yardsPerPixel, y0 + j * yardsPerPixel);
    heights[j * (W + 1) + i] = h; lo = Math.min(lo, h); hi = Math.max(hi, h);
  }
  const AREA_COLORS = [[214, 196, 140], [150, 120, 160], [120, 170, 120], [200, 110, 90], [90, 140, 120], [110, 150, 200],
    [230, 170, 70], [190, 150, 110], [80, 170, 170], [140, 140, 210], [210, 130, 170], [160, 190, 90]];
  const classColor = { sage: [118, 128, 96], cheat: [214, 186, 120], bunchgrass: [176, 164, 112], talus: [128, 126, 118], rimrock: [62, 60, 58],
    seep: [92, 132, 72], flat: [190, 176, 132], bare: [200, 184, 150], river: [70, 110, 130] };
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * (W + 1) + i, h = heights[k];
    const gx = (heights[k + 1] - h) / (yardsPerPixel * .9144), gy = (heights[k + W + 1] - h) / (yardsPerPixel * .9144);
    const slope = Math.hypot(gx, gy);
    const shade = Math.max(.25, Math.min(1.25, .82 + (-gx * .6 - gy * .8) * .9));
    const t = (h - lo) / (hi - lo || 1);
    let c = [120 + t * 110, 112 + t * 100, 92 + t * 80];
    const x = x0 + (i + .5) * yardsPerPixel, y = y0 + (j + .5) * yardsPerPixel;
    if (layer === 'slope') { const s = Math.min(1, slope / 1.2); c = [80 + s * 175, 160 - s * 120, 90 - s * 60]; }
    else if (layer === 'habitat' && habitat?.habitatClassAt) { const cls = habitat.habitatClassAt(area, x, y); if (cls && classColor[cls]) c = classColor[cls]; }
    else if (layer === 'areas' && huntAreas?.huntAreaModel) { const k = huntAreas.huntAreaModel(area)?.indexAt(x, y) ?? -1; if (k >= 0) c = AREA_COLORS[k % AREA_COLORS.length]; }
    if (h < -60) c = [70, 110, 130];
    const inside = x >= world.x && x <= world.x + world.w && y >= world.y && y <= world.y + world.h;
    const dim = inside ? 1 : .72;
    const o = (j * W + i) * 3;
    for (let n = 0; n < 3; n++) px[o + n] = Math.max(0, Math.min(255, c[n] * shade * dim));
  }
  const plot = (x, y, color, r = 0) => {
    const ci = Math.round((x - x0) / yardsPerPixel), cj = Math.round((y - y0) / yardsPerPixel);
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= W || j >= H) continue;
      const o = (j * W + i) * 3; px[o] = color[0]; px[o + 1] = color[1]; px[o + 2] = color[2];
    }
  };
  const line = (a, b, color, r = 0) => { const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / yardsPerPixel) + 1; for (let s = 0; s <= n; s++) plot(a.x + (b.x - a.x) * s / n, a.y + (b.y - a.y) * s / n, color, r); };
  // Contours every 10 m.
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * (W + 1) + i, a = Math.floor(heights[k] / 10), b = Math.floor(heights[k + 1] / 10), c = Math.floor(heights[k + W + 1] / 10);
    if (a !== b || a !== c) { const o = (j * W + i) * 3; for (let n = 0; n < 3; n++) px[o + n] = px[o + n] * .7; }
  }
  // A 100 yd grid, bolder every 500 yd, for reading coordinates off the plan.
  for (let g = 0; g <= Math.max(world.w, world.h) + margin; g += 100) {
    const bold = g % 500 === 0, color = bold ? [255, 255, 255] : [235, 235, 235];
    if (g <= world.w) for (let y = y0; y < y0 + H * yardsPerPixel; y += bold ? yardsPerPixel : yardsPerPixel * 3) plot(world.x + g, y, color);
    if (g <= world.h) for (let x = x0; x < x0 + W * yardsPerPixel; x += bold ? yardsPerPixel : yardsPerPixel * 3) plot(x, world.y + g, color);
  }
  for (const b of landscape.solidBlockers?.() ?? []) plot(b.x, b.y, [30, 26, 24], 0);
  if (huntAreas?.huntAreasFor) for (const ha of huntAreas.huntAreasFor(area)) {
    plot(ha.center.x, ha.center.y, [255, 255, 255], 3);
    if (ha.landmark) plot(ha.landmark.position.x, ha.landmark.position.y, [255, 80, 200], 2);
  }
  if (huntAreas?.huntAreaAt && !args.includes('--no-areas')) {
    for (let j = 0; j < H; j += 1) for (let i = 0; i < W; i += 1) {
      const x = x0 + i * yardsPerPixel, y = y0 + j * yardsPerPixel;
      const a = huntAreas.huntAreaAt(area, x, y)?.id, b = huntAreas.huntAreaAt(area, x + yardsPerPixel, y)?.id, c = huntAreas.huntAreaAt(area, x, y + yardsPerPixel)?.id;
      if (a !== b || a !== c) plot(x, y, [250, 250, 250]);
    }
  }
  for (const p of area.patches) { line({ x: p.x, y: p.y }, { x: p.x + p.w, y: p.y }, [40, 90, 40]); line({ x: p.x, y: p.y + p.h }, { x: p.x + p.w, y: p.y + p.h }, [40, 90, 40]); line({ x: p.x, y: p.y }, { x: p.x, y: p.y + p.h }, [40, 90, 40]); line({ x: p.x + p.w, y: p.y }, { x: p.x + p.w, y: p.y + p.h }, [40, 90, 40]); }
  for (const t of area.trails) for (let i = 1; i < t.points.length; i++) line(t.points[i - 1], t.points[i], [200, 60, 30], 0);
  for (const d of area.dropPoints) plot(d.position.x, d.position.y, [30, 60, 220], 5);
  for (const l of area.landmarks) plot(l.position.x, l.position.y, [250, 220, 40], 2);
  // PNG
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let j = 0; j < H; j++) { raw[j * (W * 3 + 1)] = 0; Buffer.from(px.buffer, j * W * 3, W * 3).copy(raw, j * (W * 3 + 1) + 1); }
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = buf => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
  console.log(JSON.stringify({ out, W, H, lo: +lo.toFixed(1), hi: +hi.toFixed(1), blockers: landscape.solidBlockers?.().length ?? 0, patches: area.patches.length }));
} finally { await server.close(); }
