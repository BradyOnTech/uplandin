#!/usr/bin/env node
/** Matched vegetation inspections, plus optional ordinary-input approach walks.
 * node tools3d/review-quail-vegetation.mjs --url http://localhost:4173 --label before
 */
import puppeteer from 'puppeteer';
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { verifyEvidenceImage } from './evidence-image.mjs';
import { startBrowserRecording } from './browser-recording.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const base = option('--url', 'http://localhost:4173').replace(/\/$/, '');
const out = resolve(option('--out', 'artifacts/3d/quail-vegetation'));
const label = option('--label', 'before');
const quality = option('--quality', 'high');
assert.ok(['high', 'lite'].includes(quality));
const tod = option('--tod', 'noon');
assert.ok(['dawn','morning','noon','evening','lastlight'].includes(tod));
const selectedViews = option('--views', '').split(',').filter(Boolean);
const selectedWalkDrop = option('--walk-drop', 'both');
assert.ok(['both', 'south-gate', 'west-track'].includes(selectedWalkDrop));
assert.ok(!args.includes('--walk-only') || args.includes('--walk'), '--walk-only requires --walk');
const changedScheduler = args.includes('--uncapped');
mkdirSync(out, { recursive: true });
const html = await fetch(`${base}/index3d.html`).then(response => { assert.ok(response.ok); return response.text(); });
assert.ok(!/\/@vite|\/src\/main3d/.test(html), 'Use an immutable production preview.');
// Matched inspection contract: these drop anchors and the yard-to-meter
// conversion are unchanged by the access pass. Avoid loading mutable source
// modules while a different immutable build supplies the rendered evidence.
const drops = { 'south-gate': { x: 504, y: 658, heading: -Math.PI / 2 }, 'west-track': { x: 42, y: 406, heading: 0 } };
const propertyToWorld = (dropId, point) => ({ x: (point.x - drops[dropId].x) * 0.9144, z: (point.y - drops[dropId].y) * 0.9144 + 40 });
const report = { evidence: 'quail-vegetation-review', label, base, startedAt: new Date().toISOString(),
  viewport: { width: 1920, height: 1080 }, quality, fov: 70, tod,
  changedScheduler, performanceEligible: false,
  limitations: ['Staged environment inspections are not gameplay evidence.', 'Optional ordinary input walks approach and retreat through entry cover at the normal spawn heading.', 'Near/mid/far appearance requires visual review; image variation is only a missing-render guard.', 'No performance, full-hunt or human-usability claim.'],
  navigationContract: { drops, metersPerPropertyUnit: 0.9144, anchor: { x: 0, z: 40 } },
  inspections: [], walks: [], errors: [], result: 'running' };
report.dogSource=option('--dog','existing');
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
const read = () => page.evaluate(() => ({ token: window.__evidenceBootToken, ready: window.__ready3d, telemetry: window.__api3d.telemetry(), generatedDog: typeof window.__generatedDogAudit === 'function' ? window.__generatedDogAudit() : null }));
const closePage = async () => { if (page) { await page.close(); page = undefined; } };
async function open(drop, staged) {
  report.phase = `open ${drop} ${staged ? 'staged' : 'ordinary'}`; save();
  await closePage(); page = await browser.newPage(); await page.setViewport(report.viewport); await page.bringToFront();
  page.on('pageerror', error => report.errors.push(String(error)));
  page.on('console', message => { if(message.type()==='error')report.errors.push(message.text()); });
  const query = new URLSearchParams({ area: 'quail-fields', drop, quality, tod, breed: 'gsp', coat: 'liver-white' });
  if(option('--dog','existing')==='generated')query.set('dog','generated');
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
  const allViews = [
    { name: 'south-cover-crossing', drop: 'south-gate', property: { x: 510, y: 565 }, target: { x: 549, y: 562 }, pitch: -12 },
    { name: 'south-open-shelf', drop: 'south-gate', property: { x: 540, y: 495 }, target: { x: 555, y: 462 }, pitch: -12 },
    { name: 'south-draw-cover', drop: 'south-gate', property: { x: 595, y: 395 }, target: { x: 621, y: 381 }, pitch: -12 },
    { name: 'point-cover-close', drop: 'south-gate', property: { x: 510.961417, y: 604.072089 }, target: { x: 525.202, y: 576.544 }, pitch: -12.066491 },
    { name: 'ground-props-edge', drop: 'south-gate', property: { x: 491, y: 622 }, target: { x: 487, y: 616 }, pitch: -18 },
    { name: 'ground-props-draw', drop: 'south-gate', property: { x: 632, y: 346 }, target: { x: 630, y: 340 }, pitch: -18 },
    { name: 'south-spawn-inward', drop: 'south-gate', property: { x: 504, y: 658 }, target: { x: 504, y: 620 }, pitch: -0.16 * 180 / Math.PI },
    { name: 'west-spawn-inward', drop: 'west-track', property: { x: 42, y: 406 }, target: { x: 80, y: 406 }, pitch: -0.16 * 180 / Math.PI },
    { name: 'south-entry-cover', drop: 'south-gate', property: { x: 504, y: 620 }, target: { x: 504, y: 590 }, pitch: -12 },
    { name: 'south-parking-outward', drop: 'south-gate', property: { x: 504, y: 642 }, target: { x: 504, y: 685 }, pitch: -4 },
    { name: 'south-plum-edge', drop: 'south-gate', property: { x: 488, y: 620 }, target: { x: 483, y: 613 }, pitch: -6 },
    { name: 'south-return-junction', drop: 'south-gate', property: { x: 540, y: 486 }, target: { x: 540, y: 469 }, pitch: -14 },
    { name: 'drainage-windmill-broadside', drop: 'south-gate', property: { x: 750, y: 310 }, target: { x: 800, y: 280 }, pitch: -5 },
    { name: 'west-parking-outward', drop: 'west-track', property: { x: 58, y: 406 }, target: { x: 15, y: 406 }, pitch: -4 },
  ];
  assert.ok(selectedViews.every(name => allViews.some(view => view.name === name)), 'Unknown staged vegetation view');
  const views = args.includes('--walk-only') ? [] : selectedViews.length ? allViews.filter(view => selectedViews.includes(view.name)) : allViews;
  for (const view of views) {
    const boot = await open(view.drop, true);
    const world = propertyToWorld(view.drop, view.property);
    const yaw = Math.atan2(-(view.target.x - view.property.x), -(view.target.y - view.property.y)) * 180 / Math.PI;
    await page.evaluate(({ world, yaw, pitch }) => { window.__api3d.setPose(world.x, world.z, yaw, pitch); window.__api3d.renderOnce(); }, { world, yaw, pitch: view.pitch });
    const image = await shot(`staged-${view.name}`, boot.token);
    assert.equal(image.camera.fov, 70);
    assert.equal(image.quality, quality);
    report.inspections.push({ purpose: 'staged-environment-inspection', ...view, ...boot, image });
  }
  if (args.includes('--walk')) for (const dropId of selectedWalkDrop === 'both' ? ['south-gate', 'west-track'] : [selectedWalkDrop]) {
    const boot = await open(dropId, false);
    const drop = drops[dropId]; const origin = propertyToWorld(dropId, drop);
    // Keep the native camera heading while W approaches and S retreats. This
    // exposes distance transitions without a setter, turn or simulated step.
    const offsets = [[0, 'spawn'], [12, 'approach-12m'], [26, 'approach-26m'], [40, 'approach-40m'], [26, 'retreat-26m'], [12, 'retreat-12m'], [0, 'returned-spawn']];
    const route = offsets.map(([forward, checkpoint]) => ({
      x: origin.x + Math.cos(drop.heading) * forward,
      z: origin.z + Math.sin(drop.heading) * forward,
      forward, checkpoint,
    }));
    const walk = { purpose: 'ordinary-input-vegetation-approach-retreat', drop: dropId, ...boot, route, checkpoints: [], distanceM: 0, result: 'running' };
    report.walks.push(walk);
    const trace = `${out}/${label}-${dropId}-walk.ndjson`; writeFileSync(trace, '');
    await page.bringToFront(); await page.click('#enter-field');
    await waitFor(() => document.pointerLockElement?.tagName === 'CANVAS', 5000);
    const video = args.includes('--video') ? await startBrowserRecording(page, `${out}/${label}-normal-${dropId}-approach.mp4`) : null;
    const start = Date.now(); let last = null;
    for (let waypoint = 0; waypoint < route.length; waypoint++) {
      const target = route[waypoint]; const waypointStart = Date.now();
      while (true) {
        const state = await read(); assert.equal(state.token, boot.token); assert.equal(state.ready, true);
        assert.equal(state.telemetry.paused, false, 'Ordinary vegetation walk was interrupted by pause');
        const camera = state.telemetry.camera;
        if (last) walk.distanceM += Math.hypot(camera.x - last.x, camera.z - last.z);
        last = camera;
        assert.ok(Number.isFinite(camera.y));
        appendFileSync(trace, JSON.stringify({ elapsedMs: Date.now() - start, waypoint, camera, paused: state.telemetry.paused, render: state.telemetry.render, generatedDog: state.generatedDog }) + '\n');
        if (Math.hypot(target.x - camera.x, target.z - camera.z) < 0.7) break;
        if (Date.now() - waypointStart > 20000) throw new Error(`${dropId} could not reach vegetation waypoint ${waypoint}`);
        const forwardError = (target.x - camera.x) * Math.cos(drop.heading) + (target.z - camera.z) * Math.sin(drop.heading);
        const lateral = -(camera.x - origin.x) * Math.sin(drop.heading) + (camera.z - origin.z) * Math.cos(drop.heading);
        assert.ok(Math.abs(lateral) < 1.5, 'Straight entry path deviated laterally');
        await page.keyboard.up(forwardError > 0 ? 's' : 'w');
        await page.keyboard.down(forwardError > 0 ? 'w' : 's');
        await new Promise(done => setTimeout(done, 65));
      }
      await page.keyboard.up('w'); await page.keyboard.up('s');
      if (target.checkpoint) walk.checkpoints.push({ name: target.checkpoint, elapsedSeconds: (Date.now() - start) / 1000, image: await shot(`normal-${dropId}-${target.checkpoint}`, boot.token) });
    }
    walk.elapsedSeconds = (Date.now() - start) / 1000;
    if (video) walk.video = await video.stop();
    walk.result = 'passed';
    console.log('PASS ordinary vegetation walk', dropId, walk.elapsedSeconds);
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
