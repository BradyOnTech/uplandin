#!/usr/bin/env node
/** Coarse-pointer Chromium emulation, ordinary touch input, natural point/rise.
 * This establishes routing/ammo behavior; it is not physical-device acceptance. */
import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { startServer } from './playthrough.mjs';

const args = process.argv.slice(2);
const get = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const out = resolve(get('--out', '/tmp/quail-touch-rise'));
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const rad = (deg) => deg * Math.PI / 180;
const deg = (rad) => rad * 180 / Math.PI;
const wrap = (rad) => Math.atan2(Math.sin(rad), Math.cos(rad));
mkdirSync(out, { recursive: true });
writeFileSync(`${out}/touch-rise.ndjson`, '');
const result = { evidence: 'emulated-touch-natural-rise-functional', limits: ['No physical mobile hardware, thermal test, or human usability study.'], checks: [], errors: [] };
let browser, server, page;
const start = Date.now();
const log = (event, state) => {
  const item = { event, wallMs: Date.now() - start, state };
  appendFileSync(`${out}/touch-rise.ndjson`, `${JSON.stringify(item)}\n`);
  if (event !== 'sample') { result.checks.push(item); console.log(`PASS ${event}`); }
};
try {
  const serving = await startServer(get('--url', 'http://localhost:4517')); server = serving.server;
  browser = await puppeteer.launch({ headless: !args.includes('--headed'), args: [] });
  page = await browser.newPage();
  page.on('pageerror', (error) => result.errors.push(String(error)));
  await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await page.goto(`${serving.url}/index3d.html?breed=gsp&coat=liver-white&area=quail-fields&quality=lite&drop=south-gate&dog=${get('--dog','existing')}`);
  await page.waitForFunction('window.__ready3d === true', { timeout: 60000 });
  result.applicationScripts = await page.evaluate(() => [...document.scripts].map((script) => script.src).filter(Boolean));
  assert.equal(await page.evaluate(() => matchMedia('(pointer:coarse)').matches), true);
  const read = () => page.evaluate(() => ({ telemetry: window.__api3d.telemetry(), hunt: window.__api3d.hunt(), birds: window.__api3d.birds(), gun: window.__api3d.gun() }));
  const tap = async (selector) => {
    const button = await page.$(selector), box = await button.boundingBox();
    assert.ok(box && box.width > 0, `${selector} visible`);
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  };
  const cdp = await page.createCDPSession();
  const points = new Map();
  const touch = async (type, id, x, y) => {
    if (type === 'touchCancel') points.clear(); else if (type === 'touchEnd') points.delete(id); else points.set(id, { x, y, id });
    await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: [...points.values()] });
  };
  let walking = false;
  const walk = async (on) => {
    if (walking === on) return;
    walking = on;
    if (on) { await touch('touchStart', 1, 100, 285); await touch('touchMove', 1, 100, 225); }
    else await touch('touchEnd', 1);
  };
  const look = async (yaw, pitch, camera) => {
    // Short right-side swipes stay in the canvas and preserve a held left stick.
    const dx = Math.max(-110, Math.min(110, -wrap(rad(yaw - camera.yawDeg)) / .004));
    const dy = Math.max(-95, Math.min(95, -rad(pitch - camera.pitchDeg) / .004));
    await touch('touchStart', 2, 520, 160);
    await touch('touchMove', 2, 520 + dx, 160 + dy);
    await touch('touchEnd', 2);
  };
  await tap('#enter-field');
  await walk(true);
  let state, target = null, lastSample = 0;
  const deadline = Date.now() + Number(get('--seconds', '180')) * 1000;
  while (Date.now() < deadline) {
    await sleep(80); state = await read();
    if (Date.now() - lastSample > 1000) { log('sample', state); lastSample = Date.now(); }
    if (!target && state.hunt.dog.state === 'pointing') {
      await walk(false); log('natural-point', state);
      const dog = state.hunt.dog;
      target = { x: dog.x + Math.cos(dog.heading) * 22, z: dog.z + Math.sin(dog.heading) * 22 };
      await tap('[data-action="aim"]'); await walk(true);
    }
    if (target) {
      const camera = state.telemetry.camera;
      await look(deg(Math.atan2(camera.x - target.x, camera.z - target.z)), -7, camera);
    }
    if (state.birds.some((bird) => bird.status === 'flying')) break;
  }
  await walk(false);
  assert.ok(target, 'a natural point was seen');
  assert.ok(state?.birds.some((bird) => bird.status === 'flying'), 'natural active rise');
  log('natural-rise-after-touch-walk-in', state);
  // Aim into open sky so this checks the touch shot path without claiming a hit.
  for (let i = 0; i < 4; i++) { state = await read(); await look(state.telemetry.camera.yawDeg, 55, state.telemetry.camera); await sleep(40); }
  await page.waitForFunction('window.__api3d.gun().mount > .9', { timeout: 2000 });
  const beforeShot = await read();
  assert.ok(beforeShot.birds.some((bird) => bird.status === 'flying'));
  if (args.includes('--drag-fire')) {
    const box=await (await page.$('[data-action="fire"]')).boundingBox();
    const x=box.x+box.width/2,y=box.y+box.height/2;
    await touch('touchStart',3,x,y);await touch('touchCancel',3);await sleep(30);
    assert.equal((await read()).gun.shells,beforeShot.gun.shells);
    log('cancelled-fire-touch-keeps-ammo',await read());
    await walk(true);await sleep(100);
    await touch('touchStart',3,x,y);await touch('touchMove',3,x-35,y);await sleep(30);
    const tracking=await read();
    assert.ok(Math.abs(wrap(rad(tracking.telemetry.camera.yawDeg-beforeShot.telemetry.camera.yawDeg)))>.08,'Fire drag changes aim');
    assert.equal(tracking.gun.shells,beforeShot.gun.shells,'Holding Fire does not spend ammo');
    assert.ok(Math.hypot(tracking.telemetry.camera.x-beforeShot.telemetry.camera.x,tracking.telemetry.camera.z-beforeShot.telemetry.camera.z)>.1,'Movement thumb remains active while tracking');
    log('two-thumb-move-and-track',tracking);
    await touch('touchEnd',3);await walk(false);await sleep(100);
  } else { await tap('[data-action="fire"]'); await sleep(100); }
  const afterShot = await read();
  assert.equal(afterShot.gun.shells, beforeShot.gun.shells - 1);
  log('touch-fire-spends-one-shell-during-active-rise', { beforeShot, afterShot });
  if (args.includes('--complete')) {
    result.limits.push('Airborne target telemetry assists touch aim; no camera setters, forced hits or simulation steps.');
    const hitDeadline=Date.now()+18000;
    let lastFire=0,shots=0;
    while(Date.now()<hitDeadline) {
      state=await read();if(state.hunt.tally.downed>0)break;
      const bird=state.birds.find(b=>b.status==='flying');
      assert.ok(bird,'Covey escaped before a touch hit');
      if(state.gun.shells===0) {await tap('[data-action="reload"]');await sleep(350);continue;}
      const camera=state.telemetry.camera;
      const yaw=deg(Math.atan2(camera.x-bird.x,camera.z-bird.z));
      const pitch=deg(Math.atan2(bird.y-camera.y,Math.hypot(bird.x-camera.x,bird.z-camera.z)));
      await look(yaw,pitch,camera);await sleep(25);
      const current=await read();
      const flying=current.birds.find(b=>b.simId===bird.simId && b.status==='flying');
      if(!flying)continue;
      const elapsed=Math.max(.016,(flying.airMs-bird.airMs)/1000),lead=.08;
      const target={x:flying.x+(flying.x-bird.x)/elapsed*lead,y:flying.y+(flying.y-bird.y)/elapsed*lead,z:flying.z+(flying.z-bird.z)/elapsed*lead};
      const c=current.telemetry.camera;
      const deltaYaw=wrap(Math.atan2(c.x-target.x,c.z-target.z)-rad(c.yawDeg));
      const deltaPitch=Math.atan2(target.y-c.y,Math.hypot(target.x-c.x,target.z-c.z))-rad(c.pitchDeg);
      if(Math.abs(deltaYaw)>.22 || Math.abs(deltaPitch)>.22 || Date.now()-lastFire<350)continue;
      const box=await (await page.$('[data-action="fire"]')).boundingBox();
      const x=box.x+box.width/2,y=box.y+box.height/2;
      await touch('touchStart',3,x,y);await touch('touchMove',3,x-deltaYaw/.004,y-deltaPitch/.004);await touch('touchEnd',3);
      lastFire=Date.now();shots++;log('touch-aimed-shot',await read());await sleep(80);
    }
    state=await read();assert.ok(state.hunt.tally.downed>0,'Touch controls downed a bird');log('touch-hit',state);
    await tap('[data-action="aim"]');
    let carrying=false;const returnDeadline=Date.now()+90000;
    while(Date.now()<returnDeadline) {
      state=await read();carrying ||= state.hunt.dog.carryingBirdId!==null;
      if(state.hunt.tally.retrieved>0)break;
      await sleep(100);
    }
    assert.ok(carrying,'Dog carried the bird');assert.ok(state.hunt.tally.retrieved>0,'Dog delivered the bird');log('touch-hunt-delivery',state);
    await tap('[data-action="reload"]');await sleep(2500);
    await tap('#end-hunt');await page.waitForFunction('document.getElementById("hunt-summary").hidden === false');
    result.summary=await page.$eval('#hunt-summary-copy',node=>node.textContent);
    await page.screenshot({path:`${out}/touch-summary.png`});log('touch-summary',{text:result.summary});
    const save=await page.evaluate(()=>localStorage.getItem('uplandin.career.v1'));
    await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded'}),tap('#hunt-again')]);
    await page.waitForFunction('window.__ready3d === true');
    state=await read();assert.equal(state.hunt.tally.downed,0);assert.equal(state.hunt.tally.retrieved,0);
    assert.equal(await page.evaluate(()=>localStorage.getItem('uplandin.career.v1')),save);log('touch-replay-reset',state);
    await tap('#enter-field');await tap('#pause-hunt');await sleep(100);
    assert.equal((await read()).telemetry.paused,true);log('touch-replay-pause',await read());
  } else {
  assert.ok(afterShot.birds.some((bird) => bird.status === 'flying'), 'reload starts during active rise');
  await tap('[data-action="reload"]');
  await page.waitForFunction((shells) => window.__api3d.gun().shells === shells, { timeout: 5000 }, beforeShot.gun.shells);
  log('touch-reload-restores-shell-capacity', await read());
  await page.screenshot({ path: `${out}/touch-after-reload.png` });
  await tap('#pause-hunt'); await sleep(100);
  assert.equal((await read()).telemetry.paused, true);
  log('touch-pause-after-active-rise-controls', await read());
  }
  assert.equal(result.errors.length, 0);
  result.result = 'passed';
} catch (error) {
  result.result = 'failed'; result.errors.push(String(error)); console.error(error); process.exitCode = 1;
  try { await page?.screenshot({ path: `${out}/failure.png` }); } catch {}
} finally {
  writeFileSync(`${out}/touch-rise.json`, JSON.stringify(result, null, 2));
  await browser?.close(); server?.kill('SIGTERM');
}
