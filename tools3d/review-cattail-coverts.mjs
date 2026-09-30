#!/usr/bin/env node
/** Staged environment frames for Cattail Coverts, from the same views as
 * tools3d/cattail-coverts-review.html. Staged camera positions only: this is
 * look-development evidence, never playthrough evidence.
 *
 *   node tools3d/review-cattail-coverts.mjs --label before
 *   node tools3d/review-cattail-coverts.mjs --label after --tod evening --views truck,slough-shore
 *
 * Needs the Vite dev server (the view list is read from its TypeScript
 * module). Starts one on --url's port when nothing answers there.
 */
import puppeteer from 'puppeteer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { startServer } from './playthrough.mjs';

const args = process.argv.slice(2);
const arg = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const url = arg('--url', 'http://localhost:4517').replace(/\/$/, '');
const label = arg('--label', 'current');
const quality = arg('--quality', 'high');
const tod = arg('--tod', 'morning');
const only = arg('--views', '')?.split(',').filter(Boolean) ?? [];
const out = resolve(arg('--out', 'artifacts/3d/cattail-coverts'));
const executablePath = arg('--chrome', process.env.PUPPETEER_EXECUTABLE_PATH);
mkdirSync(out, { recursive: true });

const { server } = await startServer(url);
const browser = await puppeteer.launch({ headless: true, executablePath,
  args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const report = { label, url, quality, tod, startedAt: new Date().toISOString(), frames: [], errors: [] };
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 810 });
  page.on('pageerror', error => report.errors.push(String(error)));
  const query = new URLSearchParams({ area: 'pheasant-coverts', drop: 'south-gate', quality, tod, dog: 'generated', seed: '7701', capture: '1' });
  await page.goto(`${url}/index3d.html?${query}`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__ready3d === true && !!window.__api3d, { timeout: 240000, polling: 250 });
  const views = await page.evaluate(async () => {
    const { getArea } = await import('/src/game/areas.ts');
    const { LandscapeModel } = await import('/src/game/landscape.ts');
    const { cattailCovertsViews } = await import('/tools3d/cattailCovertsViews.ts');
    const area = getArea('pheasant-coverts'), landscape = new LandscapeModel(area);
    window.__api3d.pause(true);
    return cattailCovertsViews(area).map(view => {
      const world = landscape.propertyToWorld(view.at[0], view.at[1], { x: 0, z: 0 });
      const yaw = -Math.atan2(view.toward[0] - view.at[0], -(view.toward[1] - view.at[1])) * 180 / Math.PI;
      return { ...view, world, yaw };
    });
  });
  for (const view of views.filter(v => !only.length || only.includes(v.id))) {
    await page.evaluate(v => { window.__api3d.setPose(v.world.x, v.world.z, v.yaw, v.pitch, v.lift ?? 0); window.__api3d.renderOnce(); }, view);
    // Let distance tiers and culling settle at the new camera.
    await new Promise(done => setTimeout(done, 400));
    const render = await page.evaluate(() => { window.__api3d.renderOnce(); return window.__api3d.info(); });
    const file = `${label}-${quality}-${tod}-${view.id}.png`;
    await page.screenshot({ path: `${out}/${file}` });
    report.frames.push({ view: view.id, name: view.name, file, render });
    console.log(`${view.id}: ${render.calls} draws, ${render.triangles.toLocaleString()} triangles`);
  }
  report.result = report.errors.length ? 'errors' : 'passed';
} catch (error) {
  report.result = 'failed'; report.failure = String(error); process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  writeFileSync(`${out}/${label}-${quality}-${tod}.json`, JSON.stringify(report, null, 2));
  await browser.close();
  server?.kill('SIGTERM');
}
console.log(JSON.stringify({ result: report.result, failure: report.failure, frames: report.frames.length, out }));
