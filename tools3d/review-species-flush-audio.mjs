#!/usr/bin/env node
/** Offline stereo renders for audition and spatial routing checks. This is
 * not a perceptual sound-mix approval or physical-phone performance test. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import puppeteer from 'puppeteer';

const out = resolve(process.argv[2] ?? 'output/production-wave-two/flush-audio');
await mkdir(out, { recursive: true });
const bundle = await build({ entryPoints: ['src/audio.ts'], bundle: true, format: 'iife', globalName: 'FieldAudio', write: false });
const browser = await puppeteer.launch({ headless: true, args: ['--disable-gpu'] });
const report = { evidence: 'Offline WebAudio stereo render; listening acceptance remains open', cases: [] };
try {
  for (const species of ['bobwhite', 'chukar', 'sharptail']) for (const position of ['left', 'right', 'far', 'covey']) {
    const page = await browser.newPage();
    await page.evaluate(() => {
      window.renderContext = new OfflineAudioContext(2, 2 * 48000, 48000);
      window.AudioContext = function () {
        return new Proxy(window.renderContext, { get(target, name) {
          if (name === 'state') return 'running';
          const value = Reflect.get(target, name, target);
          return typeof value === 'function' ? value.bind(target) : value;
        } });
      };
    });
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const result = await page.evaluate(async ({ species, position }) => {
      const distance = position === 'far' ? 45 : position === 'covey' ? .5 : 5;
      const x = position === 'right' ? distance : -distance;
      const count = position === 'covey' ? 12 : 1;
      let sounded = 0;
      for (let n = 0; n < count; n++) {
        const d = distance + n;
        if (FieldAudio.playBirdFlush(species, d, { x, y: 0, z: -d * .3 },
          { seed: 41 + n, flapRate: species === 'bobwhite' ? 18 : species === 'chukar' ? 15 : 13,
            glideAfterMs: species === 'sharptail' ? 800 : undefined })) sounded++;
      }
      const rendered = await window.renderContext.startRendering();
      const channels = [rendered.getChannelData(0), rendered.getChannelData(1)];
      const rms = channels.map(data => Math.sqrt(data.reduce((sum, x) => sum + x * x, 0) / data.length));
      const interleaved = new Float32Array(channels[0].length * 2);
      let peak = 0, finite = true;
      for (let i = 0; i < channels[0].length; i++) for (let c = 0; c < 2; c++) {
        const value = channels[c][i]; interleaved[i * 2 + c] = value;
        peak = Math.max(peak, Math.abs(value)); finite &&= Number.isFinite(value);
      }
      const bytes = new Uint8Array(interleaved.buffer), pieces = [];
      for (let i = 0; i < bytes.length; i += 8192) pieces.push(String.fromCharCode(...bytes.subarray(i, i + 8192)));
      return { sounded, rms, peak, finite, base64: btoa(pieces.join('')) };
    }, { species, position });
    assert.equal(result.finite, true); assert.ok(result.peak > .001 && result.peak < .7, 'Launch mix lacks headroom');
    assert.equal(result.sounded, position === 'covey' ? 4 : 1);
    if (position === 'left') assert.ok(result.rms[0] > result.rms[1] * 1.2);
    if (position === 'right') assert.ok(result.rms[1] > result.rms[0] * 1.2);
    const bytes = Buffer.from(result.base64, 'base64');
    const samples = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.length / 4);
    const wav = Buffer.alloc(44 + samples.length * 2);
    wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
    wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22);
    wav.writeUInt32LE(48000, 24); wav.writeUInt32LE(192000, 28); wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34);
    wav.write('data', 36); wav.writeUInt32LE(samples.length * 2, 40);
    for (let i = 0; i < samples.length; i++) wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + i * 2);
    const file = `${species}-${position}.wav`;
    await writeFile(resolve(out, file), wav);
    const { base64, ...metrics } = result; report.cases.push({ species, position, file, ...metrics });
    await page.close();
  }
  for (const species of ['bobwhite', 'chukar', 'sharptail']) {
    const close = report.cases.find(c => c.species === species && c.position === 'left');
    const far = report.cases.find(c => c.species === species && c.position === 'far');
    assert.ok(far.rms[0] < close.rms[0] * .4);
  }
  report.result = 'passed';
} catch (error) { report.result = 'failed'; report.error = String(error.stack ?? error); process.exitCode = 1; }
finally { await browser.close(); await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); }
console.log(JSON.stringify(report, null, 2));
