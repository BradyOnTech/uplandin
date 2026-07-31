#!/usr/bin/env node
/*
 * Headless capture harness — the eye of the AAA loop. Renders the 3D
 * build at named camera poses / times of day and writes PNGs that the
 * visual-critic agents judge against the Firewatch / A Short Hike
 * reference stills in docs/3d/reference/.
 *
 * Usage:
 *   node tools3d/capture.mjs                       # standard shot set
 *   node tools3d/capture.mjs --url http://localhost:5173
 *   node tools3d/capture.mjs --shots dawn-field,evening-ridge
 *   node tools3d/capture.mjs --out docs/3d/shots
 *
 * If no server answers, it boots its own `vite --port 4517` and kills it
 * after. Exit code is non-zero if any shot fails — this is a build gate.
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer';

const SHOTS = {
  // name: [x, z, yawDeg, pitchDeg, tod]
  'dawn-field': [0, 40, 180, 4, 'dawn'],
  'dawn-into-sun': [0, 40, 265, 4, 'dawn'],
  'dawn-ridge': [-60, -20, 150, -2, 'dawn'],
  'noon-open': [20, 10, 200, 4, 'noon'],
  'evening-field': [0, 40, 85, 3, 'evening'],
  'lastlight': [10, 20, 90, 5, 'lastlight'],
  // Sim-posed: advances the (capture-frozen) hunt sim from the fixed seed
  // until the dog reaches the wanted read, then frames it. Deterministic —
  // stepping-until-a-predicate is a pure function of the seed.
  //   mode 'work'  → dog busy inside a cover patch (tail-up cover work)
  //   mode 'point' → dog frozen ON POINT; camera at hunter's-eye height,
  //                  ~15 m back at a three-quarter angle: the money shot.
  // Round 7 reframe: the shot is ABOUT the dog — 4.5 m, not 10, with a
  // downward angle that sets the working dog against lit grass.
  'dawn-dogwork': { tod: 'dawn', sim: 'work', base: [0, 40, 180, 4], maxTicks: 12000, dist: 2.4, spin: 0.9, pitch: -16 },
  // Probed framing: into the sunrise from the dog's left — the covey
  // holds mid-patch (no edge points exist in this seed), so the camera
  // walks in CLOSE (2.9 m, round-7 reframe: the dog fills the frame now)
  // and looks slightly down, silhouetting the white coat, flag tail and
  // driving head against the sun-drenched bluestem instead of burying
  // the dog in it.
  // spin -1.35 puts the camera broadside to the dog-bird line: the point
  // reads side-on — level topline, raised flag, folded foreleg — with the
  // sunrise still in the top of the wide frame.
  'dawn-point': { tod: 'dawn', sim: 'point', base: [0, 40, 180, 4], maxTicks: 30000, dist: 2.2, spin: -1.35, pitch: -18 },
  // Debug poses (not part of the standard set — request via --shots).
  'debug-shadow': [26, 82, 180, -6, 'dawn'],
  'debug-noon-shadow': [36, 62, 180, -10, 'noon'],
  // Open ground looking at the SW edge of the sim's patch-9 cover block:
  // the density-tier ladder (bare break -> sparse open -> fringe -> dense)
  // and the 9->25 game trail all sit in this frame.
  'debug-cover-edge': [2, -8, 222, 2, 'noon'],
  // Sighting straight down the long 25->4 game trail across the open.
  'debug-trail': [10, -29, 70, -4, 'noon'],
  // Dog inspection poses (request via --shots): the point at 5 m for
  // proportion work, and side-on at 8 m in flat light.
  'debug-dog-close': { tod: 'dawn', sim: 'point', maxTicks: 30000, base: [0, 40, 180, 4], dist: 3.5, spin: -0.62, pitch: -16 },
  'debug-dog-side': { tod: 'noon', sim: 'point', maxTicks: 30000, base: [0, 40, 180, 4], dist: 4, spin: -1.45, pitch: -14 },
  'debug-dog-work-close': { tod: 'noon', sim: 'work', maxTicks: 12000, base: [0, 40, 180, 4], dist: 6, spin: 0.8, pitch: -8 },
  // Mid-stride on open ground — proportion/gait inspection in the clear.
  'debug-dog-open': { tod: 'noon', sim: 'open', maxTicks: 12000, base: [0, 40, 180, 4], dist: 4.5, spin: 1.5, pitch: -14 },
  'debug-dog-open-rear': { tod: 'noon', sim: 'open', maxTicks: 12000, base: [0, 40, 180, 4], dist: 4.5, spin: 0.2, pitch: -14 },
  // Macro poses at 2 m for anatomy work — steep pitch so the dog CENTERS
  // and fills the frame from the fixed 1.62 m eye height.
  'debug-dog-macro-side': { tod: 'noon', sim: 'open', maxTicks: 12000, base: [0, 40, 180, 4], dist: 2.0, spin: 1.55, pitch: -30 },
  'debug-dog-macro-front': { tod: 'noon', sim: 'open', maxTicks: 12000, base: [0, 40, 180, 4], dist: 2.0, spin: 2.7, pitch: -30 },
  'debug-dog-macro-point': { tod: 'morning', sim: 'point', maxTicks: 30000, base: [0, 40, 180, 4], dist: 2.1, spin: -1.55, pitch: -24 },
};

const args = process.argv.slice(2);
const get = (flag, dflt) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : dflt;
};
const baseUrl = get('--url', 'http://localhost:4517');
const outDir = resolve(get('--out', 'docs/3d/shots'));
const wanted = get(
  '--shots',
  Object.keys(SHOTS).filter((n) => !n.startsWith('debug-')).join(','),
).split(',');
const W = 960;
const H = 540;

async function reachable(url) {
  try {
    const res = await fetch(url + '/index3d.html', { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  let server = null;
  let url = baseUrl;
  if (!(await reachable(url))) {
    server = spawn('npx', ['vite', '--port', '4517', '--strictPort'], { stdio: 'pipe' });
    url = 'http://localhost:4517';
    for (let i = 0; i < 40; i++) {
      if (await reachable(url)) break;
      await new Promise((r) => setTimeout(r, 500));
      if (i === 39) throw new Error('vite never came up');
    }
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle'],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
    let failed = 0;
    for (const name of wanted) {
      const spec = SHOTS[name];
      if (!spec) {
        console.error(`unknown shot: ${name}`);
        failed++;
        continue;
      }
      const tod = Array.isArray(spec) ? spec[4] : spec.tod;
      await page.goto(`${url}/index3d.html?capture=1&tod=${tod}`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction('window.__ready3d === true', { timeout: 30000 });
      if (Array.isArray(spec)) {
        const [x, z, yaw, pitch] = spec;
        await page.evaluate(
          (px, pz, pyaw, ppitch, ptod) => {
            window.__api3d.setTod(ptod);
            window.__api3d.setPose(px, pz, pyaw, ppitch);
            window.__api3d.renderOnce();
          },
          x, z, yaw, pitch, tod,
        );
      } else {
        // Sim-posed shot: park the hunter, advance the frozen sim from the
        // fixed seed until the dog reaches the wanted read (pure function
        // of the seed), then frame it from `dist` meters at a `spin`-rad
        // three-quarter angle off the line to the cover it faces.
        const simInfo = await page.evaluate(
          (base, mode, maxTicks, dist, spin, camPitch, ptod) => {
            window.__api3d.setTod(ptod);
            window.__api3d.setPose(...base);
            const hunt = () => window.__api3d.hunt();
            const inPatch = (h) =>
              h.patches.some((p) => Math.abs(h.dog.x - p.cx) < p.hx && Math.abs(h.dog.z - p.cz) < p.hz);
            // Distance from the dog to the nearest patch EDGE (negative = inside).
            const edgeDist = (h) => {
              let best = Infinity;
              for (const p of h.patches) {
                const ex = Math.abs(h.dog.x - p.cx) - p.hx;
                const ez = Math.abs(h.dog.z - p.cz) - p.hz;
                best = Math.min(best, Math.max(ex, ez));
              }
              return best;
            };
            const want =
              mode === 'point'
                // The point. (Probed: this seed's covey holds mid-patch, so
                // the dog stands IN the bluestem — white coat, tail flag and
                // head over the grass carry the read; edge points don't
                // exist here to wait for.)
                ? (h) => h.dog.state === 'pointing'
                : mode === 'open'
                  // Anatomy/gait inspection: mid-stride on open ground —
                  // and INSIDE the camera's ±230 clamp with orbit room (a
                  // dog at the plate edge pushed the macro camera 4 m out).
                  ? (h) =>
                      h.dog.state === 'quartering' && h.dog.gait !== 'still' && edgeDist(h) > 6 &&
                      Math.abs(h.dog.x) < 222 && Math.abs(h.dog.z) < 222
                  : (h) => h.dog.state === 'quartering' && h.dog.gait === 'run' && inPatch(h);
            // Skip the opening cast so the frame isn't the first stride.
            window.__api3d.stepSim(240);
            let ticks = 240;
            let h = hunt();
            while (!want(h) && ticks < maxTicks) {
              window.__api3d.stepSim(15);
              ticks += 15;
              h = hunt();
            }
            let nearest = h.patches[0];
            let bd = Infinity;
            for (const p of h.patches) {
              const d = Math.hypot(p.cx - h.dog.x, p.cz - h.dog.z);
              if (d < bd) { bd = d; nearest = p; }
            }
            // Back direction: away from the cover the dog faces, rotated by
            // `spin` so the pose reads three-quarter, never dead-on rear.
            let dx = h.dog.x - nearest.cx;
            let dz = h.dog.z - nearest.cz;
            const l = Math.hypot(dx, dz) || 1;
            dx /= l; dz /= l;
            const ca = Math.cos(spin);
            const sa = Math.sin(spin);
            const rx = dx * ca - dz * sa;
            const rz = dx * sa + dz * ca;
            const camX = Math.max(-230, Math.min(230, h.dog.x + rx * dist));
            const camZ = Math.max(-230, Math.min(230, h.dog.z + rz * dist));
            const vx = h.dog.x - camX;
            const vz = h.dog.z - camZ;
            const yawDeg = (Math.atan2(-vx, -vz) * 180) / Math.PI;
            window.__api3d.setPose(camX, camZ, yawDeg, camPitch);
            window.__api3d.renderOnce();
            return { dog: h.dog, ticks, reached: want(h), cam: { x: camX, z: camZ, yawDeg }, simMs: h.simMs };
          },
          spec.base, spec.sim, spec.maxTicks, spec.dist, spec.spin ?? 0, spec.pitch ?? 0, tod,
        );
        if (!simInfo.reached) {
          console.error(`  sim: ${name} never reached mode '${spec.sim}' in ${spec.maxTicks} ticks`);
          failed++;
        }
        console.log(
          `  sim: dog ${simInfo.dog.state}/${simInfo.dog.gait} at (${simInfo.dog.x.toFixed(1)}, ${simInfo.dog.z.toFixed(1)}), ` +
          `cam (${simInfo.cam.x.toFixed(1)}, ${simInfo.cam.z.toFixed(1)}) yaw ${simInfo.cam.yawDeg.toFixed(0)}, ` +
          `sim ${simInfo.simMs.avg.toFixed(3)}ms avg / ${simInfo.simMs.max.toFixed(2)}ms max per tick`,
        );
      }
      await new Promise((r) => setTimeout(r, 400)); // settle a few frames
      const file = `${outDir}/${name}.png`;
      await page.screenshot({ path: file });
      const info = await page.evaluate(() => window.__api3d.info());
      console.log(`shot ${name} -> ${file} (${info.calls} calls, ${info.triangles} tris)`);
    }
    if (failed > 0) process.exit(1);
  } finally {
    await browser.close();
    if (server) server.kill('SIGTERM');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
