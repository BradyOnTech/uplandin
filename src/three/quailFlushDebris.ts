import * as THREE from 'three';
import { mulberry32 } from '../game/math';
import type { Quality } from './engine';

interface Fragment {
  age: number; life: number;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  length: number; width: number; phase: number; spin: number;
}

/** Actual launch sites shed stems and dry leaves for a little over a second.
 * A fixed pool shares one opaque, lit mesh. Each bird has a separate cosmetic
 * seed; changing detail levels cannot change a covey's flight or launch timing.
 */
export class QuailFlushDebris {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial>;
  readonly capacity: number;
  private readonly piecesPerBird: number;
  private readonly fragments: Fragment[];
  private readonly positions: Float32Array;
  private readonly normals: Float32Array;
  private cursor = 0;
  private launchCount = 0;
  private visibleCount = 0;

  constructor(quality: Quality, private readonly ground: (x: number, z: number) => number,
    private readonly profile: 'ground' | 'tall-cover' = 'ground',
    private readonly crownHeight?: (x: number, z: number) => number) {
    this.capacity = quality === 'lite' ? 56 : 112;
    this.piecesPerBird = profile === 'tall-cover' ? (quality === 'lite' ? 8 : 14) : (quality === 'lite' ? 4 : 8);
    this.fragments = Array.from({ length: this.capacity }, () => ({
      age: -1, life: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
      length: 0, width: 0, phase: 0, spin: 0,
    }));
    this.positions = new Float32Array(this.capacity * 12);
    this.normals = new Float32Array(this.capacity * 12);
    const colors = new Float32Array(this.capacity * 12);
    const indices = new Uint16Array(this.capacity * 6);
    const tones = [0xb9a373, 0x8b8157, 0xc6af7d, 0x85724c].map(tone => new THREE.Color(tone));
    for (let i = 0; i < this.capacity; i++) {
      const color = tones[i % tones.length];
      for (let v = 0; v < 4; v++) color.toArray(colors, i * 12 + v * 3);
      indices.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('normal', new THREE.BufferAttribute(this.normals, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    const material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.name = profile === 'tall-cover' ? 'pheasant-launch-cover' : 'quail-launch-cover';
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  launch(x: number, z: number, forwardX: number, forwardZ: number, seed: number): void {
    const rng = mulberry32(seed ^ 0x7b315a);
    const base = this.ground(x, z);
    const crown = this.crownHeight?.(x, z);
    this.launchCount++;
    for (let i = 0; i < this.piecesPerBird; i++) {
      const piece = this.fragments[this.cursor];
      this.cursor = (this.cursor + 1) % this.capacity;
      const angle = rng() * Math.PI * 2;
      const outward = .35 + rng() * 1.45;
      const stem = i % 3 !== 0;
      piece.age = 0;
      piece.life = .85 + rng() * .65;
      piece.x = x + Math.cos(angle) * .12;
      const heightRoll = rng();
      piece.y = base + (this.profile === 'tall-cover'
        ? crown !== undefined && Number.isFinite(crown) ? Math.max(.12, crown) * (.65 + heightRoll * .30) : .75 + heightRoll * .5
        : .12 + heightRoll * .2);
      piece.z = z + Math.sin(angle) * .12;
      piece.vx = Math.cos(angle) * outward + forwardX * .65;
      piece.vy = 1.5 + rng() * 2.9;
      piece.vz = Math.sin(angle) * outward + forwardZ * .65;
      // Half-lengths: clipped stalks are 9–21 cm, leaves are 4–9 cm.
      piece.length = stem ? .045 + rng() * .060 : .022 + rng() * .023;
      if (this.profile === 'tall-cover') piece.length *= 1.8;
      piece.width = stem ? .002 + rng() * .002 : .006 + rng() * .004;
      if (this.profile === 'tall-cover') piece.width *= 1.4;
      piece.phase = rng() * Math.PI * 2;
      piece.spin = (rng() < .5 ? -1 : 1) * (4 + rng() * 5);
    }
  }

  advance(dtMs: number): void {
    for (const piece of this.fragments) {
      if (piece.age < 0) continue;
      piece.age += dtMs / 1000;
      if (piece.age >= piece.life) piece.age = -1;
    }
  }

  render(): void {
    let visible = 0;
    for (const piece of this.fragments) {
      if (piece.age < 0) continue;
      const t = piece.age;
      const travel = (1 - Math.exp(-t * 1.8)) / 1.8;
      const x = piece.x + piece.vx * travel;
      const z = piece.z + piece.vz * travel;
      const ground = this.ground(x, z) + .025;
      const fallY = piece.y + piece.vy * t - 3.8 * t * t;
      const y = Math.max(ground, fallY);
      const shrink = Math.min(1, (piece.life - t) / .25);
      const azimuth = piece.phase + t * piece.spin;
      const pitch = fallY < ground ? Math.PI * .5 : piece.phase * .7 + t * piece.spin * .6;
      const axisX = Math.cos(azimuth) * Math.sin(pitch);
      const axisY = Math.cos(pitch);
      const axisZ = Math.sin(azimuth) * Math.sin(pitch);
      const sideX = Math.sin(azimuth), sideZ = -Math.cos(azimuth);
      const lx = axisX * piece.length * shrink, ly = axisY * piece.length * shrink, lz = axisZ * piece.length * shrink;
      const wx = sideX * piece.width * shrink, wz = sideZ * piece.width * shrink;
      const o = visible * 12;
      const p = this.positions;
      p[o] = x - lx; p[o + 1] = y - ly; p[o + 2] = z - lz;
      p[o + 3] = x + wx; p[o + 4] = y; p[o + 5] = z + wz;
      p[o + 6] = x + lx; p[o + 7] = y + ly; p[o + 8] = z + lz;
      p[o + 9] = x - wx; p[o + 10] = y; p[o + 11] = z - wz;
      // Analytic unit normal; no geometry allocations or face-normal rebuilds.
      const nx = -axisY * sideZ, ny = axisX * sideZ - axisZ * sideX, nz = axisY * sideX;
      for (let v = 0; v < 4; v++) {
        this.normals[o + v * 3] = nx;
        this.normals[o + v * 3 + 1] = ny;
        this.normals[o + v * 3 + 2] = nz;
      }
      visible++;
    }
    this.visibleCount = visible;
    this.mesh.visible = visible > 0;
    this.mesh.geometry.setDrawRange(0, visible * 6);
    if (visible) {
      this.mesh.geometry.attributes.position.needsUpdate = true;
      this.mesh.geometry.attributes.normal.needsUpdate = true;
    }
  }

  audit(): { launches: number; visible: number; capacity: number } {
    return { launches: this.launchCount, visible: this.visibleCount, capacity: this.capacity };
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
