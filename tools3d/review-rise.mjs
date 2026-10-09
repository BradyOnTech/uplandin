#!/usr/bin/env node
/** The rise from the hunter's eye, on each core ground, as a strip of frames
 * at fixed times with per-frame telemetry (tools3d/rise-sheet.py draws it).
 *
 *   node tools3d/review-rise.mjs --url http://localhost:4611 --label before
 *   node tools3d/review-rise.mjs --url http://localhost:4611 --label after --areas quail-fields --sizes 844x390:lite
 *
 * Each ground runs from a fixed seed in capture mode. The hunter walks after
 * the dog (stopping inside follow range) until the dog holds a point, then
 * triggerFlush() walks him in under the simulation's own flush law. The
 * camera stays at the hunter's eye where the walk-in ended, facing the
 * pointed bird with a hunter's ready gaze, and the whole field (dog included)
 * keeps running while the rise plays. Staged camera, controlled clock: rise
 * review evidence, never evidence of ordinary play.
 *
 * Telemetry per frame: birds in play (flying, waiting, falling) and visible
 * (flying, falling, departing), each bird's projected span in px and screen
 * position, the angular separation between airborne birds from the shooter,
 * whether each bird is sky-backed (terrain never rises above the line of
 * sight beyond it), and its line from the gun (straightaway, quartering,
 * crossing, incoming) read from its velocity against the line of sight.
 */
import puppeteer from 'puppeteer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { startServer } from './playthrough.mjs';

const args = process.argv.slice(2);
const arg = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const url = arg('--url', 'http://localhost:4611').replace(/\/$/, '');
const label = arg('--label', 'current');
const areas = arg('--areas', 'quail-fields,sharptail-prairie,pheasant-coverts,chukar-ridge').split(',').filter(Boolean);
const sizes = arg('--sizes', '1440x810:high,844x390:lite').split(',').map(entry => {
  const [dims, quality] = entry.split(':'); const [width, height] = dims.split('x').map(Number);
  return { width, height, quality: quality ?? 'high', id: `${width}x${height}-${quality ?? 'high'}` };
});
const seedFor = { 'quail-fields': 7701, 'sharptail-prairie': 7701, 'pheasant-coverts': 7701, 'chukar-ridge': 7701 };
const seedArg = arg('--seed', '');
/** The ground's own bird; points on other species are hunted through. */
const speciesFor = { 'quail-fields': 'bobwhite', 'sharptail-prairie': 'sharptail', 'pheasant-coverts': 'ringneck', 'chukar-ridge': 'chukar' };
const times = arg('--times', '0.25,0.5,0.75,1,1.5,2,2.5,3,4,5').split(',').map(Number);
const settleSeconds = Number(arg('--settle', '14'));
const tod = arg('--tod', 'morning');
const out = resolve(arg('--out', `/tmp/uplandin-rise/${label}`));
const maxHuntTicks = Number(arg('--max-ticks', '36000'));
/** --shoot: a hunter with a double fires at the first bird of each wave
 * 0.75 s after it rises (a hit) and at a wave-mate 0.5 s later (a miss),
 * then reloads (0.55 s + 0.38 s a shell). The capture never fires the real
 * gun: the shells go to the wave rule through the birds' capture audit. */
const shoot = args.includes('--shoot');
mkdirSync(out, { recursive: true });

const { server } = await startServer(url);
const browser = await puppeteer.launch({ headless: true,
  args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-frame-rate-limit', '--disable-gpu-vsync'] });
const summary = { label, url, tod, startedAt: new Date().toISOString(), rises: [] };
try {
  for (const area of areas) {
    for (const size of sizes) {
      const seed = seedArg || seedFor[area] || 7701;
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(String(error)));
      const phone = size.width < 1000;
      await page.setViewport({ width: size.width, height: size.height, deviceScaleFactor: 1, isMobile: phone, hasTouch: phone });
      await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
      const query = new URLSearchParams({ area, quality: size.quality, tod, seed: String(seed), capture: '1' });
      await page.goto(`${url}/index3d.html?${query}`, { waitUntil: 'load', timeout: 180000 });
      await page.waitForFunction(() => window.__ready3d === true && !!window.__api3d && !!window.__riseAudit, { timeout: 240000, polling: 250 });
      const hunt = await page.evaluate(runHuntToPoint, maxHuntTicks, speciesFor[area] ?? null, shoot);
      const record = { area, seed, size: size.id, width: size.width, height: size.height, quality: size.quality, hunt, frames: [], errors };
      if (!hunt.ok) {
        console.error(`${area} ${size.id}: ${hunt.why}`);
        summary.rises.push(record); await page.close(); continue;
      }
      console.log(`${area} ${size.id}: ${hunt.speciesId} point after ${hunt.huntSeconds.toFixed(0)} s (passed over ${hunt.passedOver.length}), covey ${hunt.coveySize}, flushed ${hunt.flushed.length}, walk-in ${hunt.walkInM.toFixed(1)} m`);
      let elapsed = 0;
      for (const t of times) {
        const ticks = Math.max(0, Math.round((t - elapsed) * 30));
        const frame = await page.evaluate(stepAndMeasure, ticks);
        elapsed += ticks / 30;
        const file = `${area}-${size.id}-t${String(Math.round(t * 1000)).padStart(5, '0')}.jpg`;
        await page.screenshot({ path: `${out}/${file}`, type: 'jpeg', quality: 88 });
        record.frames.push({ t, file, ...frame });
      }
      // Run the rest of the rise without frames so the summary sees every bird out.
      const settle = await page.evaluate(stepAndMeasure, Math.max(0, Math.round((settleSeconds - elapsed) * 30)));
      record.final = await page.evaluate(() => window.__riseReview.summary());
      record.settle = { inPlay: settle.inPlay, visible: settle.visible, queued: settle.queued };
      record.render = await page.evaluate(() => window.__api3d.info());
      summary.rises.push(record);
      const f = record.final;
      console.log(`  in play max ${f.maxInPlay}, visible max ${f.maxVisible}, birds ${f.birds.length}, ` +
        `min separation ${f.minSeparationDeg?.toFixed(1) ?? '-'} deg, shot window ${f.shotWindow ? `min ${f.shotWindow.minDeg.toFixed(1)} / median ${f.shotWindow.medianDeg.toFixed(1)} deg, ${(f.shotWindow.share5Deg * 100).toFixed(0)}% >= 5 deg` : '-'}, sky-backed first second ${(f.skyShareFirstSecond * 100).toFixed(0)}%, ` +
        `lines ${JSON.stringify(f.lines)}, rise length ${f.riseLengthS?.toFixed(1) ?? '-'} s (settled ${f.riseOverS?.toFixed(1) ?? '-'} s), waves at ${f.waveTimesS.join("/")} s, shots ${f.shots.length} (${f.shots.filter(s => s.hit).length} hit), ${record.render.calls} draws`);
      if (errors.length) console.error(`  page errors: ${errors.join(' | ')}`);
      await page.close();
    }
  }
} finally {
  summary.finishedAt = new Date().toISOString();
  writeFileSync(`${out}/rise-${label}.json`, JSON.stringify(summary, null, 2));
  await browser.close();
  server?.kill('SIGTERM');
}
const sheet = spawnSync('python3', [resolve('tools3d/rise-sheet.py'), `${out}/rise-${label}.json`], { encoding: 'utf8' });
process.stdout.write(sheet.stdout); process.stderr.write(sheet.stderr);

/* ------------------------------ in the page ------------------------------ */

/** Hunt the cover, patch to nearest patch, until the dog holds a point on
 * the ground's own bird; then walk in and flush. The dog quarters ahead of
 * the walking hunter, as it does in play. */
function runHuntToPoint(maxTicks, wantSpecies, shoot) {
  const api = window.__api3d;
  // The field is stepped by hand; the live frame loop must not move the camera.
  api.pause(true);
  const WALK_MPS = 1.5, REACHED_M = 8, WAIT_FOR_DOG_M = 70;
  const entryYaw = api.telemetry().camera.yawDeg * Math.PI / 180;
  const patches = api.hunt().patches.map(p => ({ x: p.cx, z: p.cz, visited: false }));
  let goal = null;
  const nextGoal = (x, z) => {
    let best = null, bestD = Infinity;
    for (const p of patches) {
      if (p.visited) continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bestD) { bestD = d; best = p; }
    }
    if (!best) { for (const p of patches) p.visited = false; return patches[0] ?? null; }
    return best;
  };
  const tickHunter = () => {
    const h = api.hunt(), cam = api.telemetry().camera;
    let x = h.hunter.x, z = h.hunter.z, yaw = cam.yawDeg;
    const dogM = Math.hypot(h.dog.x - x, h.dog.z - z);
    if (h.dog.state === 'heel') {
      // The dog waits at heel until the hunter steps off from the truck.
      x -= Math.sin(entryYaw) * WALK_MPS / 30; z -= Math.cos(entryYaw) * WALK_MPS / 30;
    } else if (h.dog.state !== 'pointing' && h.dog.state !== 'retrieving' && (h.dog.state !== 'quartering' || dogM > WAIT_FOR_DOG_M)) {
      // A dog working scent (or gone wide) is followed, not left behind.
      if (dogM > 16) {
        const dx = h.dog.x - x, dz = h.dog.z - z;
        x += dx / dogM * WALK_MPS / 30; z += dz / dogM * WALK_MPS / 30;
        yaw = Math.atan2(-dx, -dz) * 180 / Math.PI;
      }
    } else if (h.dog.state === 'quartering') {
      if (!goal || Math.hypot(goal.x - x, goal.z - z) < REACHED_M) { if (goal) goal.visited = true; goal = nextGoal(x, z); }
      if (goal) {
        const dx = goal.x - x, dz = goal.z - z, d = Math.hypot(dx, dz) || 1;
        x += dx / d * WALK_MPS / 30; z += dz / d * WALK_MPS / 30;
        yaw = Math.atan2(-dx, -dz) * 180 / Math.PI;
      }
    }
    api.setPose(x, z, yaw, 0);
    api.stepSim(1);
    return h;
  };
  let ticks = 0, lastX = null, lastZ = null, stable = 0;
  const passedOver = [];
  while (ticks < maxTicks) {
    const h = tickHunter(); ticks++;
    if (h.dog.state === 'pointing' && window.__riseAudit.sky().birds.length === 0) {
      stable = lastX !== null && Math.hypot(h.dog.x - lastX, h.dog.z - lastZ) < 0.01 ? stable + 1 : 0;
      lastX = h.dog.x; lastZ = h.dog.z;
      if (stable >= 20) {
        const pointed = api.telemetry().pointedBird;
        const bird = window.__riseAudit.pointedBird();
        const coveySize = window.__riseAudit.pointedCoveySize();
        const before = api.hunt().hunter;
        const flush = api.triggerFlush();
        if (!flush) { stable = 0; continue; }
        if (wantSpecies && bird?.speciesId !== wantSpecies) {
          // Another species on this ground: hunt it through like anyone
          // would, let the sky clear, and go on to the ground's own bird.
          passedOver.push({ speciesId: bird?.speciesId, coveySize, atS: ticks / 30 });
          for (let i = 0; i < 30 * 20 && (i < 30 || window.__riseAudit.sky().riseActive); i++) { api.stepSim(1); ticks++; }
          stable = 0; lastX = null;
          continue;
        }
        api.stepSim(1);
        const hunter = api.hunt().hunter;
        // The hunter turns to the birds that actually rose, his gaze a little
        // above the cover; the pointed bird stands in if none are up yet.
        const up = window.__riseAudit.sky().birds;
        const look = up.length ? { x: up.reduce((s, b) => s + b.x, 0) / up.length, z: up.reduce((s, b) => s + b.z, 0) / up.length } : pointed;
        const yaw = Math.atan2(-(look.x - hunter.x), -(look.z - hunter.z)) * 180 / Math.PI;
        api.setPose(hunter.x, hunter.z, yaw, 4);
        installReview(hunter, look);
        return { ok: true, huntSeconds: ticks / 30, speciesId: bird?.speciesId, sex: bird?.sex, coveySize, flushed: flush.ids,
          walkInM: Math.hypot(hunter.x - before.x, hunter.z - before.z), pointed, look, hunter, yawDeg: yaw, passedOver, dog: api.hunt().dog };
      }
    } else { lastX = null; stable = 0; }
  }
  return { ok: false, why: `no point on ${wantSpecies ?? 'any bird'} in ${maxTicks} ticks`, passedOver, dog: api.hunt().dog };

  function installReview(hunter, origin) {
    const tracks = new Map();
    let tick = 0, maxInPlay = 0, maxVisible = 0, minSeparation = Infinity, riseOver = null, envelopeClear = null;
    // Shooting hunter (--shoot): a double, fired and reloaded on a fixed rhythm.
    const RELOAD_TICKS = Math.round((0.55 + 2 * 0.38) * 30);
    const gun = { shells: 2, capacity: 2, reloading: false };
    let reloadAt = null, reloadedAt = null;
    const shots = [], waves = new Map();
    if (shoot) window.__riseAudit.gun(gun);
    const fire = (target, hit) => {
      if (gun.reloading || gun.shells <= 0) return;
      const bird = window.__riseAudit.sky().birds.find(b => b.simId === target && b.status === 'flying');
      if (!bird) return;
      gun.shells--;
      shots.push({ t: tick / 30, target, hit, rangeM: +Math.hypot(bird.x - hunter.x, bird.z - hunter.z).toFixed(1) });
      if (hit) api.downBird(target);
      if (gun.shells <= 0) reloadAt = tick + 10;
    };
    const shooter = () => {
      if (!shoot) return;
      if (reloadAt !== null && tick >= reloadAt) { gun.reloading = true; reloadAt = null; reloadedAt = tick + RELOAD_TICKS; }
      if (reloadedAt !== null && tick >= reloadedAt) { gun.reloading = false; gun.shells = gun.capacity; reloadedAt = null; }
      for (const wave of waves.values()) {
        if (!wave.first && tick >= wave.tick + 23) { wave.first = true; fire(wave.ids[0], true); }
        if (!wave.second && tick >= wave.tick + 38) { wave.second = true; if (wave.ids[1] !== undefined) fire(wave.ids[1], false); }
      }
    };
    const shotSeparations = [];
    const heightAt = (x, z) => window.__dogAudit ? window.__dogAudit.heightAt(x, z) : 0;
    const coverAt = (x, z) => window.__dogAudit ? window.__dogAudit.coverAt(x, z) : 0;
    const eye = () => api.telemetry().camera;
    // Terrain, plus the standing cover's crown for the first stretch past the
    // bird (trees and far props are not in either sampler: a known limit).
    const skyBacked = (e, b) => {
      let dx = b.x - e.x, dy = b.y - e.y, dz = b.z - e.z; const l = Math.hypot(dx, dy, dz) || 1;
      dx /= l; dy /= l; dz /= l;
      for (let s = 0.5; s < 1800; s *= 1.08) {
        const x = b.x + dx * s, y = b.y + dy * s, z = b.z + dz * s;
        if (heightAt(x, z) + (s < 80 ? coverAt(x, z) : 0) > y) return false;
      }
      return true;
    };
    const lineOf = (e, b) => {
      const lx = b.x - e.x, lz = b.z - e.z, ll = Math.hypot(lx, lz) || 1;
      const sp = Math.hypot(b.vx, b.vz);
      if (sp < 0.5) return 'rising';
      const cos = (lx * b.vx + lz * b.vz) / (ll * sp);
      const deg = Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;
      return deg < 25 ? 'straightaway' : deg < 65 ? 'quartering' : deg < 115 ? 'crossing' : 'incoming';
    };
    const measure = (withScreen) => {
      const sky = window.__riseAudit.sky(), e = eye();
      const fov = e.fov * Math.PI / 180, H = innerHeight;
      const yaw = e.yawDeg * Math.PI / 180, pitch = e.pitchDeg * Math.PI / 180;
      const fx = -Math.sin(yaw) * Math.cos(pitch), fy = Math.sin(pitch), fz = -Math.cos(yaw) * Math.cos(pitch);
      const inPlay = sky.birds.filter(b => b.status === 'flying' || b.status === 'waiting' || b.status === 'falling');
      const visible = sky.birds.filter(b => b.status !== 'waiting');
      const birds = visible.map(b => {
        const depth = (b.x - e.x) * fx + (b.y - e.y) * fy + (b.z - e.z) * fz;
        const range = Math.hypot(b.x - e.x, b.y - e.y, b.z - e.z);
        const out = { simId: b.simId, status: b.status, speciesId: b.speciesId, sex: b.sex, airMs: Math.round(b.airMs),
          rangeM: +range.toFixed(1), heightM: +(b.y - heightAt(b.x, b.z)).toFixed(2),
          spanPx: depth > 0 ? +(b.sizeM * (H / 2) / (Math.tan(fov / 2) * depth)).toFixed(1) : 0,
          sky: skyBacked(e, b), line: lineOf(e, b) };
        if (withScreen && window.__dogAudit) {
          const p = window.__dogAudit.project(b.x, b.y, b.z);
          out.screen = { x: Math.round(p.x), y: Math.round(p.y), onScreen: depth > 0 && p.x >= 0 && p.x <= innerWidth && p.y >= 0 && p.y <= innerHeight };
        }
        return out;
      });
      // Separation from the gun between live birds; the shot window counts
      // pairs that are both 0.5-2.5 s out of the cover, when a hunter shoots.
      const flying = visible.filter(b => b.status === 'flying');
      const inShotWindow = (b) => b.airMs >= 500 && b.airMs <= 2500;
      let minPair = null, minShot = null;
      for (let i = 0; i < flying.length; i++) for (let j = i + 1; j < flying.length; j++) {
        const a = flying[i], c = flying[j];
        const ax = a.x - e.x, ay = a.y - e.y, az = a.z - e.z, cx = c.x - e.x, cy = c.y - e.y, cz = c.z - e.z;
        const cos = (ax * cx + ay * cy + az * cz) / ((Math.hypot(ax, ay, az) * Math.hypot(cx, cy, cz)) || 1);
        const deg = Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;
        if (minPair === null || deg < minPair) minPair = deg;
        if (inShotWindow(a) && inShotWindow(c) && (minShot === null || deg < minShot)) minShot = deg;
      }
      return { sky, e, inPlay: inPlay.length, visible: visible.length, birds, minPairDeg: minPair, minShotDeg: minShot, queued: sky.queued };
    };
    const observe = () => {
      const m = measure(false);
      maxInPlay = Math.max(maxInPlay, m.inPlay); maxVisible = Math.max(maxVisible, m.visible);
      if (m.minPairDeg !== null) minSeparation = Math.min(minSeparation, m.minPairDeg);
      if (m.minShotDeg !== null) shotSeparations.push(m.minShotDeg);
      if (riseOver === null && tick > 3 && m.inPlay === 0 && m.queued === 0) riseOver = tick / 30;
      // The rise's length for the hunter: until nothing is queued and no live
      // bird is still inside effective range (40 m) of where he stands.
      const holding = m.sky.birds.some(b => (b.status === 'flying' || b.status === 'waiting') && Math.hypot(b.x - hunter.x, b.z - hunter.z) <= 40);
      if (holding || m.queued > 0) envelopeClear = null; else envelopeClear ??= tick / 30;
      for (const b of m.sky.birds) {
        if (tracks.has(b.simId)) continue;
        const wave = waves.get(tick) ?? { tick, ids: [] };
        wave.ids.push(b.simId); waves.set(tick, wave);
      }
      for (const b of m.sky.birds) {
        let track = tracks.get(b.simId);
        if (!track) { track = { simId: b.simId, speciesId: b.speciesId, sex: b.sex, firstSeen: tick / 30, launched: null, firstSecond: [], line: null, last: null, spanAt1s: null }; tracks.set(b.simId, track); }
        if (b.status === 'flying' && track.launched === null) track.launched = tick / 30;
        if (b.status === 'flying' && b.airMs <= 1000) track.firstSecond.push(skyBacked(m.e, b));
        if (b.status === 'flying' && track.line === null && b.airMs >= 800) track.line = lineOf(m.e, b);
        const shown = m.birds.find(x => x.simId === b.simId);
        if (shown && track.spanAt1s === null && b.airMs >= 1000) track.spanAt1s = shown.spanPx;
        track.last = { status: b.status, airMs: Math.round(b.airMs), rangeM: Math.hypot(b.x - hunter.x, b.z - hunter.z), heightM: b.y - heightAt(b.x, b.z), target: b.target, tick };
      }
      for (const track of tracks.values()) {
        if (track.gone || m.sky.birds.some(b => b.simId === track.simId)) continue;
        track.gone = tick / 30;
        const l = track.last;
        track.exit = l.status === 'falling' ? 'fell' : l.status === 'departing' ? 'departed'
          : l.heightM < 0.6 ? (l.target ? 'landed-in-target-cover' : 'put-down') : l.rangeM > 75 ? 'range-out' : 'vanished';
      }
      return m;
    };
    window.__riseReview = {
      step(ticks) { for (let i = 0; i < ticks; i++) { api.stepSim(1); tick++; observe(); shooter(); } },
      frame() {
        api.renderOnce();
        const m = measure(true);
        return { tick, inPlay: m.inPlay, visible: m.visible, onScreen: m.birds.filter(b => b.screen?.onScreen && b.spanPx >= 2).length, queued: m.queued, minPairDeg: m.minPairDeg === null ? null : +m.minPairDeg.toFixed(1),
          minShotDeg: m.minShotDeg === null ? null : +m.minShotDeg.toFixed(1),
          birds: m.birds, camera: { yawDeg: m.e.yawDeg, pitchDeg: m.e.pitchDeg, fov: m.e.fov }, dog: api.hunt().dog.state, render: api.info() };
      },
      summary() {
        const birds = [...tracks.values()];
        const first = birds.flatMap(b => b.firstSecond);
        const lines = {};
        for (const b of birds) if (b.line) lines[b.line] = (lines[b.line] ?? 0) + 1;
        const shot = [...shotSeparations].sort((a, b) => a - b);
        return { maxInPlay, maxVisible, minSeparationDeg: Number.isFinite(minSeparation) ? minSeparation : null,
          riseLengthS: envelopeClear, waveTimesS: [...waves.values()].map(w => +(w.tick / 30).toFixed(2)), shots,
          shotWindow: shot.length ? { minDeg: shot[0], medianDeg: shot[shot.length >> 1], share5Deg: shot.filter(d => d >= 5).length / shot.length, ticks: shot.length } : null,
          skyShareFirstSecond: first.length ? first.filter(Boolean).length / first.length : 0,
          lines, riseOverS: riseOver, origin, hunter,
          birds: birds.map(b => ({ simId: b.simId, speciesId: b.speciesId, sex: b.sex, launchedS: b.launched, line: b.line,
            spanAt1sPx: b.spanAt1s, skyFirstSecond: b.firstSecond.length ? +(b.firstSecond.filter(Boolean).length / b.firstSecond.length).toFixed(2) : null,
            exit: b.exit ?? 'still-up', goneS: b.gone ?? null })) };
      },
    };
  }
}

function stepAndMeasure(ticks) {
  window.__riseReview.step(ticks);
  return window.__riseReview.frame();
}
