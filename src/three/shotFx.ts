import * as THREE from 'three';
import { sportingBores } from './assets/shotgun';

/**
 * Presentation of the shot at the gun: a one-frame muzzle flash at the
 * barrel that fired, a faint wisp of smokeless-powder smoke left hanging in
 * the world, and a bright fibre-optic bead for shooting without the ring.
 * Purely cosmetic; nothing here reads or changes the hunt.
 */
const FLASH_S = .055;
const SMOKE_S = .9;

function radialTexture(inner: string, outer: string): THREE.CanvasTexture | null {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return null;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const g = typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
  if (!g) return null;
  const gradient = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, inner); gradient.addColorStop(.35, inner); gradient.addColorStop(1, outer);
  g.fillStyle = gradient; g.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** A four-point star with a hot core: reads as a flash, not a ball of light. */
function flashGeometry(): THREE.BufferGeometry {
  const points: number[] = [], rays = 5;
  for (let i = 0; i < rays * 2; i++) {
    const a = i / (rays * 2) * Math.PI * 2, r = i % 2 === 0 ? 1 : .32;
    points.push(Math.cos(a) * r, Math.sin(a) * r, 0);
  }
  const positions: number[] = [];
  for (let i = 0; i < rays * 2; i++) {
    const j = (i + 1) % (rays * 2);
    positions.push(0, 0, 0, points[i * 3], points[i * 3 + 1], 0, points[j * 3], points[j * 3 + 1], 0);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

export class ShotFx {
  private flash: THREE.Mesh;
  private glow: THREE.Mesh;
  private flashAge = Infinity;
  private smoke: THREE.Sprite;
  private smokeAge = Infinity;
  private smokeDrift = new THREE.Vector3();
  private bead: THREE.Mesh;
  private muzzleWorld = new THREE.Vector3();

  constructor(private readonly scene: THREE.Object3D, private gunRoot: THREE.Object3D, private beadLocal: THREE.Vector3) {
    this.flash = new THREE.Mesh(flashGeometry(), new THREE.MeshBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, side: THREE.DoubleSide, fog: false }));
    this.glow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: radialTexture('rgba(255,214,140,1)', 'rgba(255,160,60,0)'),
      transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false }));
    this.flash.renderOrder = this.glow.renderOrder = 1000;
    this.flash.visible = this.glow.visible = false;
    this.flash.frustumCulled = this.glow.frustumCulled = false;
    this.smoke = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture('rgba(222,220,212,.9)', 'rgba(222,220,212,0)'),
      transparent: true, opacity: 0, depthWrite: false }));
    this.smoke.visible = false;
    scene.add(this.smoke);
    // A fibre-optic bead: ivory, unlit, a touch larger than the brass bead
    // it sits on. Shown when the aiming ring is off.
    this.bead = new THREE.Mesh(new THREE.SphereGeometry(.0034, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff4d2, fog: false }));
    this.bead.visible = false;
    this.attach(gunRoot, beadLocal);
  }

  /** Follow a newly equipped viewmodel. */
  attach(gunRoot: THREE.Object3D, beadLocal: THREE.Vector3): void {
    this.gunRoot = gunRoot; this.beadLocal = beadLocal;
    gunRoot.add(this.flash, this.glow, this.bead);
    this.bead.position.copy(beadLocal).add(new THREE.Vector3(0, .0009, 0));
  }

  setHiVizBead(visible: boolean): void { this.bead.visible = visible; }

  /** Flash at the bore that fired, in the gun's own coordinates. */
  fire(bore: { x: number; y: number }, windX: number, windZ: number, reducedMotion: boolean): void {
    this.flash.position.set(bore.x, bore.y, this.beadLocal.z - .03);
    this.glow.position.copy(this.flash.position);
    this.flash.rotation.z = Math.random() * Math.PI;
    const scale = reducedMotion ? .034 : .05 + Math.random() * .016;
    this.flash.scale.setScalar(scale); this.glow.scale.setScalar(scale * 2.6);
    this.flashAge = 0;
    (this.flash.material as THREE.MeshBasicMaterial).opacity = 1;
    (this.glow.material as THREE.MeshBasicMaterial).opacity = .7;
    this.flash.visible = this.glow.visible = true;
    this.gunRoot.updateWorldMatrix(true, false);
    this.muzzleWorld.copy(this.flash.position).applyMatrix4(this.gunRoot.matrixWorld);
    this.smoke.position.copy(this.muzzleWorld);
    this.smokeDrift.set(windX * .6, .12, windZ * .6);
    this.smokeAge = 0;
    this.smoke.visible = true;
  }

  update(dt: number): void {
    if (this.flashAge < FLASH_S) {
      this.flashAge += dt;
      const k = 1 - Math.min(1, this.flashAge / FLASH_S);
      (this.flash.material as THREE.MeshBasicMaterial).opacity = k;
      (this.glow.material as THREE.MeshBasicMaterial).opacity = k * .7;
      if (this.flashAge >= FLASH_S) this.flash.visible = this.glow.visible = false;
    }
    if (this.smokeAge < SMOKE_S) {
      this.smokeAge += dt;
      const t = Math.min(1, this.smokeAge / SMOKE_S);
      this.smoke.position.addScaledVector(this.smokeDrift, dt);
      this.smoke.scale.setScalar(.12 + t * .75);
      (this.smoke.material as THREE.SpriteMaterial).opacity = .22 * (1 - t) * Math.min(1, this.smokeAge * 12);
      if (t >= 1) this.smoke.visible = false;
    }
  }

  dispose(): void {
    this.flash.removeFromParent(); this.glow.removeFromParent(); this.bead.removeFromParent(); this.smoke.removeFromParent();
    for (const mesh of [this.flash, this.glow, this.bead]) { mesh.geometry.dispose(); (mesh.material as THREE.MeshBasicMaterial).map?.dispose(); (mesh.material as THREE.Material).dispose(); }
    (this.smoke.material as THREE.SpriteMaterial).map?.dispose(); this.smoke.material.dispose();
  }
}

/** A coach's word on the shot, for the callout under the sight. */
/** Inside this range (metres) a clean hit puts the whole pattern in the bird. */
export const TOO_CLOSE_M = 9;

export function shotCall(hit: boolean, wounded: boolean, miss: { call: 'behind' | 'ahead' | 'high' | 'low'; margin: number } | null,
  rangeM = Infinity, reaction?: 'fold' | 'tower' | 'sail' | 'spiral'): { text: string; tone: 'hit' | 'wound' | 'miss' } {
  // A rooster shot at his feet is the hunter's lesson in patience: let it get out.
  if (hit && !wounded && rangeM < TOO_CLOSE_M) return { text: 'BIRD DOWN · SHOT UP, TOO CLOSE', tone: 'hit' };
  // What a hunter calls as he watches the bird: each one asks something of him.
  if (hit && reaction === 'tower') return { text: 'HIT · HE\'S TOWERING', tone: 'hit' };
  if (hit && reaction === 'sail') return { text: 'HIT · LEGS DOWN · MARK HIM', tone: wounded ? 'wound' : 'hit' };
  if (hit && reaction === 'spiral') return { text: 'WING-TIPPED · HE\'LL RUN', tone: 'wound' };
  if (hit) return wounded ? { text: 'HIT · BIRD DOWN RUNNING', tone: 'wound' } : { text: 'BIRD DOWN', tone: 'hit' };
  if (!miss || miss.margin > 3) return { text: 'MISS', tone: 'miss' };
  const where = { behind: 'BEHIND IT', ahead: 'IN FRONT OF IT', high: 'OVER IT', low: 'UNDER IT' }[miss.call];
  return { text: `MISS · ${where}`, tone: 'miss' };
}

/** Rig-local bore centres per action in firing order, matching the viewmodels. */
export function boresFor(gunId: string): { x: number; y: number }[] {
  return sportingBores(gunId === 'side-by-side' || gunId === 'over-under' || gunId === 'semi-auto' ? gunId : 'pump');
}
