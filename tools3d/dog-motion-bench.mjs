#!/usr/bin/env node
/**
 * The dog motion bench: the actual runtime dog renderer for every breed, side
 * by side under one camera and light, driven by recorded hunt traces
 * (tools3d/dog-trace.mjs) and synthetic runs, rendered frame by frame.
 *
 *   tools3d/heavy.sh node tools3d/dog-motion-bench.mjs --root . --port 4615 --quality high \
 *     --trace /tmp/dog-audit/traces/chukar-gsp8.json --segments quarter=gsp8:116-146,paces,turns \
 *     --views side,eye,look --out /tmp/dog-audit/after-high --uncapped
 *
 * --root picks the checkout whose renderer is bundled (src/ resolves there),
 * so a before run points at the read-only baseline and an after run at this
 * branch with the same bench, trace and cameras. Frames, a video per segment
 * (ffmpeg, never committed), every --still'th frame as a JPEG and per-frame
 * contact and carriage numbers go to --out.
 *
 * Segments: <name>=<trace>:<t0>-<t1> (a window of a --trace file, keyed by
 * its basename minus "chukar-"), or a synthetic name: paces, turns, slam,
 * bound, sidehill. Views: side (broadside chase, 6 m), eye (the hunter's
 * 70-degree view, a 1:1 window of a 1920x1080 frame round the dog) and look
 * (the 30-degree hold-G closer look, same window).
 *
 * Staged review evidence only: the simulation is replaced by its recorded
 * output and the ground is a plain gridded copy of the game's triangulation.
 * <trace>/brace:<t0>-<t1> replays a brace trace's second dog (tools3d/
 * dog-trace.mjs --brace), with the lead dog beside it; the watch view follows
 * the dog from the hunter's eye, zoomed to about three metres round it.
 */
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const args = process.argv.slice(2);
const arg = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(arg('--root', process.cwd()));
const port = Number(arg('--port', '4615'));
const quality = arg('--quality', 'high');
const breeds = arg('--breeds', 'gsp,english-setter,griffon').split(',');
const views = arg('--views', 'side,eye,look').split(',');
const fps = Number(arg('--fps', '30'));
const [pw, ph] = arg('--panel', '640x360').split('x').map(Number);
const out = resolve(arg('--out', `/tmp/dog-audit/${basename(root)}-${quality}`));
const label = arg('--label', basename(out));
const traces = Object.fromEntries((args.flatMap((a, i) => a === '--trace' ? [args[i + 1]] : [])).map(file =>
  [basename(file, '.json').replace(/^chukar-/, ''), JSON.parse(readFileSync(file, 'utf8'))]));

// ---- synthetic runs: a kinematic point following simple steering commands ----
const TAU = Math.PI * 2;
function drive(plan, start = { x: 0, z: 0, heading: Math.PI / 2 }, hunter = () => [-28, 20]) {
  const ticks = [], dt = 1 / 30;
  let { x, z, heading } = start, speed = 0, t = 0;
  for (const step of plan) {
    const accel = step.accel ?? 5, decel = step.decel ?? 6;
    let done = 0, turned = 0, held = 0;
    for (let guard = 0; guard < 30 * 120; guard++) {
      const target = step.speed ?? 0;
      speed = target > speed ? Math.min(target, speed + accel * dt) : Math.max(target, speed - decel * dt);
      if (step.turn) {
        const w = speed / step.radius * Math.sign(step.turn);
        heading += w * dt; turned += Math.abs(w * dt);
      }
      x += Math.cos(heading) * speed * dt; z += Math.sin(heading) * speed * dt; done += speed * dt; held += dt; t += dt;
      const state = typeof step.state === 'function' ? step.state(held) : step.state ?? (speed > .03 ? 'quartering' : 'heel');
      const gait = speed <= .03 ? 'still' : speed < 1.4 ? 'track' : speed >= 4.8 ? 'run' : 'trot';
      ticks.push({ t: +t.toFixed(4), x: +x.toFixed(4), z: +z.toFixed(4), heading: +heading.toFixed(4), travel: +heading.toFixed(4),
        state, gait: step.gait ?? gait, scent: step.scent?.(held) ?? 'none', progress: step.progress?.(held) ?? 0, waiting: false,
        creeping: step.creeping ?? false, slam: step.slam?.(held) ?? null, carrying: null, reserved: null, holdMs: 0,
        hunter: hunter(t, x, z), reach: null, watch: null });
      if (step.turn ? turned >= Math.abs(step.turn) : step.distance !== undefined ? done >= step.distance : held >= step.seconds) break;
      if (guard === 30 * 120 - 1) throw new Error(`Synthetic step never ends: ${JSON.stringify(step)}`);
    }
  }
  return ticks;
}
const PACE_KEYS = [[0, 0], [1, 0], [3, .8], [6, .8], [8, 2], [11, 2], [13, 3.6], [16, 3.6], [18, 5.5], [21, 5.5], [24, .8], [27, .8], [29, 0], [31, 0]];
function paces() {
  const plan = [];
  for (let i = 1; i < PACE_KEYS.length; i++) {
    const [t0, a] = PACE_KEYS[i - 1], [t1, b] = PACE_KEYS[i];
    for (let k = 0; k < (t1 - t0) * 2; k++) {
      const u = (k + 1) / ((t1 - t0) * 2), s = a + (b - a) * u * u * (3 - 2 * u);
      plan.push({ speed: s, seconds: .5, accel: 30, decel: 30 });
    }
  }
  return { ground: 'flat', side: 'left', ticks: drive(plan, undefined, () => [-30, 32]) };
}
function turns() {
  // Quartering casts across the hunter's line with tight reversals at each
  // end, alternating left and right, the way a bird dog works a beat.
  const plan = [{ speed: 5.2, distance: 6, accel: 6 }];
  for (let i = 0; i < 6; i++) plan.push({ speed: 5.2, distance: 22 }, { speed: 3.9, turn: (i % 2 ? -1 : 1) * Math.PI, radius: 2.6, decel: 5 });
  plan.push({ speed: 0, seconds: 1.2, decel: 4 }, { speed: 0, seconds: 1 });
  return { ground: 'flat', ticks: drive(plan, { x: -14, z: 0, heading: 0 }, (_t, _x, z) => [0, z - 30]) };
}
function slam() {
  const skid = .34, settle = .26;
  const plan = [
    { speed: 0, seconds: .5 }, { speed: 5.6, distance: 14, accel: 6 },
    { speed: 0, seconds: skid, decel: 5.6 / skid, state: 'tracking', gait: 'still', scent: () => 'locking', slam: h => Math.min(1, h / skid), progress: h => .6 * h / skid },
    { speed: 0, seconds: settle, state: 'tracking', gait: 'still', scent: () => 'locking', slam: () => 1, progress: () => .8 },
    { speed: 0, seconds: 2.5, state: 'pointing' },
    { speed: 1.31, distance: 1.83, accel: 3, decel: 3, state: 'pointing', creeping: true, gait: 'track' },
    { speed: 0, seconds: 2.2, state: 'pointing' },
  ];
  return { ground: 'flat', side: 'left', ticks: drive(plan, undefined, () => [-22, 12]) };
}
function bound() {
  const plan = [{ speed: 4.6, distance: 52, accel: 5 }, { speed: 0, seconds: 1.5 }];
  return { ground: 'flat', side: 'left', cover: { height: 1.5, z0: 8, z1: 42 }, ticks: drive(plan, undefined, () => [-16, 24]) };
}
function sidehill() {
  // A 29-degree face: across it, a turn uphill, a climb, across the other
  // way, down the fall line, then a trot along the contour to a stop.
  const plan = [
    { speed: 4.8, distance: 12, accel: 5 }, { speed: 3.6, turn: -Math.PI / 2, radius: 2.4 }, { speed: 4, distance: 7 },
    { speed: 3.6, turn: -Math.PI / 2, radius: 2.4 }, { speed: 4.8, distance: 12 }, { speed: 3.6, turn: -Math.PI / 2, radius: 2.4 },
    { speed: 5, distance: 9 }, { speed: 3.4, turn: -Math.PI / 2, radius: 2.4 }, { speed: 2.2, distance: 6, decel: 3 }, { speed: 0, seconds: 1.8, decel: 3 },
  ];
  return { ground: 'slope', slope: .55, ticks: drive(plan, { x: 0, z: 0, heading: Math.PI / 2 }, () => [-18, 6]) };
}
const SYNTHETIC = { paces, turns, slam, bound, sidehill };

const segments = arg('--segments', 'paces').split(',').map(spec => {
  const [name, source] = spec.includes('=') ? spec.split('=') : [spec, spec];
  if (SYNTHETIC[source]) return { name, ...SYNTHETIC[source]() };
  const [from, window] = source.split(':'), [t0, t1] = window.split('-').map(Number);
  // <trace>/brace replays a brace hunt's second dog, with the lead dog beside it.
  const [key, which] = from.split('/'), trace = traces[key];
  if (!trace) throw new Error(`No trace ${key}; pass --trace`);
  const span = trace.ticks.filter(t => t.t >= t0 && t.t <= t1);
  if (which === 'brace') return { name, ground: 'chukar', patches: trace.patches, ticks: span.map(t => t.brace), companion: span.map(({ brace, ...lead }) => lead) };
  // <trace>/lead replays a brace hunt's lead dog with the second dog beside it.
  if (which === 'lead') return { name, ground: 'chukar', patches: trace.patches, ticks: span.map(({ brace, ...lead }) => lead), companion: span.map(t => t.brace) };
  return { name, ground: 'chukar', patches: trace.patches, ticks: span };
});

// ---- bundle the browser half against the chosen checkout ----
const redirect = { name: 'bench-root', setup(b) {
  b.onResolve({ filter: /^\.\.\/src\// }, a => a.importer.startsWith(here) ? { path: resolve(root, a.path.slice(3)) + '.ts' } : undefined);
} };
const bundle = await build({ entryPoints: [resolve(here, 'dogMotionBench.ts')], bundle: true, write: false, format: 'esm',
  platform: 'browser', plugins: [redirect], logLevel: 'error',
  define: { __UPLANDIN_BUILD__: JSON.stringify({ version: 'bench', commit: 'bench', releases: [] }), 'import.meta.env': '{"BASE_URL":"/"}' } });
const config = JSON.stringify({ quality, breeds, views, fps, segments, panel: { w: pw, h: ph }, label });
const server = createServer((req, res) => {
  if (req.url === '/app.js') { res.setHeader('content-type', 'text/javascript'); res.end(bundle.outputFiles[0].contents); return; }
  if (req.url === '/config.json') { res.setHeader('content-type', 'application/json'); res.end(config); return; }
  res.setHeader('content-type', 'text/html');
  res.end('<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#222}</style><script>fetch("/config.json").then(r=>r.json()).then(c=>{window.benchConfig=c;import("/app.js")})</script>');
});
await new Promise(done => server.listen(port, '127.0.0.1', done));
rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ headless: true, protocolTimeout: 0,
  args: ['--ignore-gpu-blocklist', '--no-sandbox', ...(args.includes('--gpu') ? ['--use-angle=metal'] : ['--enable-unsafe-swiftshader']),
    ...(args.includes('--uncapped') ? ['--disable-frame-rate-limit', '--disable-gpu-vsync'] : [])] });
let result;
const encoders = new Map(), still = Number(arg('--still', '6'));
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  // Frames stream into one video per segment; every --still'th frame is
  // also kept as a JPEG for strips and quick looks.
  await page.exposeFunction('saveFrame', async (name, data) => {
    const [segment, frame] = name.split('/'), jpeg = Buffer.from(data.slice(data.indexOf(',') + 1), 'base64');
    let encoder = encoders.get(segment);
    if (!encoder) {
      mkdirSync(resolve(out, 'video'), { recursive: true });
      const child = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-',
        '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', resolve(out, 'video', `${segment}.mp4`)],
        { stdio: ['pipe', 'ignore', 'inherit'] });
      encoder = { process: child, closed: new Promise(done => child.on("close", done)) };
      encoders.set(segment, encoder);
    }
    if (!encoder.process.stdin.write(jpeg)) await new Promise(done => encoder.process.stdin.once('drain', done));
    if (Number(frame.slice(0, 5)) % still === 0) {
      const file = resolve(out, 'frames', name); mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, jpeg);
    }
  });
  await page.setViewport({ width: 800, height: 600 });
  await page.goto(`http://127.0.0.1:${port}/`);
  let last = '';
  for (;;) {
    const status = await page.evaluate(() => ({ done: !!window.benchDone, error: window.benchError, progress: window.benchProgress }));
    if (status.error) throw new Error(status.error);
    if (status.done) break;
    if (status.progress && status.progress !== last) { console.log(status.progress); last = status.progress; }
    await new Promise(done => setTimeout(done, 1000));
  }
  result = await page.evaluate(() => window.benchDone);
  if (errors.length) console.warn('page errors:', errors.slice(0, 5));
  result.errors = errors;
} finally {
  await browser.close(); server.close();
  for (const encoder of encoders.values()) { encoder.process.stdin.end(); await encoder.closed; }
}

// ---- numbers ----
const summary = { root, quality, label, gl: result.gl, evidence: 'Staged runtime-renderer replay of recorded/synthetic travel; not gameplay or device performance', segments: {} };
for (const seg of result.segments) {
  const rows = {};
  for (const [breed, frames] of Object.entries(seg.samples)) {
    let drift = 0, driftN = 0, maxDrift = 0, steps = 0, gaitChanges = 0, prevGait = null, clamped = 0;
    let maxGap = 0, maxMeshSink = 0, maxMeshFloat = 0, sinkFrames = 0;
    const ms = frames.map(f => f.ms).sort((a, b) => a - b);
    const pitch = [], roll = [], bodyY = [];
    frames.forEach((f, i) => {
      clamped += f.clamped;
      if (f.moving) { pitch.push(f.pitch); roll.push(f.roll); bodyY.push(f.bodyY); }
      if (prevGait !== null && f.gait !== prevGait && f.moving) gaitChanges++;
      prevGait = f.gait;
      const prior = frames[i - 1];
      for (const foot of f.feet) {
        if (!foot.locked || foot.step > 0) continue;
        maxGap = Math.max(maxGap, Math.abs(foot.gap));
        maxMeshSink = Math.max(maxMeshSink, -foot.meshGap); maxMeshFloat = Math.max(maxMeshFloat, foot.meshGap);
        if (foot.meshGap < -.02) sinkFrames++;
        const before = prior?.feet[foot.i];
        if (before && before.locked && before.step === 0 && before.plant === foot.plant && f.moving) {
          const d = Math.hypot(foot.p[0] - before.p[0], foot.p[2] - before.p[2]);
          drift += d; driftN++; maxDrift = Math.max(maxDrift, d);
        }
        if (before && before.step === 0 && foot.step > 0) steps++;
      }
      for (const foot of f.feet) if (foot.step > 0 && !(prior?.feet[foot.i].step > 0)) steps++;
    });
    const spread = a => a.length ? +(Math.max(...a) - Math.min(...a)).toFixed(4) : 0;
    rows[breed] = {
      frames: frames.length, gaitChanges, correctiveSteps: steps, clampedFrames: clamped,
      plantedDriftMeanMm: +(drift / Math.max(1, driftN) * 1000).toFixed(2), plantedDriftMaxMm: +(maxDrift * 1000).toFixed(1),
      plantedGapMaxMm: +(maxGap * 1000).toFixed(1), meshSinkMaxMm: +(maxMeshSink * 1000).toFixed(1), meshFloatMaxMm: +(maxMeshFloat * 1000).toFixed(1),
      meshSinkFrames: sinkFrames, pitchSpread: spread(pitch), rollSpread: spread(roll), bodyYSpread: spread(bodyY),
      updateMsMean: +(ms.reduce((a, b) => a + b, 0) / Math.max(1, ms.length)).toFixed(3), updateMsP95: ms[Math.floor(ms.length * .95)] ?? 0,
      gaits: frames.reduce((acc, f) => { if (f.moving) acc[f.gait] = (acc[f.gait] ?? 0) + 1; return acc; }, {}),
    };
  }
  summary.segments[seg.name] = rows;
}
writeFileSync(resolve(out, 'samples.json'), JSON.stringify(result));
writeFileSync(resolve(out, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ out, gl: result.gl, errors: result.errors?.length ?? 0, segments: Object.keys(summary.segments) }));
for (const [name, rows] of Object.entries(summary.segments)) for (const [breed, r] of Object.entries(rows))
  console.log(`${name.padEnd(10)} ${breed.padEnd(15)} gaitChanges ${r.gaitChanges} steps ${r.correctiveSteps} drift ${r.plantedDriftMeanMm}/${r.plantedDriftMaxMm} mm meshSink ${r.meshSinkMaxMm} float ${r.meshFloatMaxMm} pitch ${r.pitchSpread} roll ${r.rollSpread} ms ${r.updateMsMean}/${r.updateMsP95}`);
