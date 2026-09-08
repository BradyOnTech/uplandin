#!/usr/bin/env node
/** Ordinary keyboard/mouse traversal of the authored Quail trail loop.
 * Source geography guides navigation; gameplay state is read only. This proves
 * route access/ground continuity, not human usability or dog art acceptance. */
import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { mkdirSync, writeFileSync, appendFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { verifyEvidenceImage } from './evidence-image.mjs';

const args = process.argv.slice(2);
const get = (flag, fallback) => args.includes(flag) ? args[args.indexOf(flag) + 1] : fallback;
const url = get('--url', 'http://127.0.0.1:4521');
const quality = get('--quality', 'high');
const approachOnly = args.includes('--approach-only');
const dogSource = get('--dog', 'existing');
const changedScheduler = args.includes('--uncapped');
const out = resolve(get('--out', '/tmp/quail-property-traversal'));
mkdirSync(out, { recursive: true });
const source = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom',
  optimizeDeps: { noDiscovery: true, include: [] } });
let area, landscape;
try {
  area = (await source.ssrLoadModule('/src/game/areas.ts')).getArea('quail-fields');
  const { LandscapeModel } = await source.ssrLoadModule('/src/game/landscape.ts');
  landscape = new LandscapeModel(area, 'south-gate');
} finally { await source.close(); }
const trail = name => area.trails.find(path => path.id === name).points;
const south = trail('south-track');
const returning = trail('east-return');
const join = south.findIndex(point => point.x === returning.at(-1).x && point.y === returning.at(-1).y);
if (join < 0) throw new Error('The authored return trail does not connect to the south trail');
const legs = [
  { name: 'south-track-to-drainage', points: south.slice(1) },
  { name: 'windmill-approach', points: trail('windmill-track').slice(1) },
  { name: 'east-return', points: returning.slice(1) },
  { name: 'south-gate-return', points: south.slice(0, join).reverse() },
];
const route = (approachOnly ? legs.slice(0, 1) : legs).flatMap(leg => leg.points.map((point, index) => ({
  ...landscape.propertyToWorld(point.x, point.y, {}), property: point,
  checkpoint: index === leg.points.length - 1 ? leg.name : approachOnly && index % 7 === 0 ? `approach-${index}` : null,
})));
const result = { evidence: 'ordinary-input-property-traversal', url, quality, dogSource, approachOnly,
  changedScheduler, performanceEligible: false,
  limitations: ['Navigation uses source trail coordinates and read-only camera telemetry.', 'This run is not a dog-animation approval or an isolated performance benchmark.'],
  navigationSources: Object.fromEntries(['src/game/areas.ts', 'src/game/landscape.ts', 'src/game/quailLandscape.ts']
    .map(path => [path, createHash('sha256').update(readFileSync(resolve(path))).digest('hex')])),
  checkpoints: [], errors: [], startedAt: new Date().toISOString(), route,
  distanceM: 0, maxEyeHeightErrorM: 0, result: 'running' };
const trace = `${out}/route.ndjson`;
writeFileSync(trace, '');
if (changedScheduler) result.limitations.push('Uncapped diagnostic rendering after ordinary RAF scheduling stalled on a plain page. This does not establish native browser performance or physical-mobile readiness.');
const browser = await puppeteer.launch({ headless: !args.includes('--headed'), args: changedScheduler ? ['--disable-frame-rate-limit'] : [] });
let page;
try {
  page = await browser.newPage();
  page.on('pageerror', error => result.errors.push(String(error)));
  await page.setViewport({ width: 1920, height: 1080 });
  await page.goto(`${url}/index3d.html?area=quail-fields&drop=south-gate&quality=${quality}&breed=gsp&coat=liver-white${dogSource==='generated'?'&dog=generated':''}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.__ready3d === true', { timeout: 60000 });
  const bootToken = await page.evaluate(() => (window.__evidenceBootToken = crypto.randomUUID()));
  result.browser = await browser.version(); result.launchArgs = browser.process().spawnargs;
  result.scripts = await page.evaluate(() => performance.getEntriesByType('resource').map(entry => entry.name).filter(name => /\.js(?:[?#]|$)/.test(name)));
  await page.bringToFront();
  const entry = await page.$('#enter-field'); const box = await entry.boundingBox();
  let mouseX = box.x + box.width / 2, mouseY = box.y + box.height / 2;
  await page.mouse.move(mouseX, mouseY); await entry.click();
  await page.waitForFunction('document.pointerLockElement?.tagName === "CANVAS"', { timeout: 5000 });
  await page.keyboard.down('Shift'); await page.keyboard.down('w');
  let waypoint = 0, last = null, lastProgress = Date.now(), lastTrace = 0;
  const start = Date.now();
  while (waypoint < route.length) {
    if (Date.now() - start > 12 * 60 * 1000) throw new Error('Route exceeded the twelve-minute traversal limit');
    const state = await page.evaluate(() => ({ token: window.__evidenceBootToken, ready: window.__ready3d,
      telemetry: window.__api3d.telemetry(), hunt: window.__api3d.hunt() }));
    if (state.token !== bootToken || !state.ready) throw new Error('The page rebooted during route evidence');
    if (state.telemetry.paused) throw new Error('Traversal was interrupted by a pause');
    const camera = state.telemetry.camera, target = route[waypoint];
    if (last) result.distanceM += Math.hypot(camera.x - last.x, camera.z - last.z);
    last = camera;
    result.maxEyeHeightErrorM = Math.max(result.maxEyeHeightErrorM, Math.abs(camera.y - landscape.heightAtWorld(camera.x, camera.z) - 1.62));
    if (Math.hypot(target.x - camera.x, target.z - camera.z) < 2.3) {
      if (target.checkpoint) {
        await page.keyboard.up('w');
        const path = `${out}/${target.checkpoint}.png`;
        const image = await page.screenshot({ path });
        const imageMeasurement = await verifyEvidenceImage(page, image, bootToken);
        result.checkpoints.push({ name: target.checkpoint, elapsedSeconds: (Date.now() - start) / 1000, camera, path, imageMeasurement });
        await page.keyboard.down('w');
      }
      waypoint++; lastProgress = Date.now(); continue;
    }
    if (Date.now() - lastProgress > 100000) throw new Error(`No route progress toward waypoint ${waypoint}`);
    const desiredYaw = Math.atan2(-(target.x - camera.x), -(target.z - camera.z));
    const currentYaw = camera.yawDeg * Math.PI / 180;
    const difference = Math.atan2(Math.sin(desiredYaw - currentYaw), Math.cos(desiredYaw - currentYaw));
    const desiredPitch = -0.12;
    mouseX -= Math.max(-0.25, Math.min(0.25, difference)) / 0.0022;
    mouseY -= Math.max(-0.1, Math.min(0.1, desiredPitch - camera.pitchDeg * Math.PI / 180)) / 0.0022;
    await page.mouse.move(mouseX, mouseY);
    if (Date.now() - lastTrace > 350) {
      appendFileSync(trace, JSON.stringify({ elapsedMs: Date.now() - start, waypoint, camera, state: state.hunt.dog.state, tally: state.hunt.tally }) + '\n');
      lastTrace = Date.now();
    }
    await new Promise(done => setTimeout(done, 70));
  }
  await page.keyboard.up('w'); await page.keyboard.up('Shift');
  result.elapsedSeconds = (Date.now() - start) / 1000;
  if (result.errors.length) throw new Error('Uncaught browser errors during traversal');
  if (result.maxEyeHeightErrorM > 0.12) throw new Error('Camera departed expected continuous terrain height');
  result.result = 'passed';
  console.log(JSON.stringify({ result: result.result, distanceM: result.distanceM, elapsedSeconds: result.elapsedSeconds, checkpoints: result.checkpoints.length }));
} catch (error) {
  result.result = 'failed'; result.error = String(error); process.exitCode = 1; console.error(error);
} finally {
  writeFileSync(`${out}/route.json`, JSON.stringify(result, null, 2));
  await browser.close();
}
