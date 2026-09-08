#!/usr/bin/env node
/** Matched staged environment views and separate ordinary-input entrance walks.
 * node tools3d/review-quail-access.mjs --url http://localhost:4173 --label before
 */
import puppeteer from 'puppeteer';
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { verifyEvidenceImage } from './evidence-image.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const base = option('--url', 'http://localhost:4173').replace(/\/$/, '');
const out = resolve(option('--out', 'artifacts/3d/quail-access'));
const label = option('--label', 'before');
const changedScheduler = args.includes('--uncapped');
mkdirSync(out, { recursive: true });
const html = await fetch(`${base}/index3d.html`).then(response => { assert.ok(response.ok); return response.text(); });
assert.ok(!/\/@vite|\/src\/main3d/.test(html), 'Use an immutable production preview.');
// Matched inspection contract: these drop anchors and the yard-to-meter
// conversion are unchanged by the access pass. Avoid loading mutable source
// modules while a different immutable build supplies the rendered evidence.
const drops = { 'south-gate': { x: 504, y: 658, heading: -Math.PI / 2 }, 'west-track': { x: 42, y: 406, heading: 0 } };
const propertyToWorld = (dropId, point) => ({ x: (point.x - drops[dropId].x) * 0.9144, z: (point.y - drops[dropId].y) * 0.9144 + 40 });
const report = { evidence: 'quail-access-review', label, base, startedAt: new Date().toISOString(),
  viewport: { width: 1920, height: 1080 }, quality: 'high', fov: 70, tod: 'noon',
  changedScheduler, performanceEligible: false,
  limitations: ['Staged environment inspections are not gameplay evidence.', 'Ordinary input walks navigate around the parked truck and stay inside the closed property boundary.', 'No performance, full-hunt or human-usability claim.'],
  navigationContract: { drops, metersPerPropertyUnit: 0.9144, anchor: { x: 0, z: 40 } },
  inspections: [], walks: [], errors: [], result: 'running' };
if (changedScheduler) report.limitations.push('Uses --disable-frame-rate-limit after intermittent native RAF stalls with default scheduling. Functional visual/input evidence only; it does not establish default-browser performance or resolve the scheduling cause.');
const browser = await puppeteer.launch({ headless: !args.includes('--headed'), args: changedScheduler ? ['--disable-frame-rate-limit'] : [] });
report.browser = await browser.version(); report.launchArgs = browser.process()?.spawnargs;
let page;
const save = () => writeFileSync(`${out}/${label}.json`, JSON.stringify(report, null, 2));
async function waitFor(predicate, timeout = 60000) {
  const start = Date.now();
  while (!(await page.evaluate(predicate))) {
    if (Date.now() - start > timeout) throw new Error(`Browser predicate timed out after ${timeout}ms in ${report.phase}`);
    await new Promise(done => setTimeout(done, 250));
  }
}
const read = () => page.evaluate(() => ({ token: window.__evidenceBootToken, ready: window.__ready3d, telemetry: window.__api3d.telemetry() }));
const closePage = async () => { if (page) { await page.close(); page = undefined; } };
async function open(drop, staged) {
  report.phase = `open ${drop} ${staged ? 'staged' : 'ordinary'}`; save();
  await closePage(); page = await browser.newPage(); await page.setViewport(report.viewport); await page.bringToFront();
  page.on('pageerror', error => report.errors.push(String(error)));
  const query = new URLSearchParams({ area: 'quail-fields', drop, quality: 'high', tod: 'noon', breed: 'gsp', coat: 'liver-white' });
  await page.goto(`${base}/index3d.html?${query}`, { waitUntil: 'domcontentloaded' });
  await waitFor(() => window.__ready3d === true);
  const token = await page.evaluate(() => (window.__evidenceBootToken = crypto.randomUUID()));
  const scripts = await page.evaluate(() => performance.getEntriesByType('resource').map(entry => entry.name).filter(name => /\.js(?:[?#]|$)/.test(name)));
  if (staged) {
    await page.bringToFront(); await page.click('#enter-field');
    await waitFor(() => document.pointerLockElement?.tagName === 'CANVAS', 5000);
  }
  return { token, scripts };
}
async function shot(name, token) {
  report.phase = `screenshot ${name}`; save();
  const path = `${out}/${label}-${name}.png`; const png = await page.screenshot({ path });
  return { file: path.split('/').at(-1), measurement: await verifyEvidenceImage(page, png, token), ...(await read()).telemetry };
}

try {
  const views = [
    { name: 'south-compound-outward', drop: 'south-gate', property: { x: 504, y: 642 }, target: { x: 504, y: 685 }, pitch: -4 },
    { name: 'west-compound-outward', drop: 'west-track', property: { x: 58, y: 406 }, target: { x: 15, y: 406 }, pitch: -4 },
    { name: 'north-branch-junction', drop: 'south-gate', property: { x: 646, y: 352 }, target: { x: 660, y: 336 }, pitch: -15 },
    { name: 'south-return-junction', drop: 'south-gate', property: { x: 540, y: 486 }, target: { x: 540, y: 469 }, pitch: -14 },
  ];
  for (const view of views) {
    const boot = await open(view.drop, true);
    const world = propertyToWorld(view.drop, view.property);
    const yaw = Math.atan2(-(view.target.x - view.property.x), -(view.target.y - view.property.y)) * 180 / Math.PI;
    await page.evaluate(({ world, yaw, pitch }) => { window.__api3d.setPose(world.x, world.z, yaw, pitch); window.__api3d.renderOnce(); }, { world, yaw, pitch: view.pitch });
    const image = await shot(`staged-${view.name}`, boot.token);
    assert.equal(image.camera.fov, 70);
    report.inspections.push({ purpose: 'staged-environment-inspection', ...view, ...boot, image });
  }
  if (!args.includes('--staged-only')) for (const dropId of ['south-gate', 'west-track']) {
    const boot = await open(dropId, false);
    const drop = drops[dropId]; const origin = propertyToWorld(dropId, drop);
    // Meter offsets from the unchanged drop. Four meters to the right avoids
    // the pickup. Recenter before the inset gate; never cross the outer fence.
    const offsets = [[10, 0, 'entered-field'], [5, 4], [-8, 4], [-8, 0], [-24, 0, 'outbound'], [-8, 0], [-8, 4], [5, 4], [10, 0, 'back-in-field']];
    const route = offsets.map(([forward, right, checkpoint]) => ({
      x: origin.x + Math.cos(drop.heading) * forward - Math.sin(drop.heading) * right,
      z: origin.z + Math.sin(drop.heading) * forward + Math.cos(drop.heading) * right,
      forward, right, checkpoint,
    }));
    const walk = { purpose: 'ordinary-input-entry-outbound-return', drop: dropId, ...boot, route, checkpoints: [], distanceM: 0, result: 'running' };
    report.walks.push(walk);
    const trace = `${out}/${label}-${dropId}-walk.ndjson`; writeFileSync(trace, '');
    await page.bringToFront(); const button = await page.$('#enter-field'); const box = await button.boundingBox();
    let mouseX = box.x + box.width / 2, mouseY = box.y + box.height / 2;
    await page.mouse.move(mouseX, mouseY); await button.click();
    await waitFor(() => document.pointerLockElement?.tagName === 'CANVAS', 5000);
    const start = Date.now(); let last = null;
    for (let waypoint = 0; waypoint < route.length; waypoint++) {
      const target = route[waypoint]; const waypointStart = Date.now();
      while (true) {
        const state = await read(); assert.equal(state.token, boot.token); assert.equal(state.ready, true);
        assert.equal(state.telemetry.paused, false, 'Ordinary entry walk was interrupted by pause');
        const camera = state.telemetry.camera;
        if (last) walk.distanceM += Math.hypot(camera.x - last.x, camera.z - last.z);
        last = camera;
        assert.ok(Number.isFinite(camera.y));
        appendFileSync(trace, JSON.stringify({ elapsedMs: Date.now() - start, waypoint, camera, paused: state.telemetry.paused }) + '\n');
        if (Math.hypot(target.x - camera.x, target.z - camera.z) < 0.7) break;
        if (Date.now() - waypointStart > 20000) throw new Error(`${dropId} could not reach entrance waypoint ${waypoint}`);
        const desiredYaw = Math.atan2(-(target.x - camera.x), -(target.z - camera.z));
        const currentYaw = camera.yawDeg * Math.PI / 180;
        const difference = Math.atan2(Math.sin(desiredYaw - currentYaw), Math.cos(desiredYaw - currentYaw));
        // Turn while stationary before each leg, avoiding sweeping across the pickup.
        if (Math.abs(difference) > 0.14) await page.keyboard.up('w'); else await page.keyboard.down('w');
        mouseX -= Math.max(-0.28, Math.min(0.28, difference)) / 0.0022;
        mouseY -= Math.max(-0.1, Math.min(0.1, -0.12 - camera.pitchDeg * Math.PI / 180)) / 0.0022;
        await page.mouse.move(mouseX, mouseY); await new Promise(done => setTimeout(done, 65));
      }
      await page.keyboard.up('w');
      if (target.checkpoint) walk.checkpoints.push({ name: target.checkpoint, elapsedSeconds: (Date.now() - start) / 1000, image: await shot(`normal-${dropId}-${target.checkpoint}`, boot.token) });
    }
    walk.elapsedSeconds = (Date.now() - start) / 1000; walk.result = 'passed';
    console.log('PASS ordinary entrance walk', dropId, walk.elapsedSeconds);
  }
  assert.deepEqual(report.errors, []); report.result = 'passed';
} catch (error) {
  report.result = 'failed'; report.failure = String(error); process.exitCode = 1;
  report.finishedAt = new Date().toISOString(); save();
  // A stalled compositor may also stall its screenshot. Keep the failure
  // report and close the browser instead of hiding the diagnosis indefinitely.
  if (page) await Promise.race([
    page.screenshot({ path: `${out}/${label}-failure.png` }).catch(() => {}),
    new Promise(done => setTimeout(done, 5000)),
  ]);
} finally {
  report.finishedAt = new Date().toISOString(); await browser.close();
  save();
  console.log(JSON.stringify({ result: report.result, failure: report.failure, inspections: report.inspections.length, walks: report.walks.map(walk => ({ drop: walk.drop, result: walk.result })), out }));
}
