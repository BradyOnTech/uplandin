// Hunt lab: real hunts, headless. Drives the actual Hunt3DSystem and
// BirdsSystem (src/three/subsystems) with scripted hunters who watch the dog,
// walk, shoot and send the dog for falls, and records pacing. Sources load
// through Vite SSR with configFile:false and a /tmp cache, so nothing is
// written into the repo. HUNTLAB_ROOT (or opts.root) points the lab at another
// checkout, e.g. a frozen copy of an older commit for a baseline.
//
// Hunters never read hidden birds. They see what a player sees: the dog, the
// trails and the visible cover (patches / named hunt areas), birds in the air.
import { createServer } from 'vite';
import * as THREE from 'three';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DT = 1000 / 30;
const M = 0.9144;
/** Shooting: a hunter takes birds 12–38 m out, at most two shots a rise. */
const SHOT_MIN_M = 12, SHOT_MAX_M = 38, SHOT_REACTION_MS = 380, SHOT_GAP_MS = 420, GUN_RELOAD_MS = 2600;
/** A downed bird not delivered within this long is a stuck retrieve. */
const STUCK_RETRIEVE_S = 90;
/** One dog state held this long (except heel and quartering) is stuck. */
const STUCK_STATE_S = 75;

let server = null, mods = null, loadedRoot = null;

export async function load(root = process.env.HUNTLAB_ROOT ?? REPO) {
  if (mods && loadedRoot === root) return mods;
  if (mods) await close();
  loadedRoot = root;
  const plugin = { name: 'huntlab-bird-ids', enforce: 'pre', transform(code, id) {
    // Every live hunt is a fresh page load, so bird ids start at 1 (birds.ts
    // nextBirdId). Expose a reset so sequential runs match a fresh page.
    if (id.replaceAll('\\', '/').split('?')[0].endsWith('/src/game/birds.ts'))
      return { code: code + '\nexport function __resetBirdIdsForHuntLab() { nextBirdId = 1; }\n', map: null };
    return null;
  } };
  server = await createServer({ plugins: [plugin],
    root, configFile: false, cacheDir: '/tmp/uplandin-huntlab/.vite-cache',
    logLevel: 'silent', appType: 'custom', server: { middlewareMode: true, hmr: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
    define: { __UPLANDIN_BUILD__: JSON.stringify({ version: 'huntlab', commit: 'huntlab', releases: [] }) },
  });
  const get = (p) => server.ssrLoadModule(p);
  mods = {
    hunt3d: await get('/src/three/subsystems/hunt3d.ts'),
    birds: await get('/src/three/subsystems/birds.ts'),
    landscape: await get('/src/game/landscape.ts'),
    areas: await get('/src/game/areas.ts'),
    quick: await get('/src/game/quick.ts'),
    quailEntrances: await get('/src/three/subsystems/quailEntrances.ts'),
    assistsRuntime: await get('/src/three/assistsRuntime.ts'),
    gameBirds: await get('/src/game/birds.ts'),
    sim: await get('/src/game/huntSimulation.ts'),
    math: await get('/src/game/math.ts'),
  };
  // Optional modules that only newer checkouts have.
  for (const [key, path] of [['climbing', '/src/game/climbing.ts'], ['huntAreas', '/src/game/huntAreas.ts'], ['nav', '/src/game/landformNav.ts']]) {
    try { mods[key] = await get(path); } catch { mods[key] = null; }
  }
  const sp = mods.sim.HuntSimulation.prototype;
  if (!sp.__huntlab) {
    const flush = sp.flushBird;
    sp.flushBird = function (birdId, cause, slot) {
      const e = flush.call(this, birdId, cause, slot);
      if (e && globalThis.__huntlabFlushes) globalThis.__huntlabFlushes.push({ cause, n: e.birdIds.length });
      return e;
    };
    sp.__huntlab = true;
  }
  return mods;
}
export async function close() { if (server) await server.close(); server = null; mods = null; loadedRoot = null; }

/** Visible cover objectives for the tactic hunter: cover centroids thinned
 * to 60 yd apart, the same rule on every ground so grounds compare. */
function coverObjectives(m, area) {
  const out = [];
  for (const p of [...area.patches].sort((a, b) => b.w * b.h - a.w * a.h)) {
    const c = { x: p.x + p.w / 2, y: p.y + p.h / 2 };
    if (out.every(o => Math.hypot(o.x - c.x, o.y - c.y) > 60)) out.push({ id: `patch-${out.length}`, ...c });
  }
  return out;
}

/**
 * opts: { area, drop, seed, breed, level, wind, weather, seconds, challenge?, range?,
 *         hunter: 'follow'|'trail'|'tactic', speed (m/s), followM, shoot (bool), root? }
 */
export async function runHunt(o) {
  const m = await load(o.root);
  const opts = { drop: 'south-gate', seconds: 600, hunter: 'follow', speed: 2.0, followM: 20, shoot: true,
    range: 'medium', challenge: undefined, ...o };
  const quick = { ...m.quick.defaultQuickConfig(), areaId: opts.area, breedId: opts.breed, level: opts.level,
    wind: opts.wind, weather: opts.weather, breed2Id: 'none' };
  const store = new Map([[m.quick.QUICK_KEY, JSON.stringify(quick)]]);
  globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k) };
  if (!globalThis.window || typeof globalThis.window.addEventListener !== 'function') {
    const et = new EventTarget();
    globalThis.window = { addEventListener: et.addEventListener.bind(et), removeEventListener: et.removeEventListener.bind(et),
      dispatchEvent: et.dispatchEvent.bind(et), matchMedia: () => ({ matches: false }) };
  }
  let search = `?play=quick&drop=${opts.drop}&seed=${opts.seed}`;
  if (opts.challenge) search += `&challenge=${opts.challenge}`;
  if (opts.range) search += `&range=${opts.range}`;
  globalThis.location = { search, href: `http://localhost/index3d.html${search}` };
  m.assistsRuntime.resetHuntAssistsForTest?.();
  m.gameBirds.__resetBirdIdsForHuntLab();

  const area = m.areas.getArea(opts.area);
  const landscape = new m.landscape.LandscapeModel(area, opts.drop);
  const hunt = new m.hunt3d.Hunt3DSystem(landscape);
  const camera = new THREE.PerspectiveCamera(70, 16 / 9, .05, 2000);
  camera.rotation.order = 'YXZ';
  camera.position.set(0, landscape.heightAtWorld(0, 40) + 1.7, 40);
  const commands = [];
  const player = { isRunning: () => false, consumeRecall: () => false, consumeCommands: () => commands.splice(0),
    setHuntHeading: (_c, heading) => { camera.rotation.y = -heading - Math.PI / 2; }, setPose() {} };
  const terrain = { heightAt: (x, z) => landscape.heightAtWorld(x, z) };
  // A double gun the scripted hunter fires and reloads; the birds' waves
  // read it (Duck Hunt rules: the next wave waits on the gun).
  const gun = { shells: 2, reloadEndsMs: 0, nowMs: 0,
    shellsRemaining() { return this.shells; }, shellCapacity: () => 2, isReloading() { return this.nowMs < this.reloadEndsMs; } };
  let birds = null;
  const systems = { player, hunt3d: hunt, terrain, gun };
  const ctx = { scene: new THREE.Scene(), camera, events: new EventTarget(), quality: 'lite', timeOfDay: 'morning', time: 0,
    fixedAlpha: 1, paused: false, get: id => systems[id] ?? (id === 'birds' ? (birds ?? { isRiseActive: () => false }) : {}) };
  hunt.init(ctx);
  try { birds = new m.birds.BirdsSystem(); systems.birds = birds; birds.init(ctx); }
  catch (e) { birds = null; delete systems.birds; opts.birdsError = String(e).slice(0, 200); }
  const drop = hunt.dropPoint();
  // The arrival releases the dog at the tailgate, facing the field.
  {
    const world = hunt.truckWorld({ x: 0, z: 0 });
    const yaw = m.quailEntrances.deriveQuailParkingPose(area, drop.id)?.yaw ?? -drop.heading;
    const landing = { x: world.x + Math.sin(yaw) * 3.95, z: world.z + Math.cos(yaw) * 3.95 };
    hunt.releaseFromTruck(ctx, [{ x: landing.x, z: landing.z, heading: drop.heading }]);
  }

  // Trail hunter: nearest trail to the start, chained end to start.
  const startSim = hunt.worldToSim(camera.position.x, camera.position.z, { x: 0, y: 0 });
  const first = area.trails.reduce((best, t) => Math.hypot(t.points[0].x - startSim.x, t.points[0].y - startSim.y)
    < Math.hypot(best.points[0].x - startSim.x, best.points[0].y - startSim.y) ? t : best);
  const pts = [...first.points], used = new Set([first.id]);
  for (let i = 0; i < 12; i++) {
    const end = pts.at(-1), next = area.trails.find(t => !used.has(t.id) && Math.hypot(t.points[0].x - end.x, t.points[0].y - end.y) < 2);
    if (!next) break; used.add(next.id); pts.push(...next.points.slice(1));
  }
  const route = pts.map(p => landscape.propertyToWorld(p.x, p.y, { x: 0, z: 0 }));
  let leg = 1;
  // Tactic hunter: visible cover objectives, nearest unvisited first.
  const objectives = coverObjectives(m, area).map(o => ({ ...o, world: landscape.propertyToWorld(o.x, o.y, { x: 0, z: 0 }), visited: false }));
  let objective = null, pointPlan = null;
  const uphill = area.slope;
  // The climb costs the scripted hunter what it costs a player: on grounds
  // built as a climb, or (older checkouts) any ground with an uphill.
  const climbs = !!m.climbing?.climbSpeedFactor && (m.climbing.climbCosts ? m.climbing.climbCosts(area) : area.slope !== undefined);
  const shotRng = m.math.mulberry32((opts.seed ^ 0x5407) >>> 0);

  const res = { ...opts, search, wind: hunt.huntState().windStrength, condition: hunt.huntState().condition,
    firstScentS: null, firstPointS: null, firstFlushS: null, firstContactS: null, contacts: [], points: 0, scentContacts: 0,
    flushCauses: {}, coveysContacted: 0, coveysFlushed: 0, coveysTotal: 0, birdsTotal: 0,
    shots: 0, hits: 0, retrieved: 0, retrieveS: [], stuckRetrieves: 0, lostBirds: 0, deadCommands: 0,
    stuckStates: [], states: {}, dogPathM: 0, hunterPathM: 0, climbM: 0, maxDogHunterM: 0, maxCastHoldS: 0,
    birdsInSolid: 0, fallsInSolid: 0, areasVisited: [] };
  globalThis.__huntlabFlushes = [];
  const flushedCoveys = new Set(), contactedCoveys = new Set(), fallsChecked = new Set();
  let prevDog = hunt.dogWorld({ x: 0, z: 0 }), prevState = hunt.dog().state, stateSince = 0;
  const birdStates = new Map(hunt.huntState().birds.map(b => [b.id, b.state]));
  const downed = new Map(); // birdId -> { t, delivered }
  let walking = true, heelWalk = false, riseShots = 0, lastShotMs = -1e9, riseWasActive = false;
  const bounds = landscape.worldBounds();
  const walkDir = { x: Math.cos(drop.heading), z: Math.sin(drop.heading) };
  let beatKey = null, beatSince = 0, beatWorkAt = null, beatStart = 0;
  const closeBeat = (now) => {
    if (beatKey === null) return;
    res.maxCastHoldS = Math.max(res.maxCastHoldS, (beatWorkAt ?? now) - beatSince);
  };
  const contact = (s, kind) => {
    res.contacts.push({ t: +s.toFixed(1), kind });
    res.firstContactS ??= +s.toFixed(1);
  };
  const solidAt = (px, py) => typeof landscape.solidAtProperty === 'function' && landscape.solidAtProperty(px, py);
  for (const b of hunt.huntState().birds) if (solidAt(b.pos.x, b.pos.y)) res.birdsInSolid++;
  const sample = { height: 0, slope: 0, gradeX: 0, gradeZ: 0, rockiness: 0, vegetation: 0, moisture: 0 };
  let lastArea = null;
  // Solid rock stops the hunter as it does in the game (PlayerSystem), and
  // like a player who can see the breaks he walks round a rim, not into it.
  const solids = landscape.solidBlockers?.() ?? [];
  const hunterNav = solids.length && m.nav ? new m.nav.LandformNav(solids) : null;
  const solidIndex = new Map();
  for (const b of solids) { const k = Math.floor(b.y / 8) * 4096 + Math.floor(b.x / 8); (solidIndex.get(k) ?? solidIndex.set(k, []).get(k)).push(b); }
  const pushOut = (p) => {
    for (let pass = 0; pass < 3; pass++) for (let j = Math.floor(p.y / 8) - 1; j <= Math.floor(p.y / 8) + 1; j++) for (let i = Math.floor(p.x / 8) - 1; i <= Math.floor(p.x / 8) + 1; i++)
      for (const b of solidIndex.get(j * 4096 + i) ?? []) {
        const dx = p.x - b.x, dy = p.y - b.y, d = Math.hypot(dx, dy), r = b.radius + .35;
        if (d < r && d > 1e-6) { p.x = b.x + dx / d * r; p.y = b.y + dy / d * r; }
      }
  };

  for (let tick = 0; tick < opts.seconds * 30; tick++) {
    const s = (tick + 1) / 30, nowMs = s * 1000;
    const dog = hunt.dog(), dw = hunt.dogWorld({ x: 0, z: 0 });
    const cam = camera.position;
    const dx = dw.x - cam.x, dz = dw.z - cam.z, d = Math.hypot(dx, dz);
    const riseActive = birds ? birds.isRiseActive() : false;
    gun.nowMs = nowMs;
    if (gun.shells === 0 && nowMs >= gun.reloadEndsMs) gun.shells = 2;
    if (!riseActive && riseWasActive) riseShots = 0;
    riseWasActive = riseActive;
    // ---- scripted hunter ----
    let target = null, stop = 0;
    const pendingFall = [...downed.entries()].find(([id, r]) => !r.delivered && hunt.huntState().birds.find(b => b.id === id)?.state === 'downed');
    if (walking && (dog.state !== 'heel' && d >= opts.followM || s > 20 || dog.state === 'tracking' || dog.state === 'pointing')) walking = false;
    if (walking) target = { x: cam.x + Math.cos(drop.heading) * 10, z: cam.z + Math.sin(drop.heading) * 10 };
    else if ((dog.state === 'heel' || dog.state === 'recalled') && s > 3) {
      // A dog back at heel waits for the hunter to move on.
      target = { x: cam.x - Math.sin(camera.rotation.y) * 10, z: cam.z - Math.cos(camera.rotation.y) * 10 }; heelWalk = true;
    } else if (dog.state === 'pointing') {
      if (opts.hunter === 'tactic' && !pointPlan) {
        // Get above chukar; elsewhere come in from the flank so the covey
        // breaks across open ground rather than straight away.
        const h = dog.heading, side = (Math.cos(h) * dz - Math.sin(h) * dx) > 0 ? 1 : -1;
        const dirSim = uphill !== undefined ? { x: Math.cos(uphill), y: Math.sin(uphill) }
          : { x: -Math.sin(h) * side, y: Math.cos(h) * side };
        pointPlan = { x: dw.x + dirSim.x * 16, z: dw.z + dirSim.y * 16, reached: false };
      }
      if (pointPlan && !pointPlan.reached) {
        target = pointPlan; stop = 1.5;
        if (Math.hypot(pointPlan.x - cam.x, pointPlan.z - cam.z) < 3 || s - stateSince > 25) pointPlan.reached = true;
      } else { target = { x: dw.x + Math.cos(dog.heading) * 12 * M, z: dw.z + Math.sin(dog.heading) * 12 * M }; stop = .3; }
    } else if (pendingFall && s - pendingFall[1].t > 6) {
      // Walk toward the fall; it helps the dog and lets us send it.
      const b = hunt.huntState().birds.find(x => x.id === pendingFall[0]);
      target = hunt.simToWorld(b.pos.x, b.pos.y, { x: 0, z: 0 }); stop = 12;
    } else if (opts.hunter === 'follow' || dog.state === 'tracking') { target = dw; stop = opts.followM; }
    else if (opts.hunter === 'trail') {
      while (leg < route.length - 1 && Math.hypot(route[leg].x - cam.x, route[leg].z - cam.z) < 3) leg++;
      target = route[leg]; stop = .5;
    } else if (opts.hunter === 'tactic') {
      if (!objective || objective.visited) {
        objective = objectives.filter(o => !o.visited).sort((a, b) =>
          Math.hypot(a.world.x - cam.x, a.world.z - cam.z) - Math.hypot(b.world.x - cam.x, b.world.z - cam.z))[0] ?? null;
        if (!objective) { for (const o of objectives) o.visited = false; objective = objectives[0] ?? null; }
      }
      if (objective) {
        target = objective.world; stop = 4;
        if (Math.hypot(objective.world.x - cam.x, objective.world.z - cam.z) < 30) { objective.visited = true; res.areasVisited.push(objective.id); }
      }
      // Never outrun the dog by much: wait while it works close cover.
      if (d > 70) { target = dw; stop = opts.followM; }
    }
    if (dog.state !== 'pointing') pointPlan = null;
    // Stand for the rise, and wait for the dog to bring a bird in.
    if (riseActive || dog.state === 'retrieving') target = null;
    heelWalk = heelWalk && (dog.state === 'heel' || dog.state === 'recalled');
    if (target && hunterNav) {
      const from = landscape.worldToProperty(cam.x, cam.z, { x: 0, y: 0 }), to = landscape.worldToProperty(target.x, target.z, { x: 0, y: 0 });
      const via = hunterNav.steer(from, to);
      if (via !== to) { const w = landscape.propertyToWorld(via.x, via.y, { x: 0, z: 0 }); target = { x: w.x, z: w.z }; stop = Math.min(stop, .5); }
    }
    if (target) {
      const tx = target.x - cam.x, tz = target.z - cam.z, td = Math.hypot(tx, tz);
      const watch = opts.hunter === 'follow' && !walking && !heelWalk;
      const lookX = watch ? dx : tx, lookZ = watch ? dz : tz;
      if (Math.hypot(lookX, lookZ) > .5) camera.rotation.y = Math.atan2(-lookX, -lookZ);
      if (td > stop) {
        let speed = opts.speed;
        if (climbs) {
          landscape.surfaceAtWorld(cam.x, cam.z, sample);
          const along = (sample.gradeX * tx + sample.gradeZ * tz) / td;
          speed *= m.climbing.climbSpeedFactor(along, 0);
        }
        const step = Math.min(speed / 30, td - stop);
        const before = landscape.heightAtWorld(cam.x, cam.z);
        cam.x += tx / td * step; cam.z += tz / td * step; res.hunterPathM += step;
        if (step > 1e-4) { walkDir.x = tx / td; walkDir.z = tz / td; }
        const bx = Math.min(bounds.maxX - 2, Math.max(bounds.minX + 2, cam.x)), bz = Math.min(bounds.maxZ - 2, Math.max(bounds.minZ + 2, cam.z));
        if (bx !== cam.x || bz !== cam.z) { cam.x = bx; cam.z = bz; }
        if (solids.length) {
          const p = landscape.worldToProperty(cam.x, cam.z, { x: 0, y: 0 }); pushOut(p);
          const w = landscape.propertyToWorld(p.x, p.y, { x: 0, z: 0 }); cam.x = w.x; cam.z = w.z;
        }
        res.climbM += Math.max(0, landscape.heightAtWorld(cam.x, cam.z) - before);
      }
    } else if (d > .5 && !riseActive) camera.rotation.y = Math.atan2(-dx, -dz);
    cam.y = landscape.heightAtWorld(cam.x, cam.z) + 1.7;
    // ---- shooting ----
    if (opts.shoot && birds && gun.shells > 0 && !gun.isReloading() && nowMs - lastShotMs > SHOT_GAP_MS) {
      const hs = hunt.huntState();
      const candidates = birds.airborne().filter(a => a.status === 'flying' && a.airMs > SHOT_REACTION_MS).map(a => ({ a,
        range: Math.hypot(a.x - cam.x, a.y - cam.y, a.z - cam.z), bird: hs.birds.find(b => b.id === a.simId) }))
        .filter(c => c.range >= SHOT_MIN_M && c.range <= SHOT_MAX_M && c.bird?.state === 'flushed' && c.bird.sex !== 'hen')
        .sort((a, b) => a.range - b.range);
      const shot = candidates[0];
      if (shot) {
        camera.rotation.y = Math.atan2(-(shot.a.x - cam.x), -(shot.a.z - cam.z));
        res.shots++; riseShots++; lastShotMs = nowMs;
        if (--gun.shells <= 0) { gun.shells = 0; gun.reloadEndsMs = nowMs + GUN_RELOAD_MS; }
        const p = Math.max(.25, Math.min(.8, .95 - shot.range * .017));
        if (shotRng() < p && hunt.resolveBird(shot.a.simId, 'downed')) {
          birds.downBird(shot.a.simId, { x: shot.a.x, y: shot.a.y, z: shot.a.z });
          res.hits++; downed.set(shot.a.simId, { t: s, delivered: false, dead: 0 });
        }
      }
    }
    // Send the dog for a fall it has not picked up.
    if (pendingFall && dog.state !== 'retrieving' && dog.state !== 'pointing' && s - pendingFall[1].t > 10 && s - pendingFall[1].dead > 12) {
      const b = hunt.huntState().birds.find(x => x.id === pendingFall[0]);
      const w = hunt.simToWorld(b.pos.x, b.pos.y, { x: 0, z: 0 });
      camera.rotation.y = Math.atan2(-(w.x - cam.x), -(w.z - cam.z));
      const fx = w.x - cam.x, fz = w.z - cam.z, fd = Math.hypot(fx, fz) || 1;
      camera.rotation.x = -Math.atan2(cam.y - landscape.heightAtWorld(w.x, w.z), fd);
      commands.push('dead'); pendingFall[1].dead = s; res.deadCommands++;
    } else camera.rotation.x = -.16;
    camera.updateMatrixWorld();
    ctx.time += DT / 1000;
    hunt.fixedUpdate(ctx, DT);
    if (birds) birds.fixedUpdate(ctx, DT);
    else {
      const flown = hunt.huntState().birds.filter(b => b.state === 'flushed');
      if (flown.length) { for (const b of flown) hunt.resolveBird(b.id, 'escaped'); hunt.finishRise(); }
    }

    // ---- measurements ----
    const nd = hunt.dog(), nw = hunt.dogWorld({ x: 0, z: 0 });
    res.dogPathM += Math.hypot(nw.x - prevDog.x, nw.z - prevDog.z); prevDog = { ...nw };
    res.states[nd.state] = (res.states[nd.state] ?? 0) + 1 / 30;
    const hd = Math.hypot(nw.x - cam.x, nw.z - cam.z);
    if (nd.state === 'quartering') res.maxDogHunterM = Math.max(res.maxDogHunterM, hd);
    {
      const key = nd.state === 'quartering' ? (nd['localCoverBeat']?.key ?? null) : null;
      if (key !== beatKey) { closeBeat(s); beatKey = key; beatSince = s; beatWorkAt = null; beatStart = nd['coverWorkMsLeft']; }
      else if (key !== null && beatWorkAt === null && nd['coverWorkMsLeft'] < beatStart - 1) beatWorkAt = s;
    }
    if (nd.state !== prevState) {
      if (!['heel', 'quartering', 'recalled'].includes(prevState) && s - stateSince > STUCK_STATE_S)
        res.stuckStates.push({ state: prevState, s: +(s - stateSince).toFixed(0), at: +stateSince.toFixed(0) });
      stateSince = s;
    }
    if (nd.state === 'tracking' && prevState !== 'tracking') {
      res.scentContacts++; res.firstScentS ??= +s.toFixed(1); contact(s, 'scent');
      const b = hunt.huntState().birds.find(x => x.id === nd['scentTargetId']);
      if (b) contactedCoveys.add(b.coveyId);
    }
    if (nd.state === 'pointing' && prevState !== 'pointing') { res.points++; res.firstPointS ??= +s.toFixed(1); contact(s, 'point'); }
    while (globalThis.__huntlabFlushes.length) {
      const f = globalThis.__huntlabFlushes.shift();
      res.flushCauses[f.cause] = (res.flushCauses[f.cause] ?? 0) + 1;
      res.firstFlushS ??= +s.toFixed(1); contact(s, 'flush');
    }
    for (const b of hunt.huntState().birds) {
      const prev = birdStates.get(b.id);
      if (prev === 'hidden' && b.state === 'flushed') { flushedCoveys.add(b.coveyId); contactedCoveys.add(b.coveyId); }
      if (prev !== 'retrieved' && b.state === 'retrieved' && downed.has(b.id)) {
        const r = downed.get(b.id); r.delivered = true; res.retrieved++; res.retrieveS.push(+(s - r.t).toFixed(1));
      }
      // A fall is judged where it comes to rest, after the flight lands it.
      if (b.state === 'downed' && !b.fallPending && !fallsChecked.has(b.id)) { fallsChecked.add(b.id); if (solidAt(b.pos.x, b.pos.y)) res.fallsInSolid++; }
      birdStates.set(b.id, b.state);
    }
    if (m.huntAreas?.huntAreaAt && tick % 30 === 0) {
      const pp = landscape.worldToProperty(cam.x, cam.z, { x: 0, y: 0 });
      const here = m.huntAreas.huntAreaAt(area, pp.x, pp.y)?.id ?? null;
      if (here && here !== lastArea && !res.areasVisited.includes(here)) res.areasVisited.push(here);
      lastArea = here;
    }
    if (opts.trace && tick % 30 === 29) {
      const carried = hunt.huntState().birds.filter(b => ['downed', 'carried'].includes(b.state)).map(b => ({ id: b.id, st: b.state, x: +b.pos.x.toFixed(0), y: +b.pos.y.toFixed(0), fall: !!b.fallPending, lost: !!b.lost }));
      res.traceLog = res.traceLog ?? [];
      const hp = hunt.worldToSim(cam.x, cam.z, { x: 0, y: 0 });
      res.traceLog.push({ t: +s.toFixed(0), st: nd.state, gait: nd.gait, dog: { x: +nd.pos.x.toFixed(1), y: +nd.pos.y.toFixed(1) }, hunter: { x: +hp.x.toFixed(1), y: +hp.y.toFixed(1) }, hd: +hd.toFixed(1), birds: carried });
    }
    prevState = nd.state;
    opts.onTick?.(s, hunt, nd);
  }
  closeBeat(opts.seconds);
  if (!['heel', 'quartering', 'recalled'].includes(prevState) && opts.seconds - stateSince > STUCK_STATE_S)
    res.stuckStates.push({ state: prevState, s: +(opts.seconds - stateSince).toFixed(0), at: +stateSince.toFixed(0) });
  for (const [id, r] of downed) {
    if (r.delivered) continue;
    const b = hunt.huntState().birds.find(x => x.id === id);
    if (opts.seconds - r.t > STUCK_RETRIEVE_S) res.stuckRetrieves++;
    if (b?.lost) res.lostBirds++;
  }
  // Dry spells: the gaps between contacts (scent, point or flush), including
  // the walk to the first and the tail after the last.
  const times = [0, ...res.contacts.map(c => c.t), opts.seconds];
  let longest = 0;
  for (let i = 1; i < times.length; i++) longest = Math.max(longest, times[i] - times[i - 1]);
  res.longestDryS = +longest.toFixed(1);
  res.coveysContacted = contactedCoveys.size;
  res.coveysFlushed = flushedCoveys.size;
  res.birdsTotal = hunt.huntState().birds.length;
  { const ms = hunt.simMs(); res.simMsAvg = +ms.avg.toFixed(3); res.simMsMax = +ms.max.toFixed(2); }
  res.coveysTotal = new Set(hunt.huntState().birds.map(b => b.coveyId)).size;
  res.maxCastHoldS = +res.maxCastHoldS.toFixed(1);
  res.maxDogHunterM = +res.maxDogHunterM.toFixed(1);
  res.dogPathM = +res.dogPathM.toFixed(0); res.hunterPathM = +res.hunterPathM.toFixed(0); res.climbM = +res.climbM.toFixed(0);
  for (const k of Object.keys(res.states)) res.states[k] = +res.states[k].toFixed(1);
  if (birds) { try { birds.dispose?.(ctx); } catch {} }
  hunt.dispose?.(ctx);
  return res;
}
