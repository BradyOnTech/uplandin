import * as THREE from 'three';
import type { Engine, Subsystem } from './engine';
import { dogRendererId } from './dogs/rendererId';
import type { HuntArrivalFrame, HuntArrivalSite } from './huntArrival';
import { birdFamilyFor, type BirdsSystem } from './subsystems/birds';
import type { GunSystem } from './subsystems/gun';
import type { Hunt3DSystem } from './subsystems/hunt3d';
import type { LandmarksSystem } from './subsystems/landmarks';
import type { PlayerSystem } from './subsystems/player';
import type { TerrainSystem } from './subsystems/terrain';
import { fieldTimeOfDay } from './palette';

/**
 * The tailgate photo: at the end of a hunt the day's birds lie side by side
 * on the open tailgate, the dogs stand by the truck, and the hunter takes
 * the picture. It is staged in the hunt's own scene, at the truck the dogs
 * came out of, and rendered through the same look as the field.
 */
export interface TailgateBird { speciesId: string; sex?: 'hen' | 'rooster' }
export interface TailgateSlot { bird: TailgateBird; lateral: number; turn: number }
export interface TailgatePhoto { full: string; thumb: string }

/** Room across the open gate, metres, and the most birds laid on it. */
export const TAILGATE_WIDTH_M = 1.34;
export const TAILGATE_MAX_BIRDS = 12;
/** Across the gate a bird takes lying on its side, by family. */
const LYING_WIDTH: Readonly<Record<string, number>> = { pheasant: .21, grouse: .19, chukar: .16, partridge: .15, quail: .12, woodcock: .12 };
const ORDER: readonly string[] = ['pheasant', 'grouse', 'chukar', 'partridge', 'quail', 'woodcock'];

/** Lay the bag side by side across the gate, biggest birds first, squeezing
 * a full limit of small birds closer rather than off the edge. Pure. */
export function tailgateLayout(birds: readonly TailgateBird[]): TailgateSlot[] {
  const rank = (bird: TailgateBird) => ORDER.indexOf(birdFamilyFor(bird.speciesId));
  const laid = [...birds].sort((a, b) => rank(a) - rank(b) || a.speciesId.localeCompare(b.speciesId)).slice(0, TAILGATE_MAX_BIRDS);
  const widths = laid.map(bird => LYING_WIDTH[birdFamilyFor(bird.speciesId)] ?? .15);
  const total = widths.reduce((sum, width) => sum + width, 0), squeeze = total > TAILGATE_WIDTH_M ? TAILGATE_WIDTH_M / total : 1;
  let edge = -total * squeeze / 2;
  return laid.map((bird, i) => {
    const width = widths[i] * squeeze, lateral = edge + width / 2;
    edge += width;
    // Laid by hand: none quite square to its neighbour.
    return { bird, lateral, turn: ((i * 37) % 5 - 2) * .04 };
  });
}

type ArrivalDog = Subsystem & { setArrivalPose?(pose: HuntArrivalFrame['dog'] | null, elapsed?: number, dt?: number): void };

/** A downed bird's body rests this high over what it lies on (birds.ts). */
const LYING_HEIGHT_M = .06;
/** How far round from straight behind the photographer stands, radians. */
const PICTURE_ANGLE = .34;

/** The truck's own axes at the release site (out the back, and across it)
 * and the middle of the open gate, between its hinge and its edge. */
function truckFrame(site: HuntArrivalSite) {
  const bx = site.tailgateEdge.x - site.crateFloor.x, bz = site.tailgateEdge.z - site.crateFloor.z, length = Math.hypot(bx, bz) || 1;
  const back = { x: bx / length, z: bz / length };
  const gate = { x: site.tailgateEdge.x - back.x * .19, y: site.tailgateEdge.y, z: site.tailgateEdge.z - back.z * .19 };
  return { back, across: { x: -back.z, z: back.x }, gate };
}

/**
 * Which side of the truck the picture is taken from: the side with the sun
 * more behind the photographer, so the birds and dogs are lit, not
 * silhouettes. +1 is the truck's right-hand side seen from behind.
 */
export function tailgateSide(back: { x: number; z: number }, sunAzimuthDeg: number): 1 | -1 {
  const sun = { x: Math.sin(sunAzimuthDeg * Math.PI / 180), z: Math.cos(sunAzimuthDeg * Math.PI / 180) };
  // Seen from behind the truck, its right is the negative across axis.
  const right = { x: back.z, z: -back.x };
  return right.x * sun.x + right.z * sun.z >= 0 ? 1 : -1;
}

function pictureSide(engine: Engine, site: HuntArrivalSite): 1 | -1 {
  const ctx = engine.ctx, area = ctx.get<Hunt3DSystem>('hunt3d').areaConfig().id;
  return tailgateSide(truckFrame(site).back, fieldTimeOfDay(area, ctx.timeOfDay).sunAzimuth);
}

/** Where the photographer stands, and what the picture is centred on:
 * a couple of metres back, swung round the gate's corner on the sun's side. */
function cameraSpot(site: HuntArrivalSite, side: 1 | -1) {
  const { back, across, gate } = truckFrame(site);
  // Across is the truck's left seen from behind; the dogs' corner is on `side`.
  const aim = { x: gate.x - across.x * side * .12, y: gate.y - .3, z: gate.z - across.z * side * .12 };
  const angle = -side * PICTURE_ANGLE, cos = Math.cos(angle), sin = Math.sin(angle);
  const dx = back.x * cos - back.z * sin, dz = back.x * sin + back.z * cos;
  return { aim, eye: { x: aim.x + dx * 2.35, z: aim.z + dz * 2.35 } };
}

/** Lay out the birds (the hunt's retrieved birds unless a bag is given),
 * open the truck and stand the dogs by it. Returns the undo, or null with no
 * truck to stage at. */
export function stageTailgate(engine: Engine, staged?: readonly TailgateBird[]): (() => void) | null {
  const ctx = engine.ctx, landmarks = ctx.get<LandmarksSystem>('landmarks'), site = landmarks.arrivalSite();
  if (!site) return null;
  const hunt = ctx.get<Hunt3DSystem>('hunt3d'), flock = ctx.get<BirdsSystem>('birds'), terrain = ctx.get<TerrainSystem>('terrain');
  const { back, across, gate } = truckFrame(site), side = pictureSide(engine, site);
  // The dogs are out: the box door is shut, so it never stands in the picture.
  landmarks.setTruckRelease({ crateDoor: 0, tailgate: 1 });
  const group = new THREE.Group(); group.name = 'Tailgate photo';
  const bag = staged ?? hunt.huntState().birds.filter(bird => bird.state === 'retrieved').map(bird => ({ speciesId: bird.speciesId, sex: bird.sex }));
  // Side by side, heads out over the edge and turned half toward the
  // photographer, each on its side as a downed bird lies in the grass.
  const heading = Math.atan2(back.x, back.z) + side * PICTURE_ANGLE * .5;
  for (const slot of tailgateLayout(bag)) {
    const bird = flock.trophyBird(slot.bird.speciesId, slot.bird.sex);
    bird.rotation.set(0, heading + slot.turn, 1.2, 'YXZ');
    bird.position.set(gate.x + across.x * slot.lateral, gate.y + LYING_HEIGHT_M, gate.z + across.z * slot.lateral);
    group.add(bird);
  }
  ctx.scene.add(group);
  // The dogs stand on the ground in front of the gate, a little to the
  // photographer's side so the birds show over them, facing the camera.
  const dogs = Array.from({ length: hunt.dogCount() }, (_, slot) => ctx.get<ArrivalDog>(dogRendererId(slot)));
  const { eye } = cameraSpot(site, side);
  dogs.forEach((dog, slot) => {
    const out = -side * (.4 - slot * .8), behind = .5 + slot * .1;
    const x = gate.x + across.x * out + back.x * behind, z = gate.z + across.z * out + back.z * behind;
    // Three-quarters on to the camera.
    const toCamera = Math.atan2(eye.z - z, eye.x - x);
    dog.setArrivalPose?.({ x, y: terrain.heightAt(x, z), z, heading: toCamera + (slot === 0 ? side : -side) * .45, pitch: .06,
      bodyCompression: 0, excitement: .25, locomotion: 'stand' }, 3, 0);
  });
  ctx.get<GunSystem>('gun').setArrivalHidden(true);
  return () => {
    group.removeFromParent();
    dogs.forEach(dog => dog.setArrivalPose?.(null));
    ctx.get<GunSystem>('gun').setArrivalHidden(false);
  };
}

/** Stand the hunter behind the truck on the sun's side, the gate and the dogs in the middle of the picture. */
export function frameTailgate(engine: Engine): boolean {
  const ctx = engine.ctx, site = ctx.get<LandmarksSystem>('landmarks').arrivalSite();
  if (!site) return false;
  const { aim, eye } = cameraSpot(site, pictureSide(engine, site)), x = eye.x, z = eye.z;
  const player = ctx.get<PlayerSystem>('player');
  const yaw = Math.atan2(-(aim.x - x), -(aim.z - z)) * 180 / Math.PI;
  // Standing, so the birds on the gate are seen from above its edge.
  player.setPose(ctx, x, z, yaw, 0, 0);
  const height = ctx.camera.position.y;
  player.setPose(ctx, x, z, yaw, Math.atan2(aim.y - height, Math.hypot(aim.x - x, aim.z - z)) * 180 / Math.PI, 0);
  ctx.camera.fov = 50; ctx.camera.updateProjectionMatrix();
  return true;
}

/** Take the picture: the full frame for the hunter and a small print for the journal. */
export function takeTailgatePhoto(engine: Engine): TailgatePhoto | null {
  if (!frameTailgate(engine)) return null;
  // A few frames let streamed cover and shadows settle round the new view.
  for (let frame = 0; frame < 4; frame++) engine.renderOnce();
  const canvas = engine.ctx.renderer.domElement;
  // Read back in the same task as the draw, before the browser presents it.
  const full = canvas.toDataURL('image/jpeg', .9);
  const print = document.createElement('canvas');
  print.width = 320; print.height = Math.round(320 * canvas.height / Math.max(1, canvas.width));
  print.getContext('2d')?.drawImage(canvas, 0, 0, print.width, print.height);
  const thumb = print.toDataURL('image/webp', .72);
  return { full, thumb: thumb.startsWith('data:image/webp') ? thumb : print.toDataURL('image/jpeg', .72) };
}
