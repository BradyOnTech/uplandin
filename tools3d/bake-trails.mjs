#!/usr/bin/env node
/** Plan a rebuilt ground's trails over its authored landform and bake them
 * into src/game/<ground>Trails.ts. Rerun after changing the landform or the
 * trail waypoints; the ground's landform tests prove the baked routes stay
 * walkable (and, on Chukar Ridge, clear of the rimrock).
 *
 *   node tools3d/bake-trails.mjs chukar-ridge
 *   node tools3d/bake-trails.mjs sharptail-prairie
 */
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const area = process.argv[2] ?? 'chukar-ridge';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const server = await createServer({ root, configFile: false, cacheDir: '/tmp/uplandin-landform/.vite-cache', logLevel: 'silent', appType: 'custom',
  server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } });

/** Per ground: its surface, what a trail may not cross, its waypoints and where the result goes. */
async function groundFor(id) {
  const { planTrail } = await server.ssrLoadModule('/src/game/trailPlanner.ts');
  if (id === 'chukar-ridge') {
    const canyon = await server.ssrLoadModule('/src/game/chukarCanyon.ts');
    const ridge = await server.ssrLoadModule('/src/game/chukarRidge.ts');
    // Keep routes this far (yards) from any basalt module's footprint.
    const clearance = canyon.CHUKAR_RIM_BLOCK_RADIUS + 3.4;
    return { planTrail, heightAt: canyon.chukarHeight, world: canyon.CHUKAR_WORLD, waypoints: ridge.CHUKAR_TRAIL_WAYPOINTS,
      blocked: (x, y) => canyon.chukarRimModulesNear(x, y, clearance + 1).some(m => Math.hypot(x - m.x, y - m.y) < clearance),
      options: { cell: 3, maxGrade: .5, gradeCost: 30, tolerance: 2.2 },
      file: 'src/game/chukarTrails.ts', name: 'CHUKAR_TRAILS', header: "Chukar Ridge's trails, planned over the authored canyon", from: 'chukarRidge.ts' };
  }
  if (id === 'sharptail-prairie') {
    const coteau = await server.ssrLoadModule('/src/game/sharptailCoteau.ts');
    const prairie = await server.ssrLoadModule('/src/game/sharptailPrairie.ts');
    const features = await server.ssrLoadModule('/src/game/sharptailFeatures.ts');
    const pond = features.SHARPTAIL_STOCK_POND, c = Math.cos(pond.angle), s = Math.sin(pond.angle);
    // Round the stock pond, never through it; the coulee walls are left to the grade.
    const blocked = (x, y) => {
      const dx = x - pond.x, dy = y - pond.y, u = (dx * c + dy * s) / (pond.rx + 6), v = (-dx * s + dy * c) / (pond.ry + 6);
      return u * u + v * v < 1;
    };
    return { planTrail, heightAt: coteau.sharptailHeight, world: coteau.SHARPTAIL_WORLD, waypoints: prairie.SHARPTAIL_TRAIL_WAYPOINTS, blocked,
      // Two-tracks run nearly straight across a prairie; only a coulee wall bends them.
      options: { cell: 4, maxGrade: .32, gradeCost: 60, tolerance: 4 },
      file: 'src/game/sharptailTrails.ts', name: 'SHARPTAIL_TRAILS', header: "Sharptail Prairie's trails, planned over the authored coteau", from: 'sharptailPrairie.ts' };
  }
  throw new Error(`no trail baking for ${id}`);
}

try {
  const g = await groundFor(area);
  const trails = [];
  for (const { id, points } of g.waypoints) {
    const t0 = Date.now();
    const path = g.planTrail(points, g.heightAt, g.blocked, g.world, g.options);
    let climb = 0, steepest = 0, length = 0;
    for (let i = 1; i < path.length; i++) {
      const run = Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y), rise = g.heightAt(path[i].x, path[i].y) - g.heightAt(path[i - 1].x, path[i - 1].y);
      length += run; climb += Math.max(0, rise); steepest = Math.max(steepest, Math.abs(rise) / (run * .9144 || 1));
    }
    console.log(`${id}: ${path.length} vertices, ${length.toFixed(0)} yd, climb ${climb.toFixed(0)} m, steepest chord ${steepest.toFixed(2)}, ${Date.now() - t0} ms`);
    trails.push({ id, points: path });
  }
  const body = trails.map(t => `  { id: '${t.id}', points: [${t.points.map(p => `{ x: ${p.x}, y: ${p.y} }`).join(', ')}] },`).join('\n');
  writeFileSync(resolve(root, g.file), `/**
 * ${g.header} by
 * tools3d/bake-trails.mjs from the waypoints in ${g.from}.
 * Generated: rerun the tool rather than editing by hand.
 */
import type { AreaTrail } from './areas';

export const ${g.name}: readonly AreaTrail[] = [
${body}
];
`);
  console.log(`wrote ${g.file}`);
} finally { await server.close(); }
