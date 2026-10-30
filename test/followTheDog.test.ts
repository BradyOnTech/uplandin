import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { getArea } from '../src/game/areas';
import { defaultQuickConfig, QUICK_KEY } from '../src/game/quick';
import { LandscapeModel } from '../src/game/landscape';
import type { Ctx } from '../src/three/engine';
import { Hunt3DSystem } from '../src/three/subsystems/hunt3d';

const DT = 1000 / 30, WALK = 2;
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

/**
 * The laziest fair player: walks off the truck the way it faces, then only
 * follows the dog, keeping twenty metres behind it, and walks in to its
 * points. He never reads the cover or the trails. On a big ground the dog
 * hunts on to the next cover, so it leads him to birds from every entry.
 * Returns seconds to the first contact (scent, point or flush).
 */
function follow(areaId: string, drop: string, seed: number, seconds: number): number | null {
  const quick = { ...defaultQuickConfig(), areaId, breedId: 'gsp', level: 8, weather: 'frost' };
  vi.stubGlobal('localStorage', { getItem: (key: string) => key === QUICK_KEY ? JSON.stringify(quick) : null, setItem() {} });
  vi.stubGlobal('window', {});
  vi.stubGlobal('location', { search: `?play=quick&seed=${seed}&drop=${drop}` });
  const area = getArea(areaId), system = new Hunt3DSystem(new LandscapeModel(area, drop)), camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 1.62, 40); camera.rotation.y = Math.PI;
  const player = { consumeRecall: () => false, isRunning: () => false,
    setHuntHeading: (_: Ctx, heading: number) => { camera.rotation.y = -heading - Math.PI / 2; } };
  const ctx = { camera, events: new EventTarget(), get: (id: string) => id === 'player' ? player : { isRiseActive: () => false } } as unknown as Ctx;
  system.init(ctx); system.fixedUpdate(ctx, DT);
  const heading = system.dropPoint().heading, birds = system.huntState().birds;
  const hidden = new Set(birds.filter(b => b.state === 'hidden').map(b => b.id));
  const step = (x: number, z: number, stop: number) => {
    const dx = x - camera.position.x, dz = z - camera.position.z, d = Math.hypot(dx, dz);
    camera.rotation.y = Math.atan2(-dx, -dz);
    if (d <= stop) return;
    camera.position.x += dx / d * WALK / 30; camera.position.z += dz / d * WALK / 30;
  };
  let walking = true;
  for (let frame = 0; frame < seconds * 30; frame++) {
    const dog = system.dog(), at = system.dogWorld({ x: 0, z: 0 });
    const gap = Math.hypot(at.x - camera.position.x, at.z - camera.position.z);
    if (walking && (frame > 600 || (dog.state !== 'heel' && gap > 20))) walking = false;
    if (walking) step(camera.position.x + Math.cos(heading) * 10, camera.position.z + Math.sin(heading) * 10, 0);
    else if (dog.state === 'pointing') {
      const bird = system.huntState().birds.find(b => b.id === dog.pointedBirdId);
      const aim = bird ? system.simToWorld(bird.pos.x, bird.pos.y, { x: 0, z: 0 }) : at;
      step(aim.x, aim.z, .8);
    } else step(at.x, at.z, 20);
    system.fixedUpdate(ctx, DT);
    const next = system.dog();
    if (next.state === 'tracking' || next.state === 'pointing') return (frame + 1) / 30;
    if (system.huntState().birds.some(b => hidden.has(b.id) && b.state !== 'hidden')) return (frame + 1) / 30;
  }
  return null;
}

describe('a hunter who only follows the dog', () => {
  const area = getArea('chukar-ridge');
  it.each(area.dropPoints.map(drop => drop.id))('meets birds from the %s entry on Chukar Ridge', drop => {
    const firsts = [41, 2026, 48291].map(seed => follow('chukar-ridge', drop, seed, 300));
    // Every hunt meets birds inside five minutes, most well inside three.
    expect(firsts.every(t => t !== null), JSON.stringify(firsts)).toBe(true);
    expect([...firsts].sort((a, b) => a! - b!)[1]!, JSON.stringify(firsts)).toBeLessThan(180);
  }, 120_000);
});
