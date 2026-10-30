#!/usr/bin/env node
/**
 * What the dog's motion costs a frame: the actual field-motion controller
 * (contact solve, IK, skeleton) of each breed, timed in Node with a
 * nanosecond clock over a recorded hunt trace, bundled against a chosen
 * checkout so a baseline and a branch are timed the same way.
 *
 *   tools3d/heavy.sh node tools3d/dog-motion-cost.mjs --root . --trace /tmp/dog-audit/traces/chukar-gsp8.json
 *
 * CPU time of the presentation update only (no rendering, no simulation).
 */
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const arg = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(arg('--root', process.cwd()));
const trace = JSON.parse(readFileSync(arg('--trace', '/tmp/dog-audit/traces/chukar-gsp8.json'), 'utf8'));
const rounds = Number(arg('--rounds', '3'));
const entry = `
import { GeneratedFieldMotion } from '${root}/src/three/dogs/generatedFieldMotion.ts';
import { LandscapeModel } from '${root}/src/game/landscape.ts';
import { getArea } from '${root}/src/game/areas.ts';
export { GeneratedFieldMotion, LandscapeModel, getArea };
`;
const dir = mkdtempSync(join(tmpdir(), 'dog-cost-'));
const out = join(dir, 'cost.mjs');
await build({ stdin: { contents: entry, resolveDir: root, loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', outfile: out,
  logLevel: 'error', define: { __UPLANDIN_BUILD__: '{}', 'import.meta.env': '{"BASE_URL":"/"}' } });
const { GeneratedFieldMotion, LandscapeModel, getArea } = await import(pathToFileURL(out).href);
const landscape = new LandscapeModel(getArea('chukar-ridge'), 'south-gate');
const ground = (x, z) => landscape.heightAtWorld(x, z);
const ticks = trace.ticks;
const lerpAngle = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;
const results = {};
for (const [breed, coat, look] of [['gsp', 'liver-roan', 'smooth'], ['english-setter', 'orange-belton', 'faceted'], ['griffon', 'steel-gray', 'faceted']]) {
  for (const detail of ['high', 'lite']) {
    const samples = [];
    for (let round = 0; round < rounds; round++) {
      const motion = new GeneratedFieldMotion(detail, ground, () => 0, coat, look);
      let elapsed = 0n, frames = 0;
      for (let f = 0; f < (ticks.length - 1) * 2; f++) {
        const u = f / 2, i = Math.floor(u) + 1, k = u - Math.floor(u), a = ticks[i - 1], b = ticks[i];
        const x = a.x + (b.x - a.x) * k, z = a.z + (b.z - a.z) * k, yaw = Math.PI / 2 - lerpAngle(a.travel, b.travel, k);
        const moving = b.gait !== 'still' && Math.hypot(b.x - a.x, b.z - a.z) > .002, point = b.state === 'pointing' && !b.creeping;
        const start = process.hrtime.bigint();
        motion.update(x, z, yaw, 1 / 60, moving && !point, point, undefined,
          { state: b.state, scentStage: b.scent, scentProgress: b.progress, waitingForHandler: b.waiting, intentYaw: 0, slam: b.slam, creeping: b.creeping });
        if (round > 0 || f > 600) { elapsed += process.hrtime.bigint() - start; frames++; }
      }
      samples.push(Number(elapsed) / 1e6 / frames);
      motion.dispose();
    }
    samples.sort((p, q) => p - q);
    results[`${breed}-${detail}`] = { msPerFrame: +samples[Math.floor(samples.length / 2)].toFixed(4), rounds: samples.map(v => +v.toFixed(4)) };
  }
}
const report = { root, trace: trace.meta, frames: (ticks.length - 1) * 2, results, evidence: 'Node CPU time of GeneratedFieldMotion.update over a recorded trace; median of rounds' };
if (args.includes('--out')) writeFileSync(arg('--out'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(results));
