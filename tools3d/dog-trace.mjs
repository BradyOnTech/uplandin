#!/usr/bin/env node
/**
 * Record a real hunt's dog for the motion bench (tools3d/dog-motion-bench.mjs).
 *
 *   tools3d/heavy.sh node tools3d/dog-trace.mjs --area chukar-ridge --seed 48291 \
 *     --breed gsp --level 8 --hunter trail --seconds 240 --out /tmp/dog-audit/traces/chukar-gsp8.json
 *
 * Drives the actual hunt simulation through the hunt lab
 * (tools3d/huntlab/harness.mjs) and writes every 30 Hz tick of the lead dog:
 * position and the two headings the renderer interpolates, its state, gait,
 * scent beat, slam, creep and retrieve, the hunter, and the bird a pickup
 * reaches for or a marking dog watches. The trace is the bench's input, so
 * before and after renders of the dog see identical travel.
 *
 * Optional handler script: --recall-at <s> whistles the dog in once it is
 * quartering at least 25 m out after that time, then casts it off again after
 * eight seconds at heel; --release-on-point <n> says "hunt on" three seconds
 * into the nth point, so the dog breaks and relocates. Both go in through the
 * simulation's ordinary input, as a player's whistle and command would.
 * --brace <breed> hunts a second dog of that breed and records it too, as
 * `brace` on every tick (the same fields), so honoring can be replayed.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import * as THREE from 'three';
import { load, runHunt, close } from './huntlab/harness.mjs';

const args = process.argv.slice(2);
const arg = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const opts = {
  area: arg('--area', 'chukar-ridge'), drop: arg('--drop', 'south-gate'), seed: Number(arg('--seed', '48291')),
  breed: arg('--breed', 'gsp'), level: Number(arg('--level', '8')), hunter: arg('--hunter', 'trail'),
  seconds: Number(arg('--seconds', '240')), wind: arg('--wind', 'breezy'), weather: arg('--weather', 'frost'),
};
const recallAt = args.includes('--recall-at') ? Number(arg('--recall-at')) : null;
const releaseOnPoint = args.includes('--release-on-point') ? Number(arg('--release-on-point')) : null;
const brace = arg('--brace', null);
const out = resolve(arg('--out', `/tmp/dog-audit/traces/${opts.area}-${opts.breed}${opts.level}-${opts.seed}.json`));

const m = await load(process.env.HUNTLAB_ROOT);
if (brace) {
  // The hunt lab hunts one dog; hand the quick config a second as it is read.
  let store = null;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: () => store, set(value) {
    store = { ...value, getItem(key) {
      const raw = value.getItem(key);
      if (key !== m.quick.QUICK_KEY || !raw) return raw;
      return JSON.stringify({ ...JSON.parse(raw), breed2Id: brace });
    } };
  } });
}
// Hold on to the hunt's BirdsSystem so the trace can carry the bird a pickup
// reaches for and the birds a marking dog watches, as the renderer reads them.
const BirdsSystem = m.birds.BirdsSystem, init = BirdsSystem.prototype.init;
BirdsSystem.prototype.init = function (ctx) { globalThis.__dogTraceBirds = this; return init.call(this, ctx); };

const r4 = v => Math.round(v * 1e4) / 1e4;
const ticks = [], script = [];
let patched = false, recall = false, commands = [], points = 0, pointStart = null;
let recalled = null, heelSince = null, castAgain = false, released = false;
const v = new THREE.Vector3(), pos = { x: 0, z: 0 };
/** The fields the bench replays, for the dog in a slot. */
function record(hunt, dog, slot, s, hx, hz) {
  const at = hunt.dogRenderWorld(1, { x: 0, z: 0 }, slot), birds = globalThis.__dogTraceBirds;
  const reserved = dog.reservedRetrieveId?.() ?? null;
  const reach = dog.state === 'retrieving' && dog.carryingBirdId === null && reserved !== null && birds?.groundedTarget(reserved, v) ? [r4(v.x), r4(v.y), r4(v.z)] : null;
  const ids = dog.watchedBirdIds?.() ?? [];
  const watch = dog.state === 'marking' && ids.length && birds?.markingTarget(ids, v) ? [r4(v.x), r4(v.y), r4(v.z)] : null;
  return {
    t: r4(s), x: r4(at.x), z: r4(at.z), heading: r4(hunt.dogRenderHeading(1, slot)), travel: r4(hunt.dogRenderTravelHeading(1, slot)),
    state: dog.state, gait: dog.gait, scent: dog.scentStage, progress: r4(dog.scentProgress ?? 0),
    waiting: !!dog.waitingForHandler, creeping: !!dog.creeping, slam: dog.slamProgress?.() == null ? null : r4(dog.slamProgress()),
    carrying: dog.carryingBirdId, reserved, holdMs: Math.round(dog.retrieveHoldTimeMs?.() ?? 0),
    hunter: [r4(hx), r4(hz)], reach, watch,
  };
}
const result = await runHunt({ ...opts, onTick(s, hunt, dog) {
  if (!patched) {
    // The scripted handler speaks through the simulation's own input, once a tick.
    const sim = hunt.simulation, update = sim.update.bind(sim);
    sim.update = (dt, input) => {
      const extra = { recall: input.recall || recall, commands: [...(input.commands ?? []), ...commands] };
      recall = false; commands = [];
      return update(dt, { ...input, ...extra });
    };
    patched = true;
  }
  const hunter = hunt.huntState().hunterPos;
  hunt.simToWorld(hunter.x, hunter.y, pos);
  const hx = pos.x, hz = pos.z;
  hunt.dogRenderWorld(1, pos);
  const away = Math.hypot(pos.x - hx, pos.z - hz);
  if (dog.state === 'pointing') {
    if (pointStart === null) { pointStart = s; points++; }
    if (releaseOnPoint === points && !released && s - pointStart > 3) {
      commands.push({ kind: 'release' }); released = true; script.push({ t: s, event: 'release', point: points });
    }
  } else pointStart = null;
  if (recallAt !== null && recalled === null && s >= recallAt && dog.state === 'quartering' && away > 25) {
    recall = true; recalled = s; script.push({ t: s, event: 'recall', away: r4(away) });
  }
  if (recalled !== null && !castAgain) {
    if (dog.state === 'heel') heelSince ??= s; else heelSince = null;
    if (heelSince !== null && s - heelSince > 8) { recall = true; castAgain = true; script.push({ t: s, event: 'cast-off' }); }
  }
  const tick = record(hunt, dog, 0, s, hx, hz);
  if (brace) tick.brace = record(hunt, hunt.dog(1), 1, s, hx, hz);
  ticks.push(tick);
} });
await close();
const area = m.areas.getArea(opts.area);
const landscape = new m.landscape.LandscapeModel(area, opts.drop);
const patches = area.patches.map(p => {
  const c = landscape.propertyToWorld(p.x + p.w / 2, p.y + p.h / 2, { x: 0, z: 0 });
  return { cx: r4(c.x), cz: r4(c.z), hx: r4(p.w / 2 * m.landscape.PROPERTY_PX_TO_M), hz: r4(p.h / 2 * m.landscape.PROPERTY_PX_TO_M) };
});
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ meta: { ...opts, recallAt, releaseOnPoint, script, points: result.points, retrieved: result.retrieved,
  states: result.states, evidence: 'Hunt-lab simulation trace (scripted hunter); bench input, not gameplay evidence' }, patches, ticks }));
const counts = ticks.reduce((acc, t) => { acc[t.state] = (acc[t.state] ?? 0) + 1; return acc; }, {});
const braceCounts = brace ? ticks.reduce((acc, t) => { acc[t.brace.state] = (acc[t.brace.state] ?? 0) + 1; return acc; }, {}) : null;
console.log(JSON.stringify({ out, ticks: ticks.length, points: result.points, retrieved: result.retrieved, script, counts, braceCounts,
  creeping: ticks.filter(t => t.creeping).length, slams: ticks.filter(t => t.slam !== null).length }));
