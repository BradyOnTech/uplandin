import type { Engine, Subsystem } from './engine';
import { HUNT_ARRIVAL_DURATION, sampleHuntArrival, type HuntArrivalFrame, type HuntArrivalSite } from './huntArrival';
import { dogRendererId } from './dogs/rendererId';
import type { Hunt3DSystem } from './subsystems/hunt3d';
import type { LandmarksSystem } from './subsystems/landmarks';
import type { PlayerSystem } from './subsystems/player';
import type { TerrainSystem } from './subsystems/terrain';
import type { GunSystem } from './subsystems/gun';
import './huntArrival.css';

type ArrivalDog = Subsystem & { setArrivalPose?(pose: HuntArrivalFrame['dog'] | null, elapsed?: number, dt?: number): void };

/** Runs only presentation frames while the hunt clock is paused. Completion,
 * interruption and skip all perform the same one-time simulation handoff. */
export class HuntArrivalController {
  private raf = 0;
  private elapsed = 0;
  private last = 0;
  private sites: HuntArrivalSite[] = [];
  private actors: ArrivalDog[] = [];
  private original = { x: 0, z: 0, yaw: 0, pitch: 0 };
  private panel: HTMLElement;
  private label: HTMLElement;
  private done: (() => void) | null = null;
  private played = false;
  active = false;
  constructor(private engine: Engine) {
    this.panel = document.createElement('section');
    this.panel.id = 'hunt-arrival'; this.panel.hidden = true;
    this.panel.setAttribute('aria-label', 'Releasing your dog');
    this.panel.innerHTML = '<div><span class="arrival-kicker">THE DAY BEGINS</span><p id="arrival-label" aria-live="polite">Ready to hunt.</p></div><button type="button">Skip release <span aria-hidden="true">↗</span></button>';
    this.label = this.panel.querySelector('p')!;
    this.panel.querySelector('button')!.addEventListener('click', () => this.finish(true));
    document.body.append(this.panel);
  }
  start(done: () => void): boolean {
    if (this.played || this.active) return false;
    const ctx = this.engine.ctx, hunt = ctx.get<Hunt3DSystem>('hunt3d');
    const landmarks = ctx.get<LandmarksSystem>('landmarks'), site = landmarks.arrivalSite();
    if (!site) return false;
    this.actors = Array.from({ length: hunt.dogCount() }, (_, i) => ctx.get<ArrivalDog>(dogRendererId(i)));
    // Explicit imported-rig review keeps its own start, while both production
    // renderers and a mixed brace use the same release contract.
    if (this.actors.some(actor => !actor.setArrivalPose)) return false;
    this.played = true; this.done = done;
    const terrain = ctx.get<TerrainSystem>('terrain');
    const sideX = -Math.sin(site.releaseHeading), sideZ = Math.cos(site.releaseHeading);
    this.sites = this.actors.map((_, slot) => {
      const offset = this.actors.length === 1 ? 0 : (slot === 0 ? -.28 : .28);
      const shift = (p: { x: number; y: number; z: number }) => ({ x: p.x + sideX * offset, y: p.y, z: p.z + sideZ * offset });
      const landing = shift(site.landing); landing.y = terrain.heightAt(landing.x, landing.z);
      return { ...site, crateFloor: shift(site.crateFloor), boxThreshold: shift(site.boxThreshold), tailgateEdge: shift(site.tailgateEdge), landing };
    });
    this.original = { x: ctx.camera.position.x, z: ctx.camera.position.z, yaw: ctx.camera.rotation.y * 180 / Math.PI, pitch: ctx.camera.rotation.x * 180 / Math.PI };
    this.engine.pause(true); this.active = true; this.elapsed = 0;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { this.finish(true); return true; }
    document.body.classList.add('hunt-arriving'); this.panel.hidden = false;
    ctx.get<GunSystem>('gun').setArrivalHidden(true);
    // A stationary hunter-eye view beside the tailgate includes the box and
    // landing. Restore the authored field view before simulation resumes.
    const cameraX = site.landing.x + sideX * 3.2 + Math.cos(site.releaseHeading) * 2.5;
    const cameraZ = site.landing.z + sideZ * 3.2 + Math.sin(site.releaseHeading) * 2.5;
    const target = { x: (site.crateFloor.x + site.landing.x) * .5, z: (site.crateFloor.z + site.landing.z) * .5, y: site.crateFloor.y + .15 };
    const yaw = Math.atan2(-(target.x - cameraX), -(target.z - cameraZ));
    const pitch = Math.atan2(target.y - (terrain.heightAt(cameraX, cameraZ) + 1.68), Math.hypot(target.x - cameraX, target.z - cameraZ));
    ctx.get<PlayerSystem>('player').setPose(ctx, cameraX, cameraZ, yaw * 180 / Math.PI, pitch * 180 / Math.PI);
    this.draw(0); this.panel.querySelector('button')!.focus();
    this.last = performance.now(); this.raf = requestAnimationFrame(this.frame);
    return true;
  }
  private frame = (now: number) => {
    if (!this.active) return;
    const dt = Math.min(.08, Math.max(0, (now - this.last) / 1000)); this.last = now;
    this.elapsed += dt;
    if (this.elapsed >= HUNT_ARRIVAL_DURATION + (this.actors.length - 1) * .65) { this.finish(true); return; }
    this.draw(dt); this.raf = requestAnimationFrame(this.frame);
  };
  private draw(dt: number): void {
    const landmarks = this.engine.ctx.get<LandmarksSystem>('landmarks');
    this.sites.forEach((site, slot) => {
      const elapsed = Math.max(0, this.elapsed - slot * .65), frame = sampleHuntArrival(site, elapsed);
      if (slot === 0) {
        landmarks.setTruckRelease(frame);
        const text = frame.phase === 'anticipating' || frame.phase === 'opening' ? 'A little anticipation.' : frame.phase === 'landing' || frame.phase === 'ready' ? 'Together, into the field.' : 'Let’s go find birds.';
        if (this.label.textContent !== text) this.label.textContent = text;
      }
      this.actors[slot].setArrivalPose!(frame.dog, elapsed, dt);
    });
    this.engine.renderOnce();
  }
  finish(resume = false): void {
    if (!this.active) return;
    cancelAnimationFrame(this.raf); this.active = false;
    const ctx = this.engine.ctx;
    ctx.get<PlayerSystem>('player').setPose(ctx, this.original.x, this.original.z, this.original.yaw, this.original.pitch);
    ctx.get<LandmarksSystem>('landmarks').setTruckRelease({ crateDoor: 1, tailgate: 1 });
    const positions = this.sites.map(site => sampleHuntArrival(site, HUNT_ARRIVAL_DURATION).dog);
    ctx.get<Hunt3DSystem>('hunt3d').releaseFromTruck(ctx, positions);
    this.actors.forEach(actor => actor.setArrivalPose!(null));
    ctx.get<GunSystem>('gun').setArrivalHidden(false);
    this.panel.hidden = true; document.body.classList.remove('hunt-arriving');
    this.engine.renderOnce();
    const done = this.done; this.done = null;
    if (resume) done?.();
  }
  dispose(): void { this.finish(false); this.panel.remove(); }
}
