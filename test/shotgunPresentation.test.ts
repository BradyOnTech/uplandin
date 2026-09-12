import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createSportingShotgun } from '../src/three/assets/shotgun';

describe('sporting shotgun presentation', () => {
  it('cycles the pump and support grip from the shot event even when recoil samples are zero', () => {
    for (const fps of [10, 30, 60, 120]) {
      const model = createSportingShotgun('pump');
      const fore = model.root.getObjectByName('Walnut forend')!;
      const hand = model.root.getObjectByName('Left glove and canvas cuff')!;
      model.fire();
      let maximum = 0;
      for (let i = 0; i < fps / 2; i++) {
        model.update(0, 0, 0, 0, 1 / fps);
        maximum = Math.max(maximum, fore.position.z);
        expect(hand.position.z).toBeCloseTo(fore.position.z, 10);
      }
      expect(maximum).toBeGreaterThan(.07);
      expect(fore.position.z).toBeCloseTo(0, 10);
      model.dispose();
    }
  });

  it.each(['pump', 'semi-auto'] as const)('holds loading shells in a dedicated grip and returns to ready within the existing %s budget', action => {
    const model = createSportingShotgun(action);
    const support = model.root.getObjectByName('Left glove and canvas cuff')!;
    const loading = model.root.getObjectByName('Loading grip')!;
    const shell = model.root.getObjectByName('Visible loading shell')!;
    for (const missing of [1, 2, 3]) {
      const duration = .55 + missing * .38;
      for (let i = 0; i < missing; i++) {
        model.update(.55 + (i + .6) * .38, duration, missing, 0, 0);
        expect(support.visible).toBe(false);
        expect(loading.visible).toBe(true);
        expect(shell.visible).toBe(true);
        expect(shell.parent).toBe(loading);
        const stats = { draws: 0, triangles: 0 };
        model.root.traverseVisible(o => {
          if (o instanceof THREE.Mesh) {
            stats.draws++;
            stats.triangles += (o.geometry.index?.count ?? o.geometry.getAttribute('position').count) / 3;
          }
        });
        expect(stats.draws).toBeLessThanOrEqual(18);
        expect(stats.triangles).toBeLessThanOrEqual(3300);
      }
      model.update(duration - .04, duration, missing, 0, 0);
      expect(support.visible).toBe(true);
      expect(loading.visible).toBe(false);
      const returningDistance = support.position.length();
      model.update(duration - .01, duration, missing, 0, 0);
      expect(support.position.length()).toBeLessThan(returningDistance);
      model.update(0, 0, 0, 0, 0);
      expect(support.visible).toBe(true);
      expect(loading.visible).toBe(false);
      expect(support.position.length()).toBe(0);
    }
    model.dispose();
  });
});
