#!/usr/bin/env node
/** The mark lab: whole hunts, headless, with a shooting hunter who marks his
 * misses. It drives the real hunt and birds subsystems (Hunt3DSystem,
 * BirdsSystem) over the real landform through Vite SSR, no browser, and
 * measures the second act: follow-up encounters on birds he marked down,
 * and the dry spells between contacts.
 *
 *   tools3d/heavy.sh node tools3d/mark-lab.mjs [--grounds quail-fields,...] [--seeds 1,2,3] [--seconds 1200]
 *     [--root /path/to/other/checkout] [--out /tmp/uplandin-rise/marks.json]
 *
 * The hunter sees what a player sees: the dog, birds in the air, a bird
 * setting down in his sight. He walks with the dog, walks in on its points,
 * shoots birds 12-38 m out with a double (hit chance falling with range),
 * sends the dog for a fall it has not fetched, and when he watched a miss
 * set down within 200 m he walks toward the spot, faces it and casts the dog
 * there. A follow-up is a flush of a bird he had already put up (a single he
 * marked, or a covey that circled back).
 */
import { createServer } from 'vite';
import * as THREE from 'three';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const arg = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const grounds = arg('--grounds', 'quail-fields,sharptail-prairie,pheasant-coverts,chukar-ridge').split(',');
const seeds = arg('--seeds', '1,2,3').split(',').map(Number);
const seconds = Number(arg('--seconds', '1200'));
const root = resolve(arg('--root', process.cwd()));
const out = arg('--out', '/tmp/uplandin-rise/marks.json');
const DT = 1000 / 30, SHOT_MIN = 12, SHOT_MAX = 38, REACTION_MS = 380, SHOT_GAP_MS = 420, RELOAD_MS = 1310;
const MARK_RANGE = 200, CAST_FROM = 45;

const vite = await createServer({ root, configFile: false, cacheDir: '/tmp/uplandin-rise/.marklab-cache', logLevel: 'silent', appType: 'custom',
  server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] },
  define: { __UPLANDIN_BUILD__: JSON.stringify({ version: 'marklab', commit: 'marklab', releases: [] }) } });
const load = path => vite.ssrLoadModule(path);
const { Hunt3DSystem } = await load('/src/three/subsystems/hunt3d.ts');
const { BirdsSystem } = await load('/src/three/subsystems/birds.ts');
const { LandscapeModel } = await load('/src/game/landscape.ts');
const { getArea } = await load('/src/game/areas.ts');
const quick = await load('/src/game/quick.ts');
const { mulberry32 } = await load('/src/game/math.ts');
let parking = null;
try { parking = (await load('/src/three/subsystems/quailEntrances.ts')).deriveQuailParkingPose; } catch { parking = null; }

const store = new Map();
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k) };
if (!globalThis.window || typeof globalThis.window.addEventListener !== 'function') {
  const et = new EventTarget();
  globalThis.window = { addEventListener: et.addEventListener.bind(et), removeEventListener: et.removeEventListener.bind(et),
    dispatchEvent: et.dispatchEvent.bind(et), matchMedia: () => ({ matches: false }) };
}

function huntOnce(areaId, seed) {
  store.set(quick.QUICK_KEY, JSON.stringify({ ...quick.defaultQuickConfig(), areaId, breedId: 'gsp', level: 6, breed2Id: 'none' }));
  const drop = 'south-gate';
  const search = `?play=quick&drop=${drop}&seed=${seed}`;
  globalThis.location = { search, href: `http://localhost/index3d.html${search}` };
  const area = getArea(areaId), landscape = new LandscapeModel(area, drop);
  const hunt = new Hunt3DSystem(landscape);
  const camera = new THREE.PerspectiveCamera(70, 16 / 9, .05, 2000);
  camera.rotation.order = 'YXZ';
  const commands = [];
  const player = { isRunning: () => false, consumeRecall: () => false, consumeCommands: () => commands.splice(0),
    setHuntHeading: (_c, heading) => { camera.rotation.y = -heading - Math.PI / 2; }, setPose() {} };
  const terrain = { heightAt: (x, z) => landscape.heightAtWorld(x, z) };
  const gun = { shells: 2, reloadEnds: 0, now: 0, shellsRemaining() { return this.shells; }, shellCapacity: () => 2,
    isReloading() { return this.now < this.reloadEnds; } };
  const systems = { player, hunt3d: hunt, terrain, gun };
  let birds = null;
  const ctx = { scene: new THREE.Scene(), camera, events: new EventTarget(), quality: 'lite', timeOfDay: 'morning', time: 0,
    fixedAlpha: 1, paused: false, get: id => systems[id] ?? (id === 'birds' ? birds : {}) };
  hunt.init(ctx);
  birds = new BirdsSystem(); systems.birds = birds; birds.init(ctx);
  const dropPoint = hunt.dropPoint(), truck = hunt.truckWorld({ x: 0, z: 0 });
  const yaw = parking?.(area, dropPoint.id)?.yaw ?? -dropPoint.heading;
  camera.position.set(truck.x + Math.sin(yaw) * 5, 0, truck.z + Math.cos(yaw) * 5);
  hunt.releaseFromTruck(ctx, [{ x: truck.x + Math.sin(yaw) * 3.95, z: truck.z + Math.cos(yaw) * 3.95, heading: dropPoint.heading }]);
  const bounds = landscape.worldBounds();
  const shotRng = mulberry32((seed * 7919) ^ 0x5407);
  const internal = birds;
  const res = { area: areaId, seed, contacts: [], flushes: 0, followUps: 0, followUpPoints: 0, marks: 0, marksSeen: 0, casts: 0,
    shots: 0, hits: 0, circledBack: 0, singlesRelit: 0, states: {} };
  const everFlushed = new Set(), prevState = new Map(hunt.huntState().birds.map(b => [b.id, b.state]));
  const downed = new Map(), slotsSeen = new Map();
  let mark = null, lastShot = -1e9, prevDog = hunt.dog().state;
  const walk = { x: Math.cos(dropPoint.heading), z: Math.sin(dropPoint.heading) };
  // The cover he can see, worked patch to nearest patch, as a player does.
  const patches = hunt.coverPatches().map(p => ({ x: p.cx, z: p.cz, visited: false }));
  let goal = null;
  const nextGoal = () => {
    let best = null, bestD = Infinity;
    for (const p of patches) { const d = Math.hypot(p.x - camera.position.x, p.z - camera.position.z); if (!p.visited && d < bestD) { bestD = d; best = p; } }
    if (!best) { for (const p of patches) p.visited = false; return patches[0] ?? null; }
    return best;
  };
  const eyeSees = (x, z) => {
    const e = camera.position, y = landscape.heightAtWorld(x, z) + .3, dx = x - e.x, dz = z - e.z, len = Math.hypot(dx, dz);
    for (let s = 2; s < len - 2; s += 2) { const k = s / len; if (landscape.heightAtWorld(e.x + dx * k, e.z + dz * k) > e.y + (y - e.y) * k) return false; }
    return true;
  };
  for (let tick = 0; tick < seconds * 30; tick++) {
    const s = (tick + 1) / 30, now = s * 1000;
    gun.now = now; if (gun.shells === 0 && now >= gun.reloadEnds) gun.shells = 2;
    const dog = hunt.dog(), dw = hunt.dogWorld({ x: 0, z: 0 }), cam = camera.position;
    const rise = birds.isRiseActive();
    // ---- where the hunter goes ----
    let target = null, stop = 0;
    const pending = [...downed.entries()].find(([id, r]) => !r.done && hunt.huntState().birds.find(b => b.id === id)?.state === 'downed');
    if (dog.state === 'pointing') { target = { x: dw.x + Math.cos(dog.heading) * 11, z: dw.z + Math.sin(dog.heading) * 11 }; stop = .3; }
    else if (pending && s - pending[1].t > 6) { const b = hunt.huntState().birds.find(x => x.id === pending[0]); target = hunt.simToWorld(b.pos.x, b.pos.y, { x: 0, z: 0 }); stop = 12; }
    else if (mark && !mark.cast) { target = mark; stop = CAST_FROM; }
    else if (dog.state === 'heel' || dog.state === 'recalled') {
      // A dog at heel waits on the hunter: walk on, turning off the property line.
      if (cam.x + walk.x * 30 < bounds.minX || cam.x + walk.x * 30 > bounds.maxX) walk.x = -walk.x;
      if (cam.z + walk.z * 30 < bounds.minZ || cam.z + walk.z * 30 > bounds.maxZ) walk.z = -walk.z;
      target = { x: cam.x + walk.x * 10, z: cam.z + walk.z * 10 };
    } else if (dog.state === 'quartering' && Math.hypot(dw.x - cam.x, dw.z - cam.z) < 70) {
      if (!goal || Math.hypot(goal.x - cam.x, goal.z - cam.z) < 10) { if (goal) goal.visited = true; goal = nextGoal(); }
      target = goal ?? dw; stop = goal ? .5 : 20;
    } else { target = dw; stop = 16; }
    if (rise || dog.state === 'retrieving') target = null;
    if (target) {
      const tx = target.x - cam.x, tz = target.z - cam.z, td = Math.hypot(tx, tz);
      if (td > .5) camera.rotation.y = Math.atan2(-tx, -tz);
      if (td > stop) {
        const step = Math.min(2 / 30, td - stop);
        if (step > 1e-4 && target !== mark) { walk.x = tx / td; walk.z = tz / td; }
        cam.x = Math.min(bounds.maxX - 2, Math.max(bounds.minX + 2, cam.x + tx / td * step));
        cam.z = Math.min(bounds.maxZ - 2, Math.max(bounds.minZ + 2, cam.z + tz / td * step));
      } else if (mark && !mark.cast && target === mark) {
        // Face the spot he watched it set down, look at the ground there, cast.
        camera.rotation.x = -Math.atan2(cam.y - landscape.heightAtWorld(mark.x, mark.z), Math.max(1, td));
        if (['quartering', 'heel', 'whoa', 'marking', 'recalled', 'seeking'].includes(dog.state)) { commands.push('cast'); mark.cast = true; res.casts++; }
      }
    }
    cam.y = landscape.heightAtWorld(cam.x, cam.z) + 1.7;
    // ---- shooting ----
    if (gun.shells > 0 && !gun.isReloading() && now - lastShot > SHOT_GAP_MS) {
      const hs = hunt.huntState();
      const shot = birds.airborne().filter(a => a.status === 'flying' && a.airMs > REACTION_MS)
        .map(a => ({ a, range: Math.hypot(a.x - cam.x, a.y - cam.y, a.z - cam.z), bird: hs.birds.find(b => b.id === a.simId) }))
        .filter(c => c.range >= SHOT_MIN && c.range <= SHOT_MAX && c.bird?.state === 'flushed' && c.bird.sex !== 'hen')
        .sort((p, q) => p.range - q.range)[0];
      if (shot) {
        res.shots++; lastShot = now;
        if (--gun.shells <= 0) { gun.shells = 0; gun.reloadEnds = now + RELOAD_MS + 330; }
        if (shotRng() < Math.max(.25, Math.min(.8, .95 - shot.range * .017)) && hunt.resolveBird(shot.a.simId, 'downed')) {
          birds.downBird(shot.a.simId, { x: shot.a.x, y: shot.a.y, z: shot.a.z });
          res.hits++; downed.set(shot.a.simId, { t: s, done: false, dead: -1e9 });
        }
      }
    }
    if (pending && dog.state !== 'retrieving' && dog.state !== 'pointing' && s - pending[1].t > 10 && s - pending[1].dead > 12) {
      const b = hunt.huntState().birds.find(x => x.id === pending[0]), w = hunt.simToWorld(b.pos.x, b.pos.y, { x: 0, z: 0 });
      camera.rotation.y = Math.atan2(-(w.x - cam.x), -(w.z - cam.z));
      camera.rotation.x = -Math.atan2(cam.y - landscape.heightAtWorld(w.x, w.z), Math.max(1, Math.hypot(w.x - cam.x, w.z - cam.z)));
      commands.push('dead'); pending[1].dead = s;
    } else if (!(mark && !mark.cast)) camera.rotation.x = -.16;
    camera.updateMatrixWorld();
    ctx.time += DT / 1000;
    hunt.fixedUpdate(ctx, DT);
    birds.fixedUpdate(ctx, DT);
    // ---- what he saw ----
    for (const slot of internal.slots) {
      const was = slotsSeen.get(slot);
      if (was && was.status !== 'done' && slot.status === 'done' && ['flying', 'departing'].includes(was.status)) {
        const height = was.y - landscape.heightAtWorld(was.x, was.z);
        if (height < .7) {
          res.marks++;
          const range = Math.hypot(was.x - cam.x, was.z - cam.z);
          if (range <= MARK_RANGE && eyeSees(was.x, was.z)) { res.marksSeen++; mark = { x: was.x, z: was.z, cast: false, at: s }; }
        }
      }
      slotsSeen.set(slot, { status: slot.status, x: slot.x, y: slot.y, z: slot.z });
    }
    if (mark && s - mark.at > 240) mark = null;
    const nd = hunt.dog();
    res.states[nd.state] = (res.states[nd.state] ?? 0) + 1 / 30;
    if (nd.state === 'tracking' && prevDog !== 'tracking') res.contacts.push({ t: +s.toFixed(1), kind: 'scent' });
    if (nd.state === 'pointing' && prevDog !== 'pointing') {
      res.contacts.push({ t: +s.toFixed(1), kind: 'point' });
      const pb = hunt.huntState().birds.find(b => b.id === nd.pointedBirdId);
      if (pb && everFlushed.has(pb.id)) res.followUpPoints++;
    }
    prevDog = nd.state;
    let flushedNow = false, followNow = false;
    for (const b of hunt.huntState().birds) {
      const p = prevState.get(b.id);
      if (p === 'hidden' && b.state === 'flushed') {
        flushedNow = true;
        if (everFlushed.has(b.id)) followNow = true;
        everFlushed.add(b.id);
        if (mark && Math.hypot(hunt.simToWorld(b.pos.x, b.pos.y, { x: 0, z: 0 }).x - mark.x, hunt.simToWorld(b.pos.x, b.pos.y, { x: 0, z: 0 }).z - mark.z) < 40) mark = null;
      }
      if (p !== 'hidden' && b.state === 'hidden' && everFlushed.has(b.id)) { if (b.circled) res.circledBack++; else res.singlesRelit++; }
      if (b.state === 'retrieved' && downed.has(b.id)) downed.get(b.id).done = true;
      prevState.set(b.id, b.state);
    }
    if (flushedNow) { res.flushes++; res.contacts.push({ t: +s.toFixed(1), kind: followNow ? 'follow-up' : 'flush' }); if (followNow) res.followUps++; }
  }
  const times = [0, ...res.contacts.map(c => c.t), seconds];
  let longest = 0, over = 0;
  for (let i = 1; i < times.length; i++) { const gap = times[i] - times[i - 1]; longest = Math.max(longest, gap); if (gap > 180) over += gap; }
  res.longestDryS = +longest.toFixed(0);
  res.dryOver3MinS = +over.toFixed(0);
  delete res.contacts;
  for (const k of Object.keys(res.states)) res.states[k] = Math.round(res.states[k]);
  try { birds.dispose(ctx); } catch {}
  try { hunt.dispose?.(ctx); } catch {}
  return res;
}

const report = { root, seconds, seeds, hunts: [] };
for (const ground of grounds) {
  for (const seed of seeds) {
    const r = huntOnce(ground, seed);
    report.hunts.push(r);
    console.log(`${ground} seed ${seed}: flushes ${r.flushes}, follow-ups ${r.followUps} (points on marked birds ${r.followUpPoints}), ` +
      `marks set down ${r.marks}, seen ${r.marksSeen}, casts ${r.casts}, singles relit ${r.singlesRelit}, circled back ${r.circledBack}, ` +
      `shots ${r.shots} (${r.hits} hit), longest dry ${r.longestDryS} s, dry spells over 3 min ${r.dryOver3MinS} s` + (process.env.MARKLAB_STATES ? ` ${JSON.stringify(r.states)}` : ''));
  }
}
const by = {};
for (const h of report.hunts) {
  const g = by[h.area] ??= { hunts: 0, flushes: 0, followUps: 0, marksSeen: 0, longestDryS: [], dryOver3MinS: 0 };
  g.hunts++; g.flushes += h.flushes; g.followUps += h.followUps; g.marksSeen += h.marksSeen; g.longestDryS.push(h.longestDryS); g.dryOver3MinS += h.dryOver3MinS;
}
for (const [area, g] of Object.entries(by)) {
  console.log(`${area}: per hunt flushes ${(g.flushes / g.hunts).toFixed(1)}, follow-ups ${(g.followUps / g.hunts).toFixed(1)}, marks seen ${(g.marksSeen / g.hunts).toFixed(1)}, ` +
    `longest dry median ${g.longestDryS.sort((a, b) => a - b)[g.longestDryS.length >> 1]} s, dry over 3 min ${(g.dryOver3MinS / g.hunts).toFixed(0)} s`);
}
report.byGround = by;
writeFileSync(out, JSON.stringify(report, null, 2));
await vite.close();
