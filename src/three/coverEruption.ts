import * as THREE from 'three';
import { mulberry32 } from '../game/math';
import type { Quality } from './engine';

/**
 * The visual half of "the whole covey goes" (the wing thunder is the other):
 * when a covey flushes, its cover blows out across the whole footprint in a
 * burst of dust and chaff that reads at 20–40 m on both tiers.
 *
 * Low-poly and lit like the ground it came from, no glow: soft dust puffs
 * (one instanced, translucent icosahedron whose edges thin to nothing, so a
 * puff reads as a cloud and never as a stone) are thrown up out of the cover
 * where each bird sat and billow out along the ground round them, thinning
 * as they spread and drift down the wind, while seed heads, stems and leaf
 * thrown from the cover flutter down through it. The size of the burst
 * follows the covey: a twelve-bird covey throws visibly more than five.
 * Two draws in all; Lightweight throws fewer, larger pieces.
 */

/** Dust puffs per covey: a few for the cover itself, more for every bird. */
const PUFFS_BASE = 3;
const PUFFS_PER_BIRD = 1.6;
const PUFFS_MAX = { high: 30, lite: 18 } as const;
/** Share of puffs thrown up out of the cover in a column; the rest billow low. */
const PLUME_SHARE = .55;
/** Chaff flakes thrown per bird. */
const CHAFF_PER_BIRD = { high: 12, lite: 6 } as const;
const CHAFF_MAX = { high: 140, lite: 70 } as const;
/** Dust starts this opaque at its heart and thins to nothing as it spreads. */
const DUST_OPACITY = .62;
/** Dust is a little paler than the ground it lifts from: mixed this far toward haze. */
const DUST_PALE = .2;
const HAZE = 0xede7d7;

/** Each ground's dust: lighter than its soil, the colour of its cover's seed. */
const DUST: Readonly<Record<string, readonly [number, number]>> = {
  'quail-fields': [0xc99c74, 0xb98660],
  'sharptail-prairie': [0xd0bb8f, 0xbfa979],
  'pheasant-coverts': [0xd6c69a, 0xc3b083],
  'chukar-ridge': [0xdacdad, 0xc8b892],
};
const DUST_DEFAULT: readonly [number, number] = [0xcdb98f, 0xbaa67c];
const SNOW: readonly [number, number] = [0xf1f4f7, 0xdfe5ec];
/** Straw, seed and leaf: light enough never to read as a dark speck (a bird) at range. */
const CHAFF_TONES = [0xeadbab, 0xdcc48c, 0xcaae74, 0xb89c62];
/** Cattail and reed: pale seed fluff and broken blade. */
const REED_TONES = [0xe6dcc0, 0xc9b98a, 0xa9a46e, 0x8d8a5a];
/** Water thrown up: pale, catching the sky. */
const WATER_TONES = [0xeef4f6, 0xd6e2e8, 0xc4d4dc];

/** Where a shot bird strikes: open ground, cattails and heavy reeds, or water. */
export type ImpactSurface = 'ground' | 'reeds' | 'water';

interface Puff {
  age: number; life: number;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  radius: number; spin: number; grow: number;
}
interface Flake {
  age: number; life: number;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  size: number; phase: number; spin: number;
  /** A water drop falls fast and is gone where it lands; chaff flutters and lies. */
  drop: boolean;
}

export interface EruptionBurst {
  /** Where the covey's birds sat, world metres. */
  footprint: readonly { x: number; z: number }[];
  /** Birds in the covey: the burst is sized to all of them. */
  birds: number;
  /** The hunt's wind, the way it blows (unit-ish), in metres a second. */
  windX: number; windZ: number;
  seed: number;
  /** Close-flush intensity, 0..1: sat on underfoot, the cover blows higher. */
  intensity?: number;
  snow?: boolean;
}

export class CoverEruption {
  readonly puffMesh: THREE.InstancedMesh;
  readonly chaffMesh: THREE.InstancedMesh;
  private readonly puffs: Puff[];
  private readonly flakes: Flake[];
  private puffCursor = 0;
  private flakeCursor = 0;
  private readonly tones: readonly [number, number];
  private readonly matrix = new THREE.Matrix4();
  private readonly quat = new THREE.Quaternion();
  private readonly euler = new THREE.Euler();
  private readonly scale = new THREE.Vector3();
  private readonly pos = new THREE.Vector3();
  private readonly color = new THREE.Color();
  private readonly scratch = new THREE.Color();
  private readonly lite: boolean;
  private readonly alpha: THREE.InstancedBufferAttribute;
  private bursts = 0;

  constructor(quality: Quality, private readonly ground: (x: number, z: number) => number, groundId: string,
    private readonly crown: (x: number, z: number) => number = () => .45) {
    this.lite = quality === 'lite';
    const puffMax = PUFFS_MAX[this.lite ? 'lite' : 'high'], chaffMax = CHAFF_MAX[this.lite ? 'lite' : 'high'];
    this.tones = DUST[groundId] ?? DUST_DEFAULT;
    const puffGeometry = new THREE.IcosahedronGeometry(1, 1);
    this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(puffMax), 1);
    this.alpha.setUsage(THREE.DynamicDrawUsage);
    puffGeometry.setAttribute('instanceAlpha', this.alpha);
    const material = new THREE.MeshLambertMaterial({ transparent: true, depthWrite: false });
    // Each puff thins on its own clock (a per-instance opacity), and its
    // edges thin to nothing where the surface turns away from the eye, so a
    // puff has no hard outline: dust, not a stone. (It only ever lowers
    // opacity: no rim light, no glow.) It takes its light mostly as the
    // ground under it does.
    material.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float instanceAlpha;\nvarying float vInstanceAlpha;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvInstanceAlpha = instanceAlpha;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vInstanceAlpha;')
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vInstanceAlpha;')
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n'
          + 'diffuseColor.a *= smoothstep(.08, .8, abs(dot(normal, normalize(vViewPosition))));\n'
          // Lit like the ground it rose from, with a little of its own form:
          // a puff seen against the sun must not turn to dark smoke.
          + 'normal = normalize(mix((viewMatrix * vec4(0., 1., 0., 0.)).xyz, normal, .35));');
    };
    this.puffMesh = new THREE.InstancedMesh(puffGeometry, material, puffMax);
    const chaffGeometry = new THREE.PlaneGeometry(1, .55);
    const chaffMaterial = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
    // Straw turned edge-on or against the sun must not go black: lit mostly
    // as the ground is.
    chaffMaterial.onBeforeCompile = shader => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>',
        '#include <normal_fragment_maps>\nnormal = normalize(mix((viewMatrix * vec4(0., 1., 0., 0.)).xyz, normal, .3));');
    };
    this.chaffMesh = new THREE.InstancedMesh(chaffGeometry, chaffMaterial, chaffMax);
    for (const mesh of [this.puffMesh, this.chaffMesh]) {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.castShadow = mesh.receiveShadow = false;
      mesh.count = 0;
      mesh.visible = false;
      mesh.name = mesh === this.puffMesh ? 'covey-eruption-dust' : 'covey-eruption-chaff';
    }
    this.puffs = Array.from({ length: puffMax }, () => ({ age: -1, life: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, radius: 1, spin: 0, grow: .35 }));
    this.flakes = Array.from({ length: chaffMax }, () => ({ age: -1, life: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: .1, phase: 0, spin: 0, drop: false }));
    // Colour every slot once; a burst only recolours the slots it takes.
    for (let i = 0; i < puffMax; i++) this.puffMesh.setColorAt(i, this.color.setHex(this.tones[0]));
    for (let i = 0; i < chaffMax; i++) this.chaffMesh.setColorAt(i, this.color.setHex(CHAFF_TONES[i % CHAFF_TONES.length]));
  }

  /** How many puffs and flakes a covey of `birds` throws on this tier. */
  static size(birds: number, quality: Quality): { puffs: number; flakes: number } {
    const tier = quality === 'lite' ? 'lite' : 'high';
    return {
      puffs: Math.min(PUFFS_MAX[tier], Math.round(PUFFS_BASE + PUFFS_PER_BIRD * Math.max(1, birds) * (tier === 'lite' ? .6 : 1))),
      flakes: Math.min(CHAFF_MAX[tier], Math.round(CHAFF_PER_BIRD[tier] * Math.max(1, birds))),
    };
  }

  erupt(burst: EruptionBurst): void {
    if (burst.footprint.length === 0) return;
    this.bursts++;
    const rng = mulberry32(burst.seed ^ 0x3e8b21);
    const power = 1 + .5 * Math.max(0, Math.min(1, burst.intensity ?? 0));
    const { puffs, flakes } = CoverEruption.size(burst.birds, this.lite ? 'lite' : 'high');
    const tones = burst.snow ? SNOW : this.tones;
    const spot = () => burst.footprint[Math.floor(rng() * burst.footprint.length) % burst.footprint.length];
    for (let i = 0; i < puffs; i++) {
      const at = spot(), puff = this.puffs[this.puffCursor];
      const index = this.puffCursor;
      this.puffCursor = (this.puffCursor + 1) % this.puffs.length;
      // A column thrown up out of the cover where a bird burst from it, or a
      // low billow rolling out along the ground round the covey.
      const plume = rng() < PLUME_SHARE;
      const angle = rng() * Math.PI * 2, out = plume ? .2 + rng() * .4 : .6 + rng() * .8;
      puff.age = 0; puff.life = (plume ? 1.5 : 1.8) + rng() * .8;
      const spread = plume ? .4 : .9;
      puff.x = at.x + Math.cos(angle) * rng() * spread; puff.z = at.z + Math.sin(angle) * rng() * spread;
      puff.y = this.ground(puff.x, puff.z) + Math.max(.2, this.crown(puff.x, puff.z)) * (.5 + rng() * .4);
      puff.vx = Math.cos(angle) * out + burst.windX; puff.vz = Math.sin(angle) * out + burst.windZ;
      puff.vy = (plume ? 2.2 + rng() * 1.6 : .3 + rng() * .4) * power;
      // Lightweight throws fewer, larger puffs: the same read for less.
      puff.radius = (plume ? .5 + rng() * .3 : .7 + rng() * .4) * (this.lite ? 1.3 : 1) * Math.sqrt(power);
      puff.grow = plume ? .9 : .45;
      puff.spin = (rng() - .5) * 1.4;
      this.color.setHex(tones[0]).lerp(this.scratch.setHex(tones[1]), rng()).lerp(this.scratch.setHex(burst.snow ? tones[0] : HAZE), DUST_PALE);
      this.puffMesh.setColorAt(index, this.color);
    }
    for (let i = 0; i < flakes; i++) {
      const at = spot(), flake = this.flakes[this.flakeCursor];
      const index = this.flakeCursor;
      this.flakeCursor = (this.flakeCursor + 1) % this.flakes.length;
      const angle = rng() * Math.PI * 2, out = 1 + rng() * 1.6;
      flake.age = 0; flake.life = 1.6 + rng() * .9;
      flake.x = at.x; flake.z = at.z;
      flake.y = this.ground(at.x, at.z) + Math.max(.2, this.crown(at.x, at.z)) * .8;
      flake.vx = Math.cos(angle) * out + burst.windX * .8; flake.vz = Math.sin(angle) * out + burst.windZ * .8;
      flake.vy = (2 + rng() * 2.4) * power;
      flake.size = (.12 + rng() * .1) * (this.lite ? 1.5 : 1);
      flake.phase = rng() * Math.PI * 2; flake.spin = (rng() < .5 ? -1 : 1) * (5 + rng() * 6);
      flake.drop = false;
      const tone = burst.snow ? SNOW[i % 2] : CHAFF_TONES[Math.floor(rng() * CHAFF_TONES.length) % CHAFF_TONES.length];
      this.chaffMesh.setColorAt(index, this.color.setHex(tone));
    }
    for (const mesh of [this.puffMesh, this.chaffMesh]) if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  /**
   * A shot bird striking the ground where it fell: a small burst of dust and
   * stems off open ground, seed fluff and broken blade out of cattails, or
   * water thrown up. `scale` is the bird's own readability enlargement at
   * that range, so the strike reads as far off as the bird does.
   */
  impact(at: { x: number; z: number }, surface: ImpactSurface, scale: number, seed: number): void {
    this.bursts++;
    const rng = mulberry32((seed ^ 0x1f2e3d) >>> 0), k = Math.max(1, scale) * (this.lite ? 1.25 : 1);
    const groundY = this.ground(at.x, at.z);
    const puffs = surface === 'ground' ? 3 : surface === 'reeds' ? 1 : 0;
    for (let i = 0; i < puffs; i++) {
      const puff = this.puffs[this.puffCursor], index = this.puffCursor;
      this.puffCursor = (this.puffCursor + 1) % this.puffs.length;
      const angle = rng() * Math.PI * 2, out = .3 + rng() * .5;
      puff.age = 0; puff.life = .9 + rng() * .5;
      puff.x = at.x + Math.cos(angle) * .1 * k; puff.z = at.z + Math.sin(angle) * .1 * k; puff.y = groundY + .05;
      puff.vx = Math.cos(angle) * out; puff.vz = Math.sin(angle) * out; puff.vy = .5 + rng() * .5;
      puff.radius = (.16 + rng() * .1) * k; puff.grow = .5; puff.spin = (rng() - .5) * 1.4;
      const tones = this.tones;
      this.color.setHex(tones[0]).lerp(this.scratch.setHex(tones[1]), rng()).lerp(this.scratch.setHex(HAZE), DUST_PALE);
      this.puffMesh.setColorAt(index, this.color);
    }
    const flakes = surface === 'water' ? 14 : surface === 'reeds' ? 12 : 7;
    const palette = surface === 'water' ? WATER_TONES : surface === 'reeds' ? REED_TONES : CHAFF_TONES;
    for (let i = 0; i < flakes; i++) {
      const flake = this.flakes[this.flakeCursor], index = this.flakeCursor;
      this.flakeCursor = (this.flakeCursor + 1) % this.flakes.length;
      const angle = rng() * Math.PI * 2, out = (surface === 'water' ? .5 : .8) + rng() * 1.2;
      flake.age = 0; flake.life = surface === 'water' ? 1.2 : 1.3 + rng() * .7;
      flake.x = at.x; flake.z = at.z; flake.y = groundY + .08;
      flake.vx = Math.cos(angle) * out; flake.vz = Math.sin(angle) * out;
      flake.vy = surface === 'water' ? 2.4 + rng() * 2 : 1.4 + rng() * 1.8;
      flake.size = (surface === 'water' ? .06 + rng() * .05 : .07 + rng() * .06) * k;
      flake.phase = rng() * Math.PI * 2; flake.spin = (rng() < .5 ? -1 : 1) * (5 + rng() * 6);
      flake.drop = surface === 'water';
      this.chaffMesh.setColorAt(index, this.color.setHex(palette[Math.floor(rng() * palette.length) % palette.length]));
    }
    for (const mesh of [this.puffMesh, this.chaffMesh]) if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  /** Fixed-tick motion: puffs bloom, rise and drift, slowing; chaff flutters down. */
  advance(dtMs: number): void {
    const dt = dtMs / 1000;
    for (const puff of this.puffs) {
      if (puff.age < 0) continue;
      puff.age += dt;
      if (puff.age >= puff.life) { puff.age = -1; continue; }
      const drag = Math.exp(-dt * 1.6);
      puff.vx *= drag; puff.vz *= drag; puff.vy = puff.vy * Math.exp(-dt * 2.2) - .15 * dt;
      puff.x += puff.vx * dt; puff.y += puff.vy * dt; puff.z += puff.vz * dt;
    }
    for (const flake of this.flakes) {
      if (flake.age < 0) continue;
      flake.age += dt;
      if (flake.age >= flake.life) { flake.age = -1; continue; }
      const drag = Math.exp(-dt * 2.4);
      flake.vx *= drag; flake.vz *= drag;
      // Light chaff: a quick climb, then a slow flutter down (terminal ~0.9 m/s);
      // a drop of water falls as a drop does and is gone where it lands.
      flake.vy = flake.drop ? flake.vy - 9.8 * dt : Math.max(-.9, flake.vy - 6 * dt);
      flake.x += flake.vx * dt; flake.y += flake.vy * dt; flake.z += flake.vz * dt;
      const ground = this.ground(flake.x, flake.z) + .02;
      if (flake.y < ground && flake.drop) { flake.age = -1; continue; }
      if (flake.y < ground) { flake.y = ground; flake.vx = flake.vz = flake.vy = 0; }
    }
  }

  /** Write the live instances: puffs bloom in fast, hold, then shrink away. */
  render(): void {
    let puffs = 0;
    for (let i = 0; i < this.puffs.length; i++) {
      const puff = this.puffs[i];
      if (puff.age < 0) { this.matrix.makeScale(0, 0, 0); this.puffMesh.setMatrixAt(i, this.matrix); this.alpha.setX(i, 0); continue; }
      // It billows out fast, then keeps spreading as it thins away.
      const u = puff.age / puff.life;
      const r = puff.radius * (.3 + .7 * (1 - Math.pow(1 - Math.min(1, u / .3), 2)) + puff.grow * u);
      this.pos.set(puff.x, puff.y + r * .3, puff.z);
      this.quat.setFromEuler(this.euler.set(.2, puff.spin * puff.age + puff.radius * 3, .1));
      this.scale.set(r * 1.2, r * .75, r);
      this.matrix.compose(this.pos, this.quat, this.scale);
      this.puffMesh.setMatrixAt(i, this.matrix);
      this.alpha.setX(i, DUST_OPACITY * Math.min(1, u / .08) * Math.pow(1 - u, 1.4));
      puffs = i + 1;
    }
    let flakes = 0;
    for (let i = 0; i < this.flakes.length; i++) {
      const flake = this.flakes[i];
      if (flake.age < 0) { this.matrix.makeScale(0, 0, 0); this.chaffMesh.setMatrixAt(i, this.matrix); continue; }
      const u = flake.age / flake.life, shrink = Math.min(1, (1 - u) / .2);
      this.pos.set(flake.x, flake.y, flake.z);
      this.quat.setFromEuler(this.euler.set(flake.phase + flake.age * flake.spin, flake.phase * 1.7 + flake.age * flake.spin * .6, flake.phase));
      this.scale.setScalar(flake.size * shrink);
      this.matrix.compose(this.pos, this.quat, this.scale);
      this.chaffMesh.setMatrixAt(i, this.matrix);
      flakes = i + 1;
    }
    this.puffMesh.count = puffs; this.chaffMesh.count = flakes;
    this.puffMesh.visible = puffs > 0; this.chaffMesh.visible = flakes > 0;
    if (puffs) { this.puffMesh.instanceMatrix.needsUpdate = true; this.alpha.needsUpdate = true; }
    if (flakes) this.chaffMesh.instanceMatrix.needsUpdate = true;
  }

  /** A live puff's opacity, for review. */
  opacity(index: number): number { return this.alpha.getX(index); }

  audit(): { bursts: number; puffs: number; flakes: number } {
    return { bursts: this.bursts, puffs: this.puffs.filter(p => p.age >= 0).length, flakes: this.flakes.filter(f => f.age >= 0).length };
  }

  dispose(): void {
    for (const mesh of [this.puffMesh, this.chaffMesh]) {
      mesh.removeFromParent();
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
  }
}
