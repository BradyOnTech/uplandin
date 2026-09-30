import * as THREE from 'three';
import type { LandscapeModel } from '../../game/landscape';
import { PROPERTY_PX_TO_M } from '../../game/landscape';
import { mulberry32 } from '../../game/math';
import type { Ctx, Subsystem } from '../engine';

/**
 * The ranch's boundary fence: weathered cedar posts and four strands of
 * sagging barbed wire around the pasture, with braced corners and open wire
 * gates where the two parking places enter. It frames the property and gives
 * the long grass views a man-made scale line. Purely visual; the property
 * edge already bounds movement.
 */
export function sharptailFenceLine(landscape: LandscapeModel): { x: number; y: number }[] {
  const { x, y, w, h } = landscape.area.world, inset = 4;
  return [
    { x: x + inset, y: y + inset }, { x: x + w - inset, y: y + inset },
    { x: x + w - inset, y: y + h - inset }, { x: x + inset, y: y + h - inset }, { x: x + inset, y: y + inset },
  ];
}

export class SharptailFenceSystem implements Subsystem {
  readonly id = 'sharptail-fence';
  private objects: THREE.InstancedMesh[] = [];
  private geometries: THREE.BufferGeometry[] = [];
  private materials: THREE.Material[] = [];

  constructor(private readonly landscape: LandscapeModel) {}

  init(ctx: Ctx): void {
    const area = this.landscape.area, rng = mulberry32(area.terrain.seed ^ 0xfe7ce);
    const postGeo = new THREE.CylinderGeometry(.06, .08, 1.35, 6);
    postGeo.translate(0, .6, 0);
    const braceGeo = new THREE.CylinderGeometry(.09, .1, 1.7, 6);
    braceGeo.translate(0, .75, 0);
    const wireGeo = new THREE.BoxGeometry(1, .012, .012);
    this.geometries.push(postGeo, braceGeo, wireGeo);
    const wood = new THREE.MeshLambertMaterial({ color: 0x8b8272, flatShading: true });
    const wire = new THREE.MeshLambertMaterial({ color: 0x4d4f4b });
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
    const gates = area.dropPoints.map(d => d.position);
    const line = sharptailFenceLine(this.landscape), spacing = 5.2 / PROPERTY_PX_TO_M;
    for (let s = 1; s < line.length; s++) {
      const a = line[s - 1], b = line[s], length = Math.hypot(b.x - a.x, b.y - a.y);
      const count = Math.ceil(length / spacing);
      let previous: THREE.Vector3 | undefined;
      for (let i = 0; i <= count; i++) {
        const t = i / count, px = a.x + (b.x - a.x) * t, py = a.y + (b.y - a.y) * t;
        const gate = gates.some(g => Math.hypot(g.x - px, g.y - py) < 16);
        const corner = i === 0 || i === count;
        if (gate) {
          // Braced gate posts either side of an open wire gate.
          if (previous) { braces.push(matrix.compose(previous, q.identity(), new THREE.Vector3(1, 1, 1)).clone()); }
          previous = undefined; continue;
        }
        const p = at(px, py);
        // Cedar posts lean a little and vary in height; every seventh one
        // is a heavier line post.
        e.set((rng() - .5) * .08, rng() * Math.PI, (rng() - .5) * .08);
        const heavy = corner || i % 7 === 0;
        (heavy ? braces : posts).push(matrix.compose(p, q.setFromEuler(e), new THREE.Vector3(1, .9 + rng() * .2, 1)).clone());
        if (!previous && !corner) braces.push(matrix.compose(p, q.identity(), new THREE.Vector3(1, 1, 1)).clone());
        if (previous) {
          for (const [height, sag] of [[.38, .03], [.64, .04], [.9, .05], [1.14, .06]] as const) span(previous, p, height, sag, wires);
        }
        previous = p;
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
  }

  dispose(ctx: Ctx): void {
    for (const mesh of this.objects) { ctx.scene.remove(mesh); mesh.dispose(); }
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.objects.length = 0; this.geometries.length = 0; this.materials.length = 0;
  }
}
