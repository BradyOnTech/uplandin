import * as THREE from 'three';
import { unlockAudio } from '../../audio';
import type { Ctx, Subsystem } from '../engine';
import type { TerrainSystem } from './terrain';

/*
 * PLAYER subsystem: first-person hunter. WASD + pointer-lock mouse look,
 * eye height 1.62m, feet glued to the terrain heightfield, gentle walk
 * bob. Capture mode (?capture=1) skips pointer lock and lets the harness
 * place the camera directly.
 */

const WALK_SPEED = 2.2; // m/s — a hunter's walk, not a soldier's sprint
const SPRINT_MULT = 1.9;
const EYE = 1.62;

export class PlayerSystem implements Subsystem {
  readonly id = 'player';
  private keys = new Set<string>();
  private yaw = Math.PI; // face -z: into the field
  // A slight natural downward gaze keeps the close-working dog and the
  // cover immediately ahead in frame on first load. Mouse look remains
  // fully free after pointer lock.
  private pitch = -0.26;
  private pos = new THREE.Vector3(0, 0, 40);
  private vel = new THREE.Vector3();
  private bobPhase = 0;
  private captureMode = false;
  private dir = new THREE.Vector3();
  private right = new THREE.Vector3();

  init(ctx: Ctx): void {
    this.captureMode = new URLSearchParams(location.search).has('capture');
    const canvas = ctx.renderer.domElement;
    if (!this.captureMode) {
      canvas.addEventListener('click', () => {
        unlockAudio();
        canvas.requestPointerLock();
      });
      window.addEventListener('mousemove', (e) => {
        if (document.pointerLockElement !== canvas) return;
        this.yaw -= e.movementX * 0.0022;
        this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * 0.0022, -1.4, 1.4);
      });
      window.addEventListener('keydown', (e) => this.keys.add(e.code));
      window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    }
    this.place(ctx);
  }

  /** Capture harness: park the camera exactly here, looking there. */
  setPose(ctx: Ctx, x: number, z: number, yawDeg: number, pitchDeg = 0): void {
    this.pos.set(x, 0, z);
    this.yaw = THREE.MathUtils.degToRad(yawDeg);
    this.pitch = THREE.MathUtils.degToRad(pitchDeg);
    this.place(ctx);
  }

  private place(ctx: Ctx): void {
    const terrain = ctx.get<TerrainSystem>('terrain');
    const ground = terrain.heightAt(this.pos.x, this.pos.z);
    ctx.camera.position.set(this.pos.x, ground + EYE + Math.sin(this.bobPhase) * 0.035, this.pos.z);
    ctx.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  update(ctx: Ctx, dt: number): void {
    if (!this.captureMode) {
      const f = (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0);
      const s = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0);
      const sprint = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
      this.dir.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)).multiplyScalar(-f);
      this.right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).multiplyScalar(-s);
      this.vel.copy(this.dir).add(this.right);
      if (this.vel.lengthSq() > 0) {
        this.vel.normalize().multiplyScalar(WALK_SPEED * (sprint ? SPRINT_MULT : 1));
        this.pos.addScaledVector(this.vel, dt);
        this.bobPhase += dt * (sprint ? 11 : 7.5);
      }
    }
    this.place(ctx);
  }
}
