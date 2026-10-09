import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CoverEruption } from '../src/three/coverEruption';

const footprint = (n: number) => Array.from({ length: n }, (_, i) => ({ x: 20 + (i % 4) * .9, z: 5 + Math.floor(i / 4) * .8 }));
const burst = (birds: number, seed = 3) => ({ footprint: footprint(birds), birds, windX: .5, windZ: 0, seed });

/** The live puffs' world centres and scales, read back off the instances. */
function puffs(eruption: CoverEruption) {
  const out: { position: THREE.Vector3; radius: number }[] = [], matrix = new THREE.Matrix4();
  for (let i = 0; i < eruption.puffMesh.count; i++) {
    eruption.puffMesh.getMatrixAt(i, matrix);
    const position = new THREE.Vector3(), quaternion = new THREE.Quaternion(), scale = new THREE.Vector3();
    matrix.decompose(position, quaternion, scale);
    if (scale.z > 1e-6) out.push({ position, radius: scale.z });
  }
  return out;
}

describe('the covey eruption', () => {
  it('throws more dust and chaff for a bigger covey, fewer and larger puffs on Lightweight', () => {
    const five = CoverEruption.size(5, 'high'), twelve = CoverEruption.size(12, 'high');
    expect(twelve.puffs).toBeGreaterThan(five.puffs + 5); expect(twelve.flakes).toBeGreaterThan(five.flakes);
    expect(CoverEruption.size(12, 'lite').puffs).toBeLessThan(twelve.puffs);
    const radius = (quality: 'high' | 'lite') => {
      const eruption = new CoverEruption(quality, () => 0, 'quail-fields');
      eruption.erupt(burst(8)); eruption.advance(400); eruption.render();
      return Math.max(...puffs(eruption).map(p => p.radius));
    };
    expect(radius('lite')).toBeGreaterThan(radius('high'));
  });

  it('blooms big enough to read at 30 m on a phone, over the covey\'s own footprint, then clears', () => {
    const eruption = new CoverEruption('lite', () => 0, 'sharptail-prairie');
    eruption.erupt(burst(10));
    eruption.advance(400); eruption.render();
    const live = puffs(eruption);
    expect(live.length).toBe(CoverEruption.size(10, 'lite').puffs);
    // A puff of radius r spans 2r: at 30 m on an 844x390 screen (70 degree view) that is
    // 2r * 390 / (2 tan 35 * 30) px; ten pixels needs r of about 0.54 m.
    const pxAt30 = (r: number) => 2 * r * 390 / (2 * Math.tan(35 * Math.PI / 180) * 30);
    expect(live.filter(p => pxAt30(p.radius) >= 10).length).toBeGreaterThan(live.length / 2);
    for (const p of live) {
      const near = Math.min(...footprint(10).map(spot => Math.hypot(p.position.x - spot.x, p.position.z - spot.z)));
      expect(near).toBeLessThan(2.5);
      expect(p.position.y).toBeGreaterThan(0);
    }
    // Dust, not stone: it starts half see-through and thins as it spreads.
    const early = eruption.opacity(0);
    expect(early).toBeGreaterThan(.25); expect(early).toBeLessThan(.7);
    eruption.advance(800); eruption.render();
    expect(eruption.opacity(0)).toBeLessThan(early);
    for (let t = 0; t < 2600; t += 1000 / 30) eruption.advance(1000 / 30);
    eruption.render();
    expect(eruption.puffMesh.visible).toBe(false); expect(eruption.audit().puffs).toBe(0);
  });

  it('settles its chaff on the ground and keeps to two draws with no glow', () => {
    const eruption = new CoverEruption('high', () => .3, 'pheasant-coverts');
    eruption.erupt(burst(6)); eruption.advance(200); eruption.render();
    expect(eruption.chaffMesh.count).toBeGreaterThan(0);
    for (let t = 0; t < 1500; t += 1000 / 30) eruption.advance(1000 / 30);
    eruption.render();
    const matrix = new THREE.Matrix4(), position = new THREE.Vector3();
    for (let i = 0; i < eruption.chaffMesh.count; i++) {
      eruption.chaffMesh.getMatrixAt(i, matrix); position.setFromMatrixPosition(matrix);
      if (position.lengthSq() > 0) expect(position.y).toBeGreaterThanOrEqual(.3);
    }
    for (const mesh of [eruption.puffMesh, eruption.chaffMesh]) {
      expect((mesh.material as THREE.MeshLambertMaterial).emissive.getHex()).toBe(0);
    }
    eruption.dispose();
  });

  it('is the same burst for the same seed', () => {
    const run = () => { const e = new CoverEruption('high', () => 0, 'chukar-ridge'); e.erupt(burst(7, 11)); e.advance(500); e.render(); return puffs(e).map(p => p.position.toArray()); };
    expect(run()).toEqual(run());
  });
});
