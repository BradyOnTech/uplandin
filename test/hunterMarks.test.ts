import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { edgeOfCover, glideMark, landingHolds, MARK_CAST_CONE, MARK_GLIDE_M, MARK_JOIN_M, MARK_MEMORY_MS, MARK_SAIL_MS, MarkBook, type HunterMark } from '../src/game/marks';
import { getSpecies } from '../src/game/species';
import { BirdsSystem } from '../src/three/subsystems/birds';
import type { Ctx } from '../src/three/engine';

vi.mock('../src/audio', () => ({ playThud: vi.fn(), playFall: vi.fn(), playBirdFlush: vi.fn(), playPheasantFlush: vi.fn(), playCoveyThunder: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());

describe('the hunter\'s mark book', () => {
  it('joins birds that went in together and keeps the mark between them', () => {
    const book = new MarkBook();
    const first = book.add(1, { x: 100, z: 50 }, 0, 'bobwhite', true, 1000);
    const second = book.add(2, { x: 110, z: 50 }, .2, 'bobwhite', false, 1500);
    expect(second).toBe(first);
    expect(first.birdIds).toEqual([1, 2]);
    expect(first.x).toBeCloseTo(105, 9);
    expect(first.toGround).toBe(true);
    expect(first.setMs).toBe(1500);
    // Farther than a join, or another species, is a mark of its own.
    expect(book.add(3, { x: 105 + MARK_JOIN_M + 5, z: 50 }, 0, 'bobwhite', true, 1600)).not.toBe(first);
    expect(book.add(4, { x: 101, z: 50 }, 0, 'hun', true, 1700)).not.toBe(first);
    expect(book.marks).toHaveLength(3);
    expect(book.latest()?.birdIds).toEqual([4]);
  });

  it('settles a mark when its birds rise again or turn out not to be there', () => {
    const book = new MarkBook();
    book.add(1, { x: 0, z: 0 }, 0, 'chukar', true, 0);
    book.add(2, { x: 4, z: 0 }, 0, 'chukar', true, 0);
    book.add(3, { x: 200, z: 0 }, 0, 'chukar', true, 0);
    book.release(1);
    expect(book.marks.map(mark => mark.birdIds)).toEqual([[2], [3]]);
    book.prune(id => id !== 3);
    expect(book.marks.map(mark => mark.birdIds)).toEqual([[2]]);
    book.release(2);
    expect(book.marks).toEqual([]);
  });

  it('fades a mark from memory: sure for half of it, then dimming to forgotten', () => {
    const book = new MarkBook();
    const mark = book.add(1, { x: 0, z: 0 }, 0, 'sharptail', true, 0);
    expect(book.freshness(mark, MARK_MEMORY_MS * .4)).toBe(1);
    expect(book.freshness(mark, MARK_MEMORY_MS * .75)).toBeCloseTo(.5, 9);
    book.forget(MARK_MEMORY_MS - 1);
    expect(book.marks).toHaveLength(1);
    book.forget(MARK_MEMORY_MS);
    expect(book.marks).toHaveLength(0);
  });

  it('gives a cast the mark the hunter faces, the nearest within the cone and reach', () => {
    const book = new MarkBook();
    const near = book.add(1, { x: 60, z: 0 }, 0, 'chukar', true, 0);
    const far = book.add(2, { x: 150, z: 10 }, 0, 'chukar', true, 0);
    book.add(3, { x: 0, z: 90 }, 0, 'chukar', true, 0);
    expect(book.aimedAt({ x: 0, z: 0 }, 0, 200)).toBe(near);
    expect(book.aimedAt({ x: 0, z: 0 }, MARK_CAST_CONE * .9, 200)).toBe(near);
    expect(book.aimedAt({ x: 0, z: 0 }, MARK_CAST_CONE * 1.1 + Math.atan2(0, 60), 50)).toBeNull();
    expect(book.aimedAt({ x: 100, z: 0 }, 0, 200)).toBe(far);
    expect(book.aimedAt({ x: 0, z: 0 }, Math.PI, 200)).toBeNull();
    // Standing on it, any facing means it.
    expect(book.aimedAt({ x: 58, z: 1 }, Math.PI, 200)).toBe(near);
  });

  it('carries a lost bird\'s glide on to where it was going down, as an eye reads it', () => {
    // 2 m up, sinking 1 m/s at 10 m/s across: 20 m on.
    expect(glideMark({ x: 0, y: 2, z: 0 }, 10, -1, 0, 0)).toEqual({ x: 20, z: 0 });
    // Never farther than he could fairly judge.
    expect(glideMark({ x: 0, y: 9, z: 0 }, 0, -1, 10, 0).z).toBeCloseTo(MARK_GLIDE_M, 9);
    // Not sinking: where it was.
    expect(glideMark({ x: 3, y: 2, z: 4 }, 10, .5, 0, 0)).toEqual({ x: 3, z: 4 });
  });

  it('finds where a line goes into a stand of cover, from his side', () => {
    const stand = { cx: 100, cz: 0, hx: 20, hz: 10 };
    // Sailing in from the west: in at the west edge, on its line.
    expect(edgeOfCover({ x: 0, z: 0 }, { x: 100, z: 0 }, stand)).toEqual({ x: 80, z: 0 });
    const slant = edgeOfCover({ x: 50, z: -40 }, { x: 95, z: 5 }, stand);
    expect(slant.z).toBeCloseTo(-10, 9); expect(slant.x).toBeCloseTo(80, 9);
    // Already over the stand when he saw it: the edge it crossed, behind it.
    expect(edgeOfCover({ x: 90, z: 0 }, { x: 110, z: 0 }, stand)).toEqual({ x: 80, z: 0 });
    // A spot outside every stand is its own mark.
    expect(edgeOfCover({ x: 0, z: 50 }, { x: 100, z: 50 }, stand)).toEqual({ x: 100, z: 50 });
  });

  it('marks only a bird the field keeps: inside the property, in cover unless it is a bird of open country', () => {
    const world = { x: 0, y: 0, w: 1000, h: 800 }, patch = { x: 400, y: 400, w: 60, h: 60 };
    expect(landingHolds('bobwhite', { x: 420, y: 420 }, world, [patch])).toBe(true);
    expect(landingHolds('bobwhite', { x: 200, y: 200 }, world, [patch])).toBe(false);
    expect(landingHolds('chukar', { x: 200, y: 200 }, world, [patch])).toBe(true);
    expect(landingHolds('hun', { x: 200, y: 200 }, world, [patch], true)).toBe(true);
    expect(landingHolds('chukar', { x: 1200, y: 200 }, world, [patch])).toBe(false);
    expect(landingHolds('chukar', { x: NaN, y: 200 }, world, [patch])).toBe(false);
  });
});

type Slot = { x: number; y: number; z: number; simId: number; status: string; vxW: number; vyW: number; vzW: number; airMs: number;
  previousAirMs: number; previousX?: number; previousY?: number; previousZ?: number; root: THREE.Group };

/** A bird gliding down to land 60 m in front of the hunter's eye. */
function landing(options: { look?: number; crown?: number; patches?: { x: number; y: number; w: number; h: number }[];
  stands?: { cx: number; cz: number; hx: number; hz: number }[] } = {}) {
  vi.stubGlobal('window', new EventTarget()); vi.stubGlobal('location', { search: '' });
  vi.stubGlobal('document', { getElementById: () => null, querySelector: () => null });
  const birds = new BirdsSystem();
  const internal = birds as unknown as {
    mat: THREE.Material; hunt: unknown; terrain: unknown; frozen: boolean; listener: THREE.Camera; coverEvents: EventTarget;
    coverCtx: unknown; staged: Set<number>; tickBirds(dtMs: number): void; fieldMs: number;
    markLanding(slot: Slot, landing: { x: number; z: number }, landed?: boolean): void;
    slots: Slot[]; buildPool(ctx: Ctx): void; applySpeciesAppearance(slot: Slot, species: ReturnType<typeof getSpecies>): void;
  };
  const simBirds = [{ id: 1, coveyId: 3, speciesId: 'bobwhite', state: 'flushed', pos: { x: 0, y: 60 } }];
  const hunt = {
    areaConfig: () => ({ id: 'test-ground', world: { x: -500, y: -500, w: 1000, h: 1000 }, patches: options.patches ?? [{ x: -20, y: 40, w: 40, h: 40 }], landmarks: [] }),
    huntState: () => ({ birds: simBirds, hunterPos: { x: 0, y: 0 }, wind: 0, areaId: 'test-ground' }),
    resolveBird: vi.fn(() => true), recordFallWorld: vi.fn(),
    worldToSim: (x: number, z: number, out: { x: number; y: number }) => Object.assign(out, { x, y: z }),
    simToWorld: (x: number, y: number, out: { x: number; z: number }) => Object.assign(out, { x, z: y }),
    coverPatches: () => options.stands ?? [],
  };
  const camera = new THREE.PerspectiveCamera(70, 16 / 9, .05, 2000);
  camera.position.set(0, 1.62, 0); camera.lookAt(Math.sin(options.look ?? 0) * 60, 0, Math.cos(options.look ?? 0) * 60); camera.updateMatrixWorld();
  const events = new EventTarget();
  const ctx = { scene: new THREE.Scene(), camera, events, quality: 'lite', timeOfDay: 'morning', time: 1, fixedAlpha: 1, paused: false,
    get: (id: string) => ({ hunt3d: hunt, birds, terrain: { heightAt: () => 0 } }[id]) } as unknown as Ctx;
  internal.mat = new THREE.MeshLambertMaterial({ vertexColors: true }); internal.hunt = hunt;
  internal.terrain = { heightAt: () => 0 }; internal.frozen = false; internal.listener = camera; internal.coverEvents = events;
  // A thicket 50 m out, between the eye and the landing, if asked for.
  internal.coverCtx = { get: (id: string) => id === 'grass' ? { launchHeightAt: (_x: number, z: number) => z > 48 && z < 54 ? options.crown ?? 0 : .3 } : {} };
  internal.buildPool(ctx); internal.staged.add(1);
  const slot = internal.slots[0]; internal.applySpeciesAppearance(slot, getSpecies('bobwhite'));
  Object.assign(slot, { simId: 1, status: 'flying', x: 0, y: 1, z: 58, vxW: 0, vyW: -10, vzW: 6, airMs: 2400, previousAirMs: 2400,
    flight: { escX: 0, escZ: 1, rightX: -1, rightZ: 0, hunterX: 0, hunterZ: 0, rng: () => .5 } });
  const marks: HunterMark[] = [];
  events.addEventListener('hunt-mark', (event) => marks.push({ ...(event as CustomEvent<HunterMark>).detail }));
  const tick = (n: number) => { for (let i = 0; i < n; i++) internal.tickBirds(1000 / 30); };
  return { birds, slot, simBirds, marks, tick, internal };
}

describe('the birds subsystem marks a miss the hunter watched go down', () => {
  it('marks it where it touched down when he saw it to the ground', () => {
    const f = landing();
    f.tick(4);
    expect(f.slot.status).toBe('done');
    expect(f.marks).toHaveLength(1);
    expect(f.marks[0].toGround).toBe(true);
    expect(f.marks[0].z).toBeGreaterThan(58);
    expect(f.birds.latestMark()?.mark.birdIds).toEqual([1]);
    expect(f.birds.aimedMark(0, 0, Math.PI / 2, 200)?.birdIds).toEqual([1]);
  });

  it('marks nothing he was not looking at', () => {
    const f = landing({ look: Math.PI });
    f.tick(4);
    expect(f.slot.status).toBe('done');
    expect(f.marks).toHaveLength(0);
    expect(f.birds.latestMark()).toBeNull();
  });

  it('marks where he lost it going in when a thicket hides the last of it', () => {
    const f = landing({ crown: 2.4 });
    // It drops in over the near side of the thicket and lands behind it.
    f.slot.y = 3.2; f.slot.vyW = -4; f.slot.z = 44; f.slot.vzW = 8;
    f.tick(30);
    expect(f.slot.status).toBe('done');
    expect(f.marks).toHaveLength(1);
    expect(f.marks[0].toGround).toBe(false);
    // Where its glide was taking it when he lost it: past where he lost it,
    // near where it touched down.
    expect(Math.abs(f.marks[0].z - f.slot.z)).toBeLessThan(2.5);
    expect(f.marks[0].z).toBeGreaterThan(46);
  });

  it('never marks a bird the field will not keep there, nor a relit single', () => {
    const outside = landing({ patches: [{ x: 200, y: 200, w: 10, h: 10 }] });
    outside.tick(4);
    expect(outside.marks).toHaveLength(0);
    const single = landing();
    Object.assign(single.slot, { launchedSingle: true });
    single.tick(4);
    expect(single.marks).toHaveLength(0);
  });

  it('marks a rooster by its sail at the edge of the stand it went into, though the cover hid its drop', () => {
    // The stand: x -20..20, z 60..100. He saw it sailing at z 30; it went down at z 80, out of his sight.
    const f = landing({ stands: [{ cx: 0, cz: 80, hx: 20, hz: 20 }] });
    Object.assign(f.slot, { sailed: { ms: 0, x: 0, z: 30 }, species: getSpecies('ringneck'), sex: 'rooster' });
    f.internal.fieldMs = MARK_SAIL_MS - 500;
    f.internal.markLanding(f.slot, { x: 0, z: 80 }, false);
    expect(f.marks).toHaveLength(1);
    expect(f.marks[0]).toMatchObject({ edge: true, toGround: false, sex: 'rooster', x: 0 });
    expect(f.marks[0].z).toBeCloseTo(60, 9);
    // Too long since he saw it sail: no mark.
    const late = landing({ stands: [{ cx: 0, cz: 80, hx: 20, hz: 20 }] });
    Object.assign(late.slot, { sailed: { ms: 0, x: 0, z: 30 } });
    late.internal.fieldMs = MARK_SAIL_MS + 500;
    late.internal.markLanding(late.slot, { x: 0, z: 80 }, false);
    expect(late.marks).toHaveLength(0);
  });

  it('marks a bird of open country by its sail at the spot it was sailing for', () => {
    const f = landing({ patches: [] });
    Object.assign(f.slot, { sailed: { ms: 0, x: 0, z: 30 }, species: getSpecies('sharptail') });
    f.internal.fieldMs = 2000;
    f.internal.markLanding(f.slot, { x: 10, z: 150 }, false);
    expect(f.marks).toHaveLength(1);
    expect(f.marks[0]).toMatchObject({ edge: false, toGround: false, x: 10, z: 150 });
  });

  it('keeps the mark while the bird sits there, and settles it when the field did not keep it', () => {
    const kept = landing();
    kept.tick(4); kept.simBirds[0].state = 'hidden'; kept.tick(30);
    expect(kept.birds.marks()).toHaveLength(1);
    const lost = landing();
    lost.tick(4); lost.simBirds[0].state = 'escaped'; lost.tick(30);
    expect(lost.birds.marks()).toHaveLength(0);
  });
});

describe('a cast the way he faces goes to his mark', () => {
  it('sends the dog to the mark he faces, and otherwise where he looks', async () => {
    const { Hunt3DSystem } = await import('../src/three/subsystems/hunt3d');
    const { LandscapeModel } = await import('../src/game/landscape');
    const { parseDropPointId, resolveThreeHuntArea } = await import('../src/game/gameplayMode');
    vi.stubGlobal('location', { search: '?breed=gsp&area=quail-fields&seed=1184004868' });
    const camera = new THREE.PerspectiveCamera(70, 16 / 9, .05, 2000);
    camera.rotation.order = 'YXZ'; camera.position.set(0, 1.7, 40);
    const book = new MarkBook();
    const birds = { isRiseActive: () => false, aimedMark: (x: number, z: number, facing: number, reach: number) => book.aimedAt({ x, z }, facing, reach) };
    const player = { isRunning: () => false, consumeRecall: () => false, setHuntHeading: () => {} };
    const land = new LandscapeModel(resolveThreeHuntArea(location.search), parseDropPointId(location.search));
    const hunt = new Hunt3DSystem(land);
    const terrain = { heightAt: (x: number, z: number) => land.heightAtWorld(x, z) };
    camera.position.y = land.heightAtWorld(0, 40) + 1.7;
    const ctx = { camera, get: (id: string) => id === 'player' ? player : id === 'terrain' ? terrain : birds } as unknown as Ctx;
    hunt.init(ctx);
    const command = (hunt as unknown as { commandFor(ctx: Ctx, kind: 'cast'): { target: { x: number; y: number } } }).commandFor.bind(hunt);
    // Facing -z (yaw 0), a mark 120 m out a little off his line.
    camera.rotation.set(-.05, 0, 0); camera.updateMatrixWorld();
    const mark = book.add(9, { x: 12, z: 40 - 120 }, 0, 'bobwhite', true, 0);
    const toMark = command(ctx, 'cast').target, expected = hunt.worldToSim(mark.x, mark.z, { x: 0, y: 0 });
    expect(toMark.x).toBeCloseTo(expected.x, 6); expect(toMark.y).toBeCloseTo(expected.y, 6);
    // Turned away from it, the cast goes where he faces.
    camera.rotation.set(-.05, Math.PI / 2, 0); camera.updateMatrixWorld();
    const away = command(ctx, 'cast').target, there = hunt.worldToSim(mark.x, mark.z, { x: 0, y: 0 });
    expect(Math.hypot(away.x - there.x, away.y - there.y)).toBeGreaterThan(50);
  });
});
