import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildBobwhiteBody, buildBobwhiteWing, poseBobwhiteFoldedWings } from '../src/three/assets/bobwhite';

describe('retrieved bobwhite silhouette', () => {
  it('keeps the actual folded wing geometry beside the torso and below the crown', () => {
    const body = buildBobwhiteBody();
    body.computeBoundingBox();
    const left = new THREE.Group();
    const right = new THREE.Group();
    left.position.set(-0.03, 0.016, 0.028);
    right.position.set(0.03, 0.016, 0.028);
    poseBobwhiteFoldedWings(left, right);
    const bounds: THREE.Box3[] = [];
    for (const [side, group] of [[-1, left], [1, right]] as const) {
      const geometry = buildBobwhiteWing(side);
      group.updateMatrix();
      geometry.applyMatrix4(group.matrix);
      geometry.computeBoundingBox();
      const box = geometry.boundingBox!;
      // A folded wing must not project above the entire head like a raised flight wing.
      expect(box.max.y).toBeLessThan(body.boundingBox!.max.y);
      // The span lies aft of the shoulder, along the body, instead of above it.
      expect(box.min.z).toBeLessThan(-0.08);
      expect(box.max.z).toBeLessThan(0.045);
      expect(Math.max(Math.abs(box.min.x), Math.abs(box.max.x))).toBeLessThan(0.065);
      bounds.push(box.clone());
      geometry.dispose();
    }
    expect(bounds[0].min.x).toBeCloseTo(-bounds[1].max.x, 6);
    expect(bounds[0].max.y).toBeCloseTo(bounds[1].max.y, 6);
    expect(bounds[0].min.z).toBeCloseTo(bounds[1].min.z, 6);
    body.dispose();
  });
});
