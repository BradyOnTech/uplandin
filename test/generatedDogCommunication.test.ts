import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getArea, getDropPoint } from '../src/game/areas';
import type { DogGait, DogScentStage, DogState } from '../src/game/dog';
import type { Ctx } from '../src/three/engine';
import { GeneratedDogSystem } from '../src/three/subsystems/generatedDog';

interface Feed {
  state: DogState;
  gait: DogGait;
  scentStage: DogScentStage;
  scentProgress: number;
  waitingForHandler: boolean;
  carryingBirdId: null;
}
interface Foot {
  actual: number[]; target: number[]; groundGap: number; targetError: number;
  locked: boolean; step: number; plantId: number;
}
interface Audit { moving: boolean; field: { performance: string; intentYaw: number }; feet: Foot[]; root: number[]; }
const disposals: (() => void)[] = [];
afterEach(() => { disposals.splice(0).forEach(dispose => dispose()); vi.unstubAllGlobals(); });
const vector = (v: number[]) => new THREE.Vector3(v[0], v[1], v[2]);

/** Exercise the real bridge, not a standalone pose selector. Its shared dog
 * feed supplies only public state/progress/heading and actual displacement. */
function fixture(patch: Partial<Feed> = {}, ground: (x: number, z: number) => number = () => 0) {
  const scope: { __generatedDogAudit?: () => Audit } = {};
  vi.stubGlobal('window', scope);
  const dog: Feed = { state: 'heel', gait: 'still', scentStage: 'none', scentProgress: 0,
    waitingForHandler: false, carryingBirdId: null, ...patch };
  const position = { x: 0, z: 0 };
  const headings = { intent: Math.PI / 2, travel: Math.PI / 2 };
  const hunt = { areaConfig: () => getArea('quail-fields'), dropPoint: () => getDropPoint(getArea('quail-fields')),
    dog: () => dog,
    dogRenderWorld: (_alpha: number, out: { x: number; z: number }) => Object.assign(out, position),
    dogRenderHeading: () => headings.intent, dogRenderTravelHeading: () => headings.travel };
  const ctx = { scene: new THREE.Scene(), quality: 'lite', fixedAlpha: 1,
    get: (id: string) => id === 'hunt3d' ? hunt : { heightAt: ground } } as unknown as Ctx;
  const system = new GeneratedDogSystem(); system.init(ctx); system.update(ctx, 0);
  disposals.push(() => system.dispose());
  const audit = scope.__generatedDogAudit!;
  return { dog, position, headings, audit,
    tick: (dt = 1 / 60) => system.update(ctx, dt),
    mouth: () => { const v = new THREE.Vector3(); system.mouthWorld(v); return v; },
    bone: (name: string) => ctx.scene.getObjectByName(name) as THREE.Bone,
  };
}

describe('generated dog communicates the shared scent work', () => {
  it('carries search versus stalking intent through the real bridge at the same travelled speed', () => {
    const search = fixture({ state: 'quartering', gait: 'trot' });
    const stalk = fixture({ state: 'tracking', gait: 'track', scentStage: 'stalking', scentProgress: .65 });
    for (let frame = 0; frame < 90; frame++) {
      search.position.z += .018; stalk.position.z += .018;
      search.tick(); stalk.tick();
    }
    expect(search.audit().field.performance).toBe('search');
    expect(stalk.audit().field.performance).toBe('stalking');
    expect(stalk.audit().root).toEqual(search.audit().root);
    const searchMuzzle = search.mouth(), stalkMuzzle = stalk.mouth();
    expect(stalkMuzzle.y).toBeLessThan(searchMuzzle.y - .07);
    expect(stalkMuzzle.z).toBeGreaterThan(searchMuzzle.z + .015);
    expect(stalk.bone('neck').position.z).toBeGreaterThan(search.bone('neck').position.z + .025);
  });

  it('shows first scent as an alert lift without moving the four supporting paws', () => {
    const f = fixture();
    for (let frame = 0; frame < 30; frame++) f.tick();
    const idleMuzzle = f.mouth(), supports = f.audit().feet.map(foot => vector(foot.actual));
    Object.assign(f.dog, { state: 'tracking', gait: 'still', scentStage: 'checking', scentProgress: 0 });
    for (let frame = 0; frame < 18; frame++) {
      f.dog.scentProgress = frame / 18; f.tick();
      f.audit().feet.forEach((foot, i) => expect(vector(foot.actual).distanceTo(supports[i])).toBeLessThan(.002));
    }
    expect(f.audit().field.performance).toBe('checking');
    expect(f.mouth().y).toBeGreaterThan(idleMuzzle.y + .03);
  });

  it('keeps a handler hold on four feet despite a retained locking stage and does not accumulate pose on zero-time renders', () => {
    const f = fixture({ state: 'tracking', gait: 'still', scentStage: 'locking', scentProgress: 1, waitingForHandler: true });
    for (let frame = 0; frame < 42; frame++) f.tick();
    expect(f.audit().field.performance).toBe('waiting');
    for (const foot of f.audit().feet) {
      expect(foot.locked).toBe(true);
      expect(Math.abs(foot.groundGap)).toBeLessThan(.012);
    }
    const muzzle = f.mouth(), neck = f.bone('neck').quaternion.clone(), head = f.bone('head').quaternion.clone();
    const supports = f.audit().feet.map(foot => vector(foot.actual));
    for (let frame = 0; frame < 40; frame++) {
      f.tick(0);
      expect(f.mouth().distanceTo(muzzle)).toBeLessThan(.00001);
      expect(f.bone('neck').quaternion.angleTo(neck)).toBeLessThan(.00001);
      expect(f.bone('head').quaternion.angleTo(head)).toBeLessThan(.00001);
      f.audit().feet.forEach((foot, i) => expect(vector(foot.actual).distanceTo(supports[i])).toBeLessThan(.00001));
    }
  });

  it('raises the pointing paw during the shared locking beat and preserves planted supports on a slope across frame rates', () => {
    for (const fps of [30, 60, 120]) {
      const f = fixture({ state: 'tracking', gait: 'still', scentStage: 'stalking', scentProgress: .9 },
        (x, z) => .07 * x - .035 * z);
      for (let frame = 0; frame < fps * .4; frame++) f.tick(1 / fps);
      const before = f.audit().feet[0].groundGap;
      let previous = f.audit().feet, middle = before, largestJump = 0;
      f.dog.scentStage = 'locking'; f.dog.scentProgress = 0;
      const count = Math.ceil(fps * .28);
      for (let frame = 0; frame < count; frame++) {
        f.dog.scentProgress = (frame + 1) / count; f.tick(1 / fps);
        const feet = f.audit().feet;
        if (frame === Math.floor(count / 2)) middle = feet[0].groundGap;
        largestJump = Math.max(largestJump, Math.abs(feet[0].groundGap - previous[0].groundGap));
        for (let i = 1; i < feet.length; i++) {
          expect(feet[i].groundGap).toBeGreaterThan(-.012);
          expect(feet[i].targetError).toBeLessThan(.035);
          if (feet[i].locked && previous[i].locked && feet[i].plantId === previous[i].plantId && !feet[i].step)
            expect(vector(feet[i].target).distanceTo(vector(previous[i].target))).toBeLessThan(.00001);
        }
        previous = feet;
      }
      const locked = f.audit().feet[0].groundGap;
      expect(f.audit().field.performance).toBe('locking');
      expect(middle).toBeGreaterThan(before + .025);
      expect(locked).toBeGreaterThan(middle + .025);
      expect(locked).toBeGreaterThan(.12);
      expect(largestJump).toBeLessThan(.09);
      f.dog.state = 'pointing'; f.dog.scentStage = 'none'; f.tick(1 / fps);
      expect(Math.abs(f.audit().feet[0].groundGap - locked)).toBeLessThan(.035);
    }
  });

  it('releases an established point into a travelled stalk without dropping the raised paw in one frame', () => {
    const f = fixture({ state: 'pointing', gait: 'still' });
    for (let frame = 0; frame < 36; frame++) f.tick();
    const raised = f.audit().feet[0].groundGap;
    expect(raised).toBeGreaterThan(.12);
    Object.assign(f.dog, { state: 'tracking', gait: 'track', scentStage: 'stalking', scentProgress: .2 });
    let previous = raised, maxJump = 0;
    for (let frame = 0; frame < 30; frame++) {
      f.position.z += .012; f.tick();
      const gap = f.audit().feet[0].groundGap;
      if (!frame) expect(gap).toBeGreaterThan(raised * .6);
      maxJump = Math.max(maxJump, Math.abs(gap - previous)); previous = gap;
      expect(gap).toBeGreaterThan(-.012);
    }
    expect(maxJump).toBeLessThan(.09);
    expect(f.audit().moving).toBe(true);
    expect(f.audit().field.performance).toBe('stalking');
    expect(f.audit().root[2]).toBeCloseTo(.36);
    expect(f.audit().feet[0].groundGap).toBeLessThan(.09);
  });

  it('turns the neck and head toward the intent bearing through either side of the heading seam', () => {
    for (const direction of [-1, 1]) {
      const f = fixture({ state: 'tracking', gait: 'track', scentStage: 'stalking', scentProgress: .5 });
      f.headings.travel = -direction * (Math.PI - .06);
      f.headings.intent = direction * (Math.PI - .06);
      for (let frame = 0; frame < 60; frame++) {
        f.position.x += Math.cos(f.headings.travel) * .018;
        f.position.z += Math.sin(f.headings.travel) * .018;
        f.tick();
      }
      // Both feed bearings are close across +/- pi, not a whole turn apart.
      expect(f.audit().field.intentYaw * direction).toBeGreaterThan(.1);
      expect(Math.abs(f.audit().field.intentYaw)).toBeLessThan(.13);
      expect(f.bone('neck').rotation.y * direction).toBeGreaterThan(.03);
      expect(f.bone('head').rotation.y * direction).toBeGreaterThan(.015);
      expect(Math.abs(f.bone('neck').rotation.y) + Math.abs(f.bone('head').rotation.y)).toBeLessThan(.15);
    }
  });
});
