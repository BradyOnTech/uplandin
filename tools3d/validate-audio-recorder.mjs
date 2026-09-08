#!/usr/bin/env node
/** Synthetic recorder regression, explicitly not gameplay/audio-quality proof. */
import puppeteer from 'puppeteer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { prepareBrowserAudioCapture } from './browser-audio.mjs';
import { startBrowserRecording } from './browser-recording.mjs';

const out = resolve(process.argv[2] ?? 'artifacts/3d/audio-recorder');
mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fixture = 'data:text/html,' + encodeURIComponent(`<body style="background:slateblue;color:white"><h1>Isolated recorder fixture</h1><button>Play fixture tone</button><script>
document.querySelector('button').onclick=()=>{window.context=new AudioContext();window.gain=context.createGain();gain.gain.value=.1;window.osc=context.createOscillator();osc.connect(gain);gain.connect(context.destination);gain.connect(context.destination);osc.start();};
</script>`);
const browser = await puppeteer.launch({ headless: true, ignoreDefaultArgs: ['--mute-audio'] });
const report = { scope: 'Synthetic duplicate-connect/disconnect/navigation and mux regression; not a game sound or usability review.', startedAt: new Date().toISOString(), checks: {}, result: 'running' };
try {
  const page = await browser.newPage();
  const audioCapture = await prepareBrowserAudioCapture(page);
  await page.goto(fixture);
  const recorder = await startBrowserRecording(page, resolve(out, 'observed.mp4'), { audioCapture });
  await page.click('button'); await sleep(650);
  const connected = await audioCapture.sample();
  await page.evaluate(() => gain.disconnect(context.destination)); await sleep(150);
  const disconnected = await audioCapture.sample();
  await page.evaluate(() => gain.connect(context.destination)); await sleep(200);
  const reconnected = await audioCapture.sample();
  await audioCapture.stopSegment();
  await page.goto(fixture);
  await audioCapture.start();
  await page.click('button'); await sleep(500);
  const replay = await audioCapture.sample();
  report.recording = await recorder.stop();
  report.observations = { connected, disconnected, reconnected, replay };
  const oneTone = (sample) => sample.mix.length === 1 && sample.mix[0].connectionCount === 1 && sample.mix[0].rms > .06 && sample.mix[0].rms < .08;
  Object.assign(report.checks, {
    duplicateConnectionNotDoubled: oneTone(connected),
    disconnectedRouteSilent: disconnected.mix[0].connectionCount === 0 && disconnected.mix[0].rms === 0,
    reconnectRestoresSingleMix: oneTone(reconnected),
    navigationRestoresSingleMix: oneTone(replay),
    twoCompleteEncodedSegments: report.recording.audioSegments.length === 2 && report.recording.audioSegments.every((segment) => segment.bytes > 1000 && segment.stoppedEpochMs > segment.startedEpochMs),
    muxHasAudio: report.recording.audioStream?.codec_name === 'aac',
    prototypesRestored: await page.evaluate(() => AudioNode.prototype.connect.toString().includes('[native code]') && AudioNode.prototype.disconnect.toString().includes('[native code]')),
  });
  const silentPage = await browser.newPage();
  await silentPage.goto(fixture);
  const silent = await startBrowserRecording(silentPage, resolve(out, 'silent.mp4'));
  await silentPage.click('button'); await sleep(300);
  report.silentRecording = await silent.stop();
  const probe = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'json', resolve(out, 'silent.mp4')], { encoding: 'utf8' });
  report.checks.defaultStillSilent = !report.silentRecording.audio && probe.status === 0 && JSON.parse(probe.stdout).streams.length === 0;
  report.checks.defaultHasNoObserver = await silentPage.evaluate(() => !window.__quailAudioEvidence);
  report.result = Object.values(report.checks).every(Boolean) ? 'passed' : 'failed';
  if (report.result !== 'passed') process.exitCode = 1;
} catch (error) { report.result = 'failed'; report.error = String(error); process.exitCode = 1; }
finally {
  await browser.close();
  report.finishedAt = new Date().toISOString();
  writeFileSync(resolve(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ result: report.result, checks: report.checks, error: report.error }));
}
