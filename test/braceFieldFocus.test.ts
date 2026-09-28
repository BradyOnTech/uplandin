import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { Dog, type DogState } from '../src/game/dog';
import { getBreed } from '../src/game/breeds';
import { getArea } from '../src/game/areas';
import { createHunt } from '../src/game/state';
import type { Bird } from '../src/game/birds';
import type { Ctx } from '../src/three/engine';
import { FieldInterface } from '../src/three/fieldInterface';
import { FieldGuide } from '../src/three/fieldGuide';
import { HuntHudSystem } from '../src/three/subsystems/huntHud';

afterEach(() => vi.unstubAllGlobals());

function dog(state: DogState, x: number, carryingBirdId: number | null = null): Dog {
  const result = new Dog({ x, y: 0 }, { breed: getBreed('gsp'), level: 5 }, () => .5);
  result.state = state; result.carryingBirdId = carryingBirdId;
  return result;
}

function element() {
  return { textContent: '', hidden: false, disabled: false, dataset: {} as Record<string, string>,
    style: { transform: '' }, classList: { toggle: vi.fn() }, setAttribute: vi.fn() };
}

/** Exercise both actual presentation adapters with opposed, observable dogs.
 * States are fixtures; this is not a claim of a natural shot or recovery. */
function render(dogs: Dog[]) {
  const area = getArea('quail-fields'), state = createHunt(area, () => .5);
  state.birds = [{ id: 1, state: 'hidden' }, { id: 2, state: 'downed' }, { id: 3, state: 'carried' }] as Bird[];
  const hunt = { dogCount: () => dogs.length, dog: (slot: number) => dogs[slot], huntState: () => state,
    simToWorld: (x: number, y: number, out: { x: number; z: number }) => Object.assign(out, { x, z: y }),
    truckWorld: (out: { x: number; z: number }) => Object.assign(out, { x: 0, z: 0 }),
  };
  const gun = { shellsRemaining: () => 2, shellCapacity: () => 3, isReloading: () => false, mountProgress: () => 0 };
  const birds = { isRiseActive: () => false };
  const ctx = { camera: new THREE.PerspectiveCamera(), paused: false,
    get: (id: string) => ({ hunt3d: hunt, gun, birds })[id],
  } as unknown as Ctx;
  const nodes = Object.fromEntries(['panel', 'tally', 'phase', 'locator', 'dogDirection', 'dogStatus', 'dogDistance', 'guidance', 'endButton'].map(key => [key, element()]));
  const hud = new HuntHudSystem();
  Object.assign(hud, { hunt, gun, birds, player: { isRunning: () => false }, ...nodes });
  hud.update(ctx, .2);

  const line = element(), guide = new FieldGuide();
  vi.stubGlobal('document', { getElementById: (id: string) => id === 'first-hunt-guide' ? line : null });
  vi.stubGlobal('localStorage', { setItem: vi.fn() });
  const ui = Object.assign(Object.create(FieldInterface.prototype), { engine: { ctx }, readyState: true, entered: true,
    complete: false, capture: false, falconry: false, touch: false, guideElapsed: 0, guide, guideSaved: JSON.stringify(guide.snapshot()),
  }) as { updateGuide(dt: number): void };
  ui.updateGuide(.2);
  return { nodes, line };
}

function expectSecondaryRecovery(nodes: ReturnType<typeof render>['nodes']) {
  expect(nodes.dogDirection.style.transform).toBe('rotate(90deg)');
  expect(nodes.dogDistance.textContent).toBe('20 YD');
  expect(nodes.panel.dataset.encounter).toBe('retrieve');
  expect(nodes.tally.textContent).toContain('Down 2');
  expect(nodes.endButton.disabled).toBe(true);
}

describe('brace field focus', () => {
  it('locates the secondary dog hunting a fall instead of the quartering primary', () => {
    const { nodes, line } = render([dog('quartering', -9), dog('retrieving', 18)]);
    expectSecondaryRecovery(nodes);
    expect(nodes.dogStatus.textContent).toBe('DOG HUNTING DEAD');
    expect(nodes.phase.textContent).toBe('DOG HUNTING DEAD');
    expect(line.hidden).toBe(false);
    expect(line.textContent).toContain('hunting the fallen bird');
  });

  it('follows the carrier when both dogs are recovering birds', () => {
    const { nodes, line } = render([dog('retrieving', -9), dog('retrieving', 18, 3)]);
    expectSecondaryRecovery(nodes);
    expect(nodes.dogStatus.textContent).toBe('DOG RETURNING');
    expect(nodes.phase.textContent).toBe('DOG RETURNING WITH BIRD');
    expect(line.textContent).toContain('bring the bird to hand');
  });

  it('keeps a held point ahead of a separate recovery without hiding remaining downed birds', () => {
    const { nodes, line } = render([dog('pointing', -9), dog('retrieving', 18, 3)]);
    expect(nodes.dogDirection.style.transform).toBe('rotate(-90deg)');
    expect(nodes.dogDistance.textContent).toBe('10 YD');
    expect(nodes.panel.dataset.encounter).toBe('point');
    expect(nodes.phase.textContent).toMatch(/^ON POINT/);
    expect(nodes.dogStatus.textContent).toBe('DOG ON POINT');
    expect(line.textContent).toContain('Walk toward your dog');
    expect(nodes.tally.textContent).toContain('Down 2');
    expect(nodes.endButton.disabled).toBe(true);
  });
});
