#!/usr/bin/env node
/**
 * The dog on point in the real field, read the way a hunter reads it.
 *
 *   tools3d/heavy.sh node tools3d/dog-field-check.mjs --url http://localhost:4615 --area chukar-ridge \
 *     --drop south-gate --seed 48291 --quality high --out /tmp/dog-audit/field-after-high --uncapped
 *
 * Loads the actual game under ?capture and walks the hunter along a recorded
 * hunt's path (--trace, from tools3d/dog-trace.mjs) with the frozen hunt
 * stepped tick by tick until each breed is steady on point (the same seed and
 * path give each breed the same hunt in either checkout), then frames the dog
 * from eye height at 25, 30 and 40 yd, at the walking 70-degree view and the
 * 30-degree closer look, with and without the dog, so
 * tools3d/dog-field-pixels.py can count what the cover leaves visible. A low
 * broadside close-up shows the paws on the slope, and each supporting paw's
 * clearance is measured against the terrain triangles actually drawn in the
 * scene, the same in any checkout.
 *
 * Uses only __api3d and __dogAudit, so it runs unchanged against the
 * read-only baseline (cwd there, its own port). Staged camera; not
 * gameplay or device performance evidence.
 */
import puppeteer from 'puppeteer';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { startServer } from './playthrough.mjs';

const args = process.argv.slice(2);
const arg = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const url = arg('--url', 'http://localhost:4615').replace(/\/$/, '');
const area = arg('--area', 'chukar-ridge'), drop = arg('--drop', 'south-gate'), seed = arg('--seed', '48291');
const quality = arg('--quality', 'high'), tod = arg('--tod', 'morning');
const breeds = arg('--breeds', 'gsp,english-setter,griffon').split(',');
const out = resolve(arg('--out', `/tmp/dog-audit/field-${quality}`));
const YARDS = [25, 30, 40];
// The hunter walks the path a recorded hunt took (tools3d/dog-trace.mjs):
// birds sit 150 yd and more out from the truck, so he has to go and find them.
const path = JSON.parse(readFileSync(arg('--trace', '/tmp/dog-audit/traces/chukar-gsp8.json'), 'utf8')).ticks.map(t => t.hunter);
mkdirSync(out, { recursive: true });

const { server } = await startServer(url);
const browser = await puppeteer.launch({ headless: true, protocolTimeout: 0,
  args: ['--ignore-gpu-blocklist', '--no-sandbox', ...(args.includes('--uncapped') ? ['--disable-frame-rate-limit', '--disable-gpu-vsync'] : [])] });
const report = { area, drop, seed, quality, tod, evidence: 'Staged camera on a real capture-mode hunt; not gameplay or performance evidence', dogs: [], errors: [] };
try {
  for (const breed of breeds) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    page.on('pageerror', error => report.errors.push(`${breed}: ${error}`));
    const query = new URLSearchParams({ capture: '1', area, drop, seed, breed, quality, tod });
    await page.goto(`${url}/index3d.html?${query}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window.__ready3d === true && !!window.__api3d && !!window.__dogAudit, { timeout: 240000, polling: 250 });
    // Walk the recorded hunter's path tick by tick, looking the way he walks
    // (at the dog while he stands), until the point is steady (two still probes).
    const found = await page.evaluate(path => {
      const api = window.__api3d;
      let ticks = 0, last = null, yaw = null;
      const step = n => {
        for (let i = 0; i < n; i++) {
          const h = api.hunt(), at = path[Math.min(path.length - 1, ticks)], next = path[Math.min(path.length - 1, ticks + 1)];
          const mx = next[0] - at[0], mz = next[1] - at[1];
          if (Math.hypot(mx, mz) > 1e-3) yaw = Math.atan2(-mx, -mz) * 180 / Math.PI;
          else yaw = Math.atan2(-(h.dog.x - at[0]), -(h.dog.z - at[1])) * 180 / Math.PI;
          api.setPose(at[0], at[1], yaw, -4);
          api.stepSim(1); ticks++;
        }
      };
      while (ticks < path.length + 3000) {
        step(15);
        const h = api.hunt();
        if (h.dog.state !== 'pointing') { last = null; continue; }
        if (last && Math.hypot(h.dog.x - last.x, h.dog.z - last.z) < .01) break;
        last = { x: h.dog.x, z: h.dog.z };
      }
      // Let the rendered dog settle into the point the sim holds.
      for (let i = 0; i < 40; i++) { api.stepSim(1); api.renderOnce(); }
      const h = api.hunt();
      return { ticks, dog: h.dog, hunter: h.hunter, pointing: h.dog.state === 'pointing' };
    }, path);
    if (!found.pointing) { report.errors.push(`${breed}: no point in ${found.ticks} ticks`); await page.close(); continue; }
    const frames = [];
    for (const yards of YARDS) for (const fov of [70, 30]) {
      const metres = yards * .9144;
      const frame = await page.evaluate((metres, fov) => {
        const api = window.__api3d, audit = window.__dogAudit;
        const s = audit.state(), root = s.root, h = api.hunt();
        // From the hunter's side of the dog, along the line he walked in on.
        let dx = h.hunter.x - root.x, dz = h.hunter.z - root.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
        const x = root.x + dx * metres, z = root.z + dz * metres, eye = audit.heightAt(x, z) + 1.65;
        const yawDeg = Math.atan2(-(root.x - x), -(root.z - z)) * 180 / Math.PI;
        const pitchDeg = Math.atan2(root.y + .35 - eye, metres) * 180 / Math.PI;
        api.setPose(x, z, yawDeg, pitchDeg); audit.setFov(fov); audit.setBodyVisible(true); api.renderOnce();
        const p = audit.project(root.x, root.y + .35, root.z);
        return { metres, fov, camera: { x, z, yawDeg, pitchDeg }, dogScreen: p, info: api.info() };
      }, metres, fov);
      const file = `${breed}-${yards}yd-fov${fov}.png`;
      await page.screenshot({ path: resolve(out, file) });
      await page.evaluate(() => { window.__dogAudit.setBodyVisible(false); window.__api3d.renderOnce(); });
      const nodog = file.replace('.png', '-nodog.png');
      await page.screenshot({ path: resolve(out, nodog) });
      await page.evaluate(() => { window.__dogAudit.setBodyVisible(true); window.__dogAudit.setFov(70); window.__api3d.renderOnce(); });
      frames.push({ style: breed, d: yards, fov, file, nodog, ...frame });
    }
    // Low broadside close-up of the stance, and each paw against the drawn terrain.
    const contact = await page.evaluate(() => {
      const api = window.__api3d, audit = window.__dogAudit;
      const s = audit.state(), root = s.root, yaw = s.yaw;
      const sideX = Math.cos(yaw), sideZ = -Math.sin(yaw), metres = 3.2;
      const x = root.x - sideX * metres, z = root.z - sideZ * metres;
      api.setPose(x, z, Math.atan2(-(root.x - x), -(root.z - z)) * 180 / Math.PI, -14); audit.setFov(40); api.renderOnce();
      // The terrain triangles drawn under each paw: the highest visible surface there.
      const meshes = [];
      api.scene().traverse(o => { if (o.isMesh && /terrain/i.test(o.name) && o.visible) meshes.push(o); });
      const drawnAt = (px, pz) => {
        let best = null;
        for (const mesh of meshes) {
          const g = mesh.geometry, box = g.boundingBox ?? (g.computeBoundingBox(), g.boundingBox);
          if (px < box.min.x || px > box.max.x || pz < box.min.z || pz > box.max.z) continue;
          const pos = g.getAttribute('position'), index = g.index, count = index ? index.count : pos.count;
          for (let t = 0; t < count; t += 3) {
            const a = index ? index.getX(t) : t, b = index ? index.getX(t + 1) : t + 1, c = index ? index.getX(t + 2) : t + 2;
            const ax = pos.getX(a), az = pos.getZ(a), bx = pos.getX(b), bz = pos.getZ(b), cx = pos.getX(c), cz = pos.getZ(c);
            const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
            if (Math.abs(d) < 1e-12) continue;
            const u = ((bz - cz) * (px - cx) + (cx - bx) * (pz - cz)) / d, v = ((cz - az) * (px - cx) + (ax - cx) * (pz - cz)) / d, w = 1 - u - v;
            if (u < -1e-6 || v < -1e-6 || w < -1e-6) continue;
            const y = u * pos.getY(a) + v * pos.getY(b) + w * pos.getY(c) + mesh.position.y;
            if (best === null || y > best.y) best = { y, name: mesh.name };
          }
        }
        return best;
      };
      const paws = s.paws.map(paw => {
        const hit = drawnAt(paw.x, paw.z);
        return { i: paw.i, y: paw.y, analyticGap: paw.gap, drawnGap: hit ? paw.y - hit.y - .023 : null, terrain: hit?.name ?? null };
      });
      return { paws, terrainMeshes: meshes.length };
    });
    const close = `${breed}-paws-close.png`;
    await page.screenshot({ path: resolve(out, close) });
    report.dogs.push({ breed, ...found, frames, contact, close });
    console.log(`${breed}: point after ${found.ticks} ticks; drawn paw gaps ${contact.paws.map(p => p.drawnGap === null ? 'n/a' : (p.drawnGap * 1000).toFixed(0) + 'mm').join(' ')}`);
    await page.close();
  }
} catch (error) { report.failure = String(error?.stack ?? error); process.exitCode = 1; }
finally {
  // dog-field-pixels.py reads `frames` at the top level.
  report.frames = report.dogs.flatMap(dog => dog.frames.map(f => ({ ...f, style: `${dog.breed}-fov${f.fov}` })));
  writeFileSync(resolve(out, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close(); server?.kill('SIGTERM');
}
console.log(JSON.stringify({ out, errors: report.errors.slice(0, 3), failure: report.failure }));
