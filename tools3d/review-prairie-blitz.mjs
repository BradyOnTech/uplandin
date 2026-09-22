#!/usr/bin/env node
/** Matched normal-lens environment inspections, separate from ordinary-input
 * walking evidence. Run against an immutable production preview.
 * node tools3d/review-prairie-blitz.mjs --url http://localhost:4621 --label before
 * Add --walk for input-driven approach/retreat recordings; --quality lite.
 */
import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { verifyEvidenceImage } from './evidence-image.mjs';
import { startBrowserRecording } from './browser-recording.mjs';

const args = process.argv.slice(2);
const arg = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const base = arg('--url', 'http://localhost:4621').replace(/\/$/, '');
const label = arg('--label', 'before');
const quality = arg('--quality', 'high');
const tod = arg('--tod', 'morning');
assert.ok(['dawn', 'morning', 'noon', 'evening', 'lastlight'].includes(tod));
const out = resolve(arg('--out', 'artifacts/3d/prairie-blitz'));
const areaFilter = arg('--area', 'both');
const mobile = args.includes('--mobile');
assert.ok(['high', 'lite'].includes(quality));
const maps = [
  { area: 'quail-fields', drop: { x: 504, y: 658 }, views: [
    { name: 'entry-plum-shoulder', at: [510, 565], toward: [549, 562], pitch: -6 },
    { name: 'drainage-crossing', at: [640, 346], toward: [698, 291], pitch: -4 },
    { name: 'windmill-return', at: [882, 300], toward: [828, 217], pitch: -3 },
  ] },
  { area: 'sharptail-prairie', drop: { x: 675.01089527132, y: 762.8057071324438 }, views: [
    { name: 'south-grass-shoulder', at: [672, 576], toward: [868, 528], pitch: -4 },
    { name: 'windbreak-approach', at: [896, 304], toward: [1024, 300], pitch: -3 },
    { name: 'prairie-return', at: [1190, 448], toward: [1008, 496], pitch: -4 },
  ] },
].filter(map => areaFilter === 'both' || map.area === areaFilter);
assert.ok(maps.length, 'Unknown map');
mkdirSync(out, { recursive: true });
assert.ok(!/\/@vite|\/src\/main3d/.test(await fetch(`${base}/index3d.html`).then(r => r.text())), 'Use a production preview');
const viewport = mobile ? { width: 844, height: 390, deviceScaleFactor: 1, isMobile: true, hasTouch: true } : { width: 1440, height: 810 };
const report = { label, base, quality, viewport, seed: 1184004868, tod, fov: 70,
  startedAt: new Date().toISOString(), inspections: [], walks: [], errors: [], result: 'running',
  limitations: ['Fixed camera inspections use ordinary FOV70 but staged positions; they are not playthrough evidence.',
    'Input walks use real keyboard/mouse input after an ordinary spawn; no bird state, time, speed or camera setters are used.',
    'Desktop/emulated viewport evidence does not establish phone performance or full-hunt acceptance.'] };
const reportPath = `${out}/${label}-${quality}${mobile ? '-mobile' : ''}.json`;
const save = () => writeFileSync(reportPath, JSON.stringify(report, null, 2));
const browser = await puppeteer.launch({ headless: true });
report.browser = await browser.version();
let page;
async function open(map) {
  if (page) await page.close();
  page = await browser.newPage();
  await page.setViewport(viewport);
  page.on('pageerror', e => report.errors.push(String(e)));
  page.on('console', msg => { if (msg.type() === 'error') report.errors.push(msg.text()); });
  const query = new URLSearchParams({ area: map.area, drop: 'south-gate', quality, tod: report.tod,
    dog: 'generated', breed: 'gsp', seed: String(report.seed), challenge: 'balanced', ...(mobile ? { input: 'touch' } : {}) });
  await page.goto(`${base}/index3d.html?${query}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__ready3d === true, { timeout: 90000 });
  await page.bringToFront();
  const token = await page.evaluate(() => (window.__evidenceBootToken = crypto.randomUUID()));
  await page.click('#enter-field');
  if (!mobile) await page.waitForFunction(() => document.pointerLockElement?.tagName === 'CANVAS');
  return token;
}
async function shot(name, token) {
  const file = `${label}-${quality}${mobile ? '-mobile' : ''}-${name}.png`;
  const png = await page.screenshot({ path: `${out}/${file}` });
  const measurement = await verifyEvidenceImage(page, png, token);
  const state = await page.evaluate(() => ({ telemetry: window.__api3d.telemetry(), render: window.__api3d.info() }));
  return { file, measurement, ...state };
}
try {
  for (const map of maps) {
    report.phase = `inspections ${map.area}`; save();
    const token = await open(map);
    for (const view of map.views) {
      const x = (view.at[0] - map.drop.x) * .9144;
      const z = (view.at[1] - map.drop.y) * .9144 + 40;
      const yaw = Math.atan2(-(view.toward[0] - view.at[0]), -(view.toward[1] - view.at[1])) * 180 / Math.PI;
      await page.evaluate(({ x, z, yaw, pitch }) => { window.__api3d.setPose(x, z, yaw, pitch); window.__api3d.renderOnce(); }, { x, z, yaw, pitch: view.pitch });
      // Allow culling/LOD to settle at the inspection position.
      await new Promise(done => setTimeout(done, 650));
      const image = await shot(`${map.area}-${view.name}`, token);
      assert.equal(image.telemetry.camera.fov, 70);
      report.inspections.push({ area: map.area, purpose: 'staged-environment-inspection', ...view, image }); save();
    }
    if (args.includes('--walk') && !mobile) {
      report.phase = `ordinary input walk ${map.area}`; save();
      const walkToken = await open(map);
      const file = `${label}-${quality}-${map.area}-ordinary-walk.mp4`;
      const recording = await startBrowserRecording(page, `${out}/${file}`, { width: 1280, height: 720, fps: 15 });
      const walk = { area: map.area, purpose: 'ordinary-input-approach-retreat', file, trace: [], images: [] };
      report.walks.push(walk);
      walk.images.push(await shot(`${map.area}-normal-spawn`, walkToken));
      for (const [key, seconds] of [['w', 16], ['s', 16]]) {
        await page.keyboard.down(key);
        for (let sec = 0; sec < seconds; sec++) {
          await new Promise(done => setTimeout(done, 1000));
          const state = await page.evaluate(() => ({ telemetry: window.__api3d.telemetry(), hunt: window.__api3d.hunt() }));
          assert.equal(state.telemetry.paused, false); walk.trace.push({ key, sec, camera: state.telemetry.camera, dog: state.hunt.dog, tally: state.hunt.tally });
        }
        await page.keyboard.up(key);
        walk.images.push(await shot(`${map.area}-normal-${key === 'w' ? 'approached' : 'returned'}`, walkToken));
      }
      walk.recording = await recording.stop();
      const first = walk.trace[0].camera, furthest = walk.trace[15].camera;
      walk.outboundMeters = Math.hypot(first.x - furthest.x, first.z - furthest.z);
      assert.ok(walk.outboundMeters > 25, `Entry walk blocked: ${walk.outboundMeters}m`);
      save();
    }
  }
  assert.deepEqual(report.errors, []);
  report.result = 'passed';
} catch (error) { report.result = 'failed'; report.failure = String(error); process.exitCode = 1; }
finally { report.finishedAt = new Date().toISOString(); save(); await browser.close(); }
console.log(JSON.stringify({ result: report.result, failure: report.failure, inspections: report.inspections.length, walks: report.walks.length, reportPath }));
