import * as THREE from 'three';
import type { LandscapeModel } from '../../game/landscape';
import { PROPERTY_PX_TO_M } from '../../game/landscape';
import { mulberry32 } from '../../game/math';
import type { Ctx, Subsystem } from '../engine';
import { createQuailWindmill } from './quailLandmarks';
import { buildSharptailHistory } from './sharptailHistory';
import { createPrairieWater } from '../prairieWater';
import { SHARPTAIL_ENTRANCE_POSTS, sharptailEntrances } from '../../game/sharptailFeatures';

/**
 * Ranch furniture for the pasture. The boundary fence: weathered cedar
 * posts and four strands of sagging barbed wire, with braced line posts and
 * open wire gates where the two parking places enter; it frames the property
 * and gives the long grass views a man-made scale line (visual only; the
 * property edge already bounds movement). A windmill and stock tank stand
 * in the lower swale, a turning landmark that is solid to hunter and dogs.
 */
/** The windmill's footing in the south swale, well off every route. */
export const SHARPTAIL_WINDMILL = { x: 600, y: 470 } as const;

export function sharptailFenceLine(landscape: LandscapeModel): { x: number; y: number }[] {
  const { x, y, w, h } = landscape.area.world, inset = 4;
  return [
    { x: x + inset, y: y + inset }, { x: x + w - inset, y: y + inset },
    { x: x + w - inset, y: y + h - inset }, { x: x + inset, y: y + h - inset }, { x: x + inset, y: y + inset },
  ];
}

export class SharptailRanchSystem implements Subsystem {
  readonly id = 'sharptail-ranch';
  private obstacles: { x: number; z: number; radius: number }[] = [];
  private rotor?: THREE.Object3D;
  private mill?: THREE.Group;

  collisionCircles(): readonly { x: number; z: number; radius: number }[] { return this.obstacles; }
  private water = createPrairieWater();
  private extras: THREE.Object3D[] = [];
  private shotSolids: THREE.Object3D[] = [];
  private shotRay = new THREE.Raycaster();

  /** The homestead's walls stop shot; so do the windmill's tank and tower legs only by collision. */
  blocksShot(origin: { x: number; y: number; z: number }, target: { x: number; y: number; z: number }): boolean {
    if (!this.shotSolids.length) return false;
    const direction = new THREE.Vector3(target.x - origin.x, target.y - origin.y, target.z - origin.z);
    const distance = direction.length();
    if (distance < .001) return false;
    this.shotRay.set(new THREE.Vector3(origin.x, origin.y, origin.z), direction.divideScalar(distance));
    this.shotRay.far = distance - .001;
    return this.shotRay.intersectObjects(this.shotSolids, false).length > 0;
  }
  private objects: THREE.InstancedMesh[] = [];
  private geometries: THREE.BufferGeometry[] = [];
  private materials: THREE.Material[] = [];

  constructor(private readonly landscape: LandscapeModel) {}

  init(ctx: Ctx): void {
    const area = this.landscape.area, rng = mulberry32(area.terrain.seed ^ 0xfe7ce);
    // A mile of fence stays cheap: open five-sided posts (their tops are
    // below eye level only at the heavy braces) and flat two-triangle wire.
    const postGeo = new THREE.CylinderGeometry(.06, .08, 1.35, 5, 1, true);
    postGeo.translate(0, .6, 0);
    const braceGeo = new THREE.CylinderGeometry(.09, .1, 1.7, 5, 1, false);
    braceGeo.translate(0, .75, 0);
    const wireGeo = new THREE.PlaneGeometry(1, .014);
    this.geometries.push(postGeo, braceGeo, wireGeo);
    const wood = new THREE.MeshLambertMaterial({ color: 0x8b8272, flatShading: true, side: THREE.DoubleSide });
    const wire = new THREE.MeshLambertMaterial({ color: 0x4d4f4b, side: THREE.DoubleSide });
    this.materials.push(wood, wire);
    const posts: THREE.Matrix4[] = [], braces: THREE.Matrix4[] = [], wires: THREE.Matrix4[] = [];
    const matrix = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), xAxis = new THREE.Vector3(1, 0, 0);
    const world = { x: 0, z: 0 };
    const at = (px: number, py: number) => {
      this.landscape.propertyToWorld(px, py, world);
      return new THREE.Vector3(world.x, this.landscape.heightAtProperty(px, py), world.z);
    };
    const span = (a: THREE.Vector3, b: THREE.Vector3, height: number, sag: number, out: THREE.Matrix4[]) => {
      const from = a.clone().setY(a.y + height), to = b.clone().setY(b.y + height);
      const direction = to.clone().sub(from), mid = from.clone().add(to).multiplyScalar(.5);
      mid.y -= sag;
      q.setFromUnitVectors(xAxis, direction.clone().normalize());
      out.push(matrix.compose(mid, q, new THREE.Vector3(direction.length(), 1, 1)).clone());
    };
    // Openings where the two-tracks come in: gateposts either side and an
    // H-brace post beyond each, with regular line posts kept clear of them.
    const entrances = sharptailEntrances(area.world, area.dropPoints);
    const line = sharptailFenceLine(this.landscape), spacing = 5.2 / PROPERTY_PX_TO_M;
    const gate = SHARPTAIL_ENTRANCE_POSTS.gatepost / PROPERTY_PX_TO_M, brace = SHARPTAIL_ENTRANCE_POSTS.brace / PROPERTY_PX_TO_M;
    for (let s = 1; s < line.length; s++) {
      const a = line[s - 1], b = line[s], length = Math.hypot(b.x - a.x, b.y - a.y);
      const dx = (b.x - a.x) / length, dy = (b.y - a.y) / length;
      // Distances along this side of each opening's centre.
      const openings = entrances.map(e => ({ at: (e.x - a.x) * dx + (e.y - a.y) * dy, off: Math.abs((e.x - a.x) * dy - (e.y - a.y) * dx) }))
        .filter(o => o.off < 1 && o.at > 0 && o.at < length).map(o => o.at);
      const count = Math.ceil(length / spacing);
      const stations: { t: number; heavy: boolean; after?: 'gap' }[] = [];
      for (let i = 0; i <= count; i++) {
        const t = i / count * length;
        if (openings.some(o => Math.abs(t - o) < brace + spacing * .45)) continue;
        stations.push({ t, heavy: i === 0 || i === count || i % 7 === 0 });
      }
      for (const o of openings) stations.push({ t: o - brace, heavy: true }, { t: o - gate, heavy: true, after: 'gap' }, { t: o + gate, heavy: true }, { t: o + brace, heavy: true });
      stations.sort((m, n) => m.t - n.t);
      let previous: THREE.Vector3 | undefined;
      for (const station of stations) {
        const p = at(a.x + dx * station.t, a.y + dy * station.t);
        // Cedar posts lean a little and vary in height; every seventh one
        // is a heavier line post.
        e.set((rng() - .5) * (station.heavy ? .02 : .08), rng() * Math.PI, (rng() - .5) * (station.heavy ? .02 : .08));
        (station.heavy ? braces : posts).push(matrix.compose(p, q.setFromEuler(e), new THREE.Vector3(1, station.heavy ? 1.12 : .9 + rng() * .2, 1)).clone());
        if (previous) {
          for (const [height, sag] of [[.38, .03], [.64, .04], [.9, .05], [1.14, .06]] as const) span(previous, p, height, sag, wires);
        }
        previous = station.after === 'gap' ? undefined : p;
      }
    }
    const add = (geometry: THREE.BufferGeometry, material: THREE.Material, list: THREE.Matrix4[], name: string, shadow: boolean) => {
      if (!list.length) return;
      const mesh = new THREE.InstancedMesh(geometry, material, list.length);
      list.forEach((m, i) => mesh.setMatrixAt(i, m));
      mesh.name = name; mesh.castShadow = shadow && ctx.quality === 'high'; mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      ctx.scene.add(mesh); this.objects.push(mesh);
    };
    add(postGeo, wood, posts, 'Sharptail fence posts', true);
    add(braceGeo, wood, braces, 'Sharptail fence line posts', true);
    add(wireGeo, wire, wires, 'Sharptail fence wire', false);

    const millWorld = this.landscape.propertyToWorld(SHARPTAIL_WINDMILL.x, SHARPTAIL_WINDMILL.y, { x: 0, z: 0 });
    const ground = this.landscape.heightAtWorld(millWorld.x, millWorld.z);
    const mill = createQuailWindmill((x, z) => this.landscape.heightAtWorld(millWorld.x + x, millWorld.z + z) - ground);
    mill.position.set(millWorld.x, ground, millWorld.z);
    mill.rotation.y = -.6;
    mill.traverse(child => { if ((child as THREE.Mesh).isMesh) { child.castShadow = ctx.quality === 'high'; child.receiveShadow = true; } });
    this.rotor = mill.getObjectByName('Quail wind rotor');
    // Tower and tank, matching the windmill kit's own layout under its turn.
    const c = Math.cos(-.6), s = Math.sin(-.6);
    this.obstacles.push({ x: millWorld.x, z: millWorld.z, radius: 1.3 },
      { x: millWorld.x + 3.35 * c + .35 * s, z: millWorld.z - 3.35 * s + .35 * c, radius: 1.3 });
    ctx.scene.add(mill);
    this.mill = mill;
    buildSharptailHistory({
      landscape: this.landscape, castShadow: ctx.quality === 'high', obstacles: this.obstacles, shotSolids: this.shotSolids,
      waterMaterial: this.water.material,
      keep: object => { ctx.scene.add(object); this.extras.push(object); object.updateMatrixWorld(true); },
      own: resource => { if (resource instanceof THREE.BufferGeometry) this.geometries.push(resource); else this.materials.push(resource); },
    });
    this.materials.push(this.water.material);
  }

  update(ctx: Ctx): void {
    this.water.update(ctx);
    if (this.rotor) this.rotor.rotation.z = -ctx.time * .32;
  }

  dispose(ctx: Ctx): void {
    if (this.mill) {
      ctx.scene.remove(this.mill);
      this.mill.traverse(child => {
        if (child instanceof THREE.Mesh) { child.geometry.dispose(); for (const m of [child.material].flat()) m.dispose(); }
      });
      this.mill = undefined; this.rotor = undefined;
    }
    this.obstacles.length = 0;
    for (const object of this.extras) ctx.scene.remove(object);
    this.extras.length = 0; this.shotSolids.length = 0;
    for (const mesh of this.objects) { ctx.scene.remove(mesh); mesh.dispose(); }
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.objects.length = 0; this.geometries.length = 0; this.materials.length = 0;
  }
}
