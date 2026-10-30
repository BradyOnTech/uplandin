import * as THREE from 'three';
import { mulberry32 } from '../game/math';
import { featherTones } from './featherDrift';

/**
 * Sign on the ground: what birds leave where they live, for a hunter who
 * reads it. A bobwhite covey's roost ring (droppings in a tight circle, where
 * they slept tails in and heads out); a rooster's tracks across a two-track;
 * a chukar's droppings; a sharptail's dusting bowl; now and then a feather.
 * Laid once, at the start of the hunt, near some of the coveys (where they
 * are, so it is true sign) and only on open ground, never in cover where
 * nobody would see it. Small, as sign is, and a little larger than life so a
 * screen shows it at the hunter's feet. One instanced draw.
 */

export interface SignCovey {
  speciesId: string;
  sex?: 'hen' | 'rooster';
  /** Where the covey is (world metres). */
  x: number; z: number;
  /** The nearest point of a two-track or trail (world metres), if within reach. */
  track?: { x: number; z: number; heading: number };
}

export interface SignSpot { kind: 'roost' | 'tracks' | 'droppings' | 'dusting' | 'feather'; x: number; z: number; speciesId: string }

/** At most this many marks in all, and this share of coveys leave sign a hunter can find. */
const CAPACITY = 640;
export const SIGN_SHARE = .45;
const DROPPING = 0x3c3326, CAP = 0xe9e4d6, PRINT = 0x5b4a35, DUST = 0x8f7a5c;

/** Where each covey's sign lies and what it is. Pure, from the hunt's seed. */
export function placeSign(coveys: readonly SignCovey[], seed: number, open: (x: number, z: number) => boolean): SignSpot[] {
  const rng = mulberry32((seed ^ 0x51a9e) >>> 0), spots: SignSpot[] = [];
  for (const covey of coveys) {
    if (rng() >= SIGN_SHARE) continue;
    // A rooster's tracks are on the two-track it crossed; the rest lie a few
    // metres out on open ground at the covey's edge.
    if (covey.speciesId === 'ringneck' && covey.track && open(covey.track.x, covey.track.z)) {
      spots.push({ kind: 'tracks', x: covey.track.x, z: covey.track.z, speciesId: covey.speciesId });
      continue;
    }
    let spot: { x: number; z: number } | undefined;
    for (let tries = 0; tries < 8 && !spot; tries++) {
      const a = rng() * Math.PI * 2, r = 2 + rng() * 7, x = covey.x + Math.cos(a) * r, z = covey.z + Math.sin(a) * r;
      if (open(x, z)) spot = { x, z };
    }
    if (!spot) continue;
    const kind: SignSpot['kind'] = covey.speciesId === 'bobwhite' ? 'roost' : covey.speciesId === 'sharptail' ? 'dusting'
      : covey.speciesId === 'ringneck' ? 'feather' : 'droppings';
    spots.push({ kind, ...spot, speciesId: covey.speciesId });
    if (rng() < .3 && kind !== 'feather') spots.push({ kind: 'feather', x: spot.x + rng() - .5, z: spot.z + rng() - .5, speciesId: covey.speciesId });
  }
  return spots;
}

export class GroundSign {
  readonly mesh: THREE.InstancedMesh;
  readonly spots: SignSpot[];

  constructor(coveys: readonly SignCovey[], seed: number, ground: (x: number, z: number) => number, open: (x: number, z: number) => boolean) {
    const quad = new THREE.PlaneGeometry(1, 1);
    quad.rotateX(-Math.PI / 2);
    const material = new THREE.MeshLambertMaterial({ color: 0xffffff, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.mesh = new THREE.InstancedMesh(quad, material, CAPACITY);
    this.mesh.name = 'ground-sign';
    this.mesh.castShadow = false; this.mesh.receiveShadow = true;
    this.spots = placeSign(coveys, seed, open);
    const rng = mulberry32((seed ^ 0x7e55) >>> 0), matrix = new THREE.Matrix4(), color = new THREE.Color();
    const position = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    let n = 0;
    const lay = (x: number, z: number, length: number, width: number, yaw: number, hex: number | THREE.Color) => {
      if (n >= CAPACITY) return;
      position.set(x, ground(x, z) + .02, z); rotation.setFromAxisAngle(up, yaw); scale.set(width, 1, length);
      this.mesh.setMatrixAt(n, matrix.compose(position, rotation, scale));
      this.mesh.setColorAt(n, typeof hex === 'number' ? color.setHex(hex) : hex);
      n++;
    };
    const dropping = (x: number, z: number) => {
      const yaw = rng() * Math.PI;
      lay(x, z, .05, .03, yaw, DROPPING);
      lay(x + .012, z + .006, .022, .02, yaw, CAP);
    };
    for (const spot of this.spots) {
      if (spot.kind === 'roost') {
        // Tails in, heads out: the night's droppings in a ring.
        const count = 10 + Math.floor(rng() * 5), r = .17 + rng() * .05;
        for (let i = 0; i < count; i++) {
          const a = i / count * Math.PI * 2 + rng() * .3;
          dropping(spot.x + Math.cos(a) * r, spot.z + Math.sin(a) * r);
        }
      } else if (spot.kind === 'droppings') {
        for (let i = 6 + Math.floor(rng() * 6); i > 0; i--) dropping(spot.x + (rng() - .5) * .5, spot.z + (rng() - .5) * .5);
      } else if (spot.kind === 'dusting') {
        // A shallow bowl of bare dust the birds bathed in, a few droppings at its rim.
        lay(spot.x, spot.z, .55, .45, rng() * Math.PI, DUST);
        for (let i = 0; i < 4; i++) { const a = rng() * Math.PI * 2; dropping(spot.x + Math.cos(a) * .32, spot.z + Math.sin(a) * .32); }
      } else if (spot.kind === 'tracks') {
        // A rooster walked across: three-toed prints, left and right, a stride apart.
        const heading = rng() * Math.PI * 2;
        for (let i = -4; i <= 4; i++) {
          const along = i * .2, side = (i % 2 ? 1 : -1) * .05;
          const px = spot.x + Math.cos(heading) * along - Math.sin(heading) * side, pz = spot.z + Math.sin(heading) * along + Math.cos(heading) * side;
          for (const toe of [-.45, 0, .45]) lay(px + Math.cos(heading + toe) * .035, pz + Math.sin(heading + toe) * .035, .07, .014, -(heading + toe) + Math.PI / 2, PRINT);
        }
      } else {
        const tones = featherTones(spot.speciesId);
        lay(spot.x, spot.z, .1, .028, rng() * Math.PI, tones[Math.floor(rng() * tones.length) % tones.length]);
      }
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.mesh.computeBoundingSphere();
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
