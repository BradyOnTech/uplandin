#!/usr/bin/env node
/** Ground-kit review frames: staged eye-height views of one spot on a ground,
 * with the real generated GSP standing on point at the spot, seen from set
 * distances, for each grass style under trial.
 *
 *   node tools3d/cover-review.mjs --area sharptail-prairie --styles legacy,masses,tufts,strokes \
 *     --spot 700,560 --toward 1000,470 --distances 10,27,40,150 --quality lite --label bake --uncapped --url http://localhost:4614
 *
 * --spot is the dog's property position (yards); the camera stands back
 * along the line from --toward through the spot, at eye height (--nodog
 * leaves the dog out, for plant close-ups). Staged
 * camera positions only: look-development evidence, never playthrough.
 * Needs the Vite dev server; starts one on --url's port when none answers.
 */
import puppeteer from 'puppeteer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { startServer } from './playthrough.mjs';

const args = process.argv.slice(2);
const arg = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const url = arg('--url', 'http://localhost:4517').replace(/\/$/, '');
const area = arg('--area', 'sharptail-prairie');
const label = arg('--label', 'cover');
const quality = arg('--quality', 'high');
const tod = arg('--tod', 'morning');
const styles = arg('--styles', 'legacy,masses').split(',');
const [sx, sy] = arg('--spot', '700,560').split(',').map(Number);
const [tx, ty] = arg('--toward', '1000,470').split(',').map(Number);
const distances = arg('--distances', '10,27,40,150').split(',').map(Number);
const pitch = Number(arg('--pitch', '-2'));
const name = arg('--name', 'spot');
const out = resolve(arg('--out', `output/cover/${area}`));
mkdirSync(out, { recursive: true });

const { server } = await startServer(url);
const browser = await puppeteer.launch({ headless: true,
  args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--no-sandbox',
    ...(args.includes('--uncapped') ? ['--disable-frame-rate-limit', '--disable-gpu-vsync'] : [])] });
const report = { area, label, quality, tod, spot: [sx, sy], toward: [tx, ty], frames: [], errors: [] };
try {
  for (const style of styles) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 810 });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    page.on('pageerror', error => report.errors.push(`${style}: ${error}`));
    const query = new URLSearchParams({ area, drop: 'south-gate', quality, tod, dog: 'generated', seed: '7701', capture: '1', cover: style });
    await page.goto(`${url}/index3d.html?${query}`, { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction(() => window.__ready3d === true && !!window.__api3d, { timeout: 240000, polling: 250 });
    // A build without the kit's review hooks on this ground (a baseline
    // checkout) gets the same stand-in: the real generated GSP on point.
    await page.evaluate(async (id, quality) => {
      if (window.__groundKit) return;
      const { getArea } = await import('/src/game/areas.ts');
      const { LandscapeModel } = await import('/src/game/landscape.ts');
      const { createGeneratedGsp } = await import('/src/three/dogs/generatedGsp.ts');
      const landscape = new LandscapeModel(getArea(id)), asset = createGeneratedGsp(quality, false, 'liver-white');
      asset.setPose('point', 1); asset.liftPointingPaw(1);
      window.__api3d.scene().add(asset.root);
      window.__groundKit = {
        style: 'stand-in', stats: () => [],
        placeDog: (x, z, yaw) => { asset.root.position.set(x, landscape.heightAtWorld(x, z), z); asset.root.rotation.set(0, yaw * Math.PI / 180, 0); asset.root.visible = true; },
        hideDog: () => { asset.root.visible = false; },
      };
    }, area, quality);
    const poses = await page.evaluate(async (id, spot, toward, distances, pitch) => {
      const { getArea } = await import('/src/game/areas.ts');
      const { LandscapeModel } = await import('/src/game/landscape.ts');
      const landscape = new LandscapeModel(getArea(id));
      window.__api3d.pause(true);
      const dog = landscape.propertyToWorld(spot[0], spot[1], { x: 0, z: 0 });
      const far = landscape.propertyToWorld(toward[0], toward[1], { x: 0, z: 0 });
      const len = Math.hypot(far.x - dog.x, far.z - dog.z), ux = (far.x - dog.x) / len, uz = (far.z - dog.z) / len;
      // The hunter comes up behind the dog, which points along the line.
      const dogYaw = Math.atan2(ux, uz) * 180 / Math.PI + 180;
      return { dog, dogYaw, views: distances.map(d => {
        const x = dog.x - ux * d, z = dog.z - uz * d;
        // Same yaw convention as review-map: look along the spot -> toward line.
        const yaw = -Math.atan2(ux, -uz) * 180 / Math.PI;
        return { d, x, z, yaw, pitch: d >= 100 ? pitch - 1 : pitch };
      }) };
    }, area, [sx, sy], [tx, ty], distances, pitch);
    for (const view of poses.views) {
      // --nodog frames the cover alone (plant close-ups).
      const pose = (v, dog, staged) => {
        window.__api3d.setPose(v.x, v.z, v.yaw, v.pitch, 0);
        if (staged) window.__groundKit?.placeDog(dog.dog.x, dog.dog.z, dog.dogYaw);
        window.__api3d.renderOnce();
      };
      const staged = !args.includes('--nodog');
      await page.evaluate(pose, view, poses, staged);
      await new Promise(done => setTimeout(done, 500));
      await page.evaluate(pose, view, poses, staged);
      const render = await page.evaluate(() => { window.__api3d.renderOnce(); return { ...window.__api3d.info(), kit: window.__groundKit?.stats?.() }; });
      const file = `${label}-${name}-${style}-${quality}-${tod}-d${view.d}.png`;
      await page.screenshot({ path: `${out}/${file}` });
      let nodog;
      if (args.includes('--dogdiff')) {
        // The same frame without the dog: tools3d/dog-pixels.py measures how
        // much of the pointing dog the cover leaves visible.
        await page.evaluate(() => { window.__groundKit?.hideDog(); window.__api3d.renderOnce(); });
        nodog = file.replace('.png', '-nodog.png');
        await page.screenshot({ path: `${out}/${nodog}` });
      }
      report.frames.push({ style, d: view.d, file, nodog, render });
      console.log(`${style} d${view.d}: ${render.calls} draws, ${render.triangles.toLocaleString()} triangles`);
    }
    await page.close();
  }
  report.result = report.errors.length ? 'errors' : 'passed';
} catch (error) {
  report.result = 'failed'; report.failure = String(error); process.exitCode = 1;
} finally {
  writeFileSync(`${out}/${label}-${name}-${quality}-${tod}.json`, JSON.stringify(report, null, 2));
  await browser.close();
  server?.kill('SIGTERM');
}
console.log(JSON.stringify({ result: report.result, failure: report.failure, errors: report.errors.slice(0, 3), frames: report.frames.length, out }));
