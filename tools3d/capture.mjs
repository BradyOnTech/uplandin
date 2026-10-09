#!/usr/bin/env node
/*
 * Normal gameplay captures default to FOV70 with real browser input.
 * Legacy named compositions are labeled staged-asset-review and saved with
 * a manifest of camera settings and simulation state. They are useful for
 * asset inspection, never evidence of normal play or overall readiness.
 *
 * Usage:
 *   node tools3d/capture.mjs                       # standard shot set
 *   node tools3d/capture.mjs --url http://localhost:5173
 *   node tools3d/capture.mjs --shots dawn-field,evening-ridge
 *   node tools3d/capture.mjs --out docs/3d/shots
 *   node tools3d/capture.mjs --breed english-pointer
 *   node tools3d/capture.mjs --area chukar-ridge --drop west-track
 *
 * If no server answers, it boots its own `vite --port 4517` and kills it
 * after. Exit code is non-zero if any shot fails — this is a build gate.
 */
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { runNormalGameplay, startServer } from './playthrough.mjs';
import { verifyEvidenceImage } from './evidence-image.mjs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer';

const SHOTS = {
  // name: [x, z, yawDeg, pitchDeg, tod]
  // dawn-field stands 12 m south of the old (0,40): the landscape rework
  // pinned the south-gate drop to (0,40) and parked the truck 5.5 m ahead
  // of the old pose (verified: truck world (0,45.5)). Same view azimuth,
  // so all azimuth-keyed composition (oak, peak, saddle, sun) is intact.
  'dawn-field': [0, 52, 180, 4, 'dawn'],
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
  // Historical enlarged-lens composition retained only as an asset review.
  'review-point-long-lens': { tod: 'dawn', sim: 'point', base: [0, 40, 180, 4], maxTicks: 30000, dist: 8.5, spin: -1.3, pitch: -7, fov: 40 },
  // The covey rise is reviewed by tools3d/review-rise.mjs: a natural hunt
  // to a point on each core ground, the walk-in under the flush law, and the
  // rise from the hunter's eye as a timed strip with sky telemetry. The old
  // 'the-rise' / 'rise-wide' compositions here staged a full covey over the
  // dog's back and walked the hunter off the property hunting for one.
  // Debug poses (not part of the standard set — request via --shots).
  'debug-shadow': [26, 82, 180, -6, 'dawn'],
  'debug-noon-shadow': [36, 62, 180, -10, 'noon'],
  // Open ground looking at the SW edge of the sim's patch-9 cover block:
  // the density-tier ladder (bare break -> sparse open -> fringe -> dense)
  // and the 9->25 game trail all sit in this frame.
  'debug-cover-edge': [2, -8, 222, 2, 'noon'],
  // Sighting straight down the long 25->4 game trail across the open.
  'debug-trail': [10, -29, 70, -4, 'noon'],
  // Chukar Ridge acceptance: hunter-eye approach into the authored rimrock
  // from the primary truck, with the sidehill and sparse cover in one read.
  'debug-chukar-approach': [0, 40, -24, -2, 'morning'],
  // Dog inspection poses (request via --shots): the point at 5 m for
  // proportion work, and side-on at 8 m in flat light.
  'debug-dog-close': { tod: 'dawn', sim: 'point', maxTicks: 30000, base: [0, 40, 180, 4], dist: 3.5, spin: -0.62, pitch: -16, hideGun: true },
  'debug-dog-side': { tod: 'noon', sim: 'point', maxTicks: 30000, base: [0, 40, 180, 4], dist: 4, spin: -1.45, pitch: -14, hideGun: true },
  'debug-dog-work-close': { tod: 'noon', sim: 'work', maxTicks: 12000, base: [0, 40, 180, 4], dist: 6, spin: 0.8, pitch: -8, hideGun: true },
  // Shared search-to-point acceptance sequence. These freeze the real 2D
  // Dog simulation at the middle of each scent beat; the 3D subsystem only
  // presents that authoritative state.
  'review-scent-checking': { tod: 'noon', sim: 'scent-checking', maxTicks: 30000, base: [0, 40, 180, 4], dist: 2.2, spin: 1.55, pitch: -27, fov: 36, hideGun: true, isolateDog: true, broadsideDog: true },
  'review-scent-locating': { tod: 'noon', sim: 'scent-locating', maxTicks: 30000, base: [0, 40, 180, 4], dist: 2.2, spin: 1.55, pitch: -27, fov: 36, hideGun: true, isolateDog: true, broadsideDog: true },
  'review-scent-stalking': { tod: 'noon', sim: 'scent-stalking', maxTicks: 30000, base: [0, 40, 180, 4], dist: 2.2, spin: 1.55, pitch: -27, fov: 36, hideGun: true, isolateDog: true, broadsideDog: true },
  'review-scent-locking': { tod: 'noon', sim: 'scent-locking', maxTicks: 30000, base: [0, 40, 180, 4], dist: 2.2, spin: 1.55, pitch: -27, fov: 36, hideGun: true, isolateDog: true, broadsideDog: true },
  // Mid-stride on open ground — proportion/gait inspection in the clear.
  'debug-dog-open': { tod: 'noon', sim: 'open', maxTicks: 12000, base: [0, 40, 180, 4], dist: 4.5, spin: 1.5, pitch: -14, hideGun: true },
  // Same open-ground pose at DAWN: the low-sun contact-shadow stretch
  // (1/tan(elevation)) is only measurable in the clear. camAz pins the
  // camera BROADSIDE to the dawn shadow axis (sun az 52 -> shadow az 232;
  // a spin-relative camera landed nearly down-axis and foreshortened the
  // whole rake out of frame).
  'debug-dog-open-dawn': { tod: 'dawn', sim: 'open', maxTicks: 12000, base: [0, 40, 180, 4], dist: 5, camAz: 322, pitch: -16, hideGun: true },
  'debug-dog-open-rear': { tod: 'noon', sim: 'open', maxTicks: 12000, base: [0, 40, 180, 4], dist: 4.5, spin: 0.2, pitch: -14, hideGun: true },
  // Macro poses at 2 m for anatomy work — steep pitch so the dog CENTERS
  // and fills the frame from the fixed 1.62 m eye height.
  'debug-dog-macro-side': { tod: 'noon', sim: 'open', maxTicks: 12000, base: [0, 40, 180, 4], dist: 2.0, spin: 1.55, pitch: -30, fov: 40, hideGun: true },
  'debug-dog-macro-front': { tod: 'noon', sim: 'open', maxTicks: 12000, base: [0, 40, 180, 4], dist: 2.0, spin: 2.7, pitch: -30, fov: 40, hideGun: true },
  'debug-dog-macro-point': { tod: 'morning', sim: 'point', maxTicks: 30000, base: [0, 40, 180, 4], dist: 2.1, spin: -1.55, pitch: -24, fov: 40, hideGun: true },
  // img2threejs review turntable: the SAME live pointing dog and lighting,
  // isolated from grass/viewmodel so silhouette and orbit diagnostics
  // measure the animal rather than the scene. Absolute camera azimuths
  // are keyed to this deterministic point's 316-degree nose bearing.
  'review-dog-side': { tod: 'morning', sim: 'point', maxTicks: 30000, base: [0, 40, 180, 4], dist: 2.1, camAz: 226, pitch: -30, fov: 32, hideGun: true, isolateDog: true },
  'review-dog-front': { tod: 'morning', sim: 'point', maxTicks: 30000, base: [0, 40, 180, 4], dist: 2.1, camAz: 316, pitch: -24, fov: 32, hideGun: true, isolateDog: true },
  'review-dog-rear': { tod: 'morning', sim: 'point', maxTicks: 30000, base: [0, 40, 180, 4], dist: 2.1, camAz: 136, pitch: -32, fov: 32, hideGun: true, isolateDog: true },
  'review-dog-three-quarter': { tod: 'morning', sim: 'point', maxTicks: 30000, base: [0, 40, 180, 4], dist: 2.1, camAz: 271, pitch: -30, fov: 32, hideGun: true, isolateDog: true },
  // Open-ground review set: all four shots freeze the same deterministic
  // open-ground frame; only the orbit spin changes.
  'review-dog-neutral-side': { tod: 'noon', sim: 'open', maxTicks: 12000, base: [0, 40, 180, 4], dist: 1.05, spin: 1.55, pitch: -48, fov: 40, hideGun: true, isolateDog: true },
  'review-dog-neutral-front': { tod: 'noon', sim: 'open', maxTicks: 12000, base: [0, 40, 180, 4], dist: 1.45, spin: 2.7, pitch: -30, fov: 32, hideGun: true, isolateDog: true },
  'review-dog-neutral-rear': { tod: 'noon', sim: 'open', maxTicks: 12000, base: [0, 40, 180, 4], dist: 1.45, spin: 0.2, pitch: -30, fov: 32, hideGun: true, isolateDog: true },
  'review-dog-neutral-three-quarter': { tod: 'noon', sim: 'open', maxTicks: 12000, base: [0, 40, 180, 4], dist: 1.45, spin: 0.9, pitch: -30, fov: 32, hideGun: true, isolateDog: true },
  // Lower-lens conformation sheet for short-coated breeds. The Setter
  // macro is intentionally steep; this one keeps the GSP wedge, tuck,
  // docked tail, and ground clearance legible in true profile.
  'review-gsp-neutral-side': { tod: 'noon', sim: 'open', maxTicks: 12000, base: [0, 40, 180, 4], dist: 2.0, spin: 1.55, pitch: -25, fov: 34, hideGun: true, isolateDog: true },
  'review-gsp-neutral-front': { tod: 'noon', sim: 'open', maxTicks: 12000, base: [0, 40, 180, 4], dist: 2.0, spin: 2.7, pitch: -25, fov: 34, hideGun: true, isolateDog: true },
  'review-gsp-neutral-three-quarter': { tod: 'noon', sim: 'open', maxTicks: 12000, base: [0, 40, 180, 4], dist: 2.0, spin: 0.9, pitch: -25, fov: 34, hideGun: true, isolateDog: true },
  // Feet-planting witness: mid-stride on visibly SLOPED ground (grade read
  // off window.__dogAudit.slopeAt), framed low and side-on so daylight
  // under a paw — or a buried shin — is unmissable.
  'debug-dog-slope': { tod: 'noon', sim: 'slope', maxTicks: 24000, base: [0, 40, 180, 4], dist: 3.2, spin: 1.55, pitch: -14, hideGun: true },
  // DOG LIGHT AUDIT (moment round, item 5): a ring of 8 dawn captures at
  // 45-degree steps around the locked point. The coat must sit in the
  // scene at EVERY angle — sun-side modeled, shade-side breathing the
  // dawn shadow tint, no angle collapsing to unlit flat white.
  ...Object.fromEntries(
    [0, 45, 90, 135, 180, 225, 270, 315].map((az) => [
      `debug-dog-ring-${az}`,
      { tod: 'dawn', sim: 'point', maxTicks: 30000, base: [0, 40, 180, 4], dist: 4.2, camAz: az, pitch: -13 },
    ]),
  ),
  // THE PLAYER'S HANDS (gun round, append-only) — Firewatch's E3 framing:
  // tools in hand, world beyond. Both shots reuse the existing sim staging
  // (work/point predicates) for the CAMERA, then the appended gun hook
  // below stages the viewmodel state and prints measured mount/recoil/info
  // numbers before the screenshot.
  //   gameplay-walk:  dawn, CARRY — diagonal ready across the lower frame,
  //                   the dog working cover ahead at honest follow range.
  //   gameplay-mount: dawn, MOUNT at the locked point — cheek-weld rib
  //                   view, barrels centered low toward the dog's mark,
  //                   dog and cover ahead past the muzzles.
  //   (iteration 2: walk stages the OPEN-ground cast — cover work buried
  //   the dog to a white speck; mount stands a half-radian off the
  //   dog-bird line so the dog reads BESIDE the rib, not behind it.)
  //   (iteration 3: mount walks in to gun range and stands further off
  //   the line — at 7 m dead astern the dog was a white sliver behind
  //   the rib.)
  'review-gun-carry': { tod: 'dawn', sim: 'open', base: [0, 40, 180, 4], maxTicks: 12000, dist: 7.5, spin: 0.55, pitch: -3, gun: 'carry', gunYawBias: 8 },
  'review-gun-mount': { tod: 'dawn', sim: 'point', base: [0, 40, 180, 4], maxTicks: 30000, dist: 5, spin: -0.65, pitch: -4, gun: 'mount', gunYawBias: 12 },
};

const args = process.argv.slice(2);
const get = (flag, dflt) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : dflt;
};
const baseUrl = get('--url', 'http://localhost:4517');
const outDir = resolve(get('--out', 'docs/3d/shots'));
const coat = get('--coat', 'liver-white');
const breed = get('--breed', 'gsp');
const quality = get('--quality', 'high');
if (!['high', 'lite'].includes(quality)) throw new Error('quality must be high or lite');
const area = get('--area', 'quail-fields');
const drop = get('--drop', '');
const wanted = get(
  '--shots',
  'gameplay-arrival,gameplay-walk,gameplay-point',
).split(',');
const W = Number(get('--width', '1920'));
const H = Number(get('--height', '1080'));

async function main() {
  mkdirSync(outDir, { recursive: true });
  const { url, server } = await startServer(baseUrl);

  const browser = await puppeteer.launch({
    headless: !args.includes('--headed'),
    args: args.includes('--uncapped') ? ['--disable-frame-rate-limit', '--disable-gpu-vsync'] : [],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
    let failed = 0;
    for (const name of wanted) {
      const normalMode = {
        'gameplay-arrival': 'arrival', 'gameplay-walk': 'walk', 'gameplay-point': 'point',
        'gameplay-hunt': 'complete',
      }[name];
      if (normalMode) {
        try {
          const result = await runNormalGameplay(page, {
            url, area, drop: drop || 'south-gate', breed, coat, quality,
            tod: get('--tod', 'morning'), until: normalMode, out: outDir,
            name, width: W, height: H, video: args.includes('--video'),
            maxSeconds: Number(get('--seconds', '240')), uncapped: args.includes('--uncapped'),
          });
          const last = result.checkpoints.filter((c) => c.screenshot).at(-1);
          if (last) copyFileSync(last.screenshot, `${outDir}/${name}.png`);
          if (result.result !== 'passed') failed++;
        } catch (error) { console.error(`${name}: ${error}`); failed++; }
        continue;
      }
      const spec = SHOTS[name];
      if (!spec) {
        console.error(`unknown shot: ${name}`);
        failed++;
        continue;
      }
      const tod = Array.isArray(spec) ? spec[4] : spec.tod;
      await page.goto(
        `${url}/index3d.html?capture=1&tod=${tod}&coat=${encodeURIComponent(coat)}&breed=${encodeURIComponent(breed)}&area=${encodeURIComponent(area)}&quality=${quality}${drop ? `&drop=${encodeURIComponent(drop)}` : ''}`,
        { waitUntil: 'domcontentloaded' },
      );
      await page.waitForFunction('window.__ready3d === true', { timeout: 30000 });
      const bootToken = await page.evaluate(() => (window.__evidenceBootToken = crypto.randomUUID()));
      // Legacy compositions are asset inspections. They share normal hunt
      // spawn/range/pace, but advance a controlled clock and stage a camera.
      // Their labels and manifest must never imply normal gameplay evidence.
      console.log(`asset-review ${name}: controlled clock and staged camera`);
      await page.evaluate(() => {
        const entry = window.__api3d.telemetry().camera;
        window.__captureStep = (ticks) => {
          for (let i = 0; i < ticks; i++) {
            const h = window.__api3d.hunt();
            const walk = h.dog.state !== 'pointing' ? 2.2 / 30 : 0;
            const yaw = entry.yawDeg * Math.PI / 180;
            window.__api3d.setPose(h.hunter.x - Math.sin(yaw) * walk,
              h.hunter.z - Math.cos(yaw) * walk, entry.yawDeg, entry.pitchDeg);
            window.__api3d.stepSim(1);
          }
        };
        window.__api3d.stepSim(1);
      });
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
          (base, mode, maxTicks, dist, spin, camPitch, ptod, fov, camAz, broadsideDog) => {
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
            // Observe the authoritative point across two probes. Foot
            // quality is separate evidence: a contact defect or unavailable
            // audit must not erase the point we are meant to inspect.
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
              const stance = st?.paws?.filter((p) => p.i !== 0) ?? [];
              const planted = stance.length === 3
                ? stance.every((p) => p.gap > -0.06 && p.gap < 0.05)
                : null;
              lastLock = {
                still,
                planted,
                gaps: stance.map((p) => Number(p.gap.toFixed(4))),
              };
              locked = still;
              return locked;
            };
            const scentTarget = {
              'scent-checking': ['checking', 0.35],
              'scent-locating': ['locating', 0.45],
              'scent-stalking': ['stalking', 0.35],
              'scent-locking': ['locking', 0.55],
            }[mode];
            const want =
              scentTarget
                ? (h) => h.dog.scentStage === scentTarget[0] && h.dog.scentProgress >= scentTarget[1]
                : mode === 'point'
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
            // Ordinary reviews skip the opening cast. Scent beats are short,
            // so probe them one authoritative tick at a time from frame 0.
            const initialTicks = scentTarget ? 0 : 240;
            if (initialTicks > 0) window.__captureStep(initialTicks);
            let ticks = initialTicks;
            let h = hunt();
            while (!want(h) && ticks < maxTicks) {
              const step = scentTarget ? 1 : 15;
              window.__captureStep(step);
              ticks += step;
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
            let frameX = h.dog.x;
            let frameZ = h.dog.z;
            if (broadsideDog && window.__dogAudit) {
              window.__api3d.renderOnce();
              const rendered = window.__dogAudit.state();
              const dogYaw = rendered.yaw;
              rx = Math.cos(dogYaw);
              rz = -Math.sin(dogYaw);
              // Frame the interpolated render root, not the latest sim
              // snapshot. Capture can advance thousands of fixed ticks
              // before rendering, so those positions need not coincide.
              frameX = rendered.root.x;
              frameZ = rendered.root.z;
            } else if (camAz !== null) {
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
            const wantedCamX = frameX + rx * dist;
            const wantedCamZ = frameZ + rz * dist;
            const camX = broadsideDog ? wantedCamX : Math.max(-230, Math.min(230, wantedCamX));
            const camZ = broadsideDog ? wantedCamZ : Math.max(-230, Math.min(230, wantedCamZ));
            const vx = frameX - camX;
            const vz = frameZ - camZ;
            const yawDeg = (Math.atan2(-vx, -vz) * 180) / Math.PI;
            window.__api3d.setPose(camX, camZ, yawDeg, camPitch);
            // Explicitly staged asset-review lens, recorded in metadata.
            if (fov && window.__dogAudit) window.__dogAudit.setFov(fov);
            window.__api3d.renderOnce();
            const reached = mode === 'point' ? locked : want(h);
            return {
              dog: h.dog, ticks, reached, lock: lastLock,
              cam: { x: camX, z: camZ, yawDeg }, simMs: h.simMs,
            };
          },
          spec.base, spec.sim, spec.maxTicks, spec.dist, spec.spin ?? 0, spec.pitch ?? 0, tod, spec.fov ?? 0, spec.camAz ?? null, spec.broadsideDog ?? false,
        );
        if (!simInfo.reached) {
          console.error(`  asset-review: ${name} did not observe '${spec.sim}' in ${spec.maxTicks} ticks`);
          failed++;
        }
        console.log(
          `  sim: dog ${simInfo.dog.state}/${simInfo.dog.gait} at (${simInfo.dog.x.toFixed(1)}, ${simInfo.dog.z.toFixed(1)}), ` +
          `cam (${simInfo.cam.x.toFixed(1)}, ${simInfo.cam.z.toFixed(1)}) yaw ${simInfo.cam.yawDeg.toFixed(0)}, ` +
          `sim ${simInfo.simMs.avg.toFixed(3)}ms avg / ${simInfo.simMs.max.toFixed(2)}ms max per tick`,
        );
        if (simInfo.lock && !simInfo.lock.planted) {
          console.warn(simInfo.lock.planted === null
            ? '  CONTACT UNVERIFIED: the current model did not provide three support probes.'
            : '  CONTACT DEFECT: authoritative point exists; supporting paw clearance exceeds tolerance.');
          if (args.includes('--require-contact')) failed++;
        }
        if (simInfo.lock) {
          console.log(
            `  lock: still=${simInfo.lock.still} planted=${simInfo.lock.planted} ` +
            `stance paw gaps [${simInfo.lock.gaps.join(', ')}] m`,
          );
        }
      }
      // GUN STAGING HOOK (gun round, append-only): shots that declare
      // spec.gun stage the viewmodel AFTER the sim/camera staging above.
      // Every claim ships as a number: mount timing and recoil excursion
      // are measured by stepping the SAME integrator update() runs, and
      // the viewmodel's draw-call/triangle cost is a renderer.info DELTA
      // (same frame rendered with the gun hidden, then shown).
      if (spec.gun) {
        const gunInfo = await page.evaluate((mode, yawBias) => {
          if (!window.__gunAudit) return { ok: false, why: 'no __gunAudit handle' };
          // A mounted gun sits dead center — exactly where the generic
          // staging parks the dog. gunYawBias swings the view a few
          // degrees so the dog stands BESIDE the rib, not behind it.
          if (yawBias) {
            const cp = window.__gunAudit.camPose();
            window.__api3d.setPose(cp.x, cp.z, cp.yawDeg + yawBias, cp.pitchDeg);
          }
          const mount = window.__gunAudit.measureMount();
          const recoil = window.__gunAudit.kickProbe();
          window.__gunAudit.setState('carry');
          window.__gunAudit.setVisible(false);
          window.__api3d.renderOnce();
          const without = window.__api3d.info();
          window.__gunAudit.setVisible(true);
          window.__api3d.renderOnce();
          const withGun = window.__api3d.info();
          window.__gunAudit.setState(mode);
          window.__api3d.renderOnce();
          const state = window.__gunAudit.state();
          return {
            ok: true,
            mount,
            recoil,
            state,
            delta: { calls: withGun.calls - without.calls, tris: withGun.triangles - without.triangles },
          };
        }, spec.gun, spec.gunYawBias ?? 0);
        if (!gunInfo.ok) {
          console.error(`  gun: ${name} failed — ${gunInfo.why}`);
          failed++;
        } else {
          console.log(
            `  gun: state=${spec.gun} mountT=${gunInfo.state.mountT.toFixed(2)} ` +
            `mount ${gunInfo.mount.ms.toFixed(1)}ms to 99%, ` +
            `recoil peak ${(gunInfo.recoil.peakZ * 100).toFixed(1)}cm / ${gunInfo.recoil.peakPitchDeg.toFixed(1)}deg, ` +
            `recovered ${gunInfo.recoil.recoverMs.toFixed(0)}ms, ` +
            `cost +${gunInfo.delta.calls} calls / +${gunInfo.delta.tris} tris`,
          );
        }
      }
      if (spec.hideGun) {
        await page.evaluate(() => {
          window.__gunAudit?.setVisible(false);
          window.__api3d.renderOnce();
        });
      }
      if (spec.isolateDog) {
        await page.evaluate(() => {
          window.__dogAudit?.setIsolated(true);
          window.__api3d.renderOnce();
        });
      }
      await new Promise((r) => setTimeout(r, 400)); // settle a few frames
      const file = `${outDir}/${name}.png`;
      const png = await page.screenshot({ path: file });
      const imageMeasurement = await verifyEvidenceImage(page, png, bootToken);
      const metadata = await page.evaluate(() => ({
        telemetry: window.__api3d.telemetry(), hunt: window.__api3d.hunt(),
        dog: window.__dogAudit?.state(),
      }));
      writeFileSync(`${outDir}/${name}.json`, JSON.stringify({
        evidence: 'staged-asset-review', normalGameplayEvidence: false,
        controlledClock: true, stagedCamera: true, spec, area, drop, breed, coat,
        requestedQuality: quality, imageMeasurement, bootToken, ...metadata,
      }, null, 2));
      const info = await page.evaluate(() => window.__api3d.info());
      console.log(`shot ${name} -> ${file} (${info.calls} calls, ${info.triangles} tris)`);
    }
    if (failed > 0) process.exitCode = 1;
  } finally {
    await browser.close();
    if (server) server.kill('SIGTERM');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
