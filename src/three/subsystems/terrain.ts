import * as THREE from 'three';
import type { Ctx, Subsystem } from '../engine';
import { P } from '../palette';

/*
 * TERRAIN subsystem: the ground under the hunt. Gentle rolling prairie —
 * a heightfield from layered value noise (deterministic from ctx.rng seed
 * fixed at build), vertex-colored in palette straws so distance reads as
 * soft banded color, Firewatch-style, with zero textures.
 *
 * Other subsystems query heightAt(x, z) — the one sanctioned crossing.
 */

export const TERRAIN_SIZE = 480; // meters square (1 sim px ≈ 1 yd ≈ 0.91 m)
const SEGMENTS = 192;

/** Deterministic 2D value noise (no Math.random, no deps). */
function makeNoise(seed: number) {
  const hash = (x: number, y: number) => {
    let h = seed ^ (x * 374761393) ^ (y * 668265263);
    h = (h ^ (h >> 13)) * 1274126177;
    return ((h ^ (h >> 16)) >>> 0) / 4294967295;
  };
  const smooth = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number): number => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = smooth(x - xi);
    const yf = smooth(y - yi);
    const a = hash(xi, yi);
    const b = hash(xi + 1, yi);
    const c = hash(xi, yi + 1);
    const d = hash(xi + 1, yi + 1);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
}

export class TerrainSystem implements Subsystem {
  readonly id = 'terrain';
  private noise = makeNoise(1971);

  heightAt(x: number, z: number): number {
    const n1 = this.noise(x * 0.008 + 100, z * 0.008 + 100); // broad swells
    const n2 = this.noise(x * 0.03 + 300, z * 0.03 + 300); // local roll
    return n1 * 6 + n2 * 1.2;
  }

  init(ctx: Ctx): void {
    const geo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, SEGMENTS, SEGMENTS);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const straw = new THREE.Color(P.straw);
    const khaki = new THREE.Color(P.khaki);
    const pale = new THREE.Color(P.strawLight);
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = this.heightAt(x, z);
      pos.setY(i, y);
      // Color by a second noise channel: dry-grass patchwork, not stripes.
      const c = this.noise(x * 0.02 + 700, z * 0.02 + 700);
      tmp.copy(khaki).lerp(straw, Math.min(1, c * 1.4));
      if (c > 0.72) tmp.lerp(pale, (c - 0.72) * 1.8);
      colors[i * 3] = tmp.r;
      colors[i * 3 + 1] = tmp.g;
      colors[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    ctx.scene.add(mesh);
  }
}
