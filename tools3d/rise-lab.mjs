#!/usr/bin/env node
/** The rise lab: many rises on each core ground, flown headless through the
 * real birds subsystem (waves, lanes, flight lines, exits) over the real
 * landform, measured from the hunter's eye. No browser, no frames: the
 * numbers behind the rise review's strips, over enough rises to trust.
 *
 *   tools3d/heavy.sh node tools3d/rise-lab.mjs [--hunts 6] [--coveys 6] [--out /tmp/uplandin-rise/lab.json]
 *
 * Each ground spawns hunts from fixed seeds; each covey is walked up on from a
 * seeded bearing at 14-24 m and flushed whole. Per ground it reports the
 * line from the gun at 0.8 s (straightaway < 25 deg, quartering < 65,
 * crossing < 115), sky-backing through each bird's first second (terrain
 * only), the least separation between live birds in the shot window, the
 * rise's length with no shot fired (until nothing is queued and no live bird
 * is inside 40 m), the most live birds ever inside 40 m at once, and how
 * the birds that got away left.
 */
import { createServer } from 'vite';
import * as THREE from 'three';
import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const arg = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const hunts = Number(arg('--hunts', '6')), coveysPerHunt = Number(arg('--coveys', '6'));
const out = arg('--out', '/tmp/uplandin-rise/lab.json');
const grounds = arg('--areas', 'quail-fields,sharptail-prairie,pheasant-coverts,chukar-ridge').split(',');

const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
const load = path => vite.ssrLoadModule(path);
const { BirdsSystem } = await load('/src/three/subsystems/birds.ts');
const { getArea } = await load('/src/game/areas.ts');
const { LandscapeModel } = await load('/src/game/landscape.ts');
const { createHunt } = await load('/src/game/state.ts');
const { mulberry32 } = await load('/src/game/math.ts');
const { PROPERTY_PX_TO_M } = await load('/src/game/worldUnits.ts');
const { holdsSky, inTheShot, countsAgainstCap } = await load('/src/game/riseScore.ts');
const { skyBehind } = await load('/src/game/flightLine.ts');

const lineOf = (eye, b) => {
  const lx = b.x - eye.x, lz = b.z - eye.z, sp = Math.hypot(b.vxW, b.vzW) || 1;
  const deg = Math.acos(Math.max(-1, Math.min(1, (lx * b.vxW + lz * b.vzW) / ((Math.hypot(lx, lz) || 1) * sp)))) * 180 / Math.PI;
  return deg < 25 ? 'straightaway' : deg < 65 ? 'quartering' : deg < 115 ? 'crossing' : 'incoming';
};
const angle = (eye, a, b) => {
  const ax = a.x - eye.x, ay = a.y - eye.y, az = a.z - eye.z, bx = b.x - eye.x, by = b.y - eye.y, bz = b.z - eye.z;
  return Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by + az * bz) / ((Math.hypot(ax, ay, az) * Math.hypot(bx, by, bz)) || 1)))) * 180 / Math.PI;
};

function riseOnce(area, landscape, patches, covey, hunterWorld, rng, ground) {
  const system = new BirdsSystem(), runtime = system;
  const birds = covey.map(bird => ({ ...bird, state: 'flushed' }));
  const hunterPos = landscape.worldToProperty(hunterWorld.x, hunterWorld.z, { x: 0, y: 0 });
  const eyeY = ground(hunterWorld.x, hunterWorld.z) + 1.62;
  const landings = [], escapes = [];
  runtime.hunt = {
    areaConfig: () => area, huntState: () => ({ birds, hunterPos, wind: rng() * Math.PI * 2, windStrength: 'breezy' }),
    simToWorld: (x, y, o) => landscape.propertyToWorld(x, y, o), coverPatches: () => patches,
    riseSlopeApproach: id => {
      const bird = birds.find(b => b.id === id);
      const w = landscape.propertyToWorld(bird.pos.x, bird.pos.y, { x: 0, z: 0 });
      const rise = eyeY - 1.62 - ground(w.x, w.z), band = Math.max(1, Math.hypot(w.x - hunterWorld.x, w.z - hunterWorld.z) * .05);
      return rise > band ? 'above' : rise < -band ? 'below' : 'level';
    },
    lastFlushInfo: () => null, finishRise: () => {}, recordFallWorld: () => {}, condition: () => 'mild',
    resolveBird: (id, outcome, landing) => { (landing ? landings : escapes).push(id); const b = birds.find(x => x.id === id); if (b) b.state = outcome; return true; },
  };
  runtime.terrain = { heightAt: ground };
  runtime.frozen = true;
  runtime.mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const camera = new THREE.PerspectiveCamera(70, 16 / 9, .05, 1600);
  camera.position.set(hunterWorld.x, eyeY, hunterWorld.z);
  const c = covey.reduce((s, b) => { const w = landscape.propertyToWorld(b.pos.x, b.pos.y, { x: 0, z: 0 }); return { x: s.x + w.x / covey.length, z: s.z + w.z / covey.length }; }, { x: 0, z: 0 });
  camera.lookAt(c.x, eyeY, c.z); camera.updateMatrixWorld();
  runtime.listener = camera;
  runtime.buildPool({ scene: new THREE.Scene() });
  const eye = camera.position;
  const tracks = new Map();
  let over = null, minShot = Infinity, maxInShot = 0, maxInSky = 0;
  const shotTicks = [];
  for (let tick = 1; tick <= 30 * 24; tick++) {
    runtime.tickBirds(1000 / 30);
    const live = runtime.slots.filter(s => s.status === 'flying');
    for (const s of runtime.slots) {
      if (s.status !== 'flying' && s.status !== 'departing' && s.status !== 'waiting') continue;
      let t = tracks.get(s.simId);
      if (!t) { t = { species: s.species.id, sky: [], line: null, exit: null, target: !!s.line?.target }; tracks.set(s.simId, t); }
      if (s.status === 'flying' && s.airMs <= 1000) t.sky.push(skyBehind(eye, s, ground));
      if (s.status === 'flying' && !t.line && s.airMs >= 800) t.line = lineOf(eye, s);
    }
    const inWindow = live.filter(s => s.airMs >= 500 && s.airMs <= 2500);
    let tickMin = Infinity;
    for (let i = 0; i < inWindow.length; i++) for (let j = i + 1; j < inWindow.length; j++) tickMin = Math.min(tickMin, angle(eye, inWindow[i], inWindow[j]));
    if (Number.isFinite(tickMin)) { shotTicks.push(tickMin); minShot = Math.min(minShot, tickMin); }
    const holding = runtime.slots.filter(s => holdsSky({ status: s.status, rangeM: Math.hypot(s.x - eye.x, s.z - eye.z),
      sinceLaunchMs: runtime.skyMs - (s.launchedSkyMs ?? -Infinity) })).length;
    maxInShot = Math.max(maxInShot, runtime.slots.filter(s => inTheShot({ status: s.status, rangeM: Math.hypot(s.x - eye.x, s.z - eye.z) })).length);
    if (countsAgainstCap) maxInSky = Math.max(maxInSky, runtime.slots.filter(s => countsAgainstCap({ status: s.status, rangeM: Math.hypot(s.x - eye.x, s.z - eye.z) })).length);
    const queued = runtime.rises.reduce((n, r) => n + r.waves.slice(r.next).reduce((m, w) => m + w.ids.length, 0), 0);
    if (over === null && holding === 0 && queued === 0 && tick > 3) over = tick / 30;
    if (over !== null && runtime.slots.every(s => !['flying', 'waiting', 'departing', 'falling'].includes(s.status))) break;
  }
  system.dispose({ scene: new THREE.Scene() });
  return { birds: covey.length, species: covey[0].speciesId, over, maxInShot, maxInSky, shotTicks, minShot: Number.isFinite(minShot) ? minShot : null,
    tracks: [...tracks.values()], landed: landings.length, droveOff: escapes.length };
}

const report = { hunts, coveysPerHunt, grounds: {} };
for (const id of grounds) {
  const area = getArea(id), landscape = new LandscapeModel(area);
  const ground = (x, z) => landscape.heightAtWorld(x, z);
  const patches = area.patches.map(p => { const w = landscape.propertyToWorld(p.x + p.w / 2, p.y + p.h / 2, { x: 0, z: 0 });
    return { cx: w.x, cz: w.z, hx: p.w / 2 * PROPERTY_PX_TO_M, hz: p.h / 2 * PROPERTY_PX_TO_M }; });
  const rises = [];
  for (let seed = 1; seed <= hunts; seed++) {
    const rng = mulberry32(0x5eed + seed * 7919);
    const hunt = createHunt(area, mulberry32(seed));
    const coveys = new Map();
    for (const bird of hunt.birds) coveys.set(bird.coveyId, [...(coveys.get(bird.coveyId) ?? []), bird]);
    for (const covey of [...coveys.values()].slice(0, coveysPerHunt)) {
      const c = covey.reduce((s, b) => { const w = landscape.propertyToWorld(b.pos.x, b.pos.y, { x: 0, z: 0 }); return { x: s.x + w.x / covey.length, z: s.z + w.z / covey.length }; }, { x: 0, z: 0 });
      const bearing = rng() * Math.PI * 2, distance = 14 + rng() * 10;
      rises.push(riseOnce(area, landscape, patches, covey, { x: c.x + Math.cos(bearing) * distance, z: c.z + Math.sin(bearing) * distance }, rng, ground));
    }
  }
  const tracks = rises.flatMap(r => r.tracks), lines = {};
  for (const t of tracks) if (t.line) lines[t.line] = (lines[t.line] ?? 0) + 1;
  const classified = Object.values(lines).reduce((a, b) => a + b, 0) || 1;
  const sky = tracks.flatMap(t => t.sky), seps = rises.map(r => r.minShot).filter(v => v !== null).sort((a, b) => a - b);
  const lengths = rises.filter(r => r.over !== null);
  const bySize = (lo, hi) => lengths.filter(r => r.birds >= lo && r.birds <= hi).map(r => r.over).sort((a, b) => a - b);
  const median = values => values.length ? values[values.length >> 1] : null;
  const summary = {
    rises: rises.length, birds: tracks.length, maxInShot: Math.max(...rises.map(r => r.maxInShot)), maxInSky: Math.max(...rises.map(r => r.maxInSky)),
    straightawayShare: (lines.straightaway ?? 0) / classified, lines,
    skyBackedFirstSecond: sky.length ? sky.filter(Boolean).length / sky.length : 0,
    shotWindowSeparation: { min: seps[0] ?? null, median: median(seps), p10: seps[Math.floor(seps.length * .1)] ?? null },
    // Over every tick with two or more birds in the shot window: the closest pair's angle.
    shotWindowTicks: (() => { const all = rises.flatMap(r => r.shotTicks).sort((a, b) => a - b);
      return { ticks: all.length, median: median(all), share5Deg: all.length ? all.filter(d => d >= 5).length / all.length : null }; })(),
    riseLengthS: { median: median(lengths.map(r => r.over).sort((a, b) => a - b)), max: Math.max(...lengths.map(r => r.over)),
      bySize: { '1-3': median(bySize(1, 3)), '4-7': median(bySize(4, 7)), '8+': median(bySize(8, 99)) } },
    escapes: { landedInCover: rises.reduce((s, r) => s + r.landed, 0), droveOff: rises.reduce((s, r) => s + r.droveOff, 0) },
    species: Object.fromEntries([...new Set(rises.map(r => r.species))].map(s => [s, rises.filter(r => r.species === s).length])),
  };
  report.grounds[id] = summary;
  console.log(`${id}: ${summary.rises} rises, ${summary.birds} birds; most in the shot ${summary.maxInShot}, inside 55 m ${summary.maxInSky}; straightaways ${(summary.straightawayShare * 100).toFixed(0)}% ${JSON.stringify(lines)}; ` +
    `sky-backed first second ${(summary.skyBackedFirstSecond * 100).toFixed(0)}%; shot window: closest pair median ${summary.shotWindowTicks.median?.toFixed(1)} deg over ${summary.shotWindowTicks.ticks} ticks, ${((summary.shotWindowTicks.share5Deg ?? 0) * 100).toFixed(0)}% >= 5 deg, least per rise median ${summary.shotWindowSeparation.median?.toFixed(1)} deg; ` +
    `rise length median ${summary.riseLengthS.median?.toFixed(1)} s, max ${summary.riseLengthS.max.toFixed(1)} s ${JSON.stringify(summary.riseLengthS.bySize)}; ` +
    `escapes landed ${summary.escapes.landedInCover} / drove off ${summary.escapes.droveOff}; species ${JSON.stringify(summary.species)}`);
}
writeFileSync(out, JSON.stringify(report, null, 2));
await vite.close();
