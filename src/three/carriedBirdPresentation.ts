import * as THREE from 'three';

const CARRY_MORPH = 'carried-rest';

/** Resting dimensions stay species-sized beside the dog, independent of
 * the readable target enlargement used only during a rise. */
export function restingBirdScale(family: string): number {
  return family === 'quail' ? 1.1 : family === 'pheasant' || family === 'woodcock' ? 1.25
    : family === 'chukar' ? 1.4 : family === 'partridge' ? 1.35 : 1.45;
}

function appendPose(geometry: THREE.BufferGeometry, deform: (point: THREE.Vector3) => void): void {
  const pose = new THREE.BufferGeometry();
  if (geometry.index) pose.setIndex(geometry.index.clone());
  const position = geometry.getAttribute('position').clone();
  const point = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    point.fromBufferAttribute(position, i); deform(point); position.setXYZ(i, point.x, point.y, point.z);
  }
  pose.setAttribute('position', position); pose.computeVertexNormals();
  position.name = CARRY_MORPH;
  (geometry.morphAttributes.position ??= []).push(position);
  (geometry.morphAttributes.normal ??= []).push(pose.getAttribute('normal').clone());
  geometry.computeBoundingSphere(); pose.dispose();
}

/** Alternate poses share the flight mesh/topology and begin at zero weight.
 * No new draw calls, per-frame vertex edits or changes to hit geometry. */
export function addCarriedBirdPoses(body: THREE.BufferGeometry, left: THREE.BufferGeometry,
  right: THREE.BufferGeometry, speciesId: string): void {
  // Ringnecks already have an authored relaxed neck used on the ground.
  if (speciesId !== 'ringneck') appendPose(body, point => {
    const amount = THREE.MathUtils.smoothstep(point.z, .040, .105);
    const angle = amount * .95, y = point.y - .012, z = point.z - .052;
    if (amount > 0) { point.y = .012 + y * Math.cos(angle) - z * Math.sin(angle); point.z = .052 + y * Math.sin(angle) + z * Math.cos(angle); }
    // Tail feathers relax behind the grip; the central body retains volume.
    if (point.z < -.078) point.y -= (-point.z - .078) * .24;
  });
  for (const [side, wing] of [[-1, left], [1, right]] as const) appendPose(wing, point => {
    const span = Math.max(0, side * point.x);
    if (span === 0) return;
    // A folded arm lies near the flank while the hand and feather tips
    // hang under their own weight. Shoulder vertices remain exactly fixed.
    const fold = THREE.MathUtils.smoothstep(span, 0, .045);
    const tuckedSpan = .030 * (1 - Math.exp(-span / .045));
    point.x = side * THREE.MathUtils.lerp(span, tuckedSpan, fold);
    point.z -= span * .56 * fold;
    point.y -= span * (side < 0 ? .64 : .77) * fold;
  });
}

function poseWeight(mesh: THREE.Mesh, weight: number): void {
  const index = mesh.morphTargetDictionary?.[CARRY_MORPH];
  if (index !== undefined && mesh.morphTargetInfluences) mesh.morphTargetInfluences[index] = weight;
}

export interface CarriedBirdParts {
  body: THREE.Mesh;
  wingLMesh: THREE.Mesh;
  wingRMesh: THREE.Mesh;
  wingL: THREE.Group;
  wingR: THREE.Group;
  tailMesh?: THREE.Mesh;
}

const relaxedWing = new THREE.Quaternion();

/** Called after the normal folded-wing pose, only for an attached bird. */
export function poseCarriedBird(parts: CarriedBirdParts, presence: number, elapsed: number, moving: boolean): void {
  poseWeight(parts.body, presence); poseWeight(parts.wingLMesh, presence); poseWeight(parts.wingRMesh, presence);
  parts.wingL.quaternion.slerp(relaxedWing, presence);
  parts.wingR.quaternion.slerp(relaxedWing, presence);
  // Quiet unequal pendulum motion, not a wingbeat. It disappears as the
  // dog stops to offer the bird, while the mouth remains the exact grip.
  const sway = moving ? Math.sin(elapsed * 7.5) * .025 * presence : 0;
  parts.wingL.rotation.z += sway;
  parts.wingR.rotation.z += sway * .65;
  if (parts.tailMesh?.visible) { parts.tailMesh.rotation.x = -.20 * presence; parts.tailMesh.rotation.y = sway * .5; }
}
