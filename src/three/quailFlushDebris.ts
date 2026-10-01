import * as THREE from 'three';
import { mulberry32 } from '../game/math';
import type { Quality } from './engine';

interface Fragment {
  age: number; life: number;
  r: number; g: number; b: number;
  /** Feathers and snow float down; stems drop. */
  gravity: number;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  length: number; width: number; phase: number; spin: number;
}

/** Actual launch sites shed stems and dry leaves for a little over a second.
 * A fixed pool shares one opaque, lit mesh. Each bird has a separate cosmetic
 * seed; changing detail levels cannot change a covey's flight or launch timing.
 */
export interface LaunchBlast {
  /** Close-flush intensity, 0..1: more cover thrown higher and wider. */
  intensity?: number;
  /** Snow on the ground: the burst is a white puff. */
  snow?: boolean;
  /** Loose body feathers knocked out on the way up, and their colour. */
  feathers?: number;
  featherColor?: number;
}

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
  private readonly colors: Float32Array;
  private readonly tones: THREE.Color[];
  private readonly snowTones = [0xf3f5f7, 0xe3e8ee, 0xd8dee6].map(tone => new THREE.Color(tone));
  private readonly feather = new THREE.Color();

  constructor(quality: Quality, private readonly ground: (x: number, z: number) => number,
    private readonly profile: 'ground' | 'tall-cover' = 'ground',
    private readonly crownHeight?: (x: number, z: number) => number) {
    this.capacity = quality === 'lite' ? 84 : 176;
    this.piecesPerBird = profile === 'tall-cover' ? (quality === 'lite' ? 8 : 14) : (quality === 'lite' ? 4 : 8);
    this.fragments = Array.from({ length: this.capacity }, () => ({
      age: -1, life: 1, r: 1, g: 1, b: 1, gravity: 3.8, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
      length: 0, width: 0, phase: 0, spin: 0,
    }));
    this.positions = new Float32Array(this.capacity * 12);
    this.normals = new Float32Array(this.capacity * 12);
    const colors = this.colors = new Float32Array(this.capacity * 12);
    const indices = new Uint16Array(this.capacity * 6);
    this.tones = [0xb9a373, 0x8b8157, 0xc6af7d, 0x85724c].map(tone => new THREE.Color(tone));
    for (let i = 0; i < this.capacity; i++) indices.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('normal', new THREE.BufferAttribute(this.normals, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    const material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.name = profile === 'tall-cover' ? 'pheasant-launch-cover' : 'quail-launch-cover';
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  launch(x: number, z: number, forwardX: number, forwardZ: number, seed: number, blast: LaunchBlast = {}): void {
    const rng = mulberry32(seed ^ 0x7b315a);
    const base = this.ground(x, z);
    const crown = this.crownHeight?.(x, z);
    const power = Math.max(0, Math.min(1, blast.intensity ?? 0));
    this.launchCount++;
    // A bird erupting at the hunter's feet throws three times the cover.
    const count = Math.min(this.capacity >> 1, Math.round(this.piecesPerBird * (1 + power * 2)));
    const feathers = Math.max(0, Math.round(blast.feathers ?? 0));
    if (blast.featherColor !== undefined) this.feather.setHex(blast.featherColor);
    for (let i = 0; i < count + feathers; i++) {
      const isFeather = i >= count;
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
      piece.vx = Math.cos(angle) * outward * (1 + power * .5) + forwardX * .65;
      piece.vy = (1.5 + rng() * 2.9) * (1 + power * .55);
      piece.vz = Math.sin(angle) * outward * (1 + power * .5) + forwardZ * .65;
      const tone = blast.snow ? this.snowTones[i % this.snowTones.length] : this.tones[i % this.tones.length];
      piece.r = tone.r; piece.g = tone.g; piece.b = tone.b;
      piece.gravity = blast.snow ? 2.2 : 3.8;
      // Half-lengths: clipped stalks are 9–21 cm, leaves are 4–9 cm.
      piece.length = stem ? .045 + rng() * .060 : .022 + rng() * .023;
      if (this.profile === 'tall-cover') piece.length *= 1.8;
      piece.width = stem ? .002 + rng() * .002 : .006 + rng() * .004;
      if (this.profile === 'tall-cover') piece.width *= 1.4;
      if (blast.snow) { piece.width = piece.length * (.5 + rng() * .4); piece.life *= .8; }
      piece.phase = rng() * Math.PI * 2;
      piece.spin = (rng() < .5 ? -1 : 1) * (4 + rng() * 5);
      if (isFeather) {
        // A body feather knocked loose, rocking down slowly in the bird's wake.
        piece.y = base + .9 + rng() * .8;
        piece.vx = forwardX * (.4 + rng() * .6) + (rng() - .5) * .6;
        piece.vy = .4 + rng() * .5;
        piece.vz = forwardZ * (.4 + rng() * .6) + (rng() - .5) * .6;
        piece.length = .035 + rng() * .02; piece.width = .012 + rng() * .006;
        piece.life = 2.2 + rng() * .8; piece.gravity = .55;
        piece.spin = (rng() < .5 ? -1 : 1) * (1.5 + rng() * 2);
        piece.r = this.feather.r; piece.g = this.feather.g; piece.b = this.feather.b;
      }
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
      const fallY = piece.y + piece.vy * t - piece.gravity * t * t;
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
        this.colors[o + v * 3] = piece.r; this.colors[o + v * 3 + 1] = piece.g; this.colors[o + v * 3 + 2] = piece.b;
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
      this.mesh.geometry.attributes.color.needsUpdate = true;
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
