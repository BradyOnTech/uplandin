import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { Ctx, Subsystem } from '../engine';
import type { Hunt3DSystem } from './hunt3d';
import type { TerrainSystem } from './terrain';
import { dogRendererId } from '../dogs/rendererId';
import { advancePhaseDrivenAction, chooseDogClip, contactWeight, crossFadeDogAction, dogClipBlendSeconds, dogTorsoHeading, planPointSettling, POINT_SETTLE_SECONDS, sampleClipContacts, sampleCorrectiveStep, supportingGait } from '../dogs/riggedMotion';

type FootId = 'FL' | 'FR' | 'HL' | 'HR';
interface ClipDescription {
  name: string; duration: number; nominalSpeed: number; loop: boolean;
  contacts: Record<FootId, { offset: number; stanceFraction: number }>;
}
interface Manifest { animations: ClipDescription[]; lods: { file: string; triangles: number }[] }
interface Leg {
  id: FootId; tip: THREE.Object3D; joints: THREE.Bone[];
  anchor: THREE.Vector3; target: THREE.Vector3; contact: number; locked: boolean;
  plantId: number;
  lastTip: THREE.Vector3; stepFrom: THREE.Vector3;
  corrective: boolean; stepAge: number;
  preIK: THREE.Vector3;
  pointTarget: THREE.Vector3;
  settling: { delay: number; from: THREE.Vector3; started: boolean;
    pose: { position: THREE.Vector3; rotation: THREE.Quaternion }[] } | null;
}
const ASSET_ROOT = './models/gsp/';
const UP = new THREE.Vector3(0, 1, 0);
const cleanName = (name: string) => THREE.PropertyBinding.sanitizeNodeName(name);

/** One skeletal owner: authored clips, followed by bounded terrain corrections. */
export class RiggedDogSystem implements Subsystem {
  readonly id: string;
  private root = new THREE.Group();
  private model!: THREE.Group;
  private mixer!: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private transitions = new Map<string, THREE.AnimationAction>();
  private accents = new Map<string, THREE.AnimationAction>();
  private accent: THREE.AnimationAction | null = null;
  private accentName = '';
  private performanceName = '';
  private transition: THREE.AnimationAction | null = null;
  private transitionAge = 0;
  private descriptions = new Map<string, ClipDescription>();
  private active!: THREE.AnimationAction;
  private activeName = '';
  private meshes: THREE.SkinnedMesh[] = [];
  private lodGeometry: THREE.BufferGeometry[][] = [];
  private loaded: GLTF[] = [];
  private lod = -1;
  private legs: Leg[] = [];
  private mouth!: THREE.Object3D;
  private head!: THREE.Bone;
  private mixerPose: { bone: THREE.Bone; position: THREE.Vector3; rotation: THREE.Quaternion; scale: THREE.Vector3 }[] = [];
  private hunt!: Hunt3DSystem;
  private terrain!: TerrainSystem;
  private frozen = false;
  private pos = { x: 0, z: 0 };
  private lastX = 0;
  private lastZ = 0;
  private lastYaw = 0;
  private placed = false;
  private speed = 0;
  private phaseOverride: { clip: string; phase: number } | null = null;
  private neutral = false;
  private bodyVisible = true;
  private clipAge = 0;
  private contactResets = 0;
  private settlingSteps = 0;
  private settlingAge = 0;
  private normal = new THREE.Vector3();
  private a = new THREE.Vector3();
  private b = new THREE.Vector3();
  private c = new THREE.Vector3();
  private q = new THREE.Quaternion();
  private parentQ = new THREE.Quaternion();
  private correction = new THREE.Quaternion();
  private identity = new THREE.Quaternion();
  private terrainQ = new THREE.Quaternion();
  private pointWorld = new THREE.Vector3();
  private visibility = new Map<THREE.Object3D, boolean>();
  private originalBackground: THREE.Scene['background'] = null;
  private groundAt = (x: number, z: number): number => this.terrain.heightAt(x, z);
  constructor(private readonly slot = 0) { this.id = dogRendererId(slot); }

  async init(ctx: Ctx): Promise<void> {
    this.hunt = ctx.get<Hunt3DSystem>('hunt3d');
    this.terrain = ctx.get<TerrainSystem>('terrain');
    this.frozen = new URLSearchParams(location.search).has('capture');
    const response = await fetch(`${ASSET_ROOT}manifest.json`);
    if (!response.ok) throw new Error(`Dog manifest failed: ${response.status}`);
    const manifest = await response.json() as Manifest;
    const loader = new GLTFLoader();
    const assets = await Promise.allSettled(manifest.lods.map(lod => loader.loadAsync(`${ASSET_ROOT}${lod.file}`)));
    // Retain every fulfilled asset even if a sibling request fails, so the
    // engine's failed-initialization cleanup can release those resources.
    this.loaded = assets.flatMap(asset => asset.status === 'fulfilled' ? [asset.value] : []);
    const failed = assets.find(asset => asset.status === 'rejected');
    if (failed?.status === 'rejected') throw failed.reason;
    for (const clip of manifest.animations) this.descriptions.set(clip.name, clip);
    this.model = this.loaded[0].scene;
    this.root.name = `GSP_${this.slot}`;
    this.root.add(this.model);
    this.originalBackground = ctx.scene.background;
    ctx.scene.add(this.root);
    for (const asset of this.loaded) {
      const meshes: THREE.SkinnedMesh[] = [];
      asset.scene.traverse(object => { if (object instanceof THREE.SkinnedMesh) meshes.push(object); });
      if (!meshes.length) throw new Error('GSP export has no skinned mesh');
      if (asset === this.loaded[0]) this.meshes = meshes;
      // Each LOD export has the identical primitive/material order and bind rig.
      if (meshes.length !== this.meshes.length) throw new Error('GSP LOD primitive order differs');
      this.lodGeometry.push(meshes.map(mesh => mesh.geometry));
      for (let i = 0; i < meshes.length; i++) {
        const high = this.meshes[i].skeleton.bones.map(b => b.name).join('|');
        if (meshes[i].skeleton.bones.map(b => b.name).join('|') !== high) throw new Error('GSP LOD joint order differs');
      }
    }
    for (const mesh of this.meshes) {
      mesh.castShadow = ctx.quality === 'high'; mesh.receiveShadow = true;
      // A baked rest-pose bound cannot contain every animated paw and tail.
      mesh.frustumCulled = false;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        if (material instanceof THREE.MeshStandardMaterial) {
          material.roughness = 0.92; material.metalness = 0;
          if (material.map) material.map.anisotropy = Math.min(4, ctx.renderer.capabilities.getMaxAnisotropy());
        }
      }
    }
    this.mixer = new THREE.AnimationMixer(this.model);
    this.model.traverse(object => {
      if (object instanceof THREE.Bone) this.mixerPose.push({ bone: object, position: object.position.clone(), rotation: object.quaternion.clone(), scale: object.scale.clone() });
    });
    for (const clip of this.loaded[0].animations) {
      const action = this.mixer.clipAction(clip);
      const meta = this.descriptions.get(clip.name);
      if (!meta) throw new Error(`No metadata for GSP clip ${clip.name}`);
      action.setLoop(meta.loop ? THREE.LoopRepeat : THREE.LoopOnce, meta.loop ? Infinity : 1);
      action.clampWhenFinished = !meta.loop;
      this.actions.set(clip.name, action);
      if (['locate', 'stalk', 'carry'].includes(clip.name)) {
        const upper = clip.clone(); upper.name = `${clip.name}_posture`;
        upper.tracks = upper.tracks.filter(track => /^(Spine|Chest|Neck|Head|Jaw|Tail\d+|EarBase[LR]|EarTip[LR])\.(position|quaternion)$/.test(track.name));
        THREE.AnimationUtils.makeClipAdditive(upper, 0, this.loaded[0].animations.find(clip => clip.name === 'idle'));
        this.accents.set(clip.name, this.mixer.clipAction(upper));
      }
      if (clip.name === 'start' || clip.name === 'stop') {
        // Anticipation sits above the distance-driven gait. Stationary feet
        // from a start/stop clip must never override legs already travelling.
        const upper = clip.clone(); upper.name = `${clip.name}_upper`;
        upper.tracks = upper.tracks.filter(track => /^(Pelvis|Spine|Chest|Neck|Head)\.(position|quaternion)$/.test(track.name));
        THREE.AnimationUtils.makeClipAdditive(upper);
        const layer = this.mixer.clipAction(upper);
        layer.setLoop(THREE.LoopOnce, 1);
        this.transitions.set(clip.name, layer);
      }
    }
    this.mouth = this.bone('MouthSocket'); this.head = this.bone('Head');
    const pointClip = this.loaded[0].animations.find(clip => clip.name === 'point');
    if (!pointClip) throw new Error('GSP point clip missing');
    const pointContacts = sampleClipContacts(this.model, pointClip,
      ['FrontContact.L', 'FrontContact.R', 'HindContact.L', 'HindContact.R'].map(cleanName));
    for (const [id, prefix, side, names] of [
      ['FL','Front','L',['FrontPaw','Carpus','Forearm','UpperArm','Shoulder']],
      ['FR','Front','R',['FrontPaw','Carpus','Forearm','UpperArm','Shoulder']],
      ['HL','Hind','L',['HindPaw','Hock','Shin','Thigh','Hip']],
      ['HR','Hind','R',['HindPaw','Hock','Shin','Thigh','Hip']],
    ] as const) {
      this.legs.push({ id, tip: this.bone(`${prefix}Contact.${side}`), joints: names.map(n => this.bone(`${n}.${side}`)),
        anchor: new THREE.Vector3(), target: new THREE.Vector3(), contact: 0, locked: false, plantId: 0,
        lastTip: new THREE.Vector3(), stepFrom: new THREE.Vector3(), corrective: false, stepAge: 0,
        pointTarget: pointContacts.get(cleanName(`${prefix}Contact.${side}`))!, settling: null, preIK: new THREE.Vector3() });
    }
    this.changeClip('idle', true);
    this.setLod(ctx.quality === 'lite' ? 1 : 0);
    this.update(ctx, 0);
    if (this.slot === 0) this.installAudit(ctx);
  }
  private bone(name: string): THREE.Bone {
    const bone = this.model.getObjectByName(cleanName(name));
    if (!(bone instanceof THREE.Bone)) throw new Error(`GSP bone missing: ${name}`);
    return bone;
  }
  private setLod(index: number): void {
    if (index === this.lod) return;
    this.meshes.forEach((mesh, i) => { mesh.geometry = this.lodGeometry[index][i]; });
    this.lod = index;
  }
  private changeClip(name: string, immediate = false): void {
    if (name === this.activeName) return;
    const next = this.actions.get(name);
    if (!next) throw new Error(`GSP clip missing: ${name}`);
    const previous = this.active;
    const previousName = this.activeName;
    next.reset().setEffectiveWeight(1).play();
    if (previous) {
      if (immediate) previous.stop(); else crossFadeDogAction(next, previous, dogClipBlendSeconds(previousName, this.performanceName));
    }
    this.active = next; this.activeName = name; this.clipAge = 0;
    if (!immediate && previous) {
      const ordinaryGait = /^(walk|trot|lope|heel|turn_left|turn_right)$/;
      const starting = ordinaryGait.test(name) && /^(idle|attentive)$/.test(previousName);
      const stopping = /^(idle|attentive)$/.test(name) && ordinaryGait.test(previousName);
      if (starting || stopping) {
        this.transition?.stop();
        this.transition = this.transitions.get(starting ? 'start' : 'stop')!;
        this.transition.reset().setEffectiveWeight(0).play(); this.transitionAge = 0;
      }
    }
    const pointing = name === 'lock' || name === 'point';
    const wasPointing = previousName === 'lock' || previousName === 'point';
    if (pointing && !wasPointing && !immediate && this.placed) this.beginPointSettling();
    for (const leg of this.legs) {
      // A clip change is not a physical liftoff. Preserve the occupied support
      // points through lock→point and while the stopping feet take their turns.
      if (!pointing || immediate) { leg.locked = false; leg.settling = null; }
      if (immediate) leg.corrective = false;
    }
  }
  private beginPointSettling(): void {
    this.settlingAge = 0;
    const feet = this.legs.filter(leg => leg.id !== 'FL').map(leg => {
      const to = this.root.localToWorld(leg.pointTarget.clone());
      to.y = this.groundAt(to.x, to.z) + 0.002;
      return { id: leg.id, planted: leg.locked && leg.contact > 0.05, from: leg.lastTip, to };
    });
    for (const { id, delay } of planPointSettling(feet)) {
      const leg = this.legs.find(leg => leg.id === id)!;
      leg.corrective = false;
      leg.settling = { delay, from: leg.lastTip.clone(), started: false,
        pose: leg.joints.map(joint => ({ position: joint.position.clone(), rotation: joint.quaternion.clone() })) };
    }
  }
  partingPoint(out: { x: number; z: number; r: number }): void {
    out.x = this.root.position.x; out.z = this.root.position.z; out.r = 0.44;
  }
  mouthWorld(out: THREE.Vector3): boolean { this.mouth.getWorldPosition(out); return true; }

  update(ctx: Ctx, dt: number): void {
    if (!this.model) return;
    const dog = this.hunt.dog(this.slot);
    this.hunt.dogRenderWorld(ctx.fixedAlpha, this.pos, this.slot);
    const dx = this.pos.x - this.lastX, dz = this.pos.z - this.lastZ;
    const distance = this.placed ? Math.hypot(dx, dz) : 0;
    const speed = dt > 0 ? distance / dt : 0;
    this.speed = this.placed && !this.frozen ? THREE.MathUtils.lerp(this.speed, speed, 1 - Math.exp(-dt * 14)) : 0;
    if (distance > 3) { this.speed = 0; for (const leg of this.legs) { leg.locked = false; leg.corrective = false; leg.settling = null; } }
    const poseSpeed = this.frozen ? dog.gait === 'run' ? 4.4 : dog.gait === 'trot' ? 2.4 : dog.gait === 'track' ? 0.45 : 0 : this.speed;
    const intentHeading = this.hunt.dogRenderHeading(ctx.fixedAlpha, this.slot);
    const travelHeading = this.hunt.dogRenderTravelHeading(ctx.fixedAlpha, this.slot);
    const heading = dogTorsoHeading(dog, poseSpeed, travelHeading, intentHeading, Math.PI / 2 - this.lastYaw, dt, !this.placed || this.frozen || distance > 3);
    const yaw = Math.PI / 2 - heading;
    const deltaYaw = Math.atan2(Math.sin(yaw - this.lastYaw), Math.cos(yaw - this.lastYaw));
    const turnRate = dt > 0 ? deltaYaw / dt : 0;
    const performance = this.neutral ? 'idle' : this.phaseOverride?.clip ?? chooseDogClip(dog, poseSpeed, turnRate);
    this.performanceName = performance;
    const source = this.descriptions.get(performance)!;
    const name = this.phaseOverride ? performance : supportingGait(performance, poseSpeed, source.nominalSpeed);
    const separatePosture = name !== performance;
    const accentName = separatePosture ? performance : '';
    if (accentName !== this.accentName) {
      if (this.accent) this.frozen ? this.accent.stop() : this.accent.fadeOut(0.16);
      this.accent = this.accents.get(accentName) ?? null;
      if (this.accent) this.accent.reset().setEffectiveWeight(1).play().fadeIn(this.frozen ? 0 : 0.16);
      this.accentName = accentName;
    }
    this.changeClip(name, this.frozen);
    const meta = this.descriptions.get(name)!;
    this.clipAge += dt;
    this.settlingAge += ctx.paused ? 0 : dt;
    if (this.transition) {
      this.transitionAge += ctx.paused ? 0 : dt;
      const phase = Math.min(1, this.transitionAge / this.transition.getClip().duration);
      this.transition.setEffectiveWeight(Math.sin(phase * Math.PI) * 0.8);
      if (phase >= 1) { this.transition.stop(); this.transition = null; }
    }
    // Three's mixer skips writes when its sampled value did not change. Restore
    // the previous authored pose first, so stationary IK/gaze never accumulates.
    for (const pose of this.mixerPose) {
      pose.bone.position.copy(pose.position); pose.bone.quaternion.copy(pose.rotation); pose.bone.scale.copy(pose.scale);
    }
    this.active.setEffectiveTimeScale(meta.nominalSpeed > 0 ? Math.max(0.03, this.speed / meta.nominalSpeed) : 1);
    if (this.phaseOverride || this.frozen) {
      this.active.time = this.phaseOverride ? this.phaseOverride.phase * this.active.getClip().duration
        : name === 'lock' ? dog.scentProgress * this.active.getClip().duration
        : this.frozen ? 0 : this.active.time;
      this.mixer.update(0);
    } else if (name === 'lock') {
      // Scent progress owns this pose; mixer time must still complete the
      // incoming crossfade and release the previous gait/posture layers.
      advancePhaseDrivenAction(this.mixer, this.active, dog.scentProgress, ctx.paused ? 0 : dt);
    } else {
      // Shared pickup and hand-delivery holds last 0.7 and 0.35 seconds.
      // Fit those gestures to the real event, without delaying the hunt.
      if (name === 'pickup') this.active.setEffectiveTimeScale(dog.needsSearch ? 1 : this.active.getClip().duration / 0.7);
      if (name === 'deliver') this.active.setEffectiveTimeScale(this.active.getClip().duration / 0.35);
      this.mixer.update(ctx.paused ? 0 : dt);
    }
    for (const pose of this.mixerPose) {
      pose.position.copy(pose.bone.position); pose.rotation.copy(pose.bone.quaternion); pose.scale.copy(pose.bone.scale);
    }
    const ground = this.terrain.heightAt(this.pos.x, this.pos.z);
    const sample = 0.45;
    this.normal.set(
      this.terrain.heightAt(this.pos.x - sample, this.pos.z) - this.terrain.heightAt(this.pos.x + sample, this.pos.z),
      2 * sample,
      this.terrain.heightAt(this.pos.x, this.pos.z - sample) - this.terrain.heightAt(this.pos.x, this.pos.z + sample),
    ).normalize();
    this.terrainQ.setFromUnitVectors(UP, this.normal);
    this.q.setFromAxisAngle(UP, yaw);
    this.root.quaternion.copy(this.terrainQ).multiply(this.q);
    this.root.position.set(this.pos.x, ground, this.pos.z);
    this.root.updateMatrixWorld(true);
    // Base heading carries scent intent, not the quartering weave's actual
    // travel direction. Let the head address that intent above the moving torso.
    let headTarget = intentHeading;
    let lookAtIntent = poseSpeed > 0.06 && !this.neutral && !this.phaseOverride;
    if ((name === 'point' || name === 'lock') && dog.pointedBirdId !== null) {
      const bird = this.hunt.huntState().birds.find(bird => bird.id === dog.pointedBirdId);
      if (bird) {
        headTarget = Math.atan2(bird.pos.y - dog.pos.y, bird.pos.x - dog.pos.x); lookAtIntent = true;
      }
    }
    if (lookAtIntent) {
      // Exported bone axes vary; turn around parent-local world-up, not bone Z.
      this.head.parent!.getWorldQuaternion(this.parentQ).invert();
      this.c.copy(UP).applyQuaternion(this.parentQ);
      const turn = THREE.MathUtils.clamp(Math.atan2(Math.sin(heading - headTarget), Math.cos(heading - headTarget)), -0.26, 0.26);
      this.q.setFromAxisAngle(this.c, turn); this.head.quaternion.premultiply(this.q);
    }
    this.root.updateMatrixWorld(true);
    const cycle = this.active.time / this.active.getClip().duration;
    for (const leg of this.legs) leg.tip.getWorldPosition(leg.preIK);
    for (const leg of this.legs) {
      const pattern = meta.contacts[leg.id];
      leg.contact = contactWeight(cycle, pattern.offset, pattern.stanceFraction);
      if (name === 'lock' && leg.id === 'FL') leg.contact *= Math.max(0, 1 - dog.scentProgress * 4);
      leg.tip.getWorldPosition(this.a);
      const terrainY = this.terrain.heightAt(this.a.x, this.a.z);
      const support = leg.contact;
      if (leg.settling) {
        const settling = leg.settling;
        const phase = Math.min(1, Math.max(0, (this.settlingAge - settling.delay) / POINT_SETTLE_SECONDS));
        const waiting = this.settlingAge < settling.delay;
        const blend = phase * phase * (3 - 2 * phase);
        // Keep waiting leg joints continuous too: a new planted clip must not
        // fold the knee under a paw which has not yet taken its settling step.
        leg.joints.forEach((joint, i) => {
          joint.position.lerpVectors(settling.pose[i].position, joint.position, blend);
          this.correction.copy(joint.quaternion);
          joint.quaternion.copy(settling.pose[i].rotation).slerp(this.correction, blend);
        });
        this.root.updateMatrixWorld(true);
        if (waiting) {
          leg.target.copy(leg.anchor);
          leg.contact = 1;
        } else {
          if (!settling.started) { settling.started = true; this.settlingSteps++; }
          this.root.localToWorld(this.pointWorld.copy(leg.pointTarget));
          sampleCorrectiveStep(settling.from, this.pointWorld, phase, this.groundAt, leg.target);
          leg.contact = 0; leg.locked = false;
        }
        this.solveLeg(leg, leg.target);
        if (phase >= 1) {
          leg.anchor.copy(leg.target); leg.locked = true; leg.contact = 1; leg.plantId++;
          leg.settling = null;
        }
        leg.tip.getWorldPosition(leg.lastTip);
        continue;
      }
      // A turning body can outgrow the planted leg's correction range. Lift
      // and replant instead of silently teleporting an occupied support point.
      if (!leg.corrective && leg.locked && support > 0.05 && !this.frozen && !this.phaseOverride
        && Math.hypot(leg.anchor.x - this.a.x, leg.anchor.z - this.a.z) > 0.14) {
        leg.corrective = true; leg.stepAge = 0; leg.stepFrom.copy(leg.lastTip);
        leg.locked = false; this.contactResets++;
      }
      if (leg.corrective) {
        leg.stepAge += ctx.paused ? 0 : dt;
        const phase = Math.min(1, leg.stepAge / 0.1);
        sampleCorrectiveStep(leg.stepFrom, this.a, phase, this.groundAt, leg.target);
        leg.contact = 0; leg.locked = false;
        this.solveLeg(leg, leg.target);
        if (phase >= 1) {
          leg.corrective = false;
          if (support > 0.05) {
            leg.anchor.copy(leg.target); leg.locked = true; leg.contact = support; leg.plantId++;
          }
        }
        leg.tip.getWorldPosition(leg.lastTip);
        continue;
      }
      if (leg.contact < 0.05 || this.phaseOverride) {
        leg.locked = false;
        // Swing feet keep the authored arc, lifted only if terrain penetrates it.
        if (this.a.y < terrainY - 0.006) {
          leg.target.copy(this.a); leg.target.y = terrainY + 0.002;
          this.solveLeg(leg, leg.target);
        }
        leg.tip.getWorldPosition(leg.lastTip);
        continue;
      }
      if (!leg.locked) { leg.anchor.copy(this.a); leg.anchor.y = terrainY + 0.002; leg.locked = true; leg.plantId++; }
      leg.target.copy(this.a).lerp(leg.anchor, leg.contact);
      leg.target.y = this.terrain.heightAt(leg.target.x, leg.target.z) + 0.002;
      this.solveLeg(leg, leg.target);
      leg.tip.getWorldPosition(leg.lastTip);
    }
    const viewDistance = this.root.position.distanceTo(ctx.camera.position);
    const nearest = ctx.quality === 'lite' ? 1 : 0;
    this.setLod(viewDistance > (this.lod === 2 ? 33 : 39) ? 2 : viewDistance > (this.lod === 1 ? 14 : 19) ? 1 : nearest);
    this.root.visible = this.bodyVisible && viewDistance < 360;
    this.lastX = this.pos.x; this.lastZ = this.pos.z; this.lastYaw = yaw; this.placed = true;
  }
  private solveLeg(leg: Leg, target: THREE.Vector3): void {
    // CCD adjusts only the articulated leg chain after the mixer. Small, bounded
    // rotations preserve the authored knee/hock bend and forbid stretch scaling.
    for (let iteration = 0; iteration < 5; iteration++) {
      leg.tip.getWorldPosition(this.a);
      if (this.a.distanceToSquared(target) < 0.000009) break;
      for (const joint of leg.joints) {
        joint.getWorldPosition(this.b);
        leg.tip.getWorldPosition(this.a).sub(this.b).normalize();
        this.c.copy(target).sub(this.b).normalize();
        this.correction.setFromUnitVectors(this.a, this.c);
        const angle = 2 * Math.acos(Math.min(1, Math.abs(this.correction.w)));
        if (angle > 0.13) this.correction.slerp(this.identity, 1 - 0.13 / angle);
        joint.parent!.getWorldQuaternion(this.parentQ);
        this.q.copy(this.parentQ).invert().multiply(this.correction).multiply(this.parentQ);
        joint.quaternion.premultiply(this.q);
        joint.updateMatrixWorld(true);
      }
    }
  }
  private installAudit(ctx: Ctx): void {
    const audit: Record<string, unknown> = {
      state: () => {
        this.root.updateMatrixWorld(true);
        const dog = this.hunt.dog(this.slot);
        return { asset: 'blender-gsp', root: { x: this.root.position.x, y: this.root.position.y, z: this.root.position.z },
          rootQuaternion: { x: this.root.quaternion.x, y: this.root.quaternion.y, z: this.root.quaternion.z, w: this.root.quaternion.w },
          yaw: this.lastYaw, state: dog.state, gait: dog.gait, breed: dog.profile.breed.id,
          intentHeading: this.hunt.dogRenderHeading(ctx.fixedAlpha, this.slot),
          travelHeading: this.hunt.dogRenderTravelHeading(ctx.fixedAlpha, this.slot),
          scent: { stage: dog.scentStage, progress: dog.scentProgress }, clip: this.activeName, lod: this.lod,
          transition: this.transition?.getClip().name ?? null,
          performance: this.performanceName, posture: this.accentName || null,
          contactResets: this.contactResets,
          correctiveSteps: this.contactResets,
          settlingSteps: this.settlingSteps,
          gallop: { cycle: this.active.time / this.active.getClip().duration, gait: this.activeName === 'lope' ? 'gallop' : this.activeName, speedMps: this.speed,
            contacts: this.legs.map(leg => leg.contact > 0.1 ? 'stance' : 'swing'), locked: this.legs.map(leg => leg.locked) },
          paws: this.legs.map((leg, i) => { leg.tip.getWorldPosition(this.a); return { i, foot: leg.id, x: this.a.x, y: this.a.y, z: this.a.z,
            gap: this.a.y - this.terrain.heightAt(this.a.x, this.a.z), contact: leg.contact, plantId: leg.plantId,
            preIK: { x: leg.preIK.x, y: leg.preIK.y, z: leg.preIK.z },
            correctiveStep: leg.corrective, correctivePhase: leg.corrective ? Math.min(1, leg.stepAge / 0.1) : null,
            settlingStep: leg.settling?.started ?? false,
            settlingPhase: leg.settling ? Math.min(1, Math.max(0, (this.settlingAge - leg.settling.delay) / POINT_SETTLE_SECONDS)) : null }; }),
          mouth: this.mouth.getWorldPosition(this.a).toArray(),
        };
      },
      heightAt: (x: number, z: number) => this.terrain.heightAt(x, z),
      slopeAt: (x: number, z: number) => Math.hypot(this.terrain.heightAt(x + 0.5, z) - this.terrain.heightAt(x - 0.5, z), this.terrain.heightAt(x, z + 0.5) - this.terrain.heightAt(x, z - 0.5)),
      modelStats: () => ({ drawCalls: this.meshes.length, triangles: this.meshes.reduce((sum, mesh) => sum + (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3, 0), lod: this.lod }),
    };
    if (this.frozen) Object.assign(audit, {
      setFov: (degrees: number) => { ctx.camera.fov = degrees; ctx.camera.updateProjectionMatrix(); },
      setBodyVisible: (visible: boolean) => { this.bodyVisible = visible; this.root.visible = visible; },
      setReviewNeutral: (neutral: boolean) => { this.neutral = neutral; },
      setLocomotionPhase: (gait: string, phase: number) => { this.phaseOverride = { clip: gait === 'gallop' ? 'lope' : gait, phase: ((phase % 1) + 1) % 1 }; },
      setGallopPhase: (phase: number) => { this.phaseOverride = { clip: 'lope', phase: ((phase % 1) + 1) % 1 }; },
      setIsolated: (isolated: boolean) => {
        if (isolated) {
          this.visibility.clear();
          for (const child of ctx.scene.children) {
            if (child === this.root || child instanceof THREE.Light) continue;
            this.visibility.set(child, child.visible); child.visible = false;
          }
          ctx.scene.background = new THREE.Color(0x363a3a);
        } else {
          for (const [child, visible] of this.visibility) child.visible = visible;
          this.visibility.clear(); ctx.scene.background = this.originalBackground;
        }
      },
      project: (x: number, y: number, z: number) => {
        this.a.set(x,y,z).project(ctx.camera);
        return { x: (this.a.x * 0.5 + 0.5) * ctx.renderer.domElement.clientWidth, y: (0.5 - this.a.y * 0.5) * ctx.renderer.domElement.clientHeight };
      },
    });
    (window as unknown as { __dogAudit: unknown }).__dogAudit = audit;
  }
  dispose(ctx: Ctx): void {
    this.mixer?.stopAllAction();
    if (this.model) this.mixer?.uncacheRoot(this.model);
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    const skeletons = new Set<THREE.Skeleton>();
    for (const asset of this.loaded) asset.scene.traverse(object => {
      if (object instanceof THREE.Mesh) {
        geometries.add(object.geometry);
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          materials.add(material);
          for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
        }
        if (object instanceof THREE.SkinnedMesh) skeletons.add(object.skeleton);
      }
    });
    for (const lod of this.lodGeometry) for (const geometry of lod) geometries.add(geometry);
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    for (const texture of textures) texture.dispose();
    for (const skeleton of skeletons) skeleton.dispose();
    ctx.scene.remove(this.root);
  }
}
