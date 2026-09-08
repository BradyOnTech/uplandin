import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RiggedDogSystem } from '../src/three/subsystems/riggedDog';
import type { Ctx } from '../src/three/engine';

interface Paw { foot: string; x: number; y: number; z: number; contact: number; plantId: number; gap: number; settlingStep: boolean }
interface Audit { state(): { paws: Paw[]; settlingSteps: number; correctiveSteps: number; clip: string; mouth: number[] } }

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function loadFixture(speed = 2.4, turn = 0) {
  const manifest = JSON.parse(await readFile(new URL('../public/models/gsp/manifest.json', import.meta.url), 'utf8'));
  vi.stubGlobal('location', { search: '' }); vi.stubGlobal('window', {});
  vi.stubGlobal('fetch', async () => ({ ok: true, json: async () => manifest }));
  vi.spyOn(GLTFLoader.prototype, 'loadAsync').mockImplementation(async url => {
    const data = await readFile(new URL(`../public/models/gsp/${String(url).split('/').at(-1)}`, import.meta.url));
    const loader = new GLTFLoader();
    loader.register(() => ({ name: 'no_gpu_texture_test', loadTexture: async () => new THREE.Texture() }));
    return loader.parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), '');
  });
  const dog = { state: 'quartering', gait: speed > 3 ? 'run' : 'trot', scentStage: 'none', scentProgress: 0,
    carryingBirdId: null as number | null, needsSearch: false, pointedBirdId: null, profile: { breed: { id: 'gsp' } } };
  const position = { x: 0, z: 0 };
  const travel = Math.PI / 2 - turn * Math.PI / 180;
  const hunt = { dog: () => dog, dogRenderWorld: (_: number, out: typeof position) => Object.assign(out, position),
    dogRenderHeading: () => Math.PI / 2, dogRenderTravelHeading: () => travel };
  const terrain = { heightAt: () => 0 };
  const ctx = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), quality: 'high', paused: false, fixedAlpha: 1,
    renderer: { capabilities: { getMaxAnisotropy: () => 1 } },
    get: (id: string) => id === 'hunt3d' ? hunt : terrain } as unknown as Ctx;
  const system = new RiggedDogSystem();
  await system.init(ctx);
  const audit = (window as unknown as { __dogAudit: Audit }).__dogAudit;
  return { dog, position, travel, system, ctx, audit };
}

describe('loaded dog settles into a point', () => {
  it('reaches the low grip at pickup completion and lifts continuously into the travelling carry pose', async () => {
    const { dog, position, system, ctx, audit } = await loadFixture();
    try {
      dog.state = 'retrieving'; dog.gait = 'still';
      for (let frame = 0; frame < 42; frame++) system.update(ctx, 1 / 60);
      let prior = audit.state().mouth;
      expect(prior[1]).toBeLessThan(0.20);
      dog.carryingBirdId = 8; dog.gait = 'trot';
      let maximumMovement = 0;
      for (let frame = 0; frame < 30; frame++) {
        position.z += 2.4 / 60; system.update(ctx, 1 / 60);
        const mouth = audit.state().mouth;
        maximumMovement = Math.max(maximumMovement, Math.hypot(...mouth.map((value, i) => value - prior[i])));
        if (frame === 0) expect(mouth[1]).toBeLessThan(0.25);
        prior = mouth;
      }
      expect(prior[1]).toBeGreaterThan(0.45);
      expect(maximumMovement).toBeLessThan(0.10);
    } finally { system.dispose(ctx); }
  });

  it.each([{ speed: 2.4, frames: 80, turn: 0 }, { speed: 4.4, frames: 77, turn: 0 }, { speed: 2.4, frames: 86, turn: 43 }])(
    'keeps contacts fixed and visibly settles from $speed m/s with a $turn degree scent turn', async ({ speed, frames, turn }) => {
    const { dog, position, travel, system, ctx, audit } = await loadFixture(speed, turn);
    try {
      for (let frame = 0; frame < frames; frame++) {
        position.x += Math.cos(travel) * speed / 60; position.z += Math.sin(travel) * speed / 60;
        system.update(ctx, 1 / 60);
      }
      let previous = audit.state();
      dog.state = 'tracking'; dog.gait = 'still'; dog.scentStage = 'locking';
      let maximumStanceDrift = 0; let maximumRawStep = 0; let highestSettlingFoot = 0;
      let worstRawStep: unknown;
      for (let frame = 0; frame < 120; frame++) {
        dog.scentProgress = Math.min(1, frame / 42);
        if (frame === 43) dog.state = 'pointing';
        system.update(ctx, 1 / 60);
        const current = audit.state();
        for (const paw of current.paws) {
          const prior = previous.paws.find(foot => foot.foot === paw.foot)!;
          const rawStep = Math.hypot(paw.x - prior.x, paw.y - prior.y, paw.z - prior.z);
          if (rawStep > maximumRawStep) { maximumRawStep = rawStep; worstRawStep = { frame, prior, paw }; }
          if (prior.contact > 0.1 && paw.contact > 0.1 && prior.plantId === paw.plantId) {
            maximumStanceDrift = Math.max(maximumStanceDrift, Math.hypot(paw.x - prior.x, paw.z - prior.z));
          }
          if (paw.settlingStep) { expect(paw.contact).toBe(0); highestSettlingFoot = Math.max(highestSettlingFoot, paw.gap); }
        }
        if (frame === 10) {
          const before = audit.state(); ctx.paused = true;
          system.update(ctx, 0);
          audit.state().paws.forEach((paw, i) => {
            expect(paw.contact).toBe(before.paws[i].contact);
            expect(paw.plantId).toBe(before.paws[i].plantId);
            expect(paw.x).toBeCloseTo(before.paws[i].x, 10);
            expect(paw.y).toBeCloseTo(before.paws[i].y, 10);
            expect(paw.z).toBeCloseTo(before.paws[i].z, 10);
          });
          ctx.paused = false;
        }
        previous = current;
      }
      expect(highestSettlingFoot).toBeGreaterThan(0.045);
      expect(previous.settlingSteps).toBeGreaterThan(0);
      expect(maximumStanceDrift).toBeLessThan(0.012);
      // Also measure raw movement; changing a contact id cannot hide a snap.
      expect(maximumRawStep, JSON.stringify(worstRawStep)).toBeLessThan(0.065);
      expect(previous.clip).toBe('point');
      for (const paw of previous.paws.filter(foot => foot.foot !== 'FL')) {
        expect(paw.contact).toBe(1); expect(Math.abs(paw.gap)).toBeLessThan(0.012);
      }
    } finally { system.dispose(ctx); }
  });
});
