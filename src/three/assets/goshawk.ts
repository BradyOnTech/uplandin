import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

type Point = [number, number, number];
/** Juvenile goshawk, model-forward +Z. Separate feather, head, eyelid, tail and
 * wing joints keep the perched bird alive without changing flight physics. */
export function createGoshawk() {
  const root = new THREE.Group(), body = new THREE.Group(), head = new THREE.Group();
  root.name = 'goshawk'; body.name = 'breathing-body'; head.name = 'scanning-head';
  root.add(body); body.add(head); head.position.set(0, .412, .032);
  const materials = new Map<number, THREE.MeshStandardMaterial>();
  const brown = 0x655346, umber = 0x493b32, edge = 0x9a8062, cream = 0xc9b997;
  const material = (color: number) => {
    let m = materials.get(color);
    if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: .88 }); materials.set(color, m); }
    return m;
  };
  // Low warm bounce preserves the overlapping vanes in the field’s backlight.
  const featherMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .96, side: THREE.DoubleSide, emissive: 0x65513b, emissiveIntensity: .32 });
  function oval(parent: THREE.Object3D, color: number, p: Point, s: Point) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), material(color));
    mesh.position.set(...p); mesh.scale.set(...s); mesh.castShadow = true; mesh.receiveShadow = true;
    parent.add(mesh); return mesh;
  }
  // Curved vanes with tapered, rounded tips, a raised shaft and a warm feather
  // edge. Layered silhouettes stay legible from the handler's rear view.
  function feather(parent: THREE.Object3D, a: Point, b: Point, width: number, base: number, barred = false, conformBack = false) {
    const start = new THREE.Vector3(...a), delta = new THREE.Vector3(...b).sub(start);
    const side = new THREE.Vector3(1, 0, 0);
    const positions: number[] = [], colors: number[] = [], indices: number[] = [];
    for (let row = 0; row <= 10; row++) {
      const t = row / 10;
      const breadth = width * (row === 10 ? .015 : Math.pow(Math.sin(Math.PI * (.09 + t * .91)), .48));
      for (let lane = -1; lane <= 1; lane++) {
        const p = start.clone().addScaledVector(delta, t).addScaledVector(side, lane * breadth);
        p.z -= Math.sin(t * Math.PI) * (lane === 0 ? .003 : .001);
        if (conformBack) {
          const section = Math.sqrt(Math.max(.025,1-(p.x/.101)**2-((p.y-.255)/.172)**2));
          p.z = -.008 - .098*section - .003 - (lane===0?.001:0);
        }
        positions.push(p.x, p.y, p.z);
        const c = new THREE.Color(base);
        if (barred && Math.sin(t * Math.PI * 10) > .52) c.multiplyScalar(.53);
        if (lane !== 0) c.lerp(new THREE.Color(edge), .38);
        colors.push(c.r, c.g, c.b);
      }
      if (row < 10) for (let lane = 0; lane < 2; lane++) {
        const i = row * 3 + lane; indices.push(i, i + 3, i + 1, i + 1, i + 3, i + 4);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, featherMat); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh);
  }
  oval(body, brown, [0, .255, -.008], [.097, .165, .090]);
  oval(body, cream, [0, .253, .053], [.077, .133, .048]);
  oval(body, brown, [0, .363, .018], [.065, .080, .062]);
  // Fine tapered breast streaks, rather than raised black dots.
  for (let row = 0; row < 6; row++) for (let col = -2; col <= 2; col++) {
    const x = col * .025, y = .155 + row * .030, z = .098 - Math.abs(col) * .004;
    feather(body, [x, y + .018, z], [x + col * .001, y, z + .002], .0035, umber);
  }
  // Scapular feathers cover the back and overlap the folded wing roots.
  for (let row = 0; row < 7; row++) for (let col = -2; col <= 2; col++) {
    const x = col * .026, y = .360 - row * .027, z = -.069 - Math.cos(col * .5) * .025;
    feather(body, [x, y, z], [x * 1.05, y - .046, z - .004], .016, row % 2 ? brown : umber, false, true);
  }
  oval(head, brown, [0, .003, 0], [.060, .059, .069]);
  oval(head, cream, [0, -.031, .035], [.040, .034, .033]);
  const lids: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    oval(head, umber, [side * .051, .004, .036], [.011, .013, .016]);
    oval(head, 0xd1b341, [side * .059, .006, .037], [.006, .008, .008]);
    oval(head, 0x131914, [side * .064, .006, .039], [.0025, .005, .004]);
    oval(head, 0xf4e6c7, [side * .065, .009, .042], [.0012, .0016, .0013]);
    const lid = oval(head, brown, [side * .065, .007, .037], [.002, .009, .010]); lids.push(lid);
    oval(head, 0xcbb99a, [side * .051, .021, .015], [.010, .005, .044]).rotation.x = .10;
    for (let i = 0; i < 4; i++) feather(head, [side * .035, .044 - i * .009, -.031], [side * .037, .02 - i * .011, -.051], .009, i % 2 ? edge : brown);
  }
  oval(head, 0xa2a06b, [0, -.002, .069], [.021, .016, .022]);
  const beakCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, -.003, .078), new THREE.Vector3(0, -.012, .104), new THREE.Vector3(0, -.036, .103)]);
  const beak = new THREE.Mesh(new THREE.TubeGeometry(beakCurve, 10, .009, 10, false), material(0x31372f)); head.add(beak);
  const tail = new THREE.Group(); tail.name = 'barred-tail'; tail.position.set(0, .139, -.055); body.add(tail);
  for (let i = -2; i <= 2; i++) feather(tail, [i * .014, 0, 0], [i * .022, -.295, -.048 + Math.abs(i) * .004], .023, brown, true);
  const wings = [-1, 1].map(side => {
    const wing = new THREE.Group(); wing.position.set(side * .077, .327, -.016); wing.name = `wing-${side}`; body.add(wing);
    oval(wing, brown, [side * .016, -.073, -.025], [.039, .105, .040]);
    for (let i = 0; i < 8; i++) feather(wing, [side * .005, -.04, -.037], [side * (.018 + i * .003), -.263 + i * .008, -.060], .009, i % 2 ? brown : umber, true);
    for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
      const x = side * (.004 + col * .014), y = -.025 - row * .044;
      feather(wing, [x, y, -.057], [x + side * .008, y - .056, -.062], .012, brown);
    }
    return wing;
  });
  const legs = new THREE.Group(); legs.name = 'gripping-feet'; root.add(legs);
  for (const side of [-1, 1]) {
    oval(legs, cream, [side * .045, .108, .012], [.030, .069, .034]);
    oval(legs, 0xbda34c, [side * .044, .032, .024], [.009, .039, .010]);
    for (let toe = -1; toe <= 2; toe++) {
      const back = toe === 2, x = side * .044 + (back ? 0 : toe * .016), z = back ? -.022 : .082 - Math.abs(toe) * .009;
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(side * .044, .013, .026), new THREE.Vector3(x, .010, z), new THREE.Vector3(x, -.012, z + (back ? -.007 : .008))]);
      legs.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 8, .0045, 7, false), material(0xbda34c)));
      oval(legs, 0x262b24, [x, -.017, z + (back ? -.007 : .008)], [.003, .009, .005]);
    }
    oval(legs, 0x4b3c30, [side * .044, .031, .024], [.011, .008, .012]);
  }
  // Merge static detail per joint/material; feather count need not become draw-call count.
  for (const joint of [body, head, tail, ...wings, legs]) {
    const groups = new Map<THREE.Material, THREE.Mesh[]>();
    for (const child of [...joint.children]) if (child instanceof THREE.Mesh && !lids.includes(child)) {
      const mat = child.material as THREE.Material; const list = groups.get(mat) ?? []; list.push(child); groups.set(mat, list);
    }
    for (const [mat, meshes] of groups) {
      if (meshes.length < 2) continue;
      const geometries = meshes.map(mesh => { mesh.updateMatrix(); return mesh.geometry.clone().applyMatrix4(mesh.matrix); });
      const merged = mergeGeometries(geometries); geometries.forEach(g => g.dispose());
      if (!merged) continue;
      for (const mesh of meshes) { joint.remove(mesh); mesh.geometry.dispose(); }
      const mesh = new THREE.Mesh(merged, mat); mesh.castShadow = mat !== featherMat; mesh.receiveShadow = mat !== featherMat; joint.add(mesh);
    }
  }
  let flightBlend = 0;
  function pose(time: number, flying: boolean, grounded = false, movement = 0, dt = 1 / 60) {
    flightBlend = THREE.MathUtils.damp(flightBlend, flying ? 1 : 0, 14, dt);
    const breath = Math.sin(time * 2.6), shift = Math.sin(time * .63) * Math.sin(time * .27);
    const scan = Math.sin(time * .48) * .48 + Math.sin(time * 1.37) * .09;
    const ruffle = Math.pow(Math.max(0, Math.sin(time * .71)), 18);
    body.position.y = (1 - flightBlend) * (breath * .0025 + Math.abs(shift) * .002);
    body.rotation.set(THREE.MathUtils.lerp(grounded ? .34 : -.075 + movement * .045, Math.PI * .48, flightBlend), 0, (1 - flightBlend) * (shift * .025 + movement * Math.sin(time * 8) * .018));
    head.rotation.set(-flightBlend * .3 + (1 - flightBlend) * Math.sin(time * .84) * .045, flying ? 0 : scan, 0);
    // Brief eyelid closure, with several seconds open between blinks.
    const blink = Math.pow(Math.max(0, Math.cos((time + .4) * 1.23)), 140);
    lids.forEach(lid => lid.scale.y = .009 * Math.max(.02, blink));
    legs.visible = flightBlend < .7;
    tail.rotation.set(flying ? -.12 : .12 + shift * .045, shift * .025, 0);
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      const folded = -side * (.04 + ruffle * .055);
      wings[i].rotation.z = THREE.MathUtils.lerp(folded, side * (1.55 + Math.sin(time * 22) * .65), flightBlend);
      wings[i].rotation.y = side * (flightBlend * .2 + ruffle * .035);
      wings[i].scale.set(1, 1 + flightBlend * .75, 1);
    }
  }
  pose(0, false);
  return { root, pose, dispose() { root.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose(); }); materials.forEach(m => m.dispose()); featherMat.dispose(); } };
}

export function createFalconryGlove() {
  const root = new THREE.Group();
  const leather = new THREE.MeshStandardMaterial({ color: 0x69503b, roughness: .94 });
  const sleeve = new THREE.MeshStandardMaterial({ color: 0x535c46, roughness: 1 });
  const seam = new THREE.MeshStandardMaterial({ color: 0x9a7d59, roughness: 1 });
  const parts: [Point, Point, THREE.Material][] = [
    [[-.03, -.20, .19], [.072, .18, .074], sleeve],
    [[-.02, -.075, .06], [.087, .12, .083], leather],
    [[0, -.012, .01], [.09, .046, .062], leather],
    [[.075, -.046, .064], [.027, .061, .032], leather],
  ];
  for (let finger = 0; finger < 4; finger++) parts.push([[ -.060 + finger * .039, -.009, -.027], [.022, .032, .054], leather]);
  for (const [p, s, m] of parts) { const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), m); mesh.position.set(...p); mesh.scale.set(...s); root.add(mesh); }
  for (const side of [-1, 1]) {
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(side * .070, -.165, .062), new THREE.Vector3(side * .083, -.07, .001), new THREE.Vector3(side * .06, -.015, -.062)]);
    root.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, .0014, 5, false), seam));
  }
  return { root, dispose() { root.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose(); }); leather.dispose(); sleeve.dispose(); seam.dispose(); } };
}
