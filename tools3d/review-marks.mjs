#!/usr/bin/env node
/** The hunter's marks in the live HUD: an ordinary page (no capture flag, so
 * the HUD is up), stepped by hand. The hunter walks the cover with the dog to
 * a point, walks in, and watches the birds that go down, as a player does.
 * Frames: the first mark (its callout and the MARK beacon), then facing the
 * mark by the beacon's own arrow, then after "This way" (C), the cast.
 *
 *   tools3d/heavy.sh node tools3d/review-marks.mjs --url http://localhost:4611 --area quail-fields --out /tmp/uplandin-marks/hud
 *
 * Staged camera and clock (the capture API's pose and steps); the game's
 * own systems decide what is marked. Functional evidence, not play.
 */
import puppeteer from 'puppeteer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { startServer } from './playthrough.mjs';

const args = process.argv.slice(2);
const arg = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const url = arg('--url', 'http://localhost:4611').replace(/\/$/, '');
const area = arg('--area', 'quail-fields'), seed = arg('--seed', '7701'), out = arg('--out', '/tmp/uplandin-marks/hud');
const [width, height] = arg('--size', '1440x810').split('x').map(Number);
mkdirSync(out, { recursive: true });

const { server } = await startServer(url);
const browser = await puppeteer.launch({ headless: true,
  args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-frame-rate-limit', '--disable-gpu-vsync'] });
const report = { area, seed, frames: [] };
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.goto(`${url}/index3d.html?${new URLSearchParams({ area, quality: 'high', tod: 'morning', seed })}`, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction(() => window.__ready3d === true && !!window.__api3d, { timeout: 240000, polling: 250 });
  // Into the field; the arrival hands the dog over in real time.
  const entry = await page.$('#enter-field');
  if (entry && await entry.evaluate(button => button.getClientRects().length > 0)) await entry.click();
  await new Promise(done => setTimeout(done, 4000));
  const shot = async (name, note) => {
    const hud = await page.evaluate(() => {
      window.__api3d.renderOnce();
      const mark = document.querySelector('.field-mark');
      return { mark: mark && !mark.hidden ? mark.textContent : null, callout: document.getElementById('dog-callout')?.hidden ? null : document.getElementById('dog-callout')?.textContent,
        guidance: document.getElementById('field-guidance')?.textContent ?? null, dog: window.__api3d.hunt().dog.state };
    });
    await page.screenshot({ path: `${out}/${area}-${name}.png` });
    report.frames.push({ name, note, ...hud });
    console.log(`${name}: ${JSON.stringify(hud)}`);
    return hud;
  };
  const result = await page.evaluate(stageMarks, 36000);
  console.log(JSON.stringify(result));
  report.result = result;
  if (result.ok) {
    await shot('marked', 'the first mark: its callout and the MARK beacon');
    // Face the mark by the beacon's own arrow, as a player would.
    await page.evaluate(() => {
      const arrow = document.querySelector('.field-mark .field-compass-arrow');
      const turn = Number(/rotate\((-?[\d.]+)deg\)/.exec(arrow?.style.transform ?? '')?.[1] ?? 0);
      const t = window.__api3d.telemetry().camera, h = window.__api3d.hunt().hunter;
      window.__api3d.setPose(h.x, h.z, t.yawDeg - turn, -3);
      window.__api3d.renderOnce();
    });
    await shot('facing-mark', 'turned to the mark by the beacon arrow');
    // "This way": the key is read by the running engine (and never by a
    // focused button, so the Enter field button gives up the focus first).
    await page.evaluate(() => { document.activeElement?.blur?.(); window.__api3d.pause(false); });
    await page.keyboard.press('KeyC');
    await new Promise(done => setTimeout(done, 1200));
    await page.evaluate(() => window.__api3d.pause(true));
    await shot('cast', 'after C: the dog casts to the mark');
  }
  report.errors = errors;
} finally {
  writeFileSync(`${out}/${area}-marks.json`, JSON.stringify(report, null, 2));
  await browser.close();
  server?.kill('SIGTERM');
}

/* ------------------------------ in the page ------------------------------ */

/** Walk the cover with the dog to a point, walk in, then watch the birds
 * going down until the HUD shows a mark. */
function stageMarks(maxTicks) {
  const api = window.__api3d;
  api.pause(true);
  const WALK = 1.5, entryYaw = api.telemetry().camera.yawDeg * Math.PI / 180;
  const patches = api.hunt().patches.map(p => ({ x: p.cx, z: p.cz, visited: false }));
  let goal = null, ticks = 0, stable = 0, last = null, rises = 0;
  const next = (x, z) => {
    let best = null, d0 = Infinity;
    for (const p of patches) { const d = Math.hypot(p.x - x, p.z - z); if (!p.visited && d < d0) { d0 = d; best = p; } }
    if (!best) { for (const p of patches) p.visited = false; return patches[0] ?? null; }
    return best;
  };
  const marked = () => { api.renderOnce(); const m = document.querySelector('.field-mark'); return !!m && !m.hidden; };
  while (ticks++ < maxTicks) {
    const h = api.hunt(), cam = api.telemetry().camera;
    let x = h.hunter.x, z = h.hunter.z, yaw = cam.yawDeg;
    const dogM = Math.hypot(h.dog.x - x, h.dog.z - z);
    if (h.dog.state === 'pointing') {
      stable = last && Math.hypot(h.dog.x - last.x, h.dog.z - last.z) < .01 ? stable + 1 : 0;
      last = { x: h.dog.x, z: h.dog.z };
      if (stable >= 20) {
        const flush = api.triggerFlush();
        if (!flush) { stable = 0; continue; }
        // Watch the birds: the one going down, else the middle of them.
        for (let t = 0; t < 30 * 25; t++) {
          api.stepSim(1);
          const birds = api.birds().filter(b => b.status === 'flying' || b.status === 'departing');
          const hunter = api.hunt().hunter, e = api.telemetry().camera;
          if (birds.length) {
            const down = birds.filter(b => b.velocity.y < -.3).sort((a, b) => a.y - b.y)[0];
            const look = down ?? { x: birds.reduce((s, b) => s + b.x, 0) / birds.length, y: birds.reduce((s, b) => s + b.y, 0) / birds.length, z: birds.reduce((s, b) => s + b.z, 0) / birds.length };
            const dx = look.x - hunter.x, dz = look.z - hunter.z;
            api.setPose(hunter.x, hunter.z, Math.atan2(-dx, -dz) * 180 / Math.PI, Math.atan2(look.y - e.y, Math.hypot(dx, dz)) * 180 / Math.PI * .8);
          }
          if (t % 5 === 0 && marked()) return { ok: true, huntSeconds: ticks / 30, riseSeconds: t / 30, flushed: flush.ids.length, rises };
        }
        // Nothing he saw went down: hunt on to the next point.
        rises++; stable = 0; last = null; ticks += 30 * 25;
        continue;
      }
    } else { stable = 0; last = null; }
    if (h.dog.state === 'heel') { x -= Math.sin(entryYaw) * WALK / 30; z -= Math.cos(entryYaw) * WALK / 30; }
    else if (h.dog.state !== 'quartering' || dogM > 70) {
      if (dogM > 16 && h.dog.state !== 'pointing') { const dx = h.dog.x - x, dz = h.dog.z - z; x += dx / dogM * WALK / 30; z += dz / dogM * WALK / 30; yaw = Math.atan2(-dx, -dz) * 180 / Math.PI; }
    } else {
      if (!goal || Math.hypot(goal.x - x, goal.z - z) < 8) { if (goal) goal.visited = true; goal = next(x, z); }
      if (goal) { const dx = goal.x - x, dz = goal.z - z, d = Math.hypot(dx, dz) || 1; x += dx / d * WALK / 30; z += dz / d * WALK / 30; yaw = Math.atan2(-dx, -dz) * 180 / Math.PI; }
    }
    api.setPose(x, z, yaw, 0);
    api.stepSim(1);
  }
  return { ok: false, why: `no mark in ${rises} rises`, huntSeconds: ticks / 30 };
}
