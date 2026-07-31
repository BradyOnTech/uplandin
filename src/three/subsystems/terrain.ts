import * as THREE from 'three';
import type { Ctx, Subsystem } from '../engine';
import { P } from '../palette';

/*
 * TERRAIN subsystem: the ground under the hunt. Gentle rolling prairie —
 * a heightfield from layered value noise (deterministic from a fixed
 * seed), vertex-colored in palette straws so the field reads as a warm
 * patchwork quilt, Firewatch-style, with zero textures. Warm straw and
 * khaki patches, cool olive sweeps in the swales, pale sunbleached crowns
 * on the swells, and fine luminance grain so nothing reads flat.
 *
 * Other subsystems query heightAt(x, z) — the one sanctioned crossing.
 */

export const TERRAIN_SIZE = 480; // meters square (1 sim px ≈ 1 yd ≈ 0.91 m)
const SEGMENTS = 192;

/** Deterministic 2D value noise (no Math.random, no deps). */
function makeNoise(seed: number) {
  const hash = (x: number, y: number) => {
    let h = seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
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

const SKIRT_INNER = 200;
const SKIRT_OUTER = 700;

export class TerrainSystem implements Subsystem {
  readonly id = 'terrain';
  private noise = makeNoise(1971);
  private mesh?: THREE.Mesh;
  private skirt?: THREE.Mesh;
  private rocks?: THREE.InstancedMesh;
  private snags: THREE.Mesh[] = [];

  heightAt(x: number, z: number): number {
    const n1 = this.noise(x * 0.006 + 100, z * 0.006 + 100); // broad swells
    const n15 = this.noise(x * 0.016 + 1300, z * 0.016 + 1300); // rolling mid
    const n2 = this.noise(x * 0.05 + 300, z * 0.05 + 300); // local roll
    return (n1 - 0.5) * 18 + (n15 - 0.5) * 6 + (n2 - 0.5) * 1.4 + 6;
  }

  init(ctx: Ctx): void {
    const geo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, SEGMENTS, SEGMENTS);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const straw = new THREE.Color(P.straw);
    const khaki = new THREE.Color(P.khaki);
    const light = new THREE.Color(P.strawLight);
    const pale = new THREE.Color(P.strawPale);
    const olive = new THREE.Color(P.oliveMid);
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = this.heightAt(x, z);
      pos.setY(i, y);

      // Patchwork: straw base bleaching toward pale gold, patch by patch.
      // The field must read light — dark albedo turns to mud under warm
      // low light + ACES; Firewatch fields are pale straw that GLOWS.
      const patch = this.noise(x * 0.016 + 700, z * 0.016 + 700);
      tmp.copy(straw).lerp(pale, Math.min(0.85, patch * 1.1));
      // Khaki dry-dirt patches breaking the gold.
      const dry = this.noise(x * 0.021 + 4200, z * 0.021 + 4200);
      if (dry < 0.42) tmp.lerp(khaki, Math.min(0.7, (0.42 - dry) * 1.8));
      // Cool olive sweeps — the field's shadowed, damper runs.
      const cool = this.noise(x * 0.011 + 1900, z * 0.011 + 1900);
      if (cool < 0.35) tmp.lerp(olive, Math.min(0.55, (0.35 - cool) * 1.5));
      // Warm russet-tinged tall grass where the patch runs hottest.
      if (patch > 0.72) tmp.lerp(light, Math.min(1, (patch - 0.72) * 1.8));
      // Pale crowns on the high swells, damper straw in the swales.
      const hNorm = THREE.MathUtils.clamp((y - 8) / 8, 0, 1);
      tmp.lerp(pale, hNorm * 0.3);
      if (y < 2) tmp.lerp(olive, (2 - y) * 0.05);
      // Mid-scale bands (~30m) so the far field keeps painted texture
      // instead of airbrushing to bare sand at distance.
      const band = this.noise(x * 0.035 + 9000, z * 0.035 + 9000);
      if (band > 0.6) tmp.lerp(khaki, Math.min(0.5, (band - 0.6) * 1.1));
      if (band < 0.35) tmp.lerp(olive, Math.min(0.35, (0.35 - band) * 0.8));
      // Grass-stroke scale (the foreground is a handful of meters — the
      // big patches above never show there): strokes of light and khaki
      // at 3-6m so near ground reads painted, not airbrushed.
      const strokeA = this.noise(x * 0.19 + 5000, z * 0.19 + 5000);
      const strokeB = this.noise(x * 0.47 + 8000, z * 0.47 + 8000);
      if (strokeA > 0.58) tmp.lerp(light, Math.min(1, (strokeA - 0.58) * 1.0));
      if (strokeA < 0.36) tmp.lerp(khaki, Math.min(1, (0.36 - strokeA) * 1.0));
      // Fine grain: ±11% luminance jitter so nothing reads airbrushed
      // (kept modest — per-vertex jitter aliases into streaks at grazing
      // angles; the grass subsystem will carry the near-field texture).
      const g = 0.89 + strokeB * 0.22;
      tmp.r *= g;
      tmp.g *= g;
      tmp.b *= g;

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
    this.mesh = mesh;

    this.buildSkirt(ctx);
    this.buildRocks(ctx);
    this.buildSnags(ctx);
  }

  /**
   * Ground skirt: an annulus that tucks under the plate edge and runs flat
   * out beneath the ridge cards, so the world never terminates in a bare
   * plane edge with sky sparkle leaking through the terrain-to-ridge gap.
   */
  private buildSkirt(ctx: Ctx): void {
    const geo = new THREE.RingGeometry(SKIRT_INNER, SKIRT_OUTER, 128, 6);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const straw = new THREE.Color(P.straw);
    const khaki = new THREE.Color(P.khaki);
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const r = Math.hypot(x, z);
      const t = THREE.MathUtils.clamp((r - SKIRT_INNER) / 150, 0, 1);
      // Follow the heightfield (half a meter under the plate) near the rim,
      // settle to a calm plain further out.
      const y = THREE.MathUtils.lerp(this.heightAt(x, z) - 0.5, 0.8, t * t * (3 - 2 * t));
      pos.setY(i, y);
      // Muted straw — a touch darker than the plate so the fogged far plain
      // never glows like water at midday.
      const patch = this.noise(x * 0.016 + 700, z * 0.016 + 700);
      tmp.copy(straw).lerp(khaki, 0.25 + patch * 0.4).multiplyScalar(0.92);
      colors[i * 3] = tmp.r;
      colors[i * 3 + 1] = tmp.g;
      colors[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    ctx.scene.add(mesh);
    this.skirt = mesh;
  }

  /** Sparse midground rocks — a third occlusion layer between grass and ridges. */
  private buildRocks(ctx: Ctx): void {
    const COUNT = ctx.quality === 'high' ? 30 : 18;
    const geo = new THREE.DodecahedronGeometry(1, 0);
    const mat = new THREE.MeshLambertMaterial({ flatShading: true });
    const mesh = new THREE.InstancedMesh(geo, mat, COUNT);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const v = new THREE.Vector3();
    const s = new THREE.Vector3();
    const c = new THREE.Color();
    const stone = new THREE.Color(P.stoneGray);
    const warm = new THREE.Color(P.warmGray);
    for (let i = 0; i < COUNT; i++) {
      const a = ctx.rng() * Math.PI * 2;
      // Midground only — a far rock silhouetted on a swell reads as a shed.
      const d = 22 + ctx.rng() * 85;
      const x = Math.sin(a) * d;
      const z = Math.cos(a) * d;
      const sc = 0.35 + ctx.rng() * ctx.rng() * 1.6;
      e.set(ctx.rng() * Math.PI, ctx.rng() * Math.PI, ctx.rng() * Math.PI);
      q.setFromEuler(e);
      s.set(sc * (0.8 + ctx.rng() * 0.5), sc * (0.5 + ctx.rng() * 0.4), sc);
      v.set(x, this.heightAt(x, z) + sc * 0.15, z);
      mesh.setMatrixAt(i, m.compose(v, q, s));
      c.copy(stone).lerp(warm, ctx.rng() * 0.6).multiplyScalar(0.85 + ctx.rng() * 0.3);
      mesh.setColorAt(i, c);
    }
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    ctx.scene.add(mesh);
    this.rocks = mesh;
  }

  /**
   * Two lone snags — dead-tree landmarks on the hero sightlines (Firewatch
   * key art always gives the eye a destination). One sits near the evening
   * and lastlight sun notch, one off-center left for dawn-field.
   */
  private buildSnags(ctx: Ctx): void {
    const mat = new THREE.MeshLambertMaterial({ color: P.charcoal, flatShading: true });
    const spots: Array<[number, number, number]> = [
      [-70, 16, 6.8], // evening / lastlight sightline (-x from origin)
      [-26, 118, 7.6], // dawn-field sightline (+z, thirds-left)
    ];
    for (const [x, z, h] of spots) {
      const group = new THREE.BufferGeometry();
      const parts: THREE.BufferGeometry[] = [];
      const trunk = new THREE.CylinderGeometry(0.1, 0.42, h, 5, 1);
      trunk.translate(0, h / 2, 0);
      parts.push(trunk);
      const nBranch = 4;
      for (let b = 0; b < nBranch; b++) {
        const bl = 1.3 + ctx.rng() * 1.7;
        const br = new THREE.CylinderGeometry(0.05, 0.12, bl, 4, 1);
        br.translate(0, bl / 2, 0);
        br.rotateZ(0.7 + ctx.rng() * 0.7);
        br.rotateY(ctx.rng() * Math.PI * 2);
        br.translate(0, h * (0.45 + 0.13 * b), 0);
        parts.push(br);
      }
      // Merge by hand (tiny geometries, position-only attributes needed).
      let total = 0;
      for (const p of parts) total += p.attributes.position.count;
      const posArr = new Float32Array(total * 3);
      const normArr = new Float32Array(total * 3);
      const idx: number[] = [];
      let vOff = 0;
      for (const p of parts) {
        posArr.set(p.attributes.position.array as Float32Array, vOff * 3);
        normArr.set(p.attributes.normal.array as Float32Array, vOff * 3);
        const pi = p.index!;
        for (let k = 0; k < pi.count; k++) idx.push(pi.getX(k) + vOff);
        vOff += p.attributes.position.count;
        p.dispose();
      }
      group.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
      group.setAttribute('normal', new THREE.BufferAttribute(normArr, 3));
      group.setIndex(idx);
      const mesh = new THREE.Mesh(group, mat);
      mesh.position.set(x, this.heightAt(x, z) - 0.15, z);
      mesh.rotation.y = ctx.rng() * Math.PI * 2;
      mesh.castShadow = true;
      ctx.scene.add(mesh);
      this.snags.push(mesh);
    }
  }

  dispose(ctx: Ctx): void {
    if (this.mesh) {
      ctx.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      (this.mesh.material as THREE.Material).dispose();
      this.mesh = undefined;
    }
    if (this.skirt) {
      ctx.scene.remove(this.skirt);
      this.skirt.geometry.dispose();
      (this.skirt.material as THREE.Material).dispose();
      this.skirt = undefined;
    }
    if (this.rocks) {
      ctx.scene.remove(this.rocks);
      this.rocks.geometry.dispose();
      (this.rocks.material as THREE.Material).dispose();
      this.rocks.dispose();
      this.rocks = undefined;
    }
    for (const snag of this.snags) {
      ctx.scene.remove(snag);
      snag.geometry.dispose();
    }
    if (this.snags.length) (this.snags[0].material as THREE.Material).dispose();
    this.snags.length = 0;
  }
}
