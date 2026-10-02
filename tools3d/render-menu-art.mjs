#!/usr/bin/env node
// Renders the menu art in public/art/menus3d from the running game, so the
// menus show the game as it is rather than painted or stale frames:
//
//   grounds  one card per core ground: a dog on point out in the ground's own
//            cover. Cameras are scored all round the point at low resolution
//            (is the dog actually visible, lit and facing us?) and the best is
//            rendered full size.
//   title    the home backdrop: a setter on point in Sharptail's bluestem at
//            evening, wide, under the evening clouds.
//   dogs     every breed, look and coat on point, from the dog portrait page.
//
// Start a dev server first (npm run dev), then:
//   npm run art:menus -- --url http://localhost:5173 [--only grounds|title|dogs] [--chrome /path/to/chrome]
// Software rendering takes a few minutes per ground; a GPU is much quicker.
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const args = process.argv.slice(2), arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback;
};
const BASE = arg('url', 'http://localhost:5173').replace(/\/$/, '');
const ONLY = arg('only', 'grounds,title,dogs').split(',');
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'art', 'menus3d');
const chrome = arg('chrome', process.env.PUPPETEER_EXECUTABLE_PATH);

// The frames chosen in October 2026. Seeds keep a ground's hunt, and so its
// points, the same from run to run of the same build.
const GROUNDS = [
  { area: 'pheasant-coverts', tod: 'morning', breed: 'gsp', coat: 'liver-white', seed: 11, minVisible: 0 },
  { area: 'sharptail-prairie', tod: 'morning', breed: 'gsp', coat: 'solid-liver', seed: 41, minVisible: .3 },
  { area: 'quail-fields', tod: 'morning', breed: 'english-setter', coat: 'tricolor', seed: 31, minVisible: .3 },
  { area: 'chukar-ridge', tod: 'morning', breed: 'gsp', coat: 'liver-roan', seed: 24, minVisible: 0 },
];
const TITLE = { area: 'sharptail-prairie', tod: 'evening', breed: 'english-setter', coat: 'orange-belton', seed: 12 };
const COATS = { 'english-setter': ['orange-belton', 'blue-belton', 'tricolor', 'liver-belton', 'lemon-belton'],
  gsp: ['liver-roan', 'liver-white', 'solid-liver', 'black-roan'] };
const DEFAULT_COAT = { 'english-setter': 'orange-belton', gsp: 'liver-white' };
const DEFAULT_LOOK = { 'english-setter': 'faceted', gsp: 'smooth' };

const browser = await puppeteer.launch({ ...(chrome ? { executablePath: chrome } : {}), protocolTimeout: 1800000,
  args: ['--no-sandbox', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
mkdirSync(join(OUT, 'dogs'), { recursive: true });

/** Open a hunt paused with the gun out of shot; returns the page and its sun. */
async function openHunt({ area, tod, breed, coat, seed }) {
  const page = await browser.newPage(); await page.setViewport({ width: 480, height: 270 });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.goto(`${BASE}/index3d.html?area=${area}&quality=high&tod=${tod}&capture=1&dog=generated&breed=${breed}&coat=${coat}&seed=${seed}&challenge=loaded`,
    { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction(() => window.__ready3d === true, { timeout: 600000, polling: 250 });
  await page.evaluate(() => { window.__api3d.pause(true); window.__gunAudit?.setVisible(false); });
  const sun = await page.evaluate(async ({ area, tod }) => {
    const { fieldTimeOfDay } = await import('/src/three/palette.ts');
    return fieldTimeOfDay(area, tod).sunAzimuth * Math.PI / 180;
  }, { area, tod });
  return { page, sunAz: sun };
}

/** Walk on behind the dog until it points where `accept` allows. */
async function nextPoint(page, accept) {
  for (let chunk = 0; chunk < 80; chunk++) {
    const found = await page.evaluate(accept => {
      const api = window.__api3d, audit = window.__dogAudit, ok = new Function('h', 'cover', `return ${accept}`);
      for (let i = 0; i < 1800; i++) {
        const h = api.hunt();
        if (h.dog.state === 'pointing' && ok(h, audit?.coverAt(h.dog.x, h.dog.z) ?? 0)) return { heading: h.dog.heading };
        const tx = h.dog.x - Math.cos(h.dog.heading) * 14, tz = h.dog.z - Math.sin(h.dog.heading) * 14;
        const ex = tx - h.hunter.x, ez = tz - h.hunter.z, d = Math.hypot(ex, ez);
        const a = Math.atan2(-ex, -ez), v = d > 30 ? 1.6 : d > 4 ? .9 : 0;
        api.setPose(h.hunter.x - Math.sin(a) * v / 30, h.hunter.z - Math.cos(a) * v / 30, a * 180 / Math.PI, -4);
        api.stepSim(1);
      }
      return null;
    }, accept);
    if (!found) continue;
    // Let the point set, then read where the dog stands (the presentation
    // root only moves when a frame updates).
    const dog = await page.evaluate(() => {
      window.__api3d.stepSim(45); window.__api3d.renderOnce();
      const s = window.__dogAudit.state(); return { x: s.root.x, y: s.root.y, z: s.root.z, state: s.state };
    });
    if (dog.state === 'pointing') return { ...dog, heading: found.heading };
  }
  throw new Error('No point found');
}

/** Stand the camera `r` m from the dog along `phi`, aimed `aim` m over its
 * feet and `lookUp` degrees above that. Several frames let the streamed
 * cover round the camera fill in before the picture is taken. */
async function frame(page, dog, { phi, r, lift, lookUp, fov = 40, aim = .55, frames = 8 }) {
  await page.evaluate(({ dog, phi, r, lift, lookUp, fov, aim, frames }) => {
    const api = window.__api3d, cx = dog.x + Math.cos(phi) * r, cz = dog.z + Math.sin(phi) * r;
    window.__dogAudit.setFov(fov);
    const yaw = Math.atan2(-(dog.x - cx), -(dog.z - cz)) * 180 / Math.PI;
    api.setPose(cx, cz, yaw, 0, lift);
    const eye = api.telemetry().camera.y;
    api.setPose(cx, cz, yaw, Math.atan2(dog.y + aim - eye, r) * 180 / Math.PI + lookUp, lift);
    for (let i = 0; i < frames; i++) api.renderOnce();
  }, { dog, phi, r, lift, lookUp, fov, aim, frames });
}

/** Share of the dog's screen box that changes when the dog is hidden. */
function visibility(page, dog, camera) {
  return page.evaluate(({ dog, camera }) => {
    const api = window.__api3d, audit = window.__dogAudit, canvas = document.getElementById('game3d');
    const gl = canvas.getContext('webgl2'), W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
    const shown = new Uint8Array(W * H * 4), hidden = new Uint8Array(W * H * 4);
    const { phi, r, lift, lookUp } = camera, cx = dog.x + Math.cos(phi) * r, cz = dog.z + Math.sin(phi) * r;
    audit.setFov(40);
    const yaw = Math.atan2(-(dog.x - cx), -(dog.z - cz)) * 180 / Math.PI;
    api.setPose(cx, cz, yaw, 0, lift);
    api.setPose(cx, cz, yaw, Math.atan2(dog.y + .55 - api.telemetry().camera.y, r) * 180 / Math.PI + lookUp, lift);
    audit.setBodyVisible(true); api.renderOnce(); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, shown);
    audit.setBodyVisible(false); api.renderOnce(); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, hidden);
    audit.setBodyVisible(true);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [ox, oy, oz] of [[-.45, .1, -.45], [.45, .1, .45], [-.45, .75, .45], [.45, .75, -.45], [0, .95, 0], [.45, .1, -.45], [-.45, .1, .45]]) {
      const p = audit.project(dog.x + ox, dog.y + oy, dog.z + oz);
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
    }
    const sx = W / canvas.clientWidth, sy = H / canvas.clientHeight;
    const bx0 = Math.max(0, Math.floor(x0 * sx)), bx1 = Math.min(W - 1, Math.ceil(x1 * sx));
    const by0 = Math.max(0, Math.floor(H - y1 * sy)), by1 = Math.min(H - 1, Math.ceil(H - y0 * sy));
    let changed = 0, area = 0;
    for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) {
      const i = (y * W + x) * 4; area++;
      if (Math.abs(shown[i] - hidden[i]) + Math.abs(shown[i + 1] - hidden[i + 1]) + Math.abs(shown[i + 2] - hidden[i + 2]) > 24) changed++;
    }
    return area ? changed / area : 0;
  }, { dog, camera });
}

if (ONLY.includes('grounds')) for (const ground of GROUNDS) {
  const { page, sunAz } = await openHunt(ground);
  for (;;) {
    // Out in the ground's own cover: away from the truck, not deep in a stand.
    const dog = await nextPoint(page, 'Math.hypot(h.dog.x - h.hunter.x, h.dog.z - h.hunter.z) > 9 && Math.hypot(h.dog.x, h.dog.z - 40) > 70 && cover < .6');
    const cameras = [];
    for (let k = 0; k < 12; k++) for (const r of [3.8, 6.2]) {
      const phi = k * Math.PI / 6, camera = { phi, r, lift: r < 5 ? -.7 : -.55, lookUp: 3 };
      const lit = Math.cos(phi) * Math.sin(sunAz) + Math.sin(phi) * Math.cos(sunAz), face = Math.cos(phi - dog.heading);
      const visible = await visibility(page, dog, camera);
      cameras.push({ camera, visible, score: 2.2 * Math.min(visible, .55) / .55 + .8 * Math.max(0, lit) + .5 * face + (r < 5 ? .15 : 0) });
    }
    cameras.sort((a, b) => b.score - a.score);
    // A dog under a thicket or deep in a stand is no picture: find another point.
    if (Math.max(...cameras.map(c => c.visible)) < ground.minVisible) {
      await page.evaluate(() => { window.__api3d.triggerFlush(); window.__api3d.stepSim(300); });
      continue;
    }
    await page.setViewport({ width: 1280, height: 720 });
    await frame(page, dog, cameras[0].camera);
    await page.screenshot({ path: join(OUT, `${ground.area}.webp`), type: 'webp', quality: 86 });
    console.log('ground', ground.area, JSON.stringify({ visible: +cameras[0].visible.toFixed(2), score: +cameras[0].score.toFixed(2) }));
    break;
  }
  await page.close();
}

if (ONLY.includes('title')) {
  const { page } = await openHunt(TITLE);
  const dog = await nextPoint(page, 'Math.hypot(h.dog.x - h.hunter.x, h.dog.z - h.hunter.z) > 9 && cover < .55');
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 2 });
  await frame(page, dog, { phi: dog.heading + 35 * Math.PI / 180, r: 11, lift: -.2, lookUp: 4, fov: 42, aim: .62 });
  await page.screenshot({ path: join(OUT, 'title-landscape.webp'), type: 'webp', quality: 80 });
  console.log('title');
  await page.close();
}

if (ONLY.includes('dogs')) {
  const page = await browser.newPage(); await page.setViewport({ width: 600, height: 400, deviceScaleFactor: 1 });
  const shoot = async (breed, look, coat, name) => {
    await page.goto(`${BASE}/tools3d/dog-portrait.html?breed=${breed}&style=${look}&coat=${coat}&pose=point&noground`, { waitUntil: 'load', timeout: 180000 });
    await page.waitForFunction(() => window.dogPortraitReady === true, { timeout: 300000, polling: 200 });
    await new Promise(resolve => setTimeout(resolve, 1200));
    await page.screenshot({ path: join(OUT, 'dogs', `${name}.webp`), type: 'webp', quality: 88, omitBackground: true });
  };
  for (const breed of Object.keys(COATS)) for (const look of ['faceted', 'smooth']) {
    for (const coat of COATS[breed]) await shoot(breed, look, coat, `${breed}-${look}-${coat}`);
    await shoot(breed, look, DEFAULT_COAT[breed], `${breed}-${look}`);
  }
  for (const breed of Object.keys(COATS)) await shoot(breed, DEFAULT_LOOK[breed], DEFAULT_COAT[breed], breed);
  console.log('dogs');
  await page.close();
}
if (!existsSync(OUT)) throw new Error(`Missing ${OUT}`);
await browser.close();
