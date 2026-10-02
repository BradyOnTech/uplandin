import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createSportingShotgun } from '../src/three/assets/shotgun';

const doubles = ['over-under', 'side-by-side'] as const;
const durationFor = (missing: number) => .55 + missing * .38;

describe('distinct sporting doubles', () => {
  it.each(['pump', 'semi-auto', ...doubles] as const)('%s seats its forend against the supporting barrel along both shoulders', action => {
    const model = createSportingShotgun(action, { hands: false });
    const forend = model.root.getObjectByName('Walnut forend')!;
    const wood = forend.children.find(object => object instanceof THREE.Mesh &&
      (object.material as THREE.MeshStandardMaterial).name === 'Walnut')!;
    const barrels = model.root.getObjectByName('Paired barrels and rib') ?? model.root.getObjectByName('Walnut stock, vented rib, blued steel')!;
    model.update(0, 0, 0, 0, 0); model.root.updateMatrixWorld(true);
    const down = new THREE.Raycaster(), up = new THREE.Raycaster();
    const xs = action === 'side-by-side' ? [-.0154, -.0094, .0094, .0154] : [-.008, .008];
    for (const z of [-.24, -.28, -.31]) for (const x of xs) {
      down.set(new THREE.Vector3(x, .12, z), new THREE.Vector3(0, -1, 0));
      up.set(new THREE.Vector3(x, action === 'pump' || action === 'semi-auto' ? -.009 : -.08, z), new THREE.Vector3(0, 1, 0));
      const timber = down.intersectObject(wood, true)[0];
      const metal = up.intersectObject(barrels, true)[0];
      expect(timber).toBeDefined(); expect(metal).toBeDefined();
      expect(timber.point.y, `Visible bedding gap at x=${x}, z=${z}`).toBeGreaterThanOrEqual(metal.point.y - .0002);
    }
    model.dispose();
  });

  it('keeps the fully retracted pump grip in front of the receiver', () => {
    const model = createSportingShotgun('pump', { hands: false });
    model.fire(); model.update(0, 0, 0, 0, .22); model.root.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(model.root.getObjectByName('Walnut forend')!);
    expect(bounds.max.z).toBeLessThan(-.132);
    model.dispose();
  });

  it.each(['pump', 'semi-auto', ...doubles] as const)('%s keeps the loading sleeve joined to its wrist with its cut end behind the camera', action => {
    const model = createSportingShotgun(action);
    const double = action === 'over-under' || action === 'side-by-side';
    const missing = double ? 2 : 3, duration = durationFor(missing);
    for (const progress of [.05, .15, .25, .35, .50, .70, .90, .99]) {
      const arc = Math.sin(progress * Math.PI);
      // The actual first-person carry/reload transform at a stationary camera.
      model.root.position.set(.19 + arc * .045, -.285 + arc * (double ? .13 : .075), -.50);
      model.root.rotation.order = 'YXZ';
      model.root.rotation.set(-.08 + arc * (double ? -.18 : .08), -.12, -.10 + arc * (double ? .28 : -1.05));
      model.update(progress * duration, duration, missing, 0, 0); model.root.updateMatrixWorld(true);
      const loading = model.root.getObjectByName('Loading grip')!;
      const sleeve = model.root.getObjectByName(loading.visible ? 'Loading forearm' : 'Support forearm') as THREE.Mesh;
      expect(sleeve.visible).toBe(true);
      const wrist = loading.visible ? loading.localToWorld(new THREE.Vector3(-.035, -.035, .053))
        : model.root.getObjectByName('Left glove and canvas cuff')!.localToWorld(new THREE.Vector3(0, -.075, -.168));
      expect(sleeve.localToWorld(new THREE.Vector3()).distanceTo(wrist)).toBeLessThan(1e-8);
      // The complete far cap, not merely its center, must remain behind the
      // camera. This catches the floating capped stump from the field captures.
      const positions = sleeve.geometry.attributes.position;
      for (let i = 10; i < 20; i++) {
        const point = sleeve.localToWorld(new THREE.Vector3().fromBufferAttribute(positions, i));
        expect(point.z).toBeGreaterThan(.02);
      }
    }
    model.dispose();
  });

  it.each(['pump', 'semi-auto', ...doubles] as const)('%s runs both sleeves past the camera at carry, the ready and mount', action => {
    const model = createSportingShotgun(action);
    // Carry, the walk-in ready and the settled mount, as gun.ts poses them.
    const poses = [
      { position: [.19, -.285, -.50], rotation: [-.08, -.12, -.10] },
      { position: [.25, -.31, -.34], rotation: [.50, .08, -.18] },
      { position: [0, -(.030 * Math.cos(.085) + .766 * Math.sin(.085)), -.34], rotation: [.085, 0, 0] },
    ] as const;
    for (const pose of poses) {
      model.root.position.fromArray(pose.position);
      model.root.rotation.order = 'YXZ'; model.root.rotation.set(pose.rotation[0], pose.rotation[1], pose.rotation[2]);
      model.update(0, 0, 0, 0, 0); model.root.updateMatrixWorld(true);
      const support = model.root.getObjectByName('Support forearm') as THREE.Mesh;
      const positions = support.geometry.attributes.position;
      for (let i = 10; i < 20; i++) expect(support.localToWorld(new THREE.Vector3().fromBufferAttribute(positions, i)).z).toBeGreaterThan(.02);
      // The trigger hand's sleeve runs on to an elbow behind the camera.
      const right = model.root.getObjectByName('Right glove and canvas cuff')!;
      const cuff = right.children.find(child => child instanceof THREE.Mesh && (child.material as THREE.MeshStandardMaterial).color.getHex() === 0x414b3d) as THREE.Mesh;
      const sleeve = cuff.geometry.attributes.position;
      let far = 0;
      for (let i = 0; i < sleeve.count; i++) {
        const local = new THREE.Vector3().fromBufferAttribute(sleeve, i);
        if (local.z < .69) continue;
        far++;
        expect(cuff.localToWorld(local).z).toBeGreaterThan(.02);
      }
      expect(far).toBeGreaterThan(9);
    }
    model.dispose();
  });

  it.each(doubles)('%s has the correct two muzzle axes and the shared ready sight line', action => {
    const model = createSportingShotgun(action);
    model.update(0, 0, 0, 0, 0); model.root.updateMatrixWorld(true);
    const muzzles = model.root.getObjectByName('Muzzle faces')!;
    const ray = new THREE.Raycaster();
    const hit = (x: number, y: number) => {
      ray.set(new THREE.Vector3(x, y, -1), new THREE.Vector3(0, 0, 1));
      return ray.intersectObject(muzzles, true);
    };
    const axes = action === 'side-by-side' ? [[-.0124, .007], [.0124, .007]] : [[0, .007], [0, -.0185]];
    for (const [x, y] of axes) {
      const intersections = hit(x, y);
      expect(intersections.length).toBeGreaterThan(0);
      expect(intersections[0].point.z).toBeCloseTo(-.77475, 5);
    }
    expect(action === 'side-by-side' ? hit(0, .007) : hit(0, -.00575)).toHaveLength(0);
    expect(model.bead.toArray()).toEqual([0, .030, -.766]);
    const barrels = model.root.getObjectByName('Break-action barrel assembly')!;
    expect(model.root.getObjectByName('Walnut forend')!.parent).toBe(barrels);
    expect(model.root.getObjectByName('Left glove and canvas cuff')!.parent).toBe(barrels);
    model.update(.31, durationFor(2), 2, 0, 0); model.root.updateMatrixWorld(true);
    expect(barrels.localToWorld(model.bead.clone()).y).toBeLessThan(-.35);
    model.dispose();
  });

  it.each(doubles)('%s ejects and inserts the requested one or two rounds within the shared reload clock', action => {
    for (const missing of [1, 2]) {
      const model = createSportingShotgun(action), duration = durationFor(missing);
      const rounds = [1, 2].map(i => model.root.getObjectByName(`Chamber round ${i}`)!);
      // The extractor lifts the fired hulls; an unfired round stays seated.
      model.update(.25, duration, missing, 0, 0);
      expect(rounds.filter(round => round.visible && round.position.z > -.15)).toHaveLength(missing);
      if (missing === 1) expect(rounds[1].position.z).toBe(-.15);
      // Then the ejectors throw them: the world takes the fired hulls, out of
      // their own open chambers, back toward the hunter and upward.
      model.update(.31, duration, missing, 0, 0);
      expect(rounds.filter(round => round.visible)).toHaveLength(2 - missing);
      for (let i = 0; i < missing; i++) {
        const exit = model.ejection(i, { position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), outward: new THREE.Vector3() });
        model.root.updateMatrixWorld(true);
        const chamber = rounds[i].parent!.localToWorld(rounds[i].position.clone());
        expect(exit.position.distanceTo(model.root.worldToLocal(chamber))).toBeLessThan(.02);
        expect(exit.outward.z).toBeGreaterThan(.4); expect(exit.outward.y).toBeGreaterThan(.4);
      }
      const closeStart = duration - .24, interval = (closeStart - .34) / missing;
      const loading = model.root.getObjectByName('Loading grip')!;
      const shell = model.root.getObjectByName('Visible loading shell')!;
      for (let i = 0; i < missing; i++) {
        model.update(.34 + (i + .55) * interval, duration, missing, 0, 0);
        expect(loading.visible).toBe(true); expect(shell.visible).toBe(true);
        expect(model.root.getObjectByName('Left glove and canvas cuff')!.visible).toBe(false);
        let draws = 0, triangles = 0;
        model.root.traverseVisible(object => {
          if (object instanceof THREE.Mesh) {
            draws++;
            triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3;
          }
        });
        expect(draws).toBeLessThanOrEqual(25);
        expect(triangles).toBeLessThan(4000);
        model.update(.34 + (i + .85) * interval, duration, missing, 0, 0);
        expect(shell.visible).toBe(false); expect(rounds[i].visible).toBe(true);
        expect(rounds[i].position.z).toBe(-.15);
      }
      const hinge = model.root.getObjectByName('Break-action hinge')!;
      model.update(duration - .08, duration, missing, 0, 0);
      expect(hinge.rotation.x).toBeLessThan(0);
      model.update(duration, duration, missing, 0, 0);
      expect(hinge.rotation.x).toBeCloseTo(0, 10);
      expect(loading.visible).toBe(false);
      expect(rounds.every(round => !round.visible)).toBe(true);
      expect(model.root.getObjectByName('Left glove and canvas cuff')!.position.length()).toBe(0);
      model.dispose();
    }
  });

  it('gives the pump a shorter sliding grip than the extended semiautomatic forend', () => {
    const pump = createSportingShotgun('pump'), semi = createSportingShotgun('semi-auto');
    const size = (model: typeof pump) => new THREE.Box3().setFromObject(model.root.getObjectByName('Walnut forend')!).getSize(new THREE.Vector3());
    expect(size(pump).z).toBeLessThan(size(semi).z * .7);
    expect(size(pump).x).toBeGreaterThan(size(semi).x);
    pump.dispose(); semi.dispose();
  });

  it('gives the A5 a high flat rear receiver with a sharp step above the walnut wrist', () => {
    const model = createSportingShotgun('semi-auto', { hands: false });
    model.root.updateMatrixWorld(true);
    const body = model.root.getObjectByName('Walnut stock, vented rib, blued steel')!;
    const ray = new THREE.Raycaster();
    const top = (z: number) => {
      ray.set(new THREE.Vector3(.004, .15, z), new THREE.Vector3(0, -1, 0));
      return ray.intersectObject(body, true)[0].point.y;
    };
    expect(top(.060)).toBeGreaterThan(.045);
    expect(Math.abs(top(.060) - top(-.070))).toBeLessThan(.002);
    expect(top(.060) - top(.085)).toBeGreaterThan(.030);
    expect(top(-.150)).toBeLessThan(.032);
    expect(model.bead.toArray()).toEqual([0, .030, -.766]);
    model.dispose();
  });

  it('keeps the Venus straight wrist and splinter foreend distinct from the Silver Pigeon pistol grip', () => {
    const venus = createSportingShotgun('side-by-side', { hands: false });
    const beretta = createSportingShotgun('over-under', { hands: false });
    const ray = new THREE.Raycaster();
    const underside = (model: typeof venus, group: string, z: number) => {
      model.root.updateMatrixWorld(true);
      ray.set(new THREE.Vector3(0, -.2, z), new THREE.Vector3(0, 1, 0));
      return ray.intersectObject(model.root.getObjectByName(group)!, true)[0].point.y;
    };
    const body = 'Walnut stock, vented rib, blued steel';
    expect(underside(venus, body, .16) - underside(beretta, body, .16)).toBeGreaterThan(.035);
    expect(underside(venus, 'Walnut forend', -.25) - underside(beretta, 'Walnut forend', -.25)).toBeGreaterThan(.025);
    venus.dispose(); beretta.dispose();
  });

  it('gives the Venus two physical triggers and the Silver Pigeon one within their open guards', () => {
    for (const action of doubles) {
      const model = createSportingShotgun(action, { hands: false });
      model.root.updateMatrixWorld(true);
      const body = model.root.getObjectByName('Walnut stock, vented rib, blued steel')!;
      const ray = new THREE.Raycaster();
      const hits = (z: number) => {
        ray.set(new THREE.Vector3(-.1, -.042, z), new THREE.Vector3(1, 0, 0));
        return ray.intersectObject(body, true);
      };
      expect(hits(.039).length).toBeGreaterThan(0);
      expect(hits(.061).length > 0).toBe(action === 'side-by-side');
      // The space between blades remains an opening, not a solid guard fill.
      expect(hits(.050)).toHaveLength(0);
      model.dispose();
    }
  });

  it.each(doubles)('%s holds a zero-time staged pose and releases shared resources once', action => {
    const model = createSportingShotgun(action);
    const pose = () => {
      const transforms: string[] = [];
      model.root.traverse(object => transforms.push(JSON.stringify([object.position.toArray(), object.quaternion.toArray(), object.visible])));
      return transforms;
    };
    model.update(.7, durationFor(2), 2, .2, 0); const first = pose();
    for (let i = 0; i < 20; i++) model.update(.7, durationFor(2), 2, .2, 0);
    expect(pose()).toEqual(first);
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    model.root.traverse(object => {
      if (object instanceof THREE.Mesh) {
        geometries.add(object.geometry);
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
      }
    });
    let geometryDisposals = 0, materialDisposals = 0;
    geometries.forEach(geometry => geometry.addEventListener('dispose', () => geometryDisposals++));
    materials.forEach(material => material.addEventListener('dispose', () => materialDisposals++));
    model.dispose();
    expect(geometryDisposals).toBe(geometries.size);
    expect(materialDisposals).toBe(materials.size);
  });

  it.each(['pump', 'semi-auto', ...doubles] as const)('%s can show its moving action without hands in the review viewer', action => {
    const model = createSportingShotgun(action, { hands: false });
    for (const elapsed of [0, .2, .6, 1, 1.3]) {
      model.update(elapsed, durationFor(2), 2, 0, 0);
      for (const name of ['Left glove and canvas cuff', 'Right glove and canvas cuff', 'Shell-loading left glove', 'Loading forearm', 'Support forearm']) {
        expect(model.root.getObjectByName(name)!.visible).toBe(false);
      }
      let draws = 0, triangles = 0;
      model.root.traverseVisible(object => {
        if (object instanceof THREE.Mesh) {
          draws++;
          triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3;
        }
      });
      expect(draws).toBeLessThanOrEqual(25);
      expect(triangles).toBeLessThan(4000);
    }
    model.dispose();
  });
});
