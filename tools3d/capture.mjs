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
 *   node tools3d/capture.mjs --breed english-pointer
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
  // MOMENT ROUND reframe: the capture stages the FULL covey (minCovey
  // gates the locked point onto a real 8+ bird covey, not the 4-bird
  // family the first point finds), launches clustered inside ~0.8 s, and
  // shoots from the hunter's eye JUST OVER THE POINTING DOG'S BACK
  // (~3 m, sideM pulls the eye off the escape line so the break
  // quarters across frame). riseTicks 28: the first birds ~0.9 s out
  // riding the horizon band low (the low-burst law holds them under
  // ~15 deg so they cross COVER and SKY, not empty vault), the last
  // still climbing out of the parted, shaking grass. Probed ticks: 17
  // buries the burst inside the cover mass, 36 scatters the fan — 28 is
  // the beat where the covey hangs together against the sky line.
  // rise-wide stands broadside off the fan's flank and quarters it past
  // the foreground cover; debug-burst (below) witnesses the launch.
  'the-rise': { tod: 'dawn', sim: 'rise', base: [0, 40, 180, 4], maxTicks: 60000, riseTicks: 28, view: 'behind', dist: 3.4, sideM: 1.4, aimK: 0.5, pitchBias: -11, yawBias: 5, fov: 48, minCovey: 8 },
  'rise-wide': { tod: 'dawn', sim: 'rise', base: [0, 40, 180, 4], maxTicks: 60000, riseTicks: 26, view: 'side', dist: 15, aimK: 0.5, pitchBias: 0, yawBias: 0, fov: 55, minCovey: 8 },
  // Burst witness (moment round, item 2): the same rise 8 ticks in —
  // the cover blown OPEN at the origin, debris up, first birds a meter
  // out of the grass. Debug only; evidence that the launch parts cover.
  'debug-burst': { tod: 'dawn', sim: 'rise', base: [0, 40, 180, 4], maxTicks: 60000, riseTicks: 8, view: 'behind', dist: 3.4, sideM: 1.4, aimK: 0.35, pitchBias: -9, yawBias: 5, fov: 48, minCovey: 8 },
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
  'debug-dog-close': { tod: 'dawn', sim: 'point', maxTicks: 30000, base: [0, 40, 180, 4], dist: 3.5, spin: -0.62, pitch: -16, hideGun: true },
  'debug-dog-side': { tod: 'noon', sim: 'point', maxTicks: 30000, base: [0, 40, 180, 4], dist: 4, spin: -1.45, pitch: -14, hideGun: true },
  'debug-dog-work-close': { tod: 'noon', sim: 'work', maxTicks: 12000, base: [0, 40, 180, 4], dist: 6, spin: 0.8, pitch: -8, hideGun: true },
  // One broadside run cycle, phase-locked through the capture audit. These
  // four frames are the locomotion acceptance sheet: rear contact, extended
  // suspension, fore contact, and gathered suspension.
  'review-gallop-rear-contact': { tod: 'noon', sim: 'work', maxTicks: 12000, base: [0, 40, 180, 4], dist: 1.75, spin: 1.55, pitch: -31, fov: 36, hideGun: true, isolateDog: true, broadsideDog: true, gaitPhase: ['gallop', 0.125] },
  'review-gallop-extended': { tod: 'noon', sim: 'work', maxTicks: 12000, base: [0, 40, 180, 4], dist: 1.75, spin: 1.55, pitch: -31, fov: 36, hideGun: true, isolateDog: true, broadsideDog: true, gaitPhase: ['gallop', 0.48] },
  'review-gallop-fore-contact': { tod: 'noon', sim: 'work', maxTicks: 12000, base: [0, 40, 180, 4], dist: 1.75, spin: 1.55, pitch: -31, fov: 36, hideGun: true, isolateDog: true, broadsideDog: true, gaitPhase: ['gallop', 0.55] },
  'review-gallop-gathered': { tod: 'noon', sim: 'work', maxTicks: 12000, base: [0, 40, 180, 4], dist: 1.75, spin: 1.55, pitch: -31, fov: 36, hideGun: true, isolateDog: true, broadsideDog: true, gaitPhase: ['gallop', 0.93] },
  // Three-beat working canter: trailing hind, diagonal pair, lead fore,
  // then suspension. This is the Setter's ordinary cover-search pace.
  'review-canter-trailing-hind': { tod: 'noon', sim: 'work', maxTicks: 12000, base: [0, 40, 180, 4], dist: 1.75, spin: 1.55, pitch: -31, fov: 36, hideGun: true, isolateDog: true, broadsideDog: true, gaitPhase: ['canter', 0.05] },
  'review-canter-diagonal': { tod: 'noon', sim: 'work', maxTicks: 12000, base: [0, 40, 180, 4], dist: 1.75, spin: 1.55, pitch: -31, fov: 36, hideGun: true, isolateDog: true, broadsideDog: true, gaitPhase: ['canter', 0.31] },
  'review-canter-lead-fore': { tod: 'noon', sim: 'work', maxTicks: 12000, base: [0, 40, 180, 4], dist: 1.75, spin: 1.55, pitch: -31, fov: 36, hideGun: true, isolateDog: true, broadsideDog: true, gaitPhase: ['canter', 0.58] },
  'review-canter-suspension': { tod: 'noon', sim: 'work', maxTicks: 12000, base: [0, 40, 180, 4], dist: 1.75, spin: 1.55, pitch: -31, fov: 36, hideGun: true, isolateDog: true, broadsideDog: true, gaitPhase: ['canter', 0.9] },
  // Shared search-to-point acceptance sequence. These freeze the real 2D
  // Dog simulation at the middle of each scent beat; the 3D subsystem only
  // presents that authoritative state.
  'review-scent-checking': { tod: 'noon', sim: 'scent-checking', maxTicks: 30000, base: [0, 40, 180, 4], dist: 2.2, spin: 1.55, pitch: -27, fov: 36, hideGun: true, isolateDog: true, broadsideDog: true },
  'review-scent-locating': { tod: 'noon', sim: 'scent-locating', maxTicks: 30000, base: [0, 40, 180, 4], dist: 2.2, spin: 1.55, pitch: -27, fov: 36, hideGun: true, isolateDog: true, broadsideDog: true },
  'review-scent-stalking': { tod: 'noon', sim: 'scent-stalking', maxTicks: 30000, base: [0, 40, 180, 4], dist: 2.2, spin: 1.55, pitch: -27, fov: 36, hideGun: true, isolateDog: true, broadsideDog: true },
  'review-scent-locking': { tod: 'noon', sim: 'scent-locking', maxTicks: 30000, base: [0, 40, 180, 4], dist: 2.2, spin: 1.55, pitch: -27, fov: 36, hideGun: true, isolateDog: true, broadsideDog: true },
  // Opposite diagonal supports at the trot. These guard against the old
  // four-leg pendulum read even when no reference video is available.
  'review-trot-diagonal-a': { tod: 'noon', sim: 'work', maxTicks: 12000, base: [0, 40, 180, 4], dist: 1.75, spin: 1.55, pitch: -31, fov: 36, hideGun: true, isolateDog: true, broadsideDog: true, gaitPhase: ['trot', 0.1] },
  'review-trot-diagonal-b': { tod: 'noon', sim: 'work', maxTicks: 12000, base: [0, 40, 180, 4], dist: 1.75, spin: 1.55, pitch: -31, fov: 36, hideGun: true, isolateDog: true, broadsideDog: true, gaitPhase: ['trot', 0.6] },
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
  // Neutral/level-tail review set for comparison with the standing-profile
  // reference. All four shots freeze the same deterministic open-ground
  // trot frame; only the orbit spin changes.
  'review-dog-neutral-side': { tod: 'noon', sim: 'open', maxTicks: 12000, base: [0, 40, 180, 4], dist: 1.05, spin: 1.55, pitch: -48, fov: 40, hideGun: true, isolateDog: true, neutralDog: true },
  'review-dog-neutral-front': { tod: 'noon', sim: 'open', maxTicks: 12000, base: [0, 40, 180, 4], dist: 1.45, spin: 2.7, pitch: -30, fov: 32, hideGun: true, isolateDog: true },
  'review-dog-neutral-rear': { tod: 'noon', sim: 'open', maxTicks: 12000, base: [0, 40, 180, 4], dist: 1.45, spin: 0.2, pitch: -30, fov: 32, hideGun: true, isolateDog: true },
  'review-dog-neutral-three-quarter': { tod: 'noon', sim: 'open', maxTicks: 12000, base: [0, 40, 180, 4], dist: 1.45, spin: 0.9, pitch: -30, fov: 32, hideGun: true, isolateDog: true },
  // Lower-lens neutral conformation sheet for short-coated breeds. The
  // Setter macro is intentionally steep; this one keeps the GSP wedge,
  // tuck, docked tail, and ground clearance legible in true profile.
  'review-gsp-neutral-side': { tod: 'noon', sim: 'open', maxTicks: 12000, base: [0, 40, 180, 4], dist: 2.0, spin: 1.55, pitch: -25, fov: 34, hideGun: true, isolateDog: true, neutralDog: true },
  'review-gsp-neutral-front': { tod: 'noon', sim: 'open', maxTicks: 12000, base: [0, 40, 180, 4], dist: 2.0, spin: 2.7, pitch: -25, fov: 34, hideGun: true, isolateDog: true, neutralDog: true },
  'review-gsp-neutral-three-quarter': { tod: 'noon', sim: 'open', maxTicks: 12000, base: [0, 40, 180, 4], dist: 2.0, spin: 0.9, pitch: -25, fov: 34, hideGun: true, isolateDog: true, neutralDog: true },
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
  'gameplay-walk': { tod: 'dawn', sim: 'open', base: [0, 40, 180, 4], maxTicks: 12000, dist: 7.5, spin: 0.55, pitch: -3, gun: 'carry', gunYawBias: 8 },
  'gameplay-mount': { tod: 'dawn', sim: 'point', base: [0, 40, 180, 4], maxTicks: 30000, dist: 5, spin: -0.65, pitch: -4, gun: 'mount', gunYawBias: 12 },
};

const args = process.argv.slice(2);
const get = (flag, dflt) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : dflt;
};
const baseUrl = get('--url', 'http://localhost:4517');
const outDir = resolve(get('--out', 'docs/3d/shots'));
const coat = get('--coat', 'orange-belton');
const breed = get('--breed', 'english-setter');
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
      await page.goto(
        `${url}/index3d.html?capture=1&tod=${tod}&coat=${encodeURIComponent(coat)}&breed=${encodeURIComponent(breed)}`,
        { waitUntil: 'domcontentloaded' },
      );
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
          (base, maxTicks, riseTicks, view, dist, aimK, pitchBias, yawBias, sideM, ptod, fov, minCovey) => {
            window.__api3d.setTod(ptod);
            window.__api3d.setPose(...base);
            const hunt = () => window.__api3d.hunt();
            // Locked-point gate — the round-9 predicate — PLUS the moment-
            // round covey gate: the rise stages a REAL covey (minCovey+
            // hidden birds), so the sim runs on past any small-family
            // point until the dog pins one worth the store-page frame.
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
            let flushedThrough = 0;
            while (ticks < maxTicks) {
              // Covey gate (moment round, item 2): a point on a small
              // family gets FLUSHED THROUGH — walk in, blow it, let the
              // sky clear (800 ticks > MAX_AIR) and hunt on until the
              // dog pins the real 8+ bird covey worth the frame.
              if (
                minCovey > 0 && window.__riseAudit && h.dog.state === 'pointing' &&
                window.__riseAudit.pointedCoveySize() > 0 &&
                window.__riseAudit.pointedCoveySize() < minCovey
              ) {
                const small = window.__api3d.triggerFlush();
                if (small) {
                  flushedThrough++;
                  window.__api3d.stepSim(800);
                  ticks += 800;
                  h = hunt();
                  lpx = null;
                  continue;
                }
              }
              if (lockedPoint(h)) break;
              window.__api3d.stepSim(15);
              ticks += 15;
              h = hunt();
            }
            const census = window.__riseAudit ? window.__riseAudit.census() : [];
            if (!locked) return { ok: false, why: 'no locked point (covey gate?)', census };
            const dogX = h.dog.x;
            const dogZ = h.dog.z;
            const flush = window.__api3d.triggerFlush();
            if (!flush) return { ok: false, why: 'triggerFlush returned null', census };
            // Field time holds its breath; only the rise plays.
            window.__api3d.stepRise(riseTicks);
            const birds = window.__api3d.birds();
            const flying = birds.filter((b) => b.status === 'flying');
            if (flying.length === 0) return { ok: false, why: 'no birds airborne', birds, census };
            const rise = window.__riseAudit ? window.__riseAudit.rise() : null;
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
            // The launch origin anchors the framing; the live centroid
            // only steers the aim height and the fan direction.
            const ox = rise ? rise.originX : cx;
            const oz = rise ? rise.originZ : cz;
            let camX;
            let camZ;
            if (view === 'behind') {
              // MOMENT ROUND, item 3: the hunter's eye JUST OVER THE
              // POINTING DOG'S BACK — pulled sideM off the dog->origin
              // line (a hunter swings around the point, never straddles
              // the dog), so the break quarters ACROSS the frame instead
              // of foreshortening straight away. The dog's rump and flag
              // hold the frame bottom, the covey explodes at the cover
              // edge 12-18 m ahead.
              let dx = ox - dogX;
              let dz = oz - dogZ;
              const l = Math.hypot(dx, dz) || 1;
              dx /= l;
              dz /= l;
              camX = dogX - dx * dist - dz * sideM;
              camZ = dogZ - dz * dist + dx * sideM;
            } else {
              // Broadside of the escape bearing at the origin: the fan
              // CROSSES the frame, quartering past the foreground cover.
              const ex = rise ? rise.escX : (cx - dogX) / (Math.hypot(cx - dogX, cz - dogZ) || 1);
              const ez = rise ? rise.escZ : (cz - dogZ) / (Math.hypot(cx - dogX, cz - dogZ) || 1);
              // Stand off the MID-FLIGHT point's flank (origin + 8 m down
              // the bearing), square to the fan — iteration 2 planted the
              // camera in the fan's path and a bird filled a sixth of the
              // frame like a moth. Of the two flanks, take the one with
              // more room inside the ±230 world clamp (this seed's covey
              // lives at the west edge; the west flank clamps).
              const mx = ox + ex * 8;
              const mz = oz + ez * 8;
              const margin = (x, z) =>
                Math.min(230 - Math.abs(x), 230 - Math.abs(z));
              const c1 = { x: mx + ez * dist, z: mz - ex * dist };
              const c2 = { x: mx - ez * dist, z: mz + ex * dist };
              const pick = margin(c1.x, c1.z) >= margin(c2.x, c2.z) ? c1 : c2;
              camX = pick.x;
              camZ = pick.z;
            }
            camX = Math.max(-230, Math.min(230, camX));
            camZ = Math.max(-230, Math.min(230, camZ));
            // Aim between the origin's cover edge and the live fan so the
            // birds ride the MIDDLE BAND; yawBias slides the fan across
            // frame for the left-to-right crossing read.
            const ax = ox + (cx - ox) * 0.6;
            const az = oz + (cz - oz) * 0.6;
            const vx = ax - camX;
            const vz = az - camZ;
            const yawDeg = (Math.atan2(-vx, -vz) * 180) / Math.PI + yawBias;
            const horiz = Math.hypot(vx, vz);
            // Terrain-aware aim (iteration 2: absolute-y aim stared into
            // empty sky on elevated ground): eye = terrain + 1.62 at the
            // camera, target = a point partway up the covey's height ABOVE
            // ITS OWN GROUND, so the explosion sits mid-frame and the dog
            // and cover line hold the lower third.
            const hAt = (x, z) => (window.__dogAudit ? window.__dogAudit.heightAt(x, z) : 0);
            const eyeY = hAt(camX, camZ) + 1.62;
            const aimY = hAt(ax, az) + (cy - hAt(cx, cz)) * aimK;
            const pitchDeg = (Math.atan2(aimY - eyeY, horiz) * 180) / Math.PI + pitchBias;
            window.__api3d.setPose(camX, camZ, yawDeg, pitchDeg);
            if (fov && window.__dogAudit) window.__dogAudit.setFov(fov);
            window.__api3d.renderOnce();
            // Projected-size telemetry (moment round, item 1): a bird at
            // 15-25 m must span ~18-30 px at this camera — measured, not
            // claimed. sizeM comes from the birds subsystem (scaled span).
            const fovDeg = fov || 70;
            const pxPerM = (d) => 270 / (Math.tan(((fovDeg / 2) * Math.PI) / 180) * d);
            for (const b of birds) {
              const d = Math.hypot(b.x - camX, b.y - (eyeY), b.z - camZ);
              b.camDist = d;
              b.spanPx = (b.sizeM ?? 0) * pxPerM(d);
            }
            return {
              ok: true,
              flush,
              birds,
              census,
              rise,
              dog: { x: dogX, z: dogZ, state: h.dog.state },
              cam: { x: camX, z: camZ, yawDeg: yawDeg, pitchDeg: pitchDeg },
              ticks,
              simMs: hunt().simMs,
            };
          },
          spec.base, spec.maxTicks, spec.riseTicks, spec.view, spec.dist,
          spec.aimK ?? 0.55, spec.pitchBias ?? 0, spec.yawBias ?? 0, spec.sideM ?? 0, tod, spec.fov ?? 0,
          spec.minCovey ?? 0,
        );
        if (!riseInfo.ok) {
          console.error(`  rise: ${name} failed — ${riseInfo.why}`);
          if (riseInfo.census) {
            console.error(`  census: ${riseInfo.census.map((c) => `covey ${c.coveyId}: ${c.n}`).join(', ')}`);
          }
          failed++;
        } else {
          console.log(`  census: ${riseInfo.census.map((c) => `covey ${c.coveyId}: ${c.n}`).join(', ')}`);
          if (riseInfo.rise) {
            console.log(
              `  origin (${riseInfo.rise.originX.toFixed(1)}, ${riseInfo.rise.originZ.toFixed(1)}) ` +
              `esc (${riseInfo.rise.escX.toFixed(2)}, ${riseInfo.rise.escZ.toFixed(2)})`,
            );
          }
          console.log(
            `  rise: ${riseInfo.birds.length} staged, walk-in ${riseInfo.flush.distPx.toFixed(1)}px, ` +
            `covey [${riseInfo.flush.ids.join(',')}], dog held at (${riseInfo.dog.x.toFixed(1)}, ${riseInfo.dog.z.toFixed(1)})`,
          );
          for (const b of riseInfo.birds) {
            console.log(
              `    bird ${b.simId}: ${b.status} at (${b.x.toFixed(1)}, ${b.y.toFixed(1)}, ${b.z.toFixed(1)}) air ${b.airMs.toFixed(0)}ms` +
              (b.camDist !== undefined ? ` dist ${b.camDist.toFixed(1)}m span ${b.spanPx.toFixed(1)}px` : ''),
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
            if (initialTicks > 0) window.__api3d.stepSim(initialTicks);
            let ticks = initialTicks;
            let h = hunt();
            while (!want(h) && ticks < maxTicks) {
              const step = scentTarget ? 1 : 15;
              window.__api3d.stepSim(step);
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
          spec.base, spec.sim, spec.maxTicks, spec.dist, spec.spin ?? 0, spec.pitch ?? 0, tod, spec.fov ?? 0, spec.camAz ?? null, spec.broadsideDog ?? false,
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
      if (spec.neutralDog) {
        await page.evaluate(() => {
          window.__dogAudit?.setReviewNeutral(true);
          window.__api3d.renderOnce();
        });
      }
      if (spec.gallopPhase !== undefined) {
        await page.evaluate((cycle) => {
          window.__dogAudit?.setGallopPhase(cycle);
          window.__api3d.renderOnce();
        }, spec.gallopPhase);
      }
      if (spec.gaitPhase !== undefined) {
        await page.evaluate(([gait, cycle]) => {
          window.__dogAudit?.setLocomotionPhase(gait, cycle);
          window.__api3d.renderOnce();
        }, spec.gaitPhase);
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
