#!/usr/bin/env node
/** Knowing the bird at range: each core species flying across the view at
 * 30, 40 and 55 m, on its own ground, at phone resolution (844x390,
 * Lightweight), in consecutive 30 fps frames so the wingbeat shows. Crops
 * round the bird go to tools3d/identity-sheet.py.
 *
 *   tools3d/heavy.sh node tools3d/review-identity.mjs --url http://localhost:4611 --label after
 *
 * Capture mode's preview bird (birds.ts `birdPreview`): a live-material bird
 * flying level, 3 m over the ground, at the hunt's origin plus 30 m; the
 * camera stands back from it to each range. Staged camera and clock.
 */
import puppeteer from 'puppeteer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { startServer } from './playthrough.mjs';

const args = process.argv.slice(2);
const arg = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const url = arg('--url', 'http://localhost:4611').replace(/\/$/, '');
const label = arg('--label', 'current');
const ranges = arg('--ranges', '30,40,55').split(',').map(Number);
const frames = Number(arg('--frames', '6'));
const [width, height] = arg('--size', '844x390').split('x').map(Number);
const quality = arg('--quality', 'lite');
const out = resolve(arg('--out', `/tmp/uplandin-identity/${label}`));
/** Each bird on its own ground. */
const grounds = { bobwhite: 'quail-fields', ringneck: 'pheasant-coverts', sharptail: 'sharptail-prairie', chukar: 'chukar-ridge', hun: 'sharptail-prairie' };
const species = arg('--species', Object.keys(grounds).join(',')).split(',');
mkdirSync(out, { recursive: true });

const { server } = await startServer(url);
const browser = await puppeteer.launch({ headless: true,
  args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-frame-rate-limit', '--disable-gpu-vsync'] });
const report = { label, url, width, height, quality, ranges, frames, birds: [] };
try {
  for (const id of species) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    const query = new URLSearchParams({ area: grounds[id], quality, tod: 'morning', seed: '7701', capture: '1', birdPreview: id });
    await page.goto(`${url}/index3d.html?${query}`, { waitUntil: 'load', timeout: 180000 });
    await page.waitForFunction(() => window.__ready3d === true && !!window.__api3d, { timeout: 240000, polling: 250 });
    const bird = { species: id, ground: grounds[id], shots: [], errors };
    for (const range of ranges) {
      for (let k = 0; k < frames; k++) {
        const shot = await page.evaluate(stage, range, k === 0, Math.max(...ranges));
        const file = `${id}-${range}m-f${k}.png`;
        await page.screenshot({ path: `${out}/${file}` });
        bird.shots.push({ range, frame: k, file, ...shot });
      }
    }
    report.birds.push(bird);
    console.log(`${id}: ${bird.shots.filter(s => s.frame === 0).map(s => `${s.range} m ${s.spanPx} px`).join(', ')}${errors.length ? ` errors ${errors.length}` : ''}`);
    await page.close();
  }
} finally {
  writeFileSync(`${out}/identity-${label}.json`, JSON.stringify(report, null, 2));
  await browser.close();
  server?.kill('SIGTERM');
}

/* ------------------------------ in the page ------------------------------ */

/** Stand `range` m back from the preview bird (re-placing it on a new range),
 * step one 30 fps tick, render, and report where it is on screen. */
function stage(range, first, maxRange) {
  const api = window.__api3d;
  api.pause(true);
  // One 30 fps tick of the bird's own clock. The preview bird has no flight
  // plan for the rest of the tick (escape credit and the like), which throws
  // once its wings and position have moved; that is all a lineup needs.
  if (!first) { try { api.stepRise(1); } catch { /* the preview's missing plan */ } }
  const bird = api.birds().find(b => b.simId === -999) ?? api.birds()[0];
  if (!bird) return { error: 'no preview bird' };
  // Beside its line (it flies +x), on whichever side the ground is open:
  // south of it facing north, else north facing south. The same side for
  // every range of a bird, chosen once.
  const audit = window.__dogAudit;
  // Clear from the farthest stand: no cover where he stands, nothing of the
  // land or the near cover across the line from his eye to the bird.
  const open = (side) => {
    if (!audit) return side < 0;
    const cx = bird.x, cz = bird.z + side * maxRange, eyeY = audit.heightAt(cx, cz) + 1.62;
    if (audit.coverAt(cx, cz) > .9) return false;
    for (let s = 1; s < maxRange; s += 1.5) {
      const pz = cz - side * s, ly = eyeY + (bird.y - eyeY) * s / maxRange;
      if (audit.heightAt(cx, pz) + (s < 25 ? audit.coverAt(cx, pz) : 0) > ly) return false;
    }
    return true;
  };
  window.__identitySide ??= open(-1) || !open(1) ? -1 : 1;
  const side = window.__identitySide;
  const x = bird.x, z = bird.z + side * range;
  api.setPose(x, z, side < 0 ? 180 : 0, 0);
  const eye = api.telemetry().camera;
  const pitch = Math.atan2(bird.y - eye.y, range) * 180 / Math.PI - 4;
  api.setPose(x, z, 180, pitch);
  api.renderOnce();
  // Its drawn size follows the camera: read it again from here.
  const seen = api.birds().find(b => b.simId === bird.simId) ?? bird;
  bird.sizeM = seen.sizeM;
  const camera = api.camera();
  camera.updateMatrixWorld();
  const e = camera.matrixWorldInverse.elements, p = camera.projectionMatrix.elements;
  const v = [bird.x, bird.y, bird.z, 1], w = [0, 0, 0, 0], c = [0, 0, 0, 0];
  for (let i = 0; i < 4; i++) w[i] = e[i] * v[0] + e[4 + i] * v[1] + e[8 + i] * v[2] + e[12 + i] * v[3];
  for (let i = 0; i < 4; i++) c[i] = p[i] * w[0] + p[4 + i] * w[1] + p[8 + i] * w[2] + p[12 + i] * w[3];
  const sx = (c[0] / c[3] * .5 + .5) * innerWidth, sy = (.5 - c[1] / c[3] * .5) * innerHeight;
  const depth = -w[2];
  const spanPx = bird.sizeM * innerHeight / (2 * Math.tan(camera.fov * Math.PI / 360) * depth);
  return { screen: { x: Math.round(sx), y: Math.round(sy) }, spanPx: +spanPx.toFixed(1), sizeM: +bird.sizeM.toFixed(3), airMs: Math.round(bird.airMs),
    depthM: +depth.toFixed(1), fov: camera.fov };
}
