import * as THREE from 'three';
import type { Hunt3DSystem } from './hunt3d';
import { playDogMovement, playFieldSong, startFieldAmbience } from '../../audio';
import type { Ctx, Subsystem } from '../engine';
export class FieldAudioSystem implements Subsystem {
  readonly id = 'field-audio';
  private ambience: ReturnType<typeof startFieldAmbience> = null;
  private nextSong = 13;
  private abort = new AbortController();
  private capture = false;
  private dogs = new Map<number, { x: number; z: number; distance: number }>();
  private dogPosition = { x: 0, z: 0 };
  private forward = new THREE.Vector3();
  init(ctx: Ctx): void {
    this.capture = new URLSearchParams(location.search).has('capture');
    ctx.events.addEventListener('pause', ((e: CustomEvent) => this.ambience?.setPaused(e.detail)) as EventListener, { signal: this.abort.signal });
  }
  update(ctx: Ctx): void {
    if (this.capture || ctx.paused) return;
    this.ambience ??= startFieldAmbience();
    const hunt = ctx.get<Hunt3DSystem>('hunt3d');
    ctx.camera.getWorldDirection(this.forward);
    for (let slot = 0; slot < hunt.dogCount(); slot++) {
      const position = hunt.dogWorld(this.dogPosition, slot);
      const previous = this.dogs.get(slot);
      if (!previous) { this.dogs.set(slot, { ...position, distance: 0 }); continue; }
      const moved = Math.hypot(position.x-previous.x, position.z-previous.z);
      previous.x = position.x; previous.z = position.z;
      if (moved > 8) { previous.distance = 0; continue; } // Relocation is not a footfall.
      if (hunt.dog(slot).gait === 'still') { previous.distance = 0; continue; }
      previous.distance += moved;
      if (previous.distance < .8) continue;
      previous.distance %= .8;
      const dx = position.x-ctx.camera.position.x, dz = position.z-ctx.camera.position.z;
      const distance = Math.hypot(dx, dz);
      if (distance >= 18) continue;
      const cover = hunt.coverPatches().some(p => Math.abs(position.x-p.cx)<p.hx && Math.abs(position.z-p.cz)<p.hz);
      const horizontal = Math.hypot(this.forward.x, this.forward.z);
      const pan = distance > .01 && horizontal > .01
        ? (-this.forward.z*dx+this.forward.x*dz)/(distance*horizontal) : 0;
      playDogMovement(cover, .09*(1-distance/18)**2, pan);
    }
    if (ctx.time > this.nextSong) { playFieldSong(); this.nextSong = ctx.time + 19 + (Math.sin(ctx.time * 0.3) + 1) * 6; }
  }
  dispose(): void { this.dogs.clear(); this.abort.abort(); this.ambience?.stop(); this.ambience = null; }
}
