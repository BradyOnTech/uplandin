#!/usr/bin/env node
/** The mark lab: whole hunts, headless, with a shooting hunter who marks his
 * misses and follows them up. It drives the real hunt and birds subsystems
 * (Hunt3DSystem, BirdsSystem) over the real landform through Vite SSR, no
 * browser, and measures the second act: the birds he marks down, the
 * follow-ups on them, and the dry spells between contacts.
 *
 *   tools3d/heavy.sh node tools3d/mark-lab.mjs [--grounds quail-fields,...] [--seeds 1,2,3] [--seconds 1200]
 *     [--drops south-gate,...] [--root /path/to/other/checkout] [--out /tmp/uplandin-marks/marks.json]
 *
 * The hunter sees what a player sees: the dog, the cover, birds in the air.
 * He walks the cover with the dog (patch to nearest patch, round the rims),
 * walks in on its points, shoots birds 12-38 m out with a double (hit chance
 * falling with range), and sends the dog for a fall it has not fetched.
 * While birds are up he watches the one going down, as a player does.
 *
 * Marks. On a build with the hunter's marks (game/marks.ts), he follows the
 * game's own marks: he walks toward the latest one, faces it from 45 m and
 * sends the dog "this way", which casts it to the mark. On an older build he
 * marks with an ideal eye instead: every miss that sets down within 200 m
 * with the land clear between him and it, whichever way he faces, through
 * any cover (the lab's own count, also kept on new builds as `idealSeen`).
 * A follow-up is a flush of a bird he had already put up; it is "on a mark"
 * when that bird was in one of his marks.
 */
import { createServer } from 'vite';
import * as THREE from 'three';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const args = process.argv.slice(2);
const arg = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const grounds = arg('--grounds', 'quail-fields,sharptail-prairie,pheasant-coverts,chukar-ridge').split(',');
const seeds = arg('--seeds', '1,2,3').split(',').map(Number);
const seconds = Number(arg('--seconds', '1200'));
const dropsArg = arg('--drops', '');
const root = resolve(arg('--root', process.cwd()));
const out = arg('--out', '/tmp/uplandin-marks/marks.json');
const DT = 1000 / 30, SHOT_MIN = 12, SHOT_MAX = 38, REACTION_MS = 380, SHOT_GAP_MS = 420, RELOAD_MS = 1310;
const IDEAL_RANGE = 200, CAST_FROM = 45, WALK = 2;

const vite = await createServer({ root, configFile: false, cacheDir: '/tmp/uplandin-marks/.vite-cache', logLevel: 'silent', appType: 'custom',
  server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] },
  define: { __UPLANDIN_BUILD__: JSON.stringify({ version: 'marklab', commit: 'marklab', releases: [] }) } });
const load = path => vite.ssrLoadModule(path);
const optional = async path => { try { return await load(path); } catch { return null; } };
const { Hunt3DSystem } = await load('/src/three/subsystems/hunt3d.ts');
const { BirdsSystem } = await load('/src/three/subsystems/birds.ts');
const { LandscapeModel } = await load('/src/game/landscape.ts');
const { getArea } = await load('/src/game/areas.ts');
const quick = await load('/src/game/quick.ts');
const { mulberry32 } = await load('/src/game/math.ts');
const parking = (await optional('/src/three/subsystems/quailEntrances.ts'))?.deriveQuailParkingPose ?? null;
const nav = await optional('/src/game/landformNav.ts');
// The standing cover a bird can go in behind, as the browser has it.
const pheasantCover = await optional('/src/three/subsystems/pheasantCover.ts');
const kitRecipes = await optional('/src/three/groundKit/coverRecipes.ts');
const kitStyle = await optional('/src/three/groundKit/groundKit.ts');

const store = new Map();
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k) };
if (!globalThis.window || typeof globalThis.window.addEventListener !== 'function') {
  const et = new EventTarget();
  globalThis.window = { addEventListener: et.addEventListener.bind(et), removeEventListener: et.removeEventListener.bind(et),
    dispatchEvent: et.dispatchEvent.bind(et), matchMedia: () => ({ matches: false }) };
}

/** The 'grass' cover system's crown sampler, as the browser registers it. */
function coverSystem(areaId, landscape) {
  if (areaId === 'pheasant-coverts' && pheasantCover?.PheasantCoverSystem) return new pheasantCover.PheasantCoverSystem(landscape);
  if (kitStyle?.groundKitStyle?.(areaId) && kitRecipes?.coverMapFor) {
    const map = kitRecipes.coverMapFor(landscape), cell = { cls: 0, density: 0, height: 0, tone: 0 };
    if (map) return { launchHeightAt: (x, z) => { const p = landscape.worldToProperty(x, z, { x: 0, y: 0 }); map.sample(p.x, p.y, cell); return cell.density > .05 ? cell.height : .15; } };
  }
  return {};
}

function huntOnce(areaId, seed, drop) {
  store.set(quick.QUICK_KEY, JSON.stringify({ ...quick.defaultQuickConfig(), areaId, breedId: 'gsp', level: 6, breed2Id: 'none' }));
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
  const systems = { player, hunt3d: hunt, terrain, gun, grass: coverSystem(areaId, landscape) };
  let birds = null;
  const events = new EventTarget();
  const ctx = { scene: new THREE.Scene(), camera, events, quality: 'lite', timeOfDay: 'morning', time: 0,
    fixedAlpha: 1, paused: false, get: id => systems[id] ?? (id === 'birds' ? birds : {}) };
  hunt.init(ctx);
  birds = new BirdsSystem(); systems.birds = birds; birds.init(ctx);
  const gameMarks = typeof birds.latestMark === 'function';
  const dropPoint = hunt.dropPoint(), truck = hunt.truckWorld({ x: 0, z: 0 });
  const yaw = parking?.(area, dropPoint.id)?.yaw ?? -dropPoint.heading;
  camera.position.set(truck.x + Math.sin(yaw) * 5, 0, truck.z + Math.cos(yaw) * 5);
  hunt.releaseFromTruck(ctx, [{ x: truck.x + Math.sin(yaw) * 3.95, z: truck.z + Math.cos(yaw) * 3.95, heading: dropPoint.heading }]);
  const bounds = landscape.worldBounds();
  const shotRng = mulberry32((seed * 7919) ^ 0x5407);
  const internal = birds;
  const res = { area: areaId, drop, seed, gameMarks, contacts: [], flushes: 0, followUps: 0, followUpsOnMarks: 0, followUpPoints: 0,
    marks: 0, markedBirds: 0, markedToGround: 0, markedFound: 0, markRangesM: [], idealSeen: 0, landings: 0, casts: 0,
    shots: 0, hits: 0, circledBack: 0, singlesRelit: 0, markToFollowUpS: [], landingLog: [], states: {} };
  const markedIds = new Set(), markedAt = new Map();
  events.addEventListener('hunt-mark', event => {
    const mark = event.detail;
    for (const id of mark.birdIds) if (!markedIds.has(id)) { markedIds.add(id); markedAt.set(id, tick / 30); res.markedBirds++; }
    res.marks++;
    if (mark.toGround) res.markedToGround++;
    res.markRangesM.push(+Math.hypot(mark.x - camera.position.x, mark.z - camera.position.z).toFixed(0));
  });
  const everFlushed = new Set(), prevState = new Map(hunt.huntState().birds.map(b => [b.id, b.state]));
  const downed = new Map(), slotsSeen = new Map();
  let idealMark = null, castFor = null, lastShot = -1e9, prevDog = hunt.dog().state, tick = 0;
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
  // Rock stops him as it does in the game, and he walks round a rim, not into it.
  const solids = landscape.solidBlockers?.() ?? [];
  const hunterNav = solids.length && nav?.LandformNav ? new nav.LandformNav(solids) : null;
  const solidIndex = new Map();
  for (const b of solids) { const k = Math.floor(b.y / 8) * 4096 + Math.floor(b.x / 8); (solidIndex.get(k) ?? solidIndex.set(k, []).get(k)).push(b); }
  const pushOut = (p) => {
    for (let pass = 0; pass < 3; pass++) for (let j = Math.floor(p.y / 8) - 1; j <= Math.floor(p.y / 8) + 1; j++) for (let i = Math.floor(p.x / 8) - 1; i <= Math.floor(p.x / 8) + 1; i++)
      for (const b of solidIndex.get(j * 4096 + i) ?? []) {
        const dx = p.x - b.x, dy = p.y - b.y, d = Math.hypot(dx, dy), r = b.radius + .35;
        if (d < r && d > 1e-6) { p.x = b.x + dx / d * r; p.y = b.y + dy / d * r; }
      }
  };
  /** The mark he is following up: the game's latest, or his ideal eye's. */
  const currentMark = () => {
    if (gameMarks) { const latest = birds.latestMark(); return latest ? { id: latest.mark.id, x: latest.mark.x, z: latest.mark.z } : null; }
    return idealMark;
  };
  const face = (x, z, pitchTo = false) => {
    const cam = camera.position, dx = x - cam.x, dz = z - cam.z, d = Math.hypot(dx, dz);
    if (d > .3) camera.rotation.y = Math.atan2(-dx, -dz);
    camera.rotation.x = pitchTo ? -Math.atan2(cam.y - landscape.heightAtWorld(x, z), Math.max(1, d)) : -.12;
  };
  for (tick = 0; tick < seconds * 30; tick++) {
    const s = (tick + 1) / 30, now = s * 1000;
    gun.now = now; if (gun.shells === 0 && now >= gun.reloadEnds) gun.shells = 2;
    const dog = hunt.dog(), dw = hunt.dogWorld({ x: 0, z: 0 }), cam = camera.position;
    const rise = birds.isRiseActive();
    // Birds he is watching: live ones, and any going down to set in.
    const up = birds.airborne().filter(a => a.status === 'flying' || (a.status === 'departing' && internal.slots.find(sl => sl.simId === a.simId)?.line?.target));
    const mark = currentMark();
    // ---- where the hunter goes ----
    let target = null, stop = 0, faced = false;
    const pending = [...downed.entries()].find(([id, r]) => !r.done && hunt.huntState().birds.find(b => b.id === id)?.state === 'downed');
    if (dog.state === 'pointing') { target = { x: dw.x + Math.cos(dog.heading) * 11, z: dw.z + Math.sin(dog.heading) * 11 }; stop = .3; }
    else if (pending && s - pending[1].t > 6) { const b = hunt.huntState().birds.find(x => x.id === pending[0]); target = hunt.simToWorld(b.pos.x, b.pos.y, { x: 0, z: 0 }); stop = 12; }
    else if (mark && castFor !== mark.id && dog.state !== 'tracking') {
      target = mark; stop = CAST_FROM;
      if (Math.hypot(mark.x - cam.x, mark.z - cam.z) <= CAST_FROM + .5) {
        // Face the spot he watched it go in and send the dog this way.
        face(mark.x, mark.z, true); faced = true;
        if (['quartering', 'heel', 'whoa', 'marking', 'recalled', 'seeking'].includes(dog.state)) { commands.push('cast'); castFor = mark.id; res.casts++; }
      }
    } else if (dog.state === 'heel' || dog.state === 'recalled') {
      // A dog at heel waits on the hunter: walk on, turning off the property line.
      if (cam.x + walk.x * 30 < bounds.minX || cam.x + walk.x * 30 > bounds.maxX) walk.x = -walk.x;
      if (cam.z + walk.z * 30 < bounds.minZ || cam.z + walk.z * 30 > bounds.maxZ) walk.z = -walk.z;
      target = { x: cam.x + walk.x * 10, z: cam.z + walk.z * 10 };
    } else if (dog.state === 'quartering' && Math.hypot(dw.x - cam.x, dw.z - cam.z) < 70) {
      if (!goal || Math.hypot(goal.x - cam.x, goal.z - cam.z) < 10) { if (goal) goal.visited = true; goal = nextGoal(); }
      target = goal ?? dw; stop = goal ? .5 : 20;
    } else { target = dw; stop = 16; }
    if (rise || up.length || dog.state === 'retrieving') target = null;
    if (target && hunterNav) {
      const from = landscape.worldToProperty(cam.x, cam.z, { x: 0, y: 0 }), to = landscape.worldToProperty(target.x, target.z, { x: 0, y: 0 });
      const via = hunterNav.steer(from, to);
      if (via !== to) { const w = landscape.propertyToWorld(via.x, via.y, { x: 0, z: 0 }); target = { x: w.x, z: w.z }; stop = Math.min(stop, .5); }
    }
    if (target && !faced) {
      const tx = target.x - cam.x, tz = target.z - cam.z, td = Math.hypot(tx, tz);
      face(target.x, target.z);
      if (td > stop) {
        const step = Math.min(WALK / 30, td - stop);
        if (step > 1e-4) { walk.x = tx / td; walk.z = tz / td; }
        cam.x = Math.min(bounds.maxX - 2, Math.max(bounds.minX + 2, cam.x + tx / td * step));
        cam.z = Math.min(bounds.maxZ - 2, Math.max(bounds.minZ + 2, cam.z + tz / td * step));
        if (solids.length) {
          const p = landscape.worldToProperty(cam.x, cam.z, { x: 0, y: 0 }); pushOut(p);
          const w = landscape.propertyToWorld(p.x, p.y, { x: 0, z: 0 }); cam.x = w.x; cam.z = w.z;
        }
      }
    }
    cam.y = landscape.heightAtWorld(cam.x, cam.z) + 1.7;
    // While birds are up he watches them: the one going down, else the nearest.
    if (up.length) {
      const going = up.filter(a => internal.slots.find(sl => sl.simId === a.simId)?.line?.target)
        .sort((p, q) => Math.hypot(p.x - cam.x, p.z - cam.z) - Math.hypot(q.x - cam.x, q.z - cam.z))[0];
      const watch = going ?? up.sort((p, q) => Math.hypot(p.x - cam.x, p.z - cam.z) - Math.hypot(q.x - cam.x, q.z - cam.z))[0];
      camera.rotation.y = Math.atan2(-(watch.x - cam.x), -(watch.z - cam.z));
      camera.rotation.x = Math.atan2(watch.y - cam.y, Math.max(1, Math.hypot(watch.x - cam.x, watch.z - cam.z))) * .8;
    }
    // ---- shooting ----
    if (gun.shells > 0 && !gun.isReloading() && now - lastShot > SHOT_GAP_MS) {
      const hs = hunt.huntState();
      const shot = up.filter(a => a.status === 'flying' && a.airMs > REACTION_MS)
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
    if (pending && !up.length && dog.state !== 'retrieving' && dog.state !== 'pointing' && s - pending[1].t > 10 && s - pending[1].dead > 12) {
      const b = hunt.huntState().birds.find(x => x.id === pending[0]), w = hunt.simToWorld(b.pos.x, b.pos.y, { x: 0, z: 0 });
      face(w.x, w.z, true);
      commands.push('dead'); pending[1].dead = s;
    }
    camera.updateMatrixWorld();
    ctx.time += DT / 1000;
    hunt.fixedUpdate(ctx, DT);
    birds.fixedUpdate(ctx, DT);
    // ---- what an ideal eye saw set down ----
    for (const slot of internal.slots) {
      const was = slotsSeen.get(slot);
      if (was && was.status !== 'done' && slot.status === 'done' && ['flying', 'departing'].includes(was.status)) {
        const height = was.y - landscape.heightAtWorld(was.x, was.z);
        if (height < .7) {
          res.landings++;
          // Why the game did or did not mark it: when he last had it in sight.
          const sighted = slot.sighted, age = sighted ? internal.fieldMs - sighted.ms : null;
          res.landingLog.push({ t: +s.toFixed(1), speciesId: slot.species?.id, rangeM: +Math.hypot(was.x - cam.x, was.z - cam.z).toFixed(0),
            sightAgeMs: age === null ? null : Math.round(age), marked: gameMarks ? birds.marks().some(m => m.birdIds.includes(slot.simId)) : null,
            ideal: Math.hypot(was.x - cam.x, was.z - cam.z) <= IDEAL_RANGE && eyeSees(was.x, was.z) });
          const range = Math.hypot(was.x - cam.x, was.z - cam.z);
          if (range <= IDEAL_RANGE && eyeSees(was.x, was.z)) {
            res.idealSeen++;
            if (!gameMarks) {
              idealMark = { id: tick, x: was.x, z: was.z, at: s, birdId: slot.simId };
              if (!markedIds.has(slot.simId)) { markedIds.add(slot.simId); markedAt.set(slot.simId, s); res.markedBirds++; res.marks++; res.markRangesM.push(+range.toFixed(0)); }
            }
          }
        }
      }
      slotsSeen.set(slot, { status: slot.status, x: slot.x, y: slot.y, z: slot.z });
    }
    if (idealMark && s - idealMark.at > 240) idealMark = null;
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
        if (everFlushed.has(b.id)) {
          followNow = true;
          if (markedIds.has(b.id)) { res.followUpsOnMarks++; res.markedFound++; res.markToFollowUpS.push(+(s - markedAt.get(b.id)).toFixed(0)); markedIds.delete(b.id); }
        }
        everFlushed.add(b.id);
        if (idealMark && idealMark.birdId === b.id) idealMark = null;
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

const defaultDrops = { 'chukar-ridge': 'south-gate,rim-track' };
const report = { root, seconds, seeds, hunts: [] };
for (const ground of grounds) {
  const drops = (dropsArg || defaultDrops[ground] || 'south-gate').split(',');
  for (const drop of drops) for (const seed of seeds) {
    const r = huntOnce(ground, seed, drop);
    report.hunts.push(r);
    console.log(`${ground} ${drop} seed ${seed}: flushes ${r.flushes}, follow-ups ${r.followUps} (${r.followUpsOnMarks} on marks, points on re-found birds ${r.followUpPoints}), ` +
      `marks ${r.marks} (${r.markedBirds} birds, ${r.markedToGround} seen to the ground, ranges ${r.markRangesM.join('/')} m), casts ${r.casts}, ` +
      `landings ${r.landings}, ideal eye saw ${r.idealSeen}, singles relit ${r.singlesRelit}, circled back ${r.circledBack}, ` +
      `shots ${r.shots} (${r.hits} hit), longest dry ${r.longestDryS} s, over 3 min ${r.dryOver3MinS} s`);
  }
}
const by = {};
const median = list => list.length ? [...list].sort((a, b) => a - b)[list.length >> 1] : null;
for (const h of report.hunts) {
  const g = by[h.area] ??= { hunts: 0, flushes: 0, followUps: 0, followUpsOnMarks: 0, marks: 0, markedBirds: 0, markedFound: 0, markedToGround: 0,
    landings: 0, idealSeen: 0, casts: 0, singlesRelit: 0, circledBack: 0, longestDryS: [], dryOver3MinS: 0, markRangesM: [], markToFollowUpS: [] };
  for (const k of ['flushes', 'followUps', 'followUpsOnMarks', 'marks', 'markedBirds', 'markedFound', 'markedToGround', 'landings', 'idealSeen', 'casts', 'singlesRelit', 'circledBack', 'dryOver3MinS']) g[k] += h[k];
  g.hunts++; g.longestDryS.push(h.longestDryS); g.markRangesM.push(...h.markRangesM); g.markToFollowUpS.push(...h.markToFollowUpS);
}
for (const [area, g] of Object.entries(by)) {
  const per = k => (g[k] / g.hunts).toFixed(1);
  g.summary = { flushes: +per('flushes'), followUps: +per('followUps'), followUpsOnMarks: +per('followUpsOnMarks'), marks: +per('marks'),
    markedBirds: +per('markedBirds'), markedFoundShare: g.markedBirds ? +(g.markedFound / g.markedBirds).toFixed(2) : null,
    landings: +per('landings'), idealSeen: +per('idealSeen'), singlesRelit: +per('singlesRelit'), circledBack: +per('circledBack'),
    longestDryMedianS: median(g.longestDryS), dryOver3MinPerHuntS: +(g.dryOver3MinS / g.hunts).toFixed(0),
    markRangeMedianM: median(g.markRangesM), markRangeMaxM: g.markRangesM.length ? Math.max(...g.markRangesM) : null, markToFollowUpMedianS: median(g.markToFollowUpS) };
  console.log(`${area}: per hunt ${JSON.stringify(g.summary)}`);
}
report.byGround = by;
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(report, null, 2));
await vite.close();
