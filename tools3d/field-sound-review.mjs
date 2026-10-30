#!/usr/bin/env node
/** The sound of place in an ordinary (non-capture) field, recorded from the
 * page's destination mix (tools3d/browser-audio.mjs) through phases: the
 * bed while the dog works, the walk-in on a point at 35 m and then 10 m
 * (the hush), the covey's rise when the hunter walks onto it, and one
 * report from the game's own gun. Levels per phase come from the decoded
 * recording; full-scale samples and the analyser's peaks show clipping.
 * Staged poses and a direct report call: level evidence, not a playtest or
 * a listening verdict. Needs a machine whose browser audio clock runs (on a
 * Mac with the display asleep, headless Chrome's does not). Wrap in
 * tools3d/heavy.sh.
 *
 *   node tools3d/field-sound-review.mjs --area quail-fields --query "weather=rain&month=oct" --url http://localhost:4612 --uncapped
 */
import puppeteer from 'puppeteer';
import { mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { startServer } from './playthrough.mjs';
import { prepareBrowserAudioCapture } from './browser-audio.mjs';

const args = process.argv.slice(2);
const arg = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const url = arg('--url', 'http://localhost:4517').replace(/\/$/, '');
const area = arg('--area', 'quail-fields'), quality = arg('--quality', 'lite'), tod = arg('--tod', 'morning');
const query = arg('--query', 'weather=mild&month=oct'), seed = arg('--seed', '7701');
const name = arg('--name', `${area}-${tod}-${query.replace(/[=&]/g, '-')}`);
const out = resolve(arg('--out', '/tmp/uplandin-sound'));
mkdirSync(out, { recursive: true });
const sleep = ms => new Promise(done => setTimeout(done, ms));

const { server } = await startServer(url);
const browser = await puppeteer.launch({ headless: true, ignoreDefaultArgs: ['--mute-audio'],
  args: ['--ignore-gpu-blocklist', '--no-sandbox', '--autoplay-policy=no-user-gesture-required',
    ...(args.includes('--uncapped') ? ['--disable-frame-rate-limit', '--disable-gpu-vsync'] : [])] });
const report = { area, quality, tod, query, seed, url, startedAt: new Date().toISOString(), phases: [], peaks: [], errors: [] };
let capture;
try {
  const page = await browser.newPage();
  // A page in the background is hidden, and the field's sound stands down.
  await page.bringToFront();
  await page.setViewport({ width: 1280, height: 720 });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  page.on('pageerror', error => report.errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text().slice(0, 300)); });
  capture = await prepareBrowserAudioCapture(page);
  const params = new URLSearchParams({ area, drop: 'south-gate', quality, tod, seed, dog: 'generated', ...Object.fromEntries(new URLSearchParams(query)) });
  await page.goto(`${url}/index3d.html?${params}`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__ready3d === true && !!window.__api3d, { timeout: 240000, polling: 250 });
  await page.click('#enter-field');
  await page.waitForFunction(() => window.__api3d.telemetry().paused === false, { timeout: 20000, polling: 100 });
  // The game's own unlock, in case the click left the context suspended.
  report.audioReady = await page.evaluate(async () => (await import('/src/audio.ts')).audioReady());
  await capture.start();
  report.page = await page.evaluate(() => ({ hidden: document.hidden, visibility: document.visibilityState }));
  const t0 = Date.now();
  const phase = async (id, ms, step) => {
    const from = (Date.now() - t0) / 1000, until = Date.now() + ms;
    while (Date.now() < until) {
      // A headless window can lose focus and pause the field; a player would walk back in.
      if (await page.evaluate(() => window.__api3d.telemetry().paused)) { report.resumed = (report.resumed ?? 0) + 1; await page.click('#enter-field').catch(() => undefined); }
      if (step) await page.evaluate(step);
      const mix = (await capture.sample()).mix[0];
      if (mix) report.peaks.push({ t: (Date.now() - t0) / 1000, phase: id, rms: mix.rms, peak: mix.peak, state: mix.contextState });
      await sleep(100);
    }
    report.phases.push({ id, from, to: (Date.now() - t0) / 1000 });
  };
  // The hunter follows the dog at a walk's distance while it works.
  const follow = () => {
    const h = window.__api3d.hunt(), dx = h.dog.x - h.hunter.x, dz = h.dog.z - h.hunter.z, d = Math.hypot(dx, dz);
    // The dog waits at heel until the hunter steps off from the truck.
    if (h.dog.state === 'heel') {
      const yaw = window.__api3d.telemetry().camera.yawDeg * Math.PI / 180;
      window.__api3d.setPose(h.hunter.x - Math.sin(yaw) * .25, h.hunter.z - Math.cos(yaw) * .25, yaw * 180 / Math.PI, 0);
    } else if (d > 28) window.__api3d.setPose(h.hunter.x + dx / d * .25, h.hunter.z + dz / d * .25, Math.atan2(-dx, -dz) * 180 / Math.PI, 0);
  };
  await phase('field', 12000, follow);
  // Follow until the dog points (or give up after two minutes of hunting).
  let pointed = false;
  for (const until = Date.now() + 150000; Date.now() < until && !pointed;) {
    await phase('hunting', 1000, follow);
    pointed = await page.evaluate(() => window.__api3d.hunt().dog.state === 'pointing');
  }
  report.pointed = pointed;
  if (pointed) {
    const standAt = m => () => {
      const h = window.__api3d.hunt(), dx = h.dog.x - h.hunter.x, dz = h.dog.z - h.hunter.z, d = Math.hypot(dx, dz) || 1;
      window.__api3d.setPose(h.dog.x - dx / d * m, h.dog.z - dz / d * m, Math.atan2(-dx, -dz) * 180 / Math.PI, -4);
    };
    await page.evaluate(standAt(35)); await phase('point at 35 m', 4000);
    await page.evaluate(standAt(10)); await phase('point at 10 m', 5000);
    // Walk onto the pointed bird: the covey goes up under the flush law.
    await page.evaluate(() => {
      const bird = window.__api3d.telemetry().pointedBird, h = window.__api3d.hunt();
      if (bird) window.__api3d.setPose(bird.x, bird.z, Math.atan2(-(bird.x - h.hunter.x), -(bird.z - h.hunter.z)) * 180 / Math.PI, 8);
    });
    await phase('the rise', 4000);
  }
  // One report from the game's own gun, through the same master chain.
  await page.evaluate(async id => { (await import('/src/audio.ts')).playShot('remington-870', id); }, area);
  await phase('the report', 2500);
  await phase('after', 2000);
  const recordings = await capture.stop();
  report.recordings = recordings.map(r => ({ file: r.file, bytes: r.bytes, startedEpochMs: r.startedEpochMs, stoppedEpochMs: r.stoppedEpochMs }));
  report.t0EpochMs = t0;
  const file = join(out, `${name}.webm`);
  copyFileSync(recordings[recordings.length - 1].file, file);
  report.audio = file;
  report.result = 'passed';
} catch (error) {
  report.result = 'failed'; report.failure = String(error?.stack ?? error); process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  writeFileSync(join(out, `${name}.json`), JSON.stringify(report, null, 2));
  capture?.cleanup?.();
  await browser.close();
  server?.kill('SIGTERM');
}
console.log(JSON.stringify({ result: report.result, failure: report.failure?.slice(0, 300), pointed: report.pointed, errors: report.errors.slice(0, 3), out }));
if (report.result === 'passed') {
  const levels = spawnSync('python3', [resolve('tools3d/field-sound-levels.py'), join(out, `${name}.json`)], { encoding: 'utf8' });
  process.stdout.write(levels.stdout); process.stderr.write(levels.stderr);
}
