#!/usr/bin/env node
/** Plan Chukar Ridge's trails over the authored canyon and bake them into
 * src/game/chukarTrails.ts. Rerun after changing the landform or the
 * waypoints in src/game/chukarRidge.ts; test/chukarLandform.test.ts proves
 * the baked routes stay walkable and clear of the rimrock.
 *
 *   node tools3d/bake-chukar-trails.mjs
 */
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const server = await createServer({ root, configFile: false, cacheDir: '/tmp/uplandin-landform/.vite-cache', logLevel: 'silent', appType: 'custom',
  server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } });
try {
  const canyon = await server.ssrLoadModule('/src/game/chukarCanyon.ts');
  const ridge = await server.ssrLoadModule('/src/game/chukarRidge.ts');
  const { planTrail } = await server.ssrLoadModule('/src/game/trailPlanner.ts');
  // Keep routes this far (yards) from any basalt module's footprint.
  const clearance = canyon.CHUKAR_RIM_BLOCK_RADIUS + 3.4;
  const blocked = (x, y) => canyon.chukarRimModulesNear(x, y, clearance + 1).some(m => Math.hypot(x - m.x, y - m.y) < clearance);
  const trails = [];
  for (const { id, points } of ridge.CHUKAR_TRAIL_WAYPOINTS) {
    const t0 = Date.now();
    const path = planTrail(points, canyon.chukarHeight, blocked, canyon.CHUKAR_WORLD, { cell: 3, maxGrade: .5, gradeCost: 30, tolerance: 2.2 });
    let climb = 0, steepest = 0, length = 0;
    for (let i = 1; i < path.length; i++) {
      const run = Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y), rise = canyon.chukarHeight(path[i].x, path[i].y) - canyon.chukarHeight(path[i - 1].x, path[i - 1].y);
      length += run; climb += Math.max(0, rise); steepest = Math.max(steepest, Math.abs(rise) / (run * .9144 || 1));
    }
    console.log(`${id}: ${path.length} vertices, ${length.toFixed(0)} yd, climb ${climb.toFixed(0)} m, steepest chord ${steepest.toFixed(2)}, ${Date.now() - t0} ms`);
    trails.push({ id, points: path });
  }
  const body = trails.map(t => `  { id: '${t.id}', points: [${t.points.map(p => `{ x: ${p.x}, y: ${p.y} }`).join(', ')}] },`).join('\n');
  writeFileSync(resolve(root, 'src/game/chukarTrails.ts'), `/**
 * Chukar Ridge's trails, planned over the authored canyon by
 * tools3d/bake-chukar-trails.mjs from the waypoints in chukarRidge.ts.
 * Generated: rerun the tool rather than editing by hand.
 */
import type { AreaTrail } from './areas';

export const CHUKAR_TRAILS: readonly AreaTrail[] = [
${body}
];
`);
  console.log('wrote src/game/chukarTrails.ts');
} finally { await server.close(); }
