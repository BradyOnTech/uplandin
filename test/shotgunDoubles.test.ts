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
      (object.material as THREE.MeshStandardMaterial).color.getHex() === 0x70503a)!;
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
      model.update(.31, duration, missing, 0, 0);
      expect(rounds.filter(round => round.visible && round.position.z > -.13)).toHaveLength(missing);
      if (missing === 1) expect(rounds[1].position.z).toBe(-.15);
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
