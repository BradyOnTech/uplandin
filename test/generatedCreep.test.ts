import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getArea, getDropPoint } from '../src/game/areas';
import type { DogGait, DogScentStage, DogState } from '../src/game/dog';
import type { Ctx } from '../src/three/engine';
import { GeneratedDogSystem } from '../src/three/subsystems/generatedDog';

interface Feed {
  state: DogState; gait: DogGait; scentStage: DogScentStage; scentProgress: number;
  waitingForHandler: boolean; creeping: boolean; carryingBirdId: null;
}
interface Audit { moving: boolean; field: { performance: string }; root: number[] }
const disposals: (() => void)[] = [];
afterEach(() => { disposals.splice(0).forEach(dispose => dispose()); vi.unstubAllGlobals(); });

/** The real renderer bridge, fed only public dog state and actual displacement. */
function fixture() {
  const scope: { __generatedDogAudit?: () => Audit } = {};
  vi.stubGlobal('window', scope);
  const dog: Feed = { state: 'pointing', gait: 'still', scentStage: 'none', scentProgress: 0,
    waitingForHandler: false, creeping: false, carryingBirdId: null };
  const position = { x: 0, z: 0 };
  const hunt = { areaConfig: () => getArea('quail-fields'), dropPoint: () => getDropPoint(getArea('quail-fields')),
    dog: () => dog,
    dogRenderWorld: (_alpha: number, out: { x: number; z: number }) => Object.assign(out, position),
    dogRenderHeading: () => Math.PI / 2, dogRenderTravelHeading: () => Math.PI / 2 };
  const ctx = { scene: new THREE.Scene(), quality: 'lite', fixedAlpha: 1,
    get: (id: string) => id === 'hunt3d' ? hunt : { heightAt: () => 0 } } as unknown as Ctx;
  const system = new GeneratedDogSystem(); system.init(ctx); system.update(ctx, 0);
  disposals.push(() => system.dispose());
  return { dog, position, audit: scope.__generatedDogAudit!, tick: (dt = 1 / 60) => system.update(ctx, dt) };
}

describe('a creeping pup in 3D', () => {
  it('breaks the point to walk its creep step, then sets up again', () => {
    const f = fixture();
    for (let frame = 0; frame < 40; frame++) f.tick();
    expect(f.audit().field.performance).toBe('point');
    expect(f.audit().moving).toBe(false);

    // The sim walks a 2-yard creep step over 1.4 s: about 1.3 m/s at the bird.
    Object.assign(f.dog, { creeping: true, gait: 'track' });
    const start = f.audit().root[2];
    const performances = new Set<string>(), moving: boolean[] = [];
    for (let frame = 0; frame < 84; frame++) {
      f.position.z += 1.83 / 84; f.tick();
      performances.add(f.audit().field.performance); moving.push(f.audit().moving);
    }
    expect(performances).toEqual(new Set(['stalking']));
    // Legs carry the step: the renderer is walking, not sliding a point pose.
    expect(moving.slice(10).every(Boolean)).toBe(true);
    expect(f.audit().root[2] - start).toBeGreaterThan(1.6);

    Object.assign(f.dog, { creeping: false, gait: 'still' });
    for (let frame = 0; frame < 40; frame++) f.tick();
    expect(f.audit().field.performance).toBe('point');
    expect(f.audit().moving).toBe(false);
  });
});
