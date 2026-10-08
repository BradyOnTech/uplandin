import * as THREE from 'three';
import type { Ctx, Subsystem } from '../engine';
import { fieldTimeOfDay, type TimeOfDay } from '../palette';
import { glareStrength, sunDirection, type Dir3 } from '../sunGlare';

/**
 * The low sun's glare as a screen veil: a hot bloom around the sun's screen
 * position plus a wash that flattens contrast across the view. It sits over
 * the canvas and under the HUD, so both quality tiers see exactly the same
 * glare. The gun reads strength() to tell a miss into the sun apart.
 */
export class SunGlareSystem implements Subsystem {
  readonly id = 'sun-glare';
  private veil: HTMLDivElement | null = null;
  private sun: Dir3 = { x: 0, y: 1, z: 0 };
  private elevation = 90;
  private current = 0;
  private readonly forward = new THREE.Vector3();
  private readonly screen = new THREE.Vector3();
  private abort = new AbortController();

  constructor(private readonly areaId: string, private readonly enabled = true) {}

  init(ctx: Ctx): void {
    if (!this.enabled || typeof document === 'undefined') return;
    const veil = document.createElement('div');
    veil.id = 'sun-glare';
    veil.setAttribute('aria-hidden', 'true');
    veil.hidden = true;
    ctx.renderer.domElement.after(veil);
    this.veil = veil;
    this.apply(ctx.timeOfDay);
    ctx.events.addEventListener('tod', event => this.apply((event as CustomEvent<TimeOfDay>).detail), { signal: this.abort.signal });
  }

  /** Current glare, 0–1, for the view the player is looking along. */
  strength(): number {
    return this.current;
  }

  update(ctx: Ctx): void {
    if (!this.veil) return;
    ctx.camera.getWorldDirection(this.forward);
    const glare = glareStrength(this.forward, this.sun, this.elevation);
    this.current = glare;
    if (glare < 0.01) {
      this.veil.hidden = true;
      return;
    }
    this.screen.set(this.sun.x, this.sun.y, this.sun.z).multiplyScalar(500).add(ctx.camera.position).project(ctx.camera);
    const style = this.veil.style;
    style.setProperty('--glare-x', `${((this.screen.x + 1) * 50).toFixed(1)}%`);
    style.setProperty('--glare-y', `${((1 - this.screen.y) * 50).toFixed(1)}%`);
    style.opacity = glare.toFixed(3);
    this.veil.hidden = false;
  }

  dispose(): void {
    this.abort.abort();
    this.veil?.remove();
    this.veil = null;
  }

  private apply(tod: TimeOfDay): void {
    const spec = fieldTimeOfDay(this.areaId, tod);
    this.sun = sunDirection(spec.sunElevation, spec.sunAzimuth);
    this.elevation = spec.sunElevation;
    const glow = new THREE.Color(spec.sunGlow);
    this.veil?.style.setProperty('--glare-rgb', `${Math.round(glow.r * 255)} ${Math.round(glow.g * 255)} ${Math.round(glow.b * 255)}`);
  }
}
