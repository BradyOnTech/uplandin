import * as THREE from 'three';
import { PHEASANT_GRAIN_BIN } from '../../game/pheasantHomesteadGround';
export { PHEASANT_GRAIN_BIN, PHEASANT_HOMESTEAD_OBSTACLES } from '../../game/pheasantHomesteadGround';

/** One vertex-coloured mesh: readable farm construction without per-board draws. */
export function createPheasantHomestead(material: THREE.Material, groundAt: (x: number, z: number) => number = () => 0): THREE.Group {
  const positions: number[] = [], colors: number[] = [];
  const tint = new THREE.Color();
  const foundation = [-7.2, 7.2].flatMap(x => [-3.15, 3.15].map(z => groundAt(x, z)));
  const floor = Math.max(...foundation) + .08, low = Math.min(...foundation);
  let elevation = floor;
  const append = (geometry: THREE.BufferGeometry, color: number) => {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    const vertices = flat.getAttribute('position');
    tint.setHex(color);
    for (let i = 0; i < vertices.count; i++) {
      positions.push(vertices.getX(i), vertices.getY(i) + elevation, vertices.getZ(i));
      colors.push(tint.r, tint.g, tint.b);
    }
    if (flat !== geometry) flat.dispose();
    geometry.dispose();
  };
  const beam = (size: [number, number, number], at: [number, number, number], color: number, rx = 0, rz = 0) => {
    const geometry = new THREE.BoxGeometry(...size);
    geometry.rotateX(rx); geometry.rotateZ(rz); geometry.translate(...at);
    append(geometry, color);
  };
  const wood = 0x9b8469, trim = 0xc6b58f, roof = 0x68706b, door = 0x635547;
  beam([14.35, floor - low + .25, 6.1], [0, -(floor - low) / 2, 0], 0x807d6d);
  beam([14, 4.1, 5.8], [0, 2.05, 0], wood);
  // Siding and corners carry scale even when the broad wall is in shade.
  for (const z of [-2.94, 2.94]) {
    for (let i = -6.5; i <= 6.5; i += .5)
      beam([.065, 4.05, .075], [i, 2.05, z], Math.round(i * 2) % 3 ? 0x87745e : 0xb09a7b);
    for (const x of [-6.88, 6.88]) beam([.18, 4.15, .10], [x, 2.08, z], trim);
    beam([14.1, .2, .16], [0, 4.08, z], trim);
  }
  // Close the gable ends beneath the sloping roof.
  for (const x of [-7, 7]) {
    const gable = new THREE.BufferGeometry();
    const triangle = [x, 4.1, -2.9, x, 5.75, 0, x, 4.1, 2.9];
    if (x < 0) triangle.splice(0, 9, x, 4.1, 2.9, x, 5.75, 0, x, 4.1, -2.9);
    gable.setAttribute('position', new THREE.Float32BufferAttribute(triangle, 3));
    append(gable, wood);
  }
  const pitch = Math.atan2(1.65, 2.9);
  for (const side of [-1, 1]) {
    beam([14.7, .18, 3.65], [0, 4.925, side * 1.45], roof, side * pitch);
  }
  beam([14.9, .18, .25], [0, 5.79, 0], 0x8c9083);
  // A small ventilating cupola breaks the long roof silhouette, while broad
  // roof panels and gable vents make the building read as a working farm.
  beam([1.7, .92, 1.3], [-1.9, 6.13, 0], trim);
  for (const z of [-.67, .67]) for (let i = 0; i < 4; i++)
    beam([1.3, .075, .035], [-1.9, 5.87 + i * .16, z], 0x4e554a);
  for (const side of [-1, 1]) {
    beam([2.05, .12, .86], [-1.9, 6.75, side * .35], roof, side * .38);
    for (let x = -6; x <= 6; x += 2)
      beam([.035, .035, 3.65], [x, 5.025, side * 1.45], 0x81867c, side * pitch);
    beam([.045, .8, 1.1], [side * 7.035, 4.62, 0], trim);
    beam([.055, .62, .85], [side * 7.06, 4.62, 0], 0x475147);
    for (let i = 0; i < 4; i++) beam([.065, .045, .87], [side * 7.08, 4.4 + i * .14, 0], trim);
  }
  // Shut sliding doors and cream rails distinguish the homestead from a void.
  beam([3.3, 3.2, .14], [0, 1.6, 3.02], door);
  for (const x of [-1.7, 0, 1.7]) beam([.12, 3.3, .18], [x, 1.65, 3.12], trim);
  for (const y of [.14, 3.24]) beam([3.6, .13, .18], [0, y, 3.12], trim);
  beam([4.6, .12, .14], [0, 3.5, 3.1], 0x494d48);
  for (const side of [-1, 1]) {
    beam([.12, 3.3, .12], [side * .83, 1.68, 3.16], trim, 0, side * .44);
    beam([1.4, 1.3, .15], [side * 4.55, 2.35, 3.02], trim);
    beam([1.13, 1.03, .17], [side * 4.55, 2.35, 3.05], 0x303b38);
    beam([.07, 1.05, .18], [side * 4.55, 2.35, 3.08], trim);
    beam([1.15, .07, .18], [side * 4.55, 2.35, 3.08], trim);
  }
  // The stored-grain landmark is one compact companion to the barn, not a
  // scatter of farm clutter. Its footing follows its own sampled ground.
  const bin = PHEASANT_GRAIN_BIN;
  const base = [0, Math.PI / 2, Math.PI, Math.PI * 1.5].map(a =>
    groundAt(bin.x + Math.cos(a) * 3.1, bin.z + Math.sin(a) * 3.1));
  elevation = Math.max(...base) + .05;
  const round = (r1: number, r2: number, h: number, y: number, color: number, open = false) => {
    const geometry = new THREE.CylinderGeometry(r1, r2, h, 16, 1, open);
    geometry.translate(bin.x, y, bin.z); append(geometry, color);
  };
  const footingDepth = elevation - Math.min(...base) + .22;
  round(3.1, 3.1, footingDepth, -footingDepth * .5 + .1, 0x8d8978);
  round(bin.radius, bin.radius, 5.2, 2.65, 0x93998c);
  for (let i = 1; i < 13; i++) round(bin.radius + .025, bin.radius + .025, .045, .12 + i * .4, 0x737e73, true);
  round(.26, bin.radius + .16, 1.45, 5.975, 0x747e74);
  round(.33, .33, .18, 6.78, 0x5c665e);
  beam([1.0, 1.9, .045], [bin.x, 1.0, bin.z + bin.radius + .02], 0x626d64);
  beam([1.12, .09, .08], [bin.x, 2.02, bin.z + bin.radius + .04], 0xb0b09a);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals(); geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Pheasant homestead'; mesh.castShadow = true; mesh.receiveShadow = true;
  const root = new THREE.Group(); root.add(mesh); return root;
}
