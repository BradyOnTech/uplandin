import * as THREE from 'three';
import { dogRendererId } from '../dogs/rendererId';
import type { Ctx, Subsystem } from '../engine';
import type { Hunt3DSystem } from './hunt3d';
import type { TerrainSystem } from './terrain';
import '../training.css';

/** A few stakes and a bumper dress the existing Quail field. Dog motion,
 * pickup, carry, delivery and scoring remain in the shared simulation. */
export class TrainingGroundSystem implements Subsystem {
  readonly id = 'training-ground';
  private abort = new AbortController();
  private group = new THREE.Group();
  private markers: THREE.Group[] = [];
  private bumpers = new Map<number, THREE.Mesh>();
  private geometries: THREE.BufferGeometry[] = [];
  private materials: THREE.Material[] = [];
  private panel?: HTMLElement;
  private instruction?: HTMLElement;
  private progress?: HTMLElement;
  private action?: HTMLButtonElement;
  private direction?: HTMLElement;
  private lastCopy = '';
  private position = { x: 0, z: 0 };
  private bearing = new THREE.Vector3();
  private inverse = new THREE.Quaternion();
  private hunt!: Hunt3DSystem;
  init(ctx: Ctx): void {
    this.hunt = ctx.get<Hunt3DSystem>('hunt3d'); if (!this.hunt.training) return;
    document.body.classList.add('training-field');
    ctx.scene.add(this.group);
    const panel = this.panel = document.createElement('section'); panel.className = 'training-field-panel'; panel.setAttribute('aria-label', 'Training drill');
    const title = document.createElement('strong'); title.textContent = this.hunt.training.snapshot().title;
    this.progress = document.createElement('span'); this.progress.className = 'training-field-progress';
    this.instruction = document.createElement('p'); this.instruction.setAttribute('aria-live', 'polite');
    this.direction = document.createElement('p'); this.direction.className = 'training-field-direction';
    this.action = document.createElement('button'); this.action.type = 'button';
    this.action.addEventListener('click', () => { this.hunt.trainingAction(ctx); ctx.renderer.domElement.focus(); }, { signal: this.abort.signal });
    panel.append(title, this.progress, this.instruction, this.direction, this.action); document.body.append(panel);
    window.addEventListener('keydown', event => {
      if (event.code !== 'KeyE' || event.repeat || ctx.paused || (event.target instanceof HTMLElement && event.target.closest('input,select,textarea,button'))) return;
      event.preventDefault(); this.hunt.trainingAction(ctx);
    }, { signal: this.abort.signal });
    ctx.events.addEventListener('hunt-complete', () => { panel.hidden = true; }, { signal: this.abort.signal });
    ctx.events.addEventListener('training-stage', () => this.stage(ctx), { signal: this.abort.signal });
    this.stage(ctx);
  }
  private stage(ctx: Ctx): void {
    for (const marker of this.markers) this.group.remove(marker);
    this.markers = [];
    const session = this.hunt.training; if (!session) return;
    // Shared geometries are reused across all repetitions.
    if (!this.geometries.length) {
      this.geometries.push(new THREE.CylinderGeometry(.035, .045, 1.4, 5), new THREE.BoxGeometry(.42, .22, .035), new THREE.CylinderGeometry(.055, .055, .32, 8));
      this.materials.push(new THREE.MeshStandardMaterial({ color: 0x6f5840, roughness: 1 }), new THREE.MeshStandardMaterial({ color: 0xf0bc5a, roughness: 1 }), new THREE.MeshStandardMaterial({ color: 0xe98332, roughness: .85 }));
    }
    const patch = session.stage.patches[0];
    const points = session.stage.markers.length ? session.stage.markers : session.stage.drill === 'planted-birds' || session.stage.drill === 'hunt-dead' || session.stage.drill === 'relocation'
      ? [{ x: patch.x, y: patch.y + patch.h }, { x: patch.x + patch.w, y: patch.y + patch.h }] : [];
    for (const point of points) {
      const marker = new THREE.Group(), pole = new THREE.Mesh(this.geometries[0], this.materials[0]), flag = new THREE.Mesh(this.geometries[1], this.materials[1]);
      pole.position.y = .7; flag.position.set(.17, 1.25, 0); marker.add(pole, flag);
      this.hunt.simToWorld(point.x, point.y, this.position);
      marker.position.set(this.position.x, ctx.get<TerrainSystem>('terrain').heightAt(this.position.x, this.position.z), this.position.z);
      this.group.add(marker); this.markers.push(marker);
    }
    for (const [id, bumper] of this.bumpers) if (!session.stage.birds.some(b => b.id === id)) { this.group.remove(bumper); this.bumpers.delete(id); }
    for (const bird of session.stage.birds) if (bird.trainingObject === 'bumper') {
      const bumper = new THREE.Mesh(this.geometries[2], this.materials[2]); bumper.rotation.z = Math.PI / 2; bumper.castShadow = true; this.group.add(bumper); this.bumpers.set(bird.id, bumper);
    }
  }
  update(ctx: Ctx): void {
    const session = this.hunt?.training; if (!session || !this.panel) return;
    const snapshot = session.snapshot(), copy = `${snapshot.instruction}|${snapshot.action}`;
    this.panel.hidden = snapshot.phase === 'complete' || ctx.paused;
    this.progress!.textContent = `Repetition ${snapshot.round}/${snapshot.rounds} · ${snapshot.elapsed}s`;
    if (copy !== this.lastCopy) {
      this.lastCopy = copy; this.instruction!.textContent = snapshot.instruction;
      this.action!.hidden = snapshot.action === null;
      this.action!.textContent = snapshot.action === 'throw' ? 'Throw bumper · E' : snapshot.action === 'send' ? 'Send dog · E / X' : 'Next repetition · E';
    }
    if (snapshot.marker) {
      this.hunt.simToWorld(snapshot.marker.x, snapshot.marker.y, this.position);
      const dx = this.position.x - ctx.camera.position.x, dz = this.position.z - ctx.camera.position.z;
      this.bearing.set(dx, 0, dz).applyQuaternion(this.inverse.copy(ctx.camera.quaternion).invert());
      const direction = this.bearing.z > 0 ? 'behind you' : this.bearing.x < -5 ? 'left' : this.bearing.x > 5 ? 'right' : 'ahead';
      this.direction!.textContent = `${snapshot.markerLabel} · ${Math.round(Math.hypot(dx, dz) / .9144)} yd · ${direction}`;
    } else this.direction!.textContent = '';
    for (const bird of this.hunt.huntState().birds) {
      const bumper = this.bumpers.get(bird.id); if (!bumper) continue;
      const thrown = session.throwProgress;
      bumper.visible = bird.state !== 'retrieved' && (!bird.fallPending || thrown !== null);
      this.hunt.simToWorld(bird.pos.x, bird.pos.y, this.position);
      const terrain = ctx.get<TerrainSystem>('terrain');
      if (bird.state === 'carried') {
        const carrier = this.hunt.dog();
        this.hunt.dogRenderWorld(ctx.fixedAlpha, this.position);
        bumper.position.set(this.position.x, terrain.heightAt(this.position.x, this.position.z) + .58, this.position.z);
        ctx.get<Subsystem & { mouthWorld?: (out: THREE.Vector3) => boolean }>(dogRendererId(0)).mouthWorld?.(bumper.position);
        bumper.rotation.set(0, Math.PI / 2 - carrier.heading, Math.PI / 2);
      } else if (thrown !== null && thrown < 1 && session.stage.drill === 'marked-retrieve') {
        const origin = this.hunt.simToWorld(session.stage.hunter.x, session.stage.hunter.y, { x: 0, z: 0 });
        const x = origin.x + (this.position.x - origin.x) * thrown, z = origin.z + (this.position.z - origin.z) * thrown;
        bumper.position.set(x, THREE.MathUtils.lerp(terrain.heightAt(origin.x, origin.z) + 1.3, terrain.heightAt(this.position.x, this.position.z) + .06, thrown) + Math.sin(thrown * Math.PI) * 3.5, z);
        bumper.rotation.set(thrown * 8, 0, Math.PI / 2);
      } else {
        bumper.position.set(this.position.x, terrain.heightAt(this.position.x, this.position.z) + .065, this.position.z); bumper.rotation.set(0, 0, Math.PI / 2);
      }
    }
  }
  /** The bumper uses the same mouth and gaze targeting as a downed bird. */
  target(id: number, out: THREE.Vector3): boolean {
    const bumper = this.bumpers.get(id);
    if (!bumper?.visible) return false;
    out.copy(bumper.position); return true;
  }
  dispose(ctx: Ctx): void {
    this.abort.abort(); this.panel?.remove(); ctx.scene.remove(this.group);
    this.geometries.forEach(g => g.dispose()); this.materials.forEach(m => m.dispose());
    document.body.classList.remove('training-field');
  }
}
