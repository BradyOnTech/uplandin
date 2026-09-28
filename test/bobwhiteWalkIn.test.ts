import { afterEach, expect, it, vi } from 'vitest';
import type { Ctx } from '../src/three/engine';
import { Hunt3DSystem } from '../src/three/subsystems/hunt3d';
import { HuntSimulation, type HuntSimulationEvent } from '../src/game/huntSimulation';
import { LandscapeModel } from '../src/game/landscape';
import { resolveThreeHuntArea } from '../src/game/gameplayMode';
import { defaultQuickConfig, QUICK_KEY } from '../src/game/quick';
import type { HuntChallenge } from '../src/game/huntChallenge';
import { getArea } from '../src/game/areas';
import { createHunt } from '../src/game/state';
import { mulberry32 } from '../src/game/math';
import { Dog } from '../src/game/dog';
import { getBreed } from '../src/game/breeds';
import { getSpecies } from '../src/game/species';
import { quailPointApproach } from '../src/game/quailApproach';
import { pheasantApproach } from '../src/game/pheasantApproach';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

/** Actual public-entry walk followed by the observable dog's scent/point.
 * Concealed birds never select this route; flush distance is read afterward. */
function walkIn(seed: number, challenge: HuntChallenge, action: 'walk' | 'run' | 'wait' = 'walk') {
  const quick = { ...defaultQuickConfig(), areaId: 'quail-fields', breedId: 'gsp', level: 5 };
  vi.stubGlobal('localStorage', { getItem: (key: string) => key === QUICK_KEY ? JSON.stringify(quick) : null });
  vi.stubGlobal('location', { search: `?play=quick&drop=west-track&challenge=${challenge}&seed=${seed}` });
  const area = resolveThreeHuntArea(location.search);
  const ctx = { camera: { position: { x: 0, z: 40 }, rotation: { y: -Math.PI / 2 } } } as unknown as Ctx;
  let pointed = false, cast = false;
  const player = {
    isRunning: () => pointed && action === 'run',
    consumeRecall: () => { if (cast) return false; cast = true; return true; },
    setHuntHeading: (_: Ctx, heading: number) => { ctx.camera.rotation.y = -heading - Math.PI / 2; },
  };
  ctx.get = ((id: string) => id === 'player' ? player : { isRiseActive: () => false }) as Ctx['get'];
  const hunt = new Hunt3DSystem(new LandscapeModel(area, 'west-track'));
  hunt.init(ctx);
  const update = vi.spyOn(HuntSimulation.prototype, 'update');
  const trail = area.trails.find(path => path.id === 'west-track')!.points;
  let leg = 1, pointMs: number | undefined, pointDogRange = 0;
  try {
    for (let ms = 0; ms < 120_000; ms += 1000 / 30) {
      const dog = hunt.dog(), dogWorld = hunt.dogWorld({ x: 0, z: 0 });
      pointed ||= dog.state === 'pointing';
      let target: { x: number; z: number }, move = true;
      if (dog.state === 'pointing') {
        target = { x: dogWorld.x + Math.cos(dog.heading) * 22, z: dogWorld.z + Math.sin(dog.heading) * 22 };
        move = action !== 'wait';
      } else if (dog.state === 'tracking') {
        target = dogWorld;
        move = Math.hypot(target.x - ctx.camera.position.x, target.z - ctx.camera.position.z) > 8;
      } else {
        target = hunt.simToWorld(trail[leg].x, trail[leg].y, { x: 0, z: 0 });
        if (Math.hypot(target.x - ctx.camera.position.x, target.z - ctx.camera.position.z) < 7 && leg < trail.length - 1) leg++;
      }
      ctx.camera.rotation.y = Math.atan2(ctx.camera.position.x - target.x, ctx.camera.position.z - target.z);
      if (move) {
        const step = (pointed && action === 'run' ? 4.18 : 2.2) / 30;
        ctx.camera.position.x -= Math.sin(ctx.camera.rotation.y) * step;
        ctx.camera.position.z -= Math.cos(ctx.camera.rotation.y) * step;
      }
      hunt.fixedUpdate(ctx, 1000 / 30);
      const events = update.mock.results.at(-1)?.value as HuntSimulationEvent[];
      if (events.some(event => event.type === 'dog-pointed')) {
        pointMs = ms;
        const position = hunt.dogWorld({ x: 0, z: 0 });
        pointDogRange = Math.hypot(position.x - ctx.camera.position.x, position.z - ctx.camera.position.z);
      }
      const flush = events.find(event => event.type === 'covey-flushed');
      if (flush) return { flush, rangeM: flush.hunterDistance * .9144, pointMs, pointDogRange, holdMs: ms - (pointMs ?? ms) };
    }
    throw new Error('Public walk did not produce a natural rise within two minutes');
  } finally { update.mockRestore(); }
}

it.each([41, 1184004868])('allows the quiet Balanced world-space walk-in after a natural distant point (seed %i)', seed => {
  const result = walkIn(seed, 'balanced');
  expect(result.pointDogRange).toBeGreaterThan(18);
  expect(result.flush.cause).toBe('proximity');
  expect(result.flush.pointCredit).toBe(true);
  expect(result.flush.birdIds.length).toBeGreaterThanOrEqual(5);
  expect(result.rangeM).toBeLessThan(12);
});

it('retains less-forgiving Wild and running approaches instead of guaranteeing a close rise', () => {
  const quiet = walkIn(41, 'balanced');
  const relaxed = walkIn(41, 'relaxed');
  const wary = walkIn(41, 'wild');
  const rushed = walkIn(41, 'balanced', 'run');
  expect(relaxed.rangeM).toBeLessThan(quiet.rangeM);
  expect(wary.flush.cause).toBe('nerve');
  expect(wary.rangeM).toBeGreaterThan(quiet.rangeM + 5);
  // A rushed approach can exhaust the point or enter the larger sprint
  // spook radius first. Either is a genuine earlier wild rise.
  expect(['nerve', 'spook']).toContain(rushed.flush.cause);
  expect(rushed.rangeM).toBeGreaterThan(quiet.rangeM + 5);
  expect(rushed.holdMs).toBeLessThan(quiet.holdMs);
});

it('still loses a distant covey naturally if the handler never closes the point', () => {
  const result = walkIn(41, 'balanced', 'wait');
  expect(result.flush.cause).toBe('nerve');
  expect(result.rangeM).toBeGreaterThan(40);
  expect(result.holdMs).toBeGreaterThan(0);
  expect(result.holdMs).toBeLessThan(35_000);
});

it.each([
  ['bobwhite', false, 40],
  // Open-country 3D points now have their own finite walk-in allowance;
  // their legacy scene-cut pressure still follows this original contract.
  ['chukar', false, 40],
  ['sharptail', false, 40],
  ['hun', true, 40],
  ['ringneck', true, 40],
  ['bobwhite', true, 15],
] as const)('preserves existing nerve pressure for %s, continuous=%s, distance=%im', (speciesId, continuous, distanceM) => {
  // Flat ground isolates the approach policy from Chukar's separate slope law.
  vi.spyOn(LandscapeModel.prototype, 'heightAtProperty').mockReturnValue(0);
  const area = getArea('quail-fields'), hunt = createHunt(area, mulberry32(1), { wind: 'calm', condition: 'mild' });
  const bird = { ...hunt.birds[0], id: 9001, coveyId: 0, speciesId, runs: false,
    pos: { x: 300, y: 300 }, state: 'hidden' as const, nerveMs: 6000, approachRoll: .5 };
  hunt.birds = [bird];
  hunt.hunterPos = { x: 300 - distanceM / .9144, y: 300 };
  const dog = new Dog({ x: 286.5, y: 300 }, { breed: getBreed('gsp'), level: 5 }, mulberry32(2), area.world);
  dog.state = 'pointing'; dog.pointedBirdId = bird.id; dog.gait = 'still';
  const simulation = new HuntSimulation({ hunt, dogs: [dog], area, rng: mulberry32(3), continuousEncounter: continuous });
  const species = getSpecies(speciesId);
  let expectedPressure = dog.pressure * (species.pointNerveMult ?? 1);
  if (continuous && species.coveyApproach) expectedPressure *= quailPointApproach(0, dog.pressure, false).nerveScale;
  if (continuous && speciesId === 'ringneck') expectedPressure *= pheasantApproach(bird.id, distanceM / .9144, false, bird.approachRoll).nerveScale;
  simulation.update(1000, { hunterPos: { ...hunt.hunterPos } });
  expect(bird.state).toBe('hidden');
  expect(bird.nerveMs).toBeCloseTo(6000 - expectedPressure * 1000, 8);
});
