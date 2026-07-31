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
  // THE GAMEPLAY READ (round 9 reframe): honest hunter-follow range — the
  // fixed 1.62 m eye at 9 m, three-quarter off the dog-bird line — with a
  // slightly longer lens (FOV 70 -> 44, capture-only via __dogAudit.setFov)
  // so the dog holds a meaningful share of frame. This is the frame the
  // player actually hunts from; the point silhouette (raised flag, level
  // topline, lifted fore) must read INSTANTLY here.
  'gameplay-point': { tod: 'dawn', sim: 'point', base: [0, 40, 180, 4], maxTicks: 30000, dist: 8.5, spin: -1.3, pitch: -7, fov: 40 },
  // THE COVEY RISE — the whole game in one frame. Deterministic: gate on
  // the locked point (same round-9 predicate), triggerFlush() walks the
  // mapped hunter in under the sim's own checkFlush law, then stepRise
  // advances ONLY the rise (field time holds its breath, the dog stands)
  // to peak spread. 'the-rise' shoots hunter's-eye over the pointing dog
  // into the explosion; 'rise-wide' stands broadside to the escape line
  // and reads the fan.
  // riseTicks 13: probed — this seed's wave has a ~367 ms sleeper, so
  // tick 13 catches it BURSTING out of the grass while its wave-mates
  // hang 5-7 m up: three birds, honestly staggered heights.
  'the-rise': { tod: 'dawn', sim: 'rise', base: [0, 40, 180, 4], maxTicks: 30000, riseTicks: 15, view: 'behind', dist: 5.5, aimK: 0.5, pitchBias: -2, fov: 52 },
  'rise-wide': { tod: 'dawn', sim: 'rise', base: [0, 40, 180, 4], maxTicks: 30000, riseTicks: 14, view: 'side', dist: 12, aimK: 0.5, pitchBias: 0, fov: 55 },
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
  // Same open-ground pose at DAWN: the low-sun contact-shadow stretch
  // (1/tan(elevation)) is only measurable in the clear. camAz pins the
  // camera BROADSIDE to the dawn shadow axis (sun az 52 -> shadow az 232;
  // a spin-relative camera landed nearly down-axis and foreshortened the
  // whole rake out of frame).
  'debug-dog-open-dawn': { tod: 'dawn', sim: 'open', maxTicks: 12000, base: [0, 40, 180, 4], dist: 5, camAz: 322, pitch: -16 },
  'debug-dog-open-rear': { tod: 'noon', sim: 'open', maxTicks: 12000, base: [0, 40, 180, 4], dist: 4.5, spin: 0.2, pitch: -14 },
  // Macro poses at 2 m for anatomy work — steep pitch so the dog CENTERS
  // and fills the frame from the fixed 1.62 m eye height.
  'debug-dog-macro-side': { tod: 'noon', sim: 'open', maxTicks: 12000, base: [0, 40, 180, 4], dist: 2.0, spin: 1.55, pitch: -30 },
  'debug-dog-macro-front': { tod: 'noon', sim: 'open', maxTicks: 12000, base: [0, 40, 180, 4], dist: 2.0, spin: 2.7, pitch: -30 },
  'debug-dog-macro-point': { tod: 'morning', sim: 'point', maxTicks: 30000, base: [0, 40, 180, 4], dist: 2.1, spin: -1.55, pitch: -24 },
  // Feet-planting witness: mid-stride on visibly SLOPED ground (grade read
  // off window.__dogAudit.slopeAt), framed low and side-on so daylight
  // under a paw — or a buried shin — is unmissable.
  'debug-dog-slope': { tod: 'noon', sim: 'slope', maxTicks: 24000, base: [0, 40, 180, 4], dist: 3.2, spin: 1.55, pitch: -14 },
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
    // vsync decoupled: on a sleeping/locked macOS display the new headless
    // stops issuing BeginFrames entirely — rAF never fires, __ready3d never
    // sets, and every capture times out. Decoupling from the display clock
    // keeps the harness alive regardless of monitor state.
    args: [
      '--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle',
      '--disable-frame-rate-limit', '--disable-gpu-vsync',
    ],
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
      } else if (spec.sim === 'rise') {
        // THE RISE: locked point -> triggerFlush (the sim walks the hunter
        // in and flushes under its own checkFlush law) -> stepRise to peak
        // spread -> frame off live bird telemetry. Every stage is a pure
        // function of the seed.
        const riseInfo = await page.evaluate(
          (base, maxTicks, riseTicks, view, dist, aimK, pitchBias, ptod, fov) => {
            window.__api3d.setTod(ptod);
            window.__api3d.setPose(...base);
            const hunt = () => window.__api3d.hunt();
            // Locked-point gate — the round-9 predicate, verbatim.
            let lpx = null;
            let lpz = null;
            let locked = false;
            const lockedPoint = (h) => {
              if (h.dog.state !== 'pointing') {
                lpx = null;
                return false;
              }
              const still = lpx !== null && Math.hypot(h.dog.x - lpx, h.dog.z - lpz) < 0.01;
              lpx = h.dog.x;
              lpz = h.dog.z;
              if (!still) return false;
              window.__api3d.renderOnce();
              const st = window.__dogAudit && window.__dogAudit.state();
              if (!st) return false;
              const stance = st.paws.filter((p) => p.i !== 0);
              locked = stance.every((p) => p.gap > -0.06 && p.gap < 0.05);
              return locked;
            };
            window.__api3d.stepSim(240);
            let ticks = 240;
            let h = hunt();
            while (!lockedPoint(h) && ticks < maxTicks) {
              window.__api3d.stepSim(15);
              ticks += 15;
              h = hunt();
            }
            if (!locked) return { ok: false, why: 'no locked point' };
            const dogX = h.dog.x;
            const dogZ = h.dog.z;
            const flush = window.__api3d.triggerFlush();
            if (!flush) return { ok: false, why: 'triggerFlush returned null' };
            // Field time holds its breath; only the rise plays.
            window.__api3d.stepRise(riseTicks);
            const birds = window.__api3d.birds();
            const flying = birds.filter((b) => b.status === 'flying');
            if (flying.length === 0) return { ok: false, why: 'no birds airborne', birds };
            let cx = 0;
            let cy = 0;
            let cz = 0;
            for (const b of flying) {
              cx += b.x;
              cy += b.y;
              cz += b.z;
            }
            cx /= flying.length;
            cy /= flying.length;
            cz /= flying.length;
            let camX;
            let camZ;
            if (view === 'behind') {
              // Hunter's eye BEHIND the pointing dog on the dog->covey line.
              let dx = cx - dogX;
              let dz = cz - dogZ;
              const l = Math.hypot(dx, dz) || 1;
              dx /= l;
              dz /= l;
              camX = dogX - dx * dist;
              camZ = dogZ - dz * dist;
            } else {
              // Three-quarter behind the fan: mostly beside the escape
              // line, pulled back toward the gun — a pure side angle
              // collapsed the lateral fan into depth (iteration 3).
              let ex = cx - dogX;
              let ez = cz - dogZ;
              const l = Math.hypot(ex, ez) || 1;
              ex /= l;
              ez /= l;
              let dxq = ez * 1.0 - ex * 0.8;
              let dzq = -ex * 1.0 - ez * 0.8;
              const lq = Math.hypot(dxq, dzq) || 1;
              dxq /= lq;
              dzq /= lq;
              camX = cx + dxq * dist;
              camZ = cz + dzq * dist;
            }
            camX = Math.max(-230, Math.min(230, camX));
            camZ = Math.max(-230, Math.min(230, camZ));
            const vx = cx - camX;
            const vz = cz - camZ;
            const yawDeg = (Math.atan2(-vx, -vz) * 180) / Math.PI;
            const horiz = Math.hypot(vx, vz);
            // Terrain-aware aim (iteration 2: absolute-y aim stared into
            // empty sky on elevated ground): eye = terrain + 1.62 at the
            // camera, target = a point partway up the covey's height ABOVE
            // ITS OWN GROUND, so the explosion sits mid-frame and the dog
            // and cover line hold the lower third.
            const hAt = (x, z) => (window.__dogAudit ? window.__dogAudit.heightAt(x, z) : 0);
            const eyeY = hAt(camX, camZ) + 1.62;
            const aimY = hAt(cx, cz) + (cy - hAt(cx, cz)) * aimK;
            const pitchDeg = (Math.atan2(aimY - eyeY, horiz) * 180) / Math.PI + pitchBias;
            window.__api3d.setPose(camX, camZ, yawDeg, pitchDeg);
            if (fov && window.__dogAudit) window.__dogAudit.setFov(fov);
            window.__api3d.renderOnce();
            return {
              ok: true,
              flush,
              birds,
              dog: { x: dogX, z: dogZ, state: h.dog.state },
              cam: { x: camX, z: camZ, yawDeg: yawDeg, pitchDeg: pitchDeg },
              ticks,
              simMs: hunt().simMs,
            };
          },
          spec.base, spec.maxTicks, spec.riseTicks, spec.view, spec.dist,
          spec.aimK ?? 0.55, spec.pitchBias ?? 0, tod, spec.fov ?? 0,
        );
        if (!riseInfo.ok) {
          console.error(`  rise: ${name} failed — ${riseInfo.why}`);
          failed++;
        } else {
          console.log(
            `  rise: ${riseInfo.birds.length} staged, walk-in ${riseInfo.flush.distPx.toFixed(1)}px, ` +
            `covey [${riseInfo.flush.ids.join(',')}], dog held at (${riseInfo.dog.x.toFixed(1)}, ${riseInfo.dog.z.toFixed(1)})`,
          );
          for (const b of riseInfo.birds) {
            console.log(
              `    bird ${b.simId}: ${b.status} at (${b.x.toFixed(1)}, ${b.y.toFixed(1)}, ${b.z.toFixed(1)}) air ${b.airMs.toFixed(0)}ms`,
            );
          }
          console.log(
            `  cam (${riseInfo.cam.x.toFixed(1)}, ${riseInfo.cam.z.toFixed(1)}) yaw ${riseInfo.cam.yawDeg.toFixed(0)} pitch ${riseInfo.cam.pitchDeg.toFixed(1)}`,
          );
        }
      } else {
        // Sim-posed shot: park the hunter, advance the frozen sim from the
        // fixed seed until the dog reaches the wanted read (pure function
        // of the seed), then frame it from `dist` meters at a `spin`-rad
        // three-quarter angle off the line to the cover it faces.
        const simInfo = await page.evaluate(
          (base, mode, maxTicks, dist, spin, camPitch, ptod, fov, camAz) => {
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
            // LOCKED-POINT GATE (round 9): a point shot only fires when the
            // sim dog is in a LOCKED point — state 'pointing' held across
            // two consecutive probes with ~zero ground speed — AND every
            // stance paw probe-verifies planted (|gap| inside tolerance,
            // measured through the full transform chain by __dogAudit; the
            // lifted foreleg, paw 0, is exempt by design). Stepping until
            // this predicate is a pure function of the seed: deterministic.
            let lpx = null;
            let lpz = null;
            let lastLock = null;
            let locked = false;
            const lockedPoint = (h) => {
              if (h.dog.state !== 'pointing') {
                lpx = null;
                return false;
              }
              const still = lpx !== null && Math.hypot(h.dog.x - lpx, h.dog.z - lpz) < 0.01;
              lpx = h.dog.x;
              lpz = h.dog.z;
              if (!still) return false;
              // Snap the visual pose to the sim (capture mode snaps all
              // smoothing), then audit the paw markers against terrain.
              window.__api3d.renderOnce();
              const st = window.__dogAudit && window.__dogAudit.state();
              if (!st) return false;
              const stance = st.paws.filter((p) => p.i !== 0);
              const planted = stance.every((p) => p.gap > -0.06 && p.gap < 0.05);
              lastLock = {
                still,
                planted,
                gaps: stance.map((p) => Number(p.gap.toFixed(4))),
              };
              locked = planted;
              return planted;
            };
            const want =
              mode === 'point'
                // The LOCKED point. (Probed: this seed's covey holds
                // mid-patch, so the dog stands IN the bluestem — white
                // coat, tail flag and head over the grass carry the read.)
                ? lockedPoint
                : mode === 'open'
                  // Anatomy/gait inspection: mid-stride on open ground —
                  // and INSIDE the camera's ±230 clamp with orbit room (a
                  // dog at the plate edge pushed the macro camera 4 m out).
                  ? (h) =>
                      h.dog.state === 'quartering' && h.dog.gait !== 'still' && edgeDist(h) > 6 &&
                      Math.abs(h.dog.x) < 222 && Math.abs(h.dog.z) < 222
                  : mode === 'slope'
                    // Planting witness: mid-stride on a real grade (>13%),
                    // clear of cover so all four feet are visible.
                    ? (h) =>
                        h.dog.state === 'quartering' && h.dog.gait !== 'still' && edgeDist(h) > 4 &&
                        (window.__dogAudit?.slopeAt(h.dog.x, h.dog.z) ?? 0) > 0.13 &&
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
            // `spin` so the pose reads three-quarter, never dead-on rear —
            // or, when camAz is set, an ABSOLUTE azimuth from the dog
            // (sun-aware witness framings need a fixed axis, not one that
            // re-rolls with whatever cover the dog stopped near).
            let rx;
            let rz;
            if (camAz !== null) {
              const azr = (camAz * Math.PI) / 180;
              rx = Math.sin(azr);
              rz = Math.cos(azr);
            } else {
              let dx = h.dog.x - nearest.cx;
              let dz = h.dog.z - nearest.cz;
              const l = Math.hypot(dx, dz) || 1;
              dx /= l; dz /= l;
              const ca = Math.cos(spin);
              const sa = Math.sin(spin);
              rx = dx * ca - dz * sa;
              rz = dx * sa + dz * ca;
            }
            const camX = Math.max(-230, Math.min(230, h.dog.x + rx * dist));
            const camZ = Math.max(-230, Math.min(230, h.dog.z + rz * dist));
            const vx = h.dog.x - camX;
            const vz = h.dog.z - camZ;
            const yawDeg = (Math.atan2(-vx, -vz) * 180) / Math.PI;
            window.__api3d.setPose(camX, camZ, yawDeg, camPitch);
            // Capture-only lens for framed reads (gameplay-point): reduced
            // FOV = slight lens length at honest follow range.
            if (fov && window.__dogAudit) window.__dogAudit.setFov(fov);
            window.__api3d.renderOnce();
            const reached = mode === 'point' ? locked : want(h);
            return {
              dog: h.dog, ticks, reached, lock: lastLock,
              cam: { x: camX, z: camZ, yawDeg }, simMs: h.simMs,
            };
          },
          spec.base, spec.sim, spec.maxTicks, spec.dist, spec.spin ?? 0, spec.pitch ?? 0, tod, spec.fov ?? 0, spec.camAz ?? null,
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
        if (simInfo.lock) {
          console.log(
            `  lock: still=${simInfo.lock.still} planted=${simInfo.lock.planted} ` +
            `stance paw gaps [${simInfo.lock.gaps.join(', ')}] m`,
          );
        }
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
