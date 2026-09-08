#!/usr/bin/env node
/** Fixed-camera, normal-FOV inspection of the Quail windmill and tank.
 * These staged views complement the ordinary-input property traversal. */
import puppeteer from 'puppeteer';
import { createServer } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { verifyEvidenceImage } from './evidence-image.mjs';

const args = process.argv.slice(2);
const get = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const url = get('--url', 'http://localhost:4530');
const out = resolve(get('--out', '/tmp/quail-windmill-review'));
mkdirSync(out, { recursive: true });
const source = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom',
  optimizeDeps: { noDiscovery: true, include: [] } });
let center;
try {
  const area = (await source.ssrLoadModule('/src/game/areas.ts')).getArea('quail-fields');
  const { LandscapeModel } = await source.ssrLoadModule('/src/game/landscape.ts');
  const landmark = area.landmarks.find(item => item.kind === 'windmill');
  center = new LandscapeModel(area, 'south-gate').propertyToWorld(landmark.position.x, landmark.position.y, {});
} finally { await source.close(); }
const report = { purpose: 'staged-windmill-grounding-inspection', normalGameplayEvidence: false,
  url, startedAt: new Date().toISOString(), viewport: [1920, 1080], fov: 70, errors: [], views: [],
  limitations: ['Camera is deliberately positioned with the capture API.', 'No performance or full-route acceptance is inferred from these images.'] };
const browser = await puppeteer.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  page.on('pageerror', error => report.errors.push(String(error)));
  await page.goto(`${url}/index3d.html?capture=1&tod=morning&breed=gsp&coat=liver-white&area=quail-fields&drop=south-gate&quality=high`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.__ready3d === true', { timeout: 60000 });
  const token = await page.evaluate(() => window.__evidenceBootToken = crypto.randomUUID());
  report.browser = await browser.version(); report.launchArgs = browser.process().spawnargs;
  for (const view of [
    { name: 'windmill-wide', dx: 12, dz: 17, yaw: 35, pitch: 10 },
    { name: 'tank-and-footings', dx: 7, dz: 4.5, yaw: 51, pitch: -13 },
    { name: 'tower-footings', dx: -4.5, dz: 3.5, yaw: -52, pitch: -17 },
  ]) {
    const pose = [center.x + view.dx, center.z + view.dz, view.yaw, view.pitch];
    await page.evaluate(async pose => {
      window.__api3d.setPose(...pose);
      for (let n = 0; n < 20; n++) await new Promise(requestAnimationFrame);
      window.__api3d.renderOnce();
    }, pose);
    const path = `${out}/${view.name}.png`;
    const png = await page.screenshot({ path });
    const measurement = await verifyEvidenceImage(page, png, token);
    const audit = await page.evaluate(() => ({ telemetry: window.__api3d.telemetry(), info: window.__api3d.info() }));
    report.views.push({ name: view.name, path, pose, measurement, ...audit });
  }
  report.scripts = await page.evaluate(() => performance.getEntriesByType('resource').map(e => e.name).filter(name => /\.js(?:[?#]|$)/.test(name)));
  if (report.errors.length) throw new Error('Uncaught browser error during inspection');
  report.result = 'captured';
  console.log(JSON.stringify({ out, result: report.result, views: report.views.map(v => v.name), errors: report.errors }));
} catch (error) {
  report.result = 'failed'; report.error = String(error); process.exitCode = 1; console.error(error);
} finally {
  report.finishedAt = new Date().toISOString();
  writeFileSync(`${out}/inspection.json`, JSON.stringify(report, null, 2) + '\n');
  await browser.close();
}
