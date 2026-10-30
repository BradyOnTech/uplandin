#!/usr/bin/env node
/** Season and weather review for one ground and tier: month and weather
 * strips of fixed review views, frame cost per day, and readability: the
 * real pointing dog seen from 30 yd and the covey's first birds in the air,
 * the same frozen moment dressed for each day, each with and without its
 * subject so tools3d/weather-sheet.py can measure what the day leaves of it.
 *
 *   node tools3d/weather-review.mjs --area chukar-ridge --quality high --label m3 --url http://localhost:4612 --uncapped
 *   node tools3d/weather-review.mjs --area chukar-ridge --quality lite --size 844x390 --parts readability --label m3 ...
 *
 * The page loads a frost October morning (the day staged visits were
 * forced to before the field showed weather), so the hunt to the point is
 * the same hunt on a build without days; the capture-only __fieldReview
 * hook then dresses the field for each day in place. Without the hook (an
 * older build) each part is captured once, as the page's own day, labelled
 * "base". Staged camera, controlled clock: look-development evidence, never
 * playthrough evidence. Wrap in tools3d/heavy.sh.
 */
import puppeteer from 'puppeteer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { startServer } from './playthrough.mjs';

const args = process.argv.slice(2);
const arg = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const url = arg('--url', 'http://localhost:4517').replace(/\/$/, '');
const area = arg('--area', 'sharptail-prairie');
const quality = arg('--quality', 'high');
const label = arg('--label', 'current');
const tod = arg('--tod', 'morning');
const seed = arg('--seed', '7701');
const [width, height] = arg('--size', '1440x810').split('x').map(Number);
const parts = arg('--parts', 'strips,cost,readability').split(',');
const VIEWS = { 'quail-fields': 'truck,vista', 'sharptail-prairie': 'truck,vista', 'pheasant-coverts': 'truck,vista', 'chukar-ridge': 'truck,vista' };
const views = arg('--views', VIEWS[area] ?? 'truck').split(',');
const out = resolve(arg('--out', `/tmp/uplandin-weather/${area}`));
const maxTicks = Number(arg('--max-ticks', '36000'));
/** Yards to metres: the point is judged from 30 yd. */
const POINT_M = 30 * .9144;
/** Seconds into the rise for the birds-in-the-air frames. */
const RISE_TIMES = arg('--rise', '0.5,1.2').split(',').map(Number);
const COST_FRAMES = Number(arg('--frames', '40'));
mkdirSync(out, { recursive: true });

const LOADED = { id: 'frost', condition: 'frost', month: 'October', wind: 'breezy' };
const MONTHS = [
  { id: 'sep', condition: 'mild', month: 'September', wind: 'breezy' },
  { id: 'oct', condition: 'mild', month: 'October', wind: 'breezy' },
  { id: 'nov', condition: 'mild', month: 'November', wind: 'breezy' },
  { id: 'dec', condition: 'mild', month: 'December', wind: 'breezy' },
  { id: 'jan', condition: 'mild', month: 'January', wind: 'breezy' },
];
const WEATHERS = [
  { id: 'clear', condition: 'mild', month: 'October', wind: 'breezy' },
  { id: 'rain', condition: 'rain', month: 'October', wind: 'breezy' },
  { id: 'frost', condition: 'frost', month: 'October', wind: 'breezy' },
  { id: 'snow', condition: 'snow', month: 'October', wind: 'breezy' },
  { id: 'wind', condition: 'mild', month: 'October', wind: 'strong' },
];

const { server } = await startServer(url);
const browser = await puppeteer.launch({ headless: true,
  args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--no-sandbox',
    ...(args.includes('--uncapped') ? ['--disable-frame-rate-limit', '--disable-gpu-vsync'] : [])] });
const report = { area, label, quality, tod, seed, width, height, url, startedAt: new Date().toISOString(), hook: false, frames: [], cost: [], errors: [] };
const prefix = `${label}-${quality}-${width}x${height}`;
try {
  const page = await browser.newPage();
  await page.setViewport({ width, height });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  page.on('pageerror', error => report.errors.push(String(error)));
  // three reports a shader that fails to compile on the console, not as a page error.
  page.on('console', message => { if (message.type() === 'error' && /shader|program|webgl/i.test(message.text())) report.errors.push(message.text().slice(0, 400)); });
  const query = new URLSearchParams({ area, drop: 'south-gate', quality, tod, dog: 'generated', seed, capture: '1', weather: LOADED.condition, month: 'oct' });
  await page.goto(`${url}/index3d.html?${query}`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__ready3d === true && !!window.__api3d, { timeout: 240000, polling: 250 });
  await page.evaluate(() => { window.__api3d.pause(true); window.__api3d.renderOnce(); });
  report.hook = await page.evaluate(() => !!window.__fieldReview);
  report.gpu = await page.evaluate(() => {
    const gl = document.querySelector('canvas')?.getContext('webgl2');
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'unknown';
  });
  const setDay = day => page.evaluate(d => { window.__fieldReview?.setDay(d.condition, d.month, d.wind); }, day);
  const shoot = async name => { const file = `${prefix}-${name}.jpg`; await page.screenshot({ path: `${out}/${file}`, type: 'jpeg', quality: 92 }); return file; };
  const days = list => report.hook ? list : [{ id: 'base' }];

  const reviewViews = await page.evaluate(async id => {
    const { getArea } = await import('/src/game/areas.ts');
    const { LandscapeModel } = await import('/src/game/landscape.ts');
    const { mapReviewViews } = await import('/tools3d/mapReviewViews.ts');
    const area = getArea(id), landscape = new LandscapeModel(area);
    return mapReviewViews(area).map(view => {
      const world = landscape.propertyToWorld(view.at[0], view.at[1], { x: 0, z: 0 });
      const yaw = -Math.atan2(view.toward[0] - view.at[0], -(view.toward[1] - view.at[1])) * 180 / Math.PI;
      return { ...view, world, yaw };
    });
  }, area);
  const posed = async view => {
    const pose = v => { window.__api3d.setPose(v.world.x, v.world.z, v.yaw, v.pitch, v.lift ?? 0); window.__api3d.renderOnce(); };
    await page.evaluate(pose, view);
    await new Promise(done => setTimeout(done, 400));
    await page.evaluate(pose, view);
    return page.evaluate(() => { window.__api3d.renderOnce(); return window.__api3d.info(); });
  };

  if (parts.includes('strips')) {
    for (const viewId of views) {
      const view = reviewViews.find(v => v.id === viewId);
      if (!view) { report.errors.push(`no view ${viewId}`); continue; }
      for (const [strip, list] of [['month', MONTHS], ['weather', WEATHERS]]) {
        if (!report.hook && strip === 'weather') continue;
        for (const day of days(list)) {
          if (report.hook) await setDay(day);
          const render = await posed(view);
          const file = await shoot(`${strip}-${viewId}-${day.id}`);
          report.frames.push({ part: 'strip', strip, view: viewId, day: day.id, file, render });
          console.log(`${strip} ${viewId} ${day.id}: ${render.calls} draws, ${render.triangles.toLocaleString()} triangles`);
        }
      }
    }
    if (report.hook) await setDay(LOADED);
  }

  if (parts.includes('cost')) {
    // Frame cost: every system's update and the render, synchronised with
    // a one-pixel read so the GPU's share is counted. Uncapped headless
    // Chrome on this Mac: comparable between days and builds, not a phone.
    const view = reviewViews.find(v => v.id === views[0]);
    await posed(view);
    for (const day of days(WEATHERS)) {
      if (report.hook) await setDay(day);
      const cost = await page.evaluate(frames => {
        const gl = document.querySelector('canvas').getContext('webgl2'), px = new Uint8Array(4), ms = [];
        for (let i = 0; i < frames + 6; i++) {
          const t0 = performance.now();
          window.__api3d.renderOnce();
          gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
          if (i >= 6) ms.push(performance.now() - t0);
        }
        ms.sort((a, b) => a - b);
        return { median: ms[ms.length >> 1], p90: ms[Math.floor(ms.length * .9)], min: ms[0], ...window.__api3d.info() };
      }, COST_FRAMES);
      report.cost.push({ view: view.id, day: day.id, ...cost });
      console.log(`cost ${view.id} ${day.id}: median ${cost.median.toFixed(2)} ms, p90 ${cost.p90.toFixed(2)} ms, ${cost.calls} draws`);
    }
    if (report.hook) await setDay(LOADED);
  }

  if (parts.includes('readability')) {
    const hunt = await page.evaluate(huntToPoint, maxTicks);
    report.hunt = hunt;
    if (!hunt.ok) report.errors.push(hunt.why);
    else {
      console.log(`point after ${hunt.seconds.toFixed(0)} s, dog ${hunt.dogFromHunterM.toFixed(1)} m from the hunter`);
      // The dog from 30 yd, back along the hunter's line to it.
      const at = await page.evaluate((m) => {
        const h = window.__api3d.hunt(), dx = h.dog.x - h.hunter.x, dz = h.dog.z - h.hunter.z, d = Math.hypot(dx, dz) || 1;
        const x = h.dog.x - dx / d * m, z = h.dog.z - dz / d * m, yaw = Math.atan2(-dx, -dz) * 180 / Math.PI;
        window.__api3d.setPose(x, z, yaw, -1.5, 0); window.__api3d.renderOnce();
        return { x, z, yaw, dog: { x: h.dog.x, z: h.dog.z } };
      }, POINT_M);
      for (const day of days(WEATHERS)) {
        if (report.hook) await setDay(day);
        const frame = await page.evaluate(() => {
          window.__api3d.renderOnce(); window.__api3d.renderOnce();
          const s = window.__dogAudit?.state(), cam = window.__api3d.telemetry().camera;
          const root = s?.root ?? { x: 0, y: 0, z: 0 };
          return { dog: s ? { ...window.__dogAudit.project(root.x, root.y + .45, root.z), state: s.state } : null,
            rangeM: s ? Math.hypot(root.x - cam.x, root.z - cam.z) : null, render: window.__api3d.info() };
        });
        const file = await shoot(`dog-${day.id}`);
        await page.evaluate(() => { window.__dogAudit?.setBodyVisible(false); window.__api3d.renderOnce(); });
        const without = await shoot(`nodog-${day.id}`);
        await page.evaluate(() => { window.__dogAudit?.setBodyVisible(true); window.__api3d.renderOnce(); });
        report.frames.push({ part: 'dog', day: day.id, file, without, ...frame });
        console.log(`dog ${day.id}: ${frame.rangeM?.toFixed(1)} m, ${frame.dog?.state}`);
      }
      if (report.hook) await setDay(LOADED);
      // The rise from the hunter's eye where the flush law stops his walk.
      const rise = await page.evaluate(() => {
        const h = window.__api3d.hunt(), yaw = Math.atan2(-(h.dog.x - h.hunter.x), -(h.dog.z - h.hunter.z)) * 180 / Math.PI;
        window.__api3d.setPose(h.hunter.x, h.hunter.z, yaw, 0, 0);
        const flush = window.__api3d.triggerFlush();
        if (!flush) return { ok: false };
        window.__api3d.stepSim(1);
        const hunter = window.__api3d.hunt().hunter, up = window.__riseAudit.sky().birds;
        const look = up.length ? { x: up.reduce((s, b) => s + b.x, 0) / up.length, z: up.reduce((s, b) => s + b.z, 0) / up.length } : window.__api3d.hunt().dog;
        const lookYaw = Math.atan2(-(look.x - hunter.x), -(look.z - hunter.z)) * 180 / Math.PI;
        window.__api3d.setPose(hunter.x, hunter.z, lookYaw, 6, 0);
        return { ok: true, flushed: flush.ids.length, walkInM: flush.distPx };
      });
      report.rise = rise;
      let elapsed = 1 / 30;
      for (const t of rise.ok ? RISE_TIMES : []) {
        const ticks = Math.max(0, Math.round((t - elapsed) * 30));
        await page.evaluate(n => window.__api3d.stepSim(n), ticks);
        elapsed += ticks / 30;
        for (const day of days(WEATHERS)) {
          if (report.hook) await setDay(day);
          const frame = await page.evaluate(() => {
            window.__api3d.renderOnce(); window.__api3d.renderOnce();
            const cam = window.__api3d.telemetry().camera, H = innerHeight, fov = cam.fov * Math.PI / 180;
            const birds = window.__riseAudit.sky().birds.filter(b => b.status !== 'waiting').map(b => {
              const p = window.__dogAudit ? window.__dogAudit.project(b.x, b.y, b.z) : null;
              const range = Math.hypot(b.x - cam.x, b.y - cam.y, b.z - cam.z);
              return { simId: b.simId, status: b.status, rangeM: +range.toFixed(1), px: p, spanPx: +(b.sizeM * (H / 2) / (Math.tan(fov / 2) * range)).toFixed(1) };
            });
            return { birds, render: window.__api3d.info() };
          });
          const file = await shoot(`birds-t${t}-${day.id}`);
          await page.evaluate(() => { window.__fieldReview?.setBirdsVisible(false); window.__api3d.renderOnce(); });
          const without = report.hook ? await shoot(`nobirds-t${t}-${day.id}`) : null;
          await page.evaluate(() => { window.__fieldReview?.setBirdsVisible(true); window.__api3d.renderOnce(); });
          report.frames.push({ part: 'birds', t, day: day.id, file, without, ...frame });
          console.log(`birds t${t} ${day.id}: ${frame.birds.length} up, ranges ${frame.birds.map(b => b.rangeM).join('/')} m`);
        }
        if (report.hook) await setDay(LOADED);
      }
    }
  }
  report.result = report.errors.length ? 'errors' : 'passed';
} catch (error) {
  report.result = 'failed'; report.failure = String(error?.stack ?? error); process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  writeFileSync(`${out}/${prefix}.json`, JSON.stringify(report, null, 2));
  await browser.close();
  server?.kill('SIGTERM');
}
console.log(JSON.stringify({ result: report.result, failure: report.failure, errors: report.errors.slice(0, 3), frames: report.frames.length, hook: report.hook, gpu: report.gpu, out }));

/* ------------------------------ in the page ------------------------------ */

/** Walk after the dog, patch to patch, until it holds a steady point (the
 * hunt the rise review plays, without its species filter). */
function huntToPoint(maxTicks) {
  const api = window.__api3d;
  api.pause(true);
  const WALK = 1.5 / 30, REACHED_M = 8, WAIT_FOR_DOG_M = 70;
  const entryYaw = api.telemetry().camera.yawDeg * Math.PI / 180;
  const patches = api.hunt().patches.map(p => ({ x: p.cx, z: p.cz, visited: false }));
  let goal = null;
  const nextGoal = (x, z) => {
    let best = null, bestD = Infinity;
    for (const p of patches) { if (p.visited) continue; const d = Math.hypot(p.x - x, p.z - z); if (d < bestD) { bestD = d; best = p; } }
    if (!best) { for (const p of patches) p.visited = false; return patches[0] ?? null; }
    return best;
  };
  let lastX = null, lastZ = null, stable = 0;
  for (let ticks = 0; ticks < maxTicks; ticks++) {
    const h = api.hunt(), cam = api.telemetry().camera;
    let x = h.hunter.x, z = h.hunter.z, yaw = cam.yawDeg;
    const dogM = Math.hypot(h.dog.x - x, h.dog.z - z);
    if (h.dog.state === 'heel') { x -= Math.sin(entryYaw) * WALK; z -= Math.cos(entryYaw) * WALK; }
    else if (h.dog.state !== 'pointing' && h.dog.state !== 'retrieving' && (h.dog.state !== 'quartering' || dogM > WAIT_FOR_DOG_M)) {
      if (dogM > 16) { const dx = h.dog.x - x, dz = h.dog.z - z; x += dx / dogM * WALK; z += dz / dogM * WALK; yaw = Math.atan2(-dx, -dz) * 180 / Math.PI; }
    } else if (h.dog.state === 'quartering') {
      if (!goal || Math.hypot(goal.x - x, goal.z - z) < REACHED_M) { if (goal) goal.visited = true; goal = nextGoal(x, z); }
      if (goal) { const dx = goal.x - x, dz = goal.z - z, d = Math.hypot(dx, dz) || 1; x += dx / d * WALK; z += dz / d * WALK; yaw = Math.atan2(-dx, -dz) * 180 / Math.PI; }
    }
    api.setPose(x, z, yaw, 0);
    api.stepSim(1);
    if (h.dog.state === 'pointing' && window.__riseAudit.sky().birds.length === 0) {
      stable = lastX !== null && Math.hypot(h.dog.x - lastX, h.dog.z - lastZ) < .01 ? stable + 1 : 0;
      lastX = h.dog.x; lastZ = h.dog.z;
      if (stable >= 20) {
        const now = api.hunt();
        return { ok: true, seconds: ticks / 30, dogFromHunterM: Math.hypot(now.dog.x - now.hunter.x, now.dog.z - now.hunter.z), dog: now.dog, hunter: now.hunter };
      }
    } else { lastX = null; stable = 0; }
  }
  return { ok: false, why: `no point in ${maxTicks} ticks` };
}
