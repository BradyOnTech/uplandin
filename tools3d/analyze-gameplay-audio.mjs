#!/usr/bin/env node
/** Inspect encoded destination-mix evidence. Level measurements do not certify
 * realistic sound, subjective mix quality, or precise audiovisual sync. */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, basename, join } from 'node:path';
import { createHash } from 'node:crypto';

const manifestPath = resolve(process.argv[2] ?? 'docs/3d/audio-gameplay-evidence/west-track-high.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (!manifest.recording?.audio || manifest.result !== 'passed') throw new Error('Expected a passing sound-enabled hunt');
const directory = dirname(manifestPath);
const trace = readFileSync(join(directory, basename(manifestPath, '.json') + '.ndjson'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
const video = join(directory, basename(manifest.video));
const sampleRate = 48000, channels = 2;
const decoded = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', video, '-vn', '-ac', String(channels), '-ar', String(sampleRate), '-f', 'f32le', 'pipe:1'], { maxBuffer: 128 * 1024 * 1024 });
if (decoded.status !== 0) throw new Error(String(decoded.stderr));
const data = decoded.stdout;
const frameCount = data.length / 4 / channels;
function stats(startSeconds, durationSeconds) {
  const from = Math.max(0, Math.floor(startSeconds * sampleRate));
  const to = Math.min(frameCount, Math.ceil((startSeconds + durationSeconds) * sampleRate));
  let sum = 0, peak = 0, atOrAboveFullScale = 0;
  for (let i = from * channels; i < to * channels; i++) {
    const value = data.readFloatLE(i * 4);
    sum += value * value; peak = Math.max(peak, Math.abs(value));
    if (Math.abs(value) >= 1) atOrAboveFullScale++;
  }
  const samples = Math.max(1, (to - from) * channels);
  const rms = Math.sqrt(sum / samples);
  return { startSeconds: from / sampleRate, durationSeconds: (to - from) / sampleRate,
    samples, rms, rmsDbfs: rms ? 20 * Math.log10(rms) : null,
    peak, peakDbfs: peak ? 20 * Math.log10(peak) : null, atOrAboveFullScale };
}
const requests = [
  ['covey-rise', -.4, .65],
  ['deliberate-miss', -.8, 3.4],
  ['audio-before-pause', -.23, .7],
  ['audio-paused', -.25, .2],
  ['audio-muted-play', -.45, .4],
  ['audio-resumed', -.4, .35],
  ['audio-replay-entered', -.4, .35],
];
const samples = requests.map(([event, before, duration]) => {
  const checkpoint = manifest.checkpoints.find((checkpoint) => checkpoint.event === event);
  if (!checkpoint) throw new Error(`Missing audio event ${event}`);
  const measured = stats(checkpoint.approximateVideoSeconds + before, duration);
  const file = `sample-${event}.wav`;
  const extracted = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(measured.startSeconds), '-i', video,
    '-t', String(measured.durationSeconds), '-vn', '-c:a', 'pcm_s16le', join(directory, file)], { encoding: 'utf8' });
  if (extracted.status !== 0) throw new Error(extracted.stderr);
  return { event, file, ...measured, listened: false };
});
const byEvent = Object.fromEntries(samples.map((sample) => [sample.event, sample]));
const globalLevels = stats(0, frameCount / sampleRate);
const report = {
  scope: 'Decoded AAC measurements and event excerpts from one ordinary-input hunt; no microphone/system audio, no imported effects.',
  generatedAt: new Date().toISOString(), sourceManifest: basename(manifestPath), video: basename(video),
  videoSha256: createHash('sha256').update(readFileSync(video)).digest('hex'),
  applicationScripts: manifest.applicationScripts, browser: manifest.browser,
  sourceStartedAt: manifest.startedAt, sourceFinishedAt: manifest.finishedAt,
  audioStream: manifest.recording.audioStream, decodedSeconds: frameCount / sampleRate,
  audioLifecycle: manifest.audioChecks, globalLevels, samples,
  checks: {
    encodedAudioHasSignal: globalLevels.rms > .00001,
    encodedMutedWindowSilent: byEvent['audio-muted-play'].rms < .000001,
    encodedResumedWindowAudible: byEvent['audio-resumed'].rms > .00001,
    encodedReplayWindowAudible: byEvent['audio-replay-entered'].rms > .00001,
    encodedAudioNearVideoDuration: Math.abs(frameCount / sampleRate - manifest.recording.durationSeconds) < .1,
    mutedProbeDuringActiveGameplay: trace.find((entry) => entry.event === 'audio-muted-play')?.paused === false,
    resumedProbeDuringActiveGameplay: trace.find((entry) => entry.event === 'audio-resumed')?.paused === false,
    replayProbeDuringActiveGameplay: trace.find((entry) => entry.event === 'audio-replay-entered')?.paused === false,
  },
  limitations: [
    'Not listened: native audio output was attempted, but this model runtime reported that audio input is unsupported. Event WAVs are provided for human listening.',
    'Samples can contain overlapping game events; event names identify nearby observed input/state checkpoints, not isolated source stems.',
    'Encoded peak values do not prove source clipping or sound quality; AAC can change sample peaks.',
    'Timestamp alignment reports recorder and hardware latency but is not sample-accurate audiovisual calibration.',
    'This audio/video-instrumented run is not a standalone performance measurement or physical-device audio test.',
  ],
};
report.result = Object.values(report.checks).every(Boolean) ? 'passed' : 'failed';
writeFileSync(join(directory, 'audio-analysis.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ result: report.result, globalLevels, checks: report.checks, samples }, null, 2));
if (report.result !== 'passed') process.exitCode = 1;
