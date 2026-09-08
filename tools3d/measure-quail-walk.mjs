#!/usr/bin/env node
/** One default headed browser attempt, then 60 seconds of unrecorded input. */
import puppeteer from 'puppeteer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';

const args = process.argv.slice(2);
const option = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const base = option('--url', 'http://localhost:4173').replace(/\/$/, '');
const out = resolve(option('--out', 'artifacts/3d/quail-default-walk'));
const dogSource = option('--dog', 'existing');
assert.ok(['existing', 'generated'].includes(dogSource));
mkdirSync(out, { recursive: true });
const report = {
  evidence: 'one-default-headed-browser-quail-walk', base, dogSource, startedAt: new Date().toISOString(),
  viewport: { width: 1920, height: 1080 }, quality: 'high', requestedReadinessBoundMs: 15000,
  host: { platform: os.platform(), release: os.release(), arch: os.arch(), cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length, memoryBytes: os.totalmem() },
  limitations: ['One isolated Puppeteer-managed headed browser on this host, with its default flags; not a user-profile or cross-device benchmark.', 'No video, screenshots, audio recorder, staged pose, forced readiness or simulation steps.', 'Native RAF intervals measure browser scheduling, not GPU execution time. Telemetry is sampled once per second.'],
  errors: [], bootSamples: [], samples: [], result: 'running',
};
const save = () => writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
const delay = ms => new Promise(done => setTimeout(done, ms));
let browser, page;
try {
  const html = await fetch(`${base}/index3d.html`).then(r => { assert.ok(r.ok); return r.text(); });
  assert.ok(!/\/@vite|\/src\/main3d/.test(html), 'Use an immutable production preview');
  browser = await puppeteer.launch({ headless: false });
  report.browser = await browser.version(); report.launchArgs = browser.process()?.spawnargs;
  assert.ok(!report.launchArgs.some(arg => ['--disable-frame-rate-limit', '--disable-gpu-vsync'].includes(arg)));
  page = await browser.newPage(); await page.setViewport(report.viewport); await page.bringToFront();
  page.on('pageerror', error => report.errors.push(String(error)));
  const query = new URLSearchParams({ area: 'quail-fields', drop: 'south-gate', quality: 'high', tod: 'noon', breed: 'gsp', coat: 'liver-white' });
  if (dogSource === 'generated') query.set('dog', 'generated');
  const bootStart = Date.now();
  await page.goto(`${base}/index3d.html?${query}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.evaluate(() => {
    const probe = window.__quailNativeFrameProbe = { times: [], active: true, id: 0 };
    const sample = t => { if (!probe.active) return; probe.times.push(t); probe.id = requestAnimationFrame(sample); };
    probe.id = requestAnimationFrame(sample);
  });
  while (Date.now() - bootStart <= 15000) {
    const state = await page.evaluate(() => ({ ready: window.__ready3d === true, api: Boolean(window.__api3d),
      visibility: document.visibilityState, focused: document.hasFocus(), nativeFrames: window.__quailNativeFrameProbe.times.length,
      telemetry: window.__api3d?.telemetry?.() ?? null, body: document.body.innerText.slice(0, 350) }));
    report.bootSamples.push({ elapsedMs: Date.now() - bootStart, ...state }); save();
    if (state.ready) break;
    await delay(Math.min(500, Math.max(1, 15000 - (Date.now() - bootStart))));
  }
  report.readinessElapsedMs = Date.now() - bootStart;
  if (!report.bootSamples.at(-1)?.ready) {
    report.result = 'readiness-stalled';
    report.limitations.push('Natural readiness did not complete in the one bounded attempt. No walk or performance claim is available; no retry was made.');
  } else {
    report.scripts = await page.evaluate(() => performance.getEntriesByType('resource').map(r => r.name).filter(name => /\.js(?:[?#]|$)/.test(name)));
    report.hardware = await page.evaluate(() => {
      const gl = document.querySelector('canvas').getContext('webgl2'), debug = gl?.getExtension('WEBGL_debug_renderer_info');
      return { userAgent: navigator.userAgent, hardwareConcurrency: navigator.hardwareConcurrency,
        renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : 'unavailable',
        vendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : 'unavailable', version: gl?.getParameter(gl.VERSION), attributes: gl?.getContextAttributes() };
    });
    await page.click('#enter-field');
    let locked = false;
    for (let n = 0; n < 20; n++) {
      locked = await page.evaluate(() => document.pointerLockElement?.tagName === 'CANVAS');
      if (locked) break; await delay(100);
    }
    assert.ok(locked, 'Entry must establish normal pointer lock');
    report.initial = await page.evaluate(() => { window.__quailNativeFrameProbe.times = []; return window.__api3d.telemetry(); });
    assert.equal(report.initial.camera.fov, 70); assert.equal(report.initial.quality, 'high');
    const start = Date.now(); let lastCamera = report.initial.camera; report.distanceM = 0;
    for (const key of ['w', 's']) {
      await page.keyboard.down(key); const legStart = Date.now();
      while (Date.now() - legStart < 30000) {
        await delay(Math.min(1000, Math.max(1, 30000 - (Date.now() - legStart))));
        const state = await page.evaluate(() => ({ ready: window.__ready3d === true, focused: document.hasFocus(),
          visibility: document.visibilityState, locked: document.pointerLockElement?.tagName === 'CANVAS', telemetry: window.__api3d.telemetry() }));
        report.samples.push({ elapsedMs: Date.now() - start, key, ...state });
        assert.ok(state.ready && state.focused && state.visibility === 'visible' && state.locked && !state.telemetry.paused, 'Ordinary walk lost active input/render state');
        const camera = state.telemetry.camera;
        report.distanceM += Math.hypot(camera.x - lastCamera.x, camera.z - lastCamera.z); lastCamera = camera;
      }
      await page.keyboard.up(key);
    }
    report.elapsedMs = Date.now() - start;
    const rawTimes = await page.evaluate(() => { window.__quailNativeFrameProbe.active = false; cancelAnimationFrame(window.__quailNativeFrameProbe.id); return window.__quailNativeFrameProbe.times; });
    writeFileSync(`${out}/native-raf-timestamps.json`, JSON.stringify(rawTimes));
    const intervals = rawTimes.slice(1).map((time, i) => time - rawTimes[i]), sorted = [...intervals].sort((a, b) => a - b);
    const pick = p => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? null;
    report.nativeFrameMs = { count: intervals.length, p50: pick(.5), p95: pick(.95), p99: pick(.99), max: sorted.at(-1) ?? null,
      mean: intervals.reduce((a, b) => a + b, 0) / intervals.length, over33ms: intervals.filter(n => n > 33.34).length,
      over50ms: intervals.filter(n => n > 50).length, observedCallbacksPerSecond: (rawTimes.length - 1) / ((rawTimes.at(-1) - rawTimes[0]) / 1000) };
    report.final = await page.evaluate(() => window.__api3d.telemetry());
    assert.ok(report.final.frameMs.totalFrames > report.initial.frameMs.totalFrames + 100, 'Rendered frame count must advance');
    assert.ok(report.distanceM > 60, 'Walk must produce meaningful movement');
    assert.deepEqual(report.errors, []); report.result = 'passed';
  }
} catch (error) { report.result = 'failed'; report.failure = String(error); process.exitCode = 1; }
finally {
  await browser?.close(); report.finishedAt = new Date().toISOString(); save();
  console.log(JSON.stringify({ result: report.result, failure: report.failure, readinessElapsedMs: report.readinessElapsedMs, frameMs: report.nativeFrameMs, out }));
}
