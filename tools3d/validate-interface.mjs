#!/usr/bin/env node
/** Desktop lifecycle and emulated-touch functional checks. Physical device,
 * thermal/performance and human usability acceptance remain separate. */
import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { startServer } from './playthrough.mjs';
const args = process.argv.slice(2);
const get = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const out = resolve(get('--out', '/tmp/quail-interface'));
mkdirSync(out, { recursive: true });
const results = { evidence: 'desktop-browser-and-emulated-touch-functional', checks: [], errors: [], mobileReadiness: 'unverified: no physical device or thermal test' };
let browser, server;
const check = (name, detail) => { results.checks.push({ name, detail }); console.log(`PASS ${name}`); };
try {
  const serving = await startServer(get('--url', 'http://localhost:4517'));
  server = serving.server;
  browser = await puppeteer.launch({ headless: true, args: [] });
  results.browser = await browser.version();
  const page = await browser.newPage();
  page.on('pageerror', (error) => results.errors.push(String(error)));
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  const url = `${serving.url}/index3d.html?breed=gsp&coat=liver-white&area=quail-fields&quality=high`;
  const read = () => page.evaluate(() => window.__api3d.telemetry());
  await page.goto(url);
  await page.waitForFunction('window.__ready3d === true');
  assert.equal((await read()).paused, true);
  check('starts paused until explicit entry', await read());
  await page.click('#enter-field');
  await page.waitForFunction('document.pointerLockElement !== null');
  await page.keyboard.down('KeyW'); await sleep(1200);
  const moved = await read();
  await page.keyboard.press('Escape');
  await page.waitForFunction('window.__api3d.telemetry().paused');
  const beforePause = await read(); await sleep(600);
  const afterPause = await read();
  assert.deepEqual(afterPause.camera, beforePause.camera);
  assert.deepEqual(afterPause.dog, beforePause.dog);
  check('pause freezes hunter and dog', { moved, beforePause, afterPause });
  await page.click('#enter-field'); await sleep(450);
  const resumed = await read();
  assert.equal(resumed.paused, false);
  assert.equal(resumed.camera.x, beforePause.camera.x);
  assert.equal(resumed.camera.z, beforePause.camera.z);
  await page.keyboard.up('KeyW');
  check('resume clears held movement', resumed);
  // This is an explicitly injected resilience check, not a claimed natural
  // browser failure. Exercise the actual WebGL extension and recovery UI.
  await page.evaluate(() => {
    window.__contextLossTest = document.querySelector('canvas').getContext('webgl2').getExtension('WEBGL_lose_context');
    window.__contextLossTest.loseContext();
  });
  await page.waitForFunction('window.__api3d.telemetry().paused && !document.getElementById("retry-field").hidden');
  await page.screenshot({ path: `${out}/graphics-interrupted.png` });
  await sleep(500);
  await page.evaluate(() => window.__contextLossTest.restoreContext());
  await page.waitForFunction('!document.getElementById("enter-field").hidden && document.getElementById("retry-field").hidden');
  await page.click('#enter-field'); await sleep(400);
  assert.equal((await read()).paused, false);
  check('injected WebGL loss recovers and resumes', await read());
  await page.close();

  const touch = await browser.newPage();
  touch.on('pageerror', (error) => results.errors.push(String(error)));
  await touch.setViewport({ width: 844, height: 390, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await touch.goto(`${serving.url}/index3d.html?breed=gsp&coat=liver-white&area=quail-fields&quality=lite`);
  await touch.waitForFunction('window.__ready3d === true');
  assert.equal(await touch.evaluate(() => matchMedia('(pointer:coarse)').matches), true);
  const tap = async (selector) => {
    const button = await touch.$(selector); const box = await button.boundingBox();
    assert.ok(box && box.width > 0, `${selector} is visible`);
    await touch.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  };
  await touch.screenshot({ path: `${out}/touch-entry.png` });
  await tap('#enter-field');
  assert.equal(await touch.$eval('#touch-controls', (element) => element.hidden), false);
  const telemetry = () => touch.evaluate(() => window.__api3d.telemetry());
  const initial = await telemetry();
  const cdp = await touch.createCDPSession();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 100, y: 285, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 100, y: 220, id: 1 }] });
  await sleep(1100);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const walking = await telemetry();
  assert.ok(Math.hypot(walking.camera.x - initial.camera.x, walking.camera.z - initial.camera.z) > 1);
  check('emulated touch movement drives normal hunter', { initial, walking });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 500, y: 180, id: 2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 560, y: 200, id: 2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(100);
  const looking = await telemetry();
  assert.ok(Math.abs(looking.camera.yawDeg - walking.camera.yawDeg) > 5);
  check('emulated touch look turns camera', looking.camera);
  await tap('[data-action="aim"]'); await sleep(650);
  const gun = await touch.evaluate(() => window.__api3d.gun());
  assert.ok(gun.mount > .9);
  await tap('[data-action="fire"]'); await sleep(120);
  assert.equal((await touch.evaluate(() => window.__api3d.gun())).shells, gun.shells);
  await tap('[data-action="reload"]'); await sleep(2400);
  assert.equal((await touch.evaluate(() => window.__api3d.gun())).shells, gun.shells);
  check('emulated touch mount and no shot outside a rise', await touch.evaluate(() => window.__api3d.gun()));
  results.checks.push({ name: 'touch shot and reload during active rise', result: 'not exercised by this lifecycle test' });
  await touch.screenshot({ path: `${out}/touch-field.png` });
  await tap('#pause-hunt'); await sleep(200);
  assert.equal((await telemetry()).paused, true);
  assert.equal(await touch.$eval('[data-action="aim"]', (button) => button.getAttribute('aria-pressed')), 'false');
  check('touch pause clears aim state', await telemetry());
  await touch.screenshot({ path: `${out}/touch-paused.png` });
  assert.equal(results.errors.length, 0, results.errors.join('\n'));
  results.result = 'passed';
} catch (error) {
  results.result = 'failed'; results.errors.push(String(error)); console.error(error); process.exitCode = 1;
} finally {
  writeFileSync(`${out}/interface.json`, JSON.stringify(results, null, 2));
  await browser?.close(); server?.kill('SIGTERM');
}
