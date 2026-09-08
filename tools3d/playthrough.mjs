#!/usr/bin/env node
/** Ordinary-browser evidence. No capture flag, teleports, time steps or forced hits.
 * Usage: node tools3d/playthrough.mjs --drop south-gate --quality high --out /tmp/quail-play
 *        node tools3d/playthrough.mjs --until point --no-video
 *        node tools3d/playthrough.mjs --audio --headed --url http://localhost:4173
 * Read-only telemetry guides automated mouse aim; this is functional evidence,
 * not a human usability study. Video encoding affects frame times, so rerun
 * --no-video for an independent performance measurement.
 */
import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import puppeteer from 'puppeteer';
import { startBrowserRecording } from './browser-recording.mjs';
import { prepareBrowserAudioCapture } from './browser-audio.mjs';
import { verifyEvidenceImage } from './evidence-image.mjs';

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const wrap = (radians) => Math.atan2(Math.sin(radians), Math.cos(radians));
const rad = (degrees) => degrees * Math.PI / 180;
const deg = (radians) => radians * 180 / Math.PI;

export async function reachable(url) {
  try { return (await fetch(`${url}/index3d.html`, { signal: AbortSignal.timeout(1500) })).ok; }
  catch { return false; }
}

export async function startServer(baseUrl) {
  if (await reachable(baseUrl)) return { url: baseUrl, server: null };
  const port = new URL(baseUrl).port || '4517';
  const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', port, '--strictPort'], { stdio: 'pipe' });
  let output = '';
  server.stderr.on('data', (chunk) => { output += chunk; });
  for (let i = 0; i < 60; i++) {
    if (await reachable(baseUrl)) return { url: baseUrl, server };
    if (server.exitCode !== null) throw new Error(`Vite exited: ${output}`);
    await sleep(250);
  }
  server.kill('SIGTERM');
  throw new Error(`Vite startup timed out: ${output}`);
}

export async function runNormalGameplay(page, options = {}) {
  const opts = {
    url: 'http://localhost:4517', area: 'quail-fields', drop: 'south-gate',
    breed: 'gsp', coat: 'liver-white', quality: 'high', tod: 'morning',
    until: 'complete', out: '/tmp/uplandin-playthrough', video: true,
    maxSeconds: 240, width: 1920, height: 1080, uncapped: false, audio: false, ...options,
  };
  if (opts.audio && !opts.video) throw new Error('--audio requires video; performance runs stay uninstrumented');
  mkdirSync(opts.out, { recursive: true });
  const prefix = opts.name || `${opts.drop}-${opts.quality}`;
  const manifestPath = resolve(opts.out, `${prefix}.json`);
  const tracePath = resolve(opts.out, `${prefix}.ndjson`);
  writeFileSync(tracePath, '');
  const manifest = {
    evidence: opts.uncapped ? 'uncapped-diagnostic-automated-input' : 'ordinary-gameplay-automated-input',
    assistedAim: 'Mouse aiming uses read-only airborne bird positions; hunting state is never written.',
    limitations: ['Automated behavior does not establish human control usability.',
      ...(opts.video ? ['Video capture is active; frame times are not a standalone performance benchmark.'] : []),
      ...(opts.uncapped ? ['Frame limiting and GPU vsync disabled explicitly; not default browser performance evidence.'] : []),
      'Desktop browser results do not establish physical mobile readiness.'],
    options: opts, startedAt: new Date().toISOString(),
    host: { platform: os.platform(), release: os.release(), cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length, memoryBytes: os.totalmem() },
    checkpoints: [], errors: [], result: 'running',
  };
  const contact = { pointSamples: 0, pointMaxSupportGapM: 0,
    pointPlantedSupportSamples: 0, pointMaxPlantedSupportGapM: 0, pointWorstPaw: null,
    locomotionContactPairs: 0, locomotionMaxStepDriftM: 0, locomotionSumStepDriftM: 0, worstStancePair: null,
    carriedSamples: 0, maxBirdMouthDistanceM: 0, contactResets: 0 };
  let previousAudit = null;
  let previousAuditMs = 0;
  const generatedContact={samples:0,pointSamples:0,plantedSamples:0,maxPlantedGroundGapM:0,maxTargetErrorM:0,clampedSamples:0,
    movingContactPairs:0,maxPlantedDriftM:0,carriedSamples:0,maxBirdMouthDistanceM:0};
  let previousGenerated=null,previousGeneratedMs=0;
  const observeContact = (state) => {
    const generated=state.generatedDogAudit,nowGenerated=Date.now();
    if(generated?.source==='generated-gsp'&&generated.version===1&&generated.frame!==previousGenerated?.frame) {
      generatedContact.samples++;if(generated.state==='pointing')generatedContact.pointSamples++;
      if(generated.clamped)generatedContact.clampedSamples++;
      for(const foot of generated.feet) {
        generatedContact.maxTargetErrorM=Math.max(generatedContact.maxTargetErrorM,foot.targetError);
        if(!foot.locked||foot.step>0)continue;
        generatedContact.plantedSamples++;
        generatedContact.maxPlantedGroundGapM=Math.max(generatedContact.maxPlantedGroundGapM,Math.abs(foot.groundGap));
        const prior=previousGenerated?.feet[foot.i];
        if(generated.moving&&previousGenerated?.moving&&nowGenerated-previousGeneratedMs<=250&&prior?.locked&&prior.step===0&&foot.plantId>0&&prior.plantId===foot.plantId) {
          generatedContact.movingContactPairs++;
          generatedContact.maxPlantedDriftM=Math.max(generatedContact.maxPlantedDriftM,Math.hypot(foot.actual[0]-prior.actual[0],foot.actual[2]-prior.actual[2]));
        }
      }
      for(const bird of state.telemetry.carriedBirds??[]) {
        generatedContact.carriedSamples++;
        generatedContact.maxBirdMouthDistanceM=Math.max(generatedContact.maxBirdMouthDistanceM,Math.hypot(bird.x-generated.mouth[0],bird.y-generated.mouth[1],bird.z-generated.mouth[2]));
      }
      previousGenerated=generated;previousGeneratedMs=nowGenerated;
    }
    const audit = state.dogAudit;
    if (!audit?.paws) return;
    const now = Date.now();
    contact.contactResets = Math.max(contact.contactResets, audit.contactResets ?? 0);
    if (audit.state === 'pointing') {
      contact.pointSamples++;
      for (const paw of audit.paws) {
        if (paw.i === 0) continue;
        const gap = Math.abs(paw.gap);
        // Keep the historical aggregate, including airborne settling feet,
        // and separately measure paws that actually claim ground support.
        if (gap > contact.pointMaxSupportGapM) {
          contact.pointMaxSupportGapM = gap;
          contact.pointWorstPaw = { ...paw, root: audit.root };
        }
        if (paw.contact > .9 && !paw.settlingStep && !paw.correctiveStep) {
          contact.pointPlantedSupportSamples++;
          contact.pointMaxPlantedSupportGapM = Math.max(contact.pointMaxPlantedSupportGapM, gap);
        }
      }
    }
    if (previousAudit && now - previousAuditMs <= 250 && audit.gait !== 'still' &&
        previousAudit.gait !== 'still' && audit.clip === previousAudit.clip) {
      for (const paw of audit.paws) {
        const prior = previousAudit.paws.find((candidate) => candidate.i === paw.i);
        const support = Number.isFinite(paw.plantId) && paw.plantId === prior?.plantId &&
          paw.contact > .9 && prior?.contact > .9 &&
          audit.gallop?.locked?.[paw.i] && previousAudit.gallop?.locked?.[paw.i];
        if (!support) continue;
        const drift = Math.hypot(paw.x - prior.x, paw.z - prior.z);
        contact.locomotionContactPairs++;
        if (drift > contact.locomotionMaxStepDriftM) {
          contact.locomotionMaxStepDriftM = drift;
          contact.worstStancePair = { intervalMs: now - previousAuditMs, clip: audit.clip,
            leg: paw.foot ?? paw.i, plantId: paw.plantId, prior: { ...prior }, current: { ...paw },
            priorRoot: previousAudit.root, currentRoot: audit.root,
            priorAudit: previousAudit, currentAudit: audit,
            intervalRootSpeedMps: Math.hypot(audit.root.x - previousAudit.root.x, audit.root.z - previousAudit.root.z) / Math.max(.001, (now - previousAuditMs) / 1000) };
        }
        contact.locomotionSumStepDriftM += drift;
      }
    }
    for (const bird of state.telemetry.carriedBirds ?? []) {
      if (!audit.mouth) continue;
      contact.carriedSamples++;
      contact.maxBirdMouthDistanceM = Math.max(contact.maxBirdMouthDistanceM,
        Math.hypot(bird.x - audit.mouth[0], bird.y - audit.mouth[1], bird.z - audit.mouth[2]));
    }
    previousAudit = audit; previousAuditMs = now;
  };
  const errors = (error) => manifest.errors.push(String(error));
  const consoleErrors = (message) => { if(message.type()==='error')manifest.errors.push(message.text()); };
  page.on('pageerror', errors);
  page.on('console', consoleErrors);
  const write = () => writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  let recorder;
  let audioCapture;
  let bootToken;
  let forward = false;
  let mounted = false;
  let mouseX = opts.width / 2;
  let mouseY = opts.height / 2;
  const forwardTo = async (on) => {
    if (forward === on) return;
    forward = on;
    if (on) await page.keyboard.down('KeyW'); else await page.keyboard.up('KeyW');
  };
  const read = async () => { const state = await page.evaluate(() => ({
    bootToken: window.__evidenceBootToken, ready: window.__ready3d,
    hunt: window.__api3d.hunt(), gun: window.__api3d.gun(),
    birds: window.__api3d.birds(), telemetry: window.__api3d.telemetry(),
    dogAudit: window.__dogAudit?.state(),
    generatedDogAudit: typeof window.__generatedDogAudit==='function'?window.__generatedDogAudit():null,
    summary: !document.getElementById('hunt-summary')?.hidden,
    summaryText: document.getElementById('hunt-summary-copy')?.textContent,
    paused: window.__api3d.telemetry().paused,
  }));
    if (!state.ready || state.bootToken !== bootToken) throw new Error('Page boot changed during gameplay evidence collection');
    return state;
  };
  const event = async (name, state, screenshot = false) => {
    const record = { event: name, wallMs: Date.now() - start, ...state };
    appendFileSync(tracePath, `${JSON.stringify(record)}\n`);
    if (name !== 'sample') {
      console.log(`${prefix}: ${name} (${(record.wallMs / 1000).toFixed(1)}s)`);
      const checkpoint = { event: name, wallMs: record.wallMs };
      if (opts.video) checkpoint.approximateVideoSeconds = Math.max(0, (record.wallMs - (manifest.videoStartedWallMs ?? 0)) / 1000);
      // PNG encoding can take seconds on a busy workstation. Do not block
      // input/state observation while a covey or retrieval is moving. The
      // continuous recording preserves those frames for extraction afterward.
      const stable = ['arrival', 'summary', 'replay', 'failure'].includes(name);
      if (screenshot && (opts.until !== 'complete' || stable)) {
        checkpoint.screenshot = resolve(opts.out, `${prefix}-${name}.png`);
        const png = await page.screenshot({ path: checkpoint.screenshot });
        checkpoint.imageMeasurement = await verifyEvidenceImage(page, png, bootToken);
      }
      manifest.checkpoints.push(checkpoint);
      write();
    }
  };
  const look = async (yawDeg, pitchDeg, state) => {
    const camera = state.telemetry.camera;
    const dx = -wrap(rad(yawDeg - camera.yawDeg)) / 0.0022;
    const dy = -rad(pitchDeg - camera.pitchDeg) / 0.0022;
    mouseX += dx;
    mouseY += dy;
    await page.mouse.move(mouseX, mouseY);
  };
  const audioProbe = async (name, state = null) => {
    const audioObservation = await audioCapture.sample();
    await event(name, { ...(state ?? await read()), audioObservation });
    return audioObservation;
  };
  const audioLifecycle = async () => {
    // Exercise actual controls after delivery, with a reload in progress.
    // Pausing here does not interfere with the live shot/retrieval sequence.
    await sleep(180);
    const audible = await audioProbe('audio-before-pause');
    await page.keyboard.press('Escape');
    await page.waitForFunction('window.__api3d.telemetry().paused === true');
    const before = await read();
    await sleep(2400);
    const paused = await read();
    const quiet = await audioProbe('audio-paused', paused);
    await page.click('#sound-setting');
    await page.click('#enter-field');
    await page.waitForFunction('document.pointerLockElement?.tagName === "CANVAS"');
    await sleep(1800);
    const muted = await audioProbe('audio-muted-play');
    await page.keyboard.press('Escape');
    await page.waitForFunction('window.__api3d.telemetry().paused === true');
    await page.click('#sound-setting');
    await page.click('#enter-field');
    await page.waitForFunction('document.pointerLockElement?.tagName === "CANVAS"');
    await sleep(1400);
    const resumed = await audioProbe('audio-resumed');
    const rms = (sample) => Math.max(0, ...sample.mix.map((mix) => mix.rms));
    const frozen = Math.hypot(before.hunt.dog.x - paused.hunt.dog.x, before.hunt.dog.z - paused.hunt.dog.z) < .0001 && before.gun.shells === paused.gun.shells;
    manifest.audioChecks = {
      audibleMix: rms(audible) > .00001,
      pauseFadesMix: rms(quiet) < Math.max(.00001, rms(audible) * .08),
      reloadAndDogFrozenDuringPause: frozen,
      mutedDuringPlay: rms(muted) < .000001,
      resumedMix: rms(resumed) > .00001,
      observations: { audible, quiet, muted, resumed },
      scope: 'Measured destination mix and actual pause/sound/resume controls; not a listening or sound-quality verdict.',
    };
    if (!manifest.audioChecks.audibleMix || !manifest.audioChecks.pauseFadesMix || !frozen ||
        !manifest.audioChecks.mutedDuringPlay || !manifest.audioChecks.resumedMix) throw new Error('Audio lifecycle checks failed');
  };
  let start = Date.now();
  try {
    await page.bringToFront();
    await page.setViewport({ width: opts.width, height: opts.height, deviceScaleFactor: 1 });
    const query = new URLSearchParams({ breed: opts.breed, coat: opts.coat, area: opts.area,
      drop: opts.drop, quality: opts.quality, tod: opts.tod });
    if (opts.play) query.set('play', opts.play);
    if (opts.dog === 'generated') query.set('dog', 'generated');
    if (opts.challenge) query.set('challenge', opts.challenge);
    if (opts.seed !== undefined) query.set('seed', String(opts.seed));
    if (opts.audio) audioCapture = await prepareBrowserAudioCapture(page);
    await page.goto(`${opts.url}/index3d.html?${query}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction('window.__ready3d === true && typeof window.__api3d?.telemetry === "function"', { timeout: 60000 });
    bootToken = await page.evaluate(() => (window.__evidenceBootToken = crypto.randomUUID()));
    manifest.huntSeed = await page.evaluate(() => window.__api3d.hunt().seed);
    manifest.browser = await page.browser().version();
    manifest.browserLaunchArgs = page.browser().process()?.spawnargs ?? [];
    manifest.uncapped = manifest.browserLaunchArgs.includes('--disable-frame-rate-limit') || manifest.browserLaunchArgs.includes('--disable-gpu-vsync');
    if (manifest.uncapped) {
      manifest.evidence = 'uncapped-diagnostic-automated-input';
      manifest.limitations.push('Actual launch flags disable frame limiting/vsync; do not cite these frame intervals as ordinary user performance.');
    }
    manifest.navigator = await page.evaluate(() => ({ userAgent: navigator.userAgent, hardwareConcurrency: navigator.hardwareConcurrency }));
    manifest.applicationScripts = await page.evaluate(() => [...new Set([
      ...[...document.scripts].map((script) => script.src).filter(Boolean),
      ...performance.getEntriesByType('resource').map((entry) => entry.name).filter((name) => /\.js(?:[?#]|$)/.test(name)),
    ])]);
    manifest.graphics = await page.evaluate(() => {
      const gl = document.querySelector('canvas').getContext('webgl2');
      const debug = gl.getExtension('WEBGL_debug_renderer_info');
      return { renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : 'unavailable',
        vendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : 'unavailable',
        version: gl.getParameter(gl.VERSION), attributes: gl.getContextAttributes() };
    });
    start = Date.now();
    if (opts.video) {
      manifest.video = resolve(opts.out, `${prefix}.mp4`);
      recorder = await startBrowserRecording(page, manifest.video, { width: 1280, height: 720, fps: 30, audioCapture });
      manifest.videoStartedWallMs = Date.now() - start;
      manifest.videoScale = 2 / 3;
      manifest.videoAudio = opts.audio;
    }
    let state = await read();
    if (state.telemetry.camera.fov !== 70) throw new Error(`Normal camera FOV is ${state.telemetry.camera.fov}, expected 70`);
    manifest.initial = state;
    await event('arrival', state, true);
    if (opts.until === 'arrival') { manifest.result = 'passed'; return manifest; }
    await page.mouse.move(mouseX, mouseY);
    const entry = await page.$('#enter-field');
    if (entry && await entry.evaluate((button) => button.getClientRects().length > 0)) {
      const box = await entry.boundingBox();
      mouseX = box.x + box.width / 2; mouseY = box.y + box.height / 2;
      await entry.click();
    } else {
      await page.mouse.click(mouseX, mouseY);
    }
    await page.waitForFunction('document.pointerLockElement?.tagName === "CANVAS"', { timeout: 5000 });
    await forwardTo(true);
    let sawPoint = false;
    let sawRise = false;
    let riseAt = 0;
    let sawRetrieve = false;
    let sawCarrying = false;
    let firedMiss = false;
    let shotsAtBird = 0;
    let lastFireMs = 0;
    let lastSampleMs = 0;
    let lastState = '';
    let pointWalkTarget = null;
    const lastSeenFlight = new Map();
    let watchedFlightId = null;
    let observedSearchTarget = null;
    while (Date.now() - start < opts.maxSeconds * 1000) {
      await sleep(80);
      state = await read();
      if (state.paused && !state.summary) throw new Error('Gameplay observation interrupted: browser paused before the hunt summary');
      observeContact(state);
      const now = Date.now() - start;
      const dog = state.hunt.dog;
      const signature = `${dog.state}/${dog.scentStage}`;
      if (signature !== lastState) {
        await event(signature.replaceAll('/', '-'), state);
        lastState = signature;
      }
      if (now - lastSampleMs > 1000) { await event('sample', state); lastSampleMs = now; }
      if (opts.until === 'walk' && now >= 4000) {
        await event('walk', state, true);
        manifest.result = 'passed'; return manifest;
      }
      if (!sawPoint && dog.state === 'pointing') {
        sawPoint = true;
        await forwardTo(false);
        await event('point', state, opts.until !== 'point');
        if (opts.until === 'point') {
          if (Number(opts.pointDistance) > 0) {
            const deadline = Date.now() + 15000;
            while (true) {
              const currentDog = state.hunt.dog, camera = state.telemetry.camera;
              const dx = currentDog.x - camera.x, dz = currentDog.z - camera.z;
              await look(deg(Math.atan2(-dx, -dz)), -12, state);
              if (Math.hypot(dx, dz) <= Number(opts.pointDistance)) break;
              if (Date.now() > deadline) throw new Error('Close dog observation exceeded its walk-in time budget');
              await forwardTo(true); await sleep(80); state = await read(); observeContact(state);
              if (state.hunt.dog.state !== 'pointing') throw new Error('Dog left point during the close observation walk-in');
            }
            await forwardTo(false);
            await event('point-close', state, true);
          }
          await sleep(750);
          state = await read(); observeContact(state);
          if (state.hunt.dog.state !== 'pointing') throw new Error('Point did not hold for the settled gameplay capture');
          await event('point-settled', state, true);
          manifest.result = 'passed'; return manifest;
        }
        // Follow the dog's visible pointing direction. Hidden bird positions
        // do not choose the hunting route or trigger the covey.
        const heading = dog.heading;
        if (!Number.isFinite(heading)) throw new Error('Missing read-only dog.heading in gameplay telemetry');
        pointWalkTarget = { x: dog.x + Math.cos(heading) * 22, z: dog.z + Math.sin(heading) * 22 };
        await page.mouse.down({ button: 'right' }); mounted = true;
      }
      const flying = state.birds.filter((bird) => bird.status === 'flying');
      for (const bird of flying) lastSeenFlight.set(bird.simId, { ...bird, observedAt: now });
      if (sawPoint && !sawRise && flying.length === 0 && pointWalkTarget) {
        const dx = pointWalkTarget.x - state.telemetry.camera.x;
        const dz = pointWalkTarget.z - state.telemetry.camera.z;
        await look(deg(Math.atan2(-dx, -dz)), -7, state);
        await forwardTo(true);
      }
      if (flying.length > 0 && !sawRise) {
        sawRise = true;
        riseAt = now;
        await forwardTo(false);
        await event('covey-rise', state);
        // Pick an airborne bird before any hidden-single information exists.
        watchedFlightId = flying[0].simId;
      }
      // Observation mode holds the approach camera and lets the entire rise
      // play without assisted aiming, deliberate sky shots or state writes.
      if (sawRise && ['rise', 'singles', 'single-point'].includes(opts.until)) {
        if (opts.until === 'rise' && now - riseAt >= 7000) {
          await event('rise-observed', state);
          manifest.result = 'passed'; return manifest;
        }
        if (opts.until !== 'rise' && !manifest.landingContinuity && now - riseAt > 1500 && state.birds.length === 0 && state.hunt.tally.flushed === 0) {
          const singles = state.hunt.singles.filter(bird => bird.state === 'hidden');
          if (singles.length === 0) throw new Error('No survivor settled in reachable cover during this observation');
          manifest.landingContinuity = singles.map(bird => {
            const seen = lastSeenFlight.get(bird.id);
            if (!seen) throw new Error('Single appeared without observed flight');
            const separation = Math.hypot(bird.x - seen.x, bird.z - seen.z);
            if (separation > 3) throw new Error(`Single ${bird.id} moved ${separation.toFixed(2)} m from its last observed flight`);
            if (!state.hunt.patches.some(p => Math.abs(bird.x-p.cx)<=p.hx && Math.abs(bird.z-p.cz)<=p.hz)) throw new Error('Single did not settle in cover');
            return { id: bird.id, landing: bird, lastSeenFlight: seen, separationM: separation };
          });
          await event('singles-landed', state, true);
          if (opts.until === 'singles') { manifest.result = 'passed'; return manifest; }
          observedSearchTarget = lastSeenFlight.get(watchedFlightId);
          if (!observedSearchTarget) throw new Error('Lost the watched flight before the follow-up search');
          if (mounted) { await page.mouse.up({ button: 'right' }); mounted = false; }
        }
        if (opts.until === 'single-point' && observedSearchTarget) {
          if (dog.state === 'pointing') {
            await forwardTo(false);
            const pointId = state.telemetry.pointedBird?.id;
            if (!manifest.landingContinuity.some(bird => bird.id === pointId)) throw new Error('Follow-up found a different bird; observed single not yet verified');
            await look(deg(Math.atan2(state.telemetry.camera.x-dog.x,state.telemetry.camera.z-dog.z)), -7, state);
            await event('single-point', await read(), true);
            manifest.followupSingleId = pointId;
            manifest.result = 'passed'; return manifest;
          }
          // Walk toward the last visible flight location. During scent work,
          // give the dog room; no hidden bird coordinates choose this route.
          const target = dog.state === 'tracking' ? dog : observedSearchTarget;
          const camera = state.telemetry.camera;
          const distance = Math.hypot(target.x-camera.x,target.z-camera.z);
          await look(deg(Math.atan2(camera.x-target.x,camera.z-target.z)), -7, state);
          await forwardTo(distance > (dog.state === 'tracking' ? 18 : 8));
        }
        await sleep(30); continue;
      }
      if (sawRise && flying.length > 0 && state.gun.mount > 0.9 && !firedMiss) {
        const before = state.hunt.tally.downed;
        await look(state.telemetry.camera.yawDeg + 65, 55, state);
        await sleep(90);
        await page.mouse.click(mouseX, mouseY, { button: 'left' });
        firedMiss = true; lastFireMs = now;
        await sleep(120);
        const after = await read();
        manifest.deliberateMiss = after.hunt.tally.downed === before && after.gun.shells < state.gun.shells;
        await event('deliberate-miss', after);
      }
      if (sawRise && firedMiss && flying.length > 0 && state.hunt.tally.downed === 0 &&
          state.gun.shells > 0 && now - lastFireMs > 350 && shotsAtBird < 4) {
        // Track a real airborne target across two observations. Compensate
        // for the read→mouse→click latency instead of shooting its stale
        // location; no ray, bird state or outcome is changed by the harness.
        const first = flying[0];
        await sleep(30);
        const tracking = await page.evaluate(() => ({
          birds: window.__api3d.birds(), camera: window.__api3d.telemetry().camera,
        }));
        const bird = tracking.birds.find((candidate) => candidate.simId === first.simId && candidate.status === 'flying');
        if (!bird) continue;
        const elapsed = Math.max(.016, (bird.airMs - first.airMs) / 1000);
        const lead = .075;
        const target = { x: bird.x + (bird.x - first.x) / elapsed * lead,
          y: bird.y + (bird.y - first.y) / elapsed * lead,
          z: bird.z + (bird.z - first.z) / elapsed * lead };
        const camera = tracking.camera;
        const dx = target.x - camera.x; const dz = target.z - camera.z;
        const aimPitch = deg(Math.atan2(target.y - camera.y, Math.hypot(dx, dz)));
        await look(deg(Math.atan2(-dx, -dz)), aimPitch, { telemetry: { camera } });
        await page.mouse.click(mouseX, mouseY, { button: 'left' });
        shotsAtBird++; lastFireMs = now;
        await event('shot', await read());
      }
      if (sawRise && state.hunt.tally.downed > 0 && mounted) {
        await page.mouse.up({ button: 'right' }); mounted = false;
        await event('bird-downed', state);
      }
      if (sawRise && dog.state === 'retrieving') {
        await forwardTo(false);
        if (!sawRetrieve) { sawRetrieve = true; await event('retrieve-search', state, true); }
        if (!sawCarrying && dog.carryingBirdId !== null) { sawCarrying = true; await event('carrying', state, true); }
        const camera = state.telemetry.camera;
        await look(deg(Math.atan2(camera.x - dog.x, camera.z - dog.z)), -10, state);
      }
      if (sawRise && flying.length === 0 && state.hunt.tally.flushed === 0 &&
          state.hunt.tally.downed === 0) {
        throw new Error(`Covey escaped without a hit; deliberate miss=${firedMiss}, aimed shots=${shotsAtBird}`);
      }
      if (sawRise && state.hunt.tally.retrieved > 0) {
        await event('delivered', state, true);
        await page.keyboard.press('KeyR');
        if (opts.audio) await audioLifecycle(); else await sleep(2200);
        // Leave pointer lock using the browser API so the real DOM finish
        // control is reachable, then click it as a player would.
        await page.evaluate(() => document.exitPointerLock());
        const finish = await page.$('#end-hunt');
        if (!finish) throw new Error('No finish-hunt control');
        await finish.click();
        await page.waitForFunction('document.getElementById("hunt-summary")?.hidden === false', { timeout: 6000 });
        state = await read();
        await event('summary', state, true);
        manifest.summary = state.summaryText;
        manifest.completedHunt = state.hunt;
        manifest.careerAtSummary = await page.evaluate(() => localStorage.getItem('uplandin.career.v1'));
        await sleep(500);
        manifest.careerStableWhileSummaryVisible = manifest.careerAtSummary === await page.evaluate(() => localStorage.getItem('uplandin.career.v1'));
        manifest.huntTelemetry = state.telemetry;
        const oldSave = await page.evaluate(() => ({ ...localStorage }));
        if (audioCapture) await audioCapture.stopSegment();
        await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), page.click('#hunt-again')]);
        await page.waitForFunction('window.__ready3d === true', { timeout: 60000 });
        bootToken = await page.evaluate(() => (window.__evidenceBootToken = crypto.randomUUID()));
        state = await read();
        manifest.replayReset = state.hunt.tally.downed === 0 && state.hunt.tally.retrieved === 0;
        manifest.saveStableOnReplay = JSON.stringify(oldSave) === JSON.stringify(await page.evaluate(() => ({ ...localStorage })));
        await event('replay', state, true);
        if (audioCapture) {
          await audioCapture.start();
          await page.click('#enter-field');
          await page.waitForFunction('document.pointerLockElement?.tagName === "CANVAS"');
          await sleep(1400);
          const replayAudio = await audioProbe('audio-replay-entered');
          manifest.audioChecks.replayMix = replayAudio.mix.some((mix) => mix.contextState === 'running' && mix.rms > .00001);
          manifest.audioChecks.replaySingleOutput = replayAudio.mix.length === 1 && replayAudio.mix[0].connectionCount === 1;
          manifest.audioChecks.observations.replay = replayAudio;
          if (!manifest.audioChecks.replayMix || !manifest.audioChecks.replaySingleOutput) throw new Error('Replay did not restore one audible game output');
        }
        manifest.result = manifest.deliberateMiss && sawRetrieve && sawCarrying && manifest.replayReset && manifest.errors.length === 0 ? 'passed' : 'incomplete';
        return manifest;
      }
    }
    throw new Error(`Timed out at ${lastState}; point=${sawPoint}, rise=${sawRise}, retrieve=${sawRetrieve}, carrying=${sawCarrying}, aimed shots=${shotsAtBird}`);
  } catch (error) {
    manifest.result = 'failed';
    manifest.errors.push(String(error));
    try { manifest.last = await read(); await event('failure', manifest.last, true); } catch {}
    throw error;
  } finally {
    await forwardTo(false).catch(() => {});
    if (mounted) await page.mouse.up({ button: 'right' }).catch(() => {});
    if (recorder) {
      try { manifest.recording = await recorder.stop(); }
      catch (error) { manifest.errors.push(String(error)); manifest.result = 'failed'; }
      if (opts.audio && manifest.recording) for (const checkpoint of manifest.checkpoints) {
        checkpoint.approximateVideoSeconds = Math.max(0, (start + checkpoint.wallMs - manifest.recording.firstFrameEpochMs) / 1000);
      }
      const frames = new Set(['point', 'covey-rise', 'deliberate-miss', 'bird-downed', 'retrieve-search', 'carrying', 'delivered']);
      for (const checkpoint of manifest.checkpoints) {
        if (!frames.has(checkpoint.event) || checkpoint.screenshot) continue;
        const path = resolve(opts.out, `${prefix}-${checkpoint.event}.png`);
        const extracted = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y',
          '-ss', String(checkpoint.approximateVideoSeconds), '-i', manifest.video,
          '-frames:v', '1', '-update', '1', path], { encoding: 'utf8' });
        if (extracted.status === 0) { checkpoint.screenshot = path; checkpoint.source = 'continuous-video-approximate-event-time'; }
        else manifest.errors.push(`Frame extraction ${checkpoint.event}: ${extracted.stderr}`);
      }
    }
    manifest.finishedAt = new Date().toISOString();
    manifest.contacts = previousAudit ? { ...contact, sampling: 'Equal touchdown plantId, >90% contact, locked markers, same moving clip, max250ms interval. Historical pointMaxSupportGapM excludes only raised foreleg and includes settling air time; pointMaxPlantedSupportGapM additionally requires >90% contact and no settling/corrective step.',
      locomotionMeanStepDriftM: contact.locomotionContactPairs ? contact.locomotionSumStepDriftM / contact.locomotionContactPairs : null } : null;
    manifest.generatedContacts=generatedContact.samples ? {...generatedContact,sampling:'Read-only generated-GSP audit. Planted means locked with no corrective step; drift pairs share a positive plantId, are both moving, and are at most 250 ms apart. Ground gap subtracts the 0.023 m paw-marker sole offset. Unsampled frames may contain larger errors.',
      maxPlantedDriftM:generatedContact.movingContactPairs?generatedContact.maxPlantedDriftM:null,
      maxBirdMouthDistanceM:generatedContact.carriedSamples?generatedContact.maxBirdMouthDistanceM:null} : null;
    try { manifest.finalTelemetry = await page.evaluate(() => window.__api3d.telemetry()); } catch {}
    page.off('pageerror', errors);
    page.off('console', consoleErrors);
    if (manifest.result === 'passed' && manifest.errors.length > 0) manifest.result = 'incomplete';
    write();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const get = (flag, fallback) => args.includes(flag) ? args[args.indexOf(flag) + 1] : fallback;
  const baseUrl = get('--url', 'http://localhost:4517');
  const { url, server } = await startServer(baseUrl);
  const browser = await puppeteer.launch({ headless: !args.includes('--headed'),
    ignoreDefaultArgs: args.includes('--audio') ? ['--mute-audio'] : undefined,
    args: args.includes('--uncapped') ? ['--disable-frame-rate-limit', '--disable-gpu-vsync'] : [] });
  try {
    const result = await runNormalGameplay(await browser.newPage(), {
      url, drop: get('--drop', 'south-gate'), area: get('--area', 'quail-fields'), play: get('--play', undefined),
      breed: get('--breed', 'gsp'), coat: get('--coat', 'liver-white'), tod: get('--tod', 'morning'), dog: get('--dog', 'existing'),
      quality: get('--quality', 'high'), out: resolve(get('--out', '/tmp/uplandin-playthrough')),
      challenge: get('--challenge', undefined),
      seed: get('--seed', undefined),
      pointDistance: Number(get('--point-distance', '0')),
      until: get('--until', 'complete'), maxSeconds: Number(get('--seconds', '240')),
      width: Number(get('--width', '1920')), height: Number(get('--height', '1080')),
      video: !args.includes('--no-video'), uncapped: args.includes('--uncapped'), audio: args.includes('--audio'),
    });
    if (result.result !== 'passed') process.exitCode = 1;
  } finally { await browser.close(); server?.kill('SIGTERM'); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
