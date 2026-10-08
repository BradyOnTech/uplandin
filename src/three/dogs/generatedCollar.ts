import * as THREE from 'three';

/**
 * A blaze-orange field collar, the way real bird dogs wear one: snug around
 * the mid-neck, behind the ears. Hunters put dogs in orange so they can pick
 * them out of cover; fluorescent fabric keeps a little glow in low light.
 */
export const BLAZE_ORANGE = 0xff5a1c;
const COLLAR_WIDTH_M = 0.024;
const COLLAR_THICKNESS_M = 0.0045;
/** Clearance over the coat so the band never sinks into the neck. */
const COLLAR_GAP_M = 0.0025;
const COLLAR_SEGMENTS = 20;

/**
 * Measure the neck in bind pose: cast rays inward from outside the neck,
 * around its axis, and return the surface distance from the axis per segment.
 */
export function measureNeck(surface: THREE.Object3D, center: THREE.Vector3, axis: THREE.Vector3, segments = COLLAR_SEGMENTS): number[] {
  const { side, up } = collarBasis(axis);
  const raycaster = new THREE.Raycaster();
  const direction = new THREE.Vector3(), origin = new THREE.Vector3();
  return Array.from({ length: segments }, (_, i) => {
    const a = i * Math.PI * 2 / segments;
    direction.copy(side).multiplyScalar(Math.cos(a)).addScaledVector(up, Math.sin(a));
    // Start just outside the neck so the first surface met is the neck itself.
    origin.copy(center).addScaledVector(direction, .15);
    raycaster.set(origin, direction.clone().negate());
    const hit = raycaster.intersectObject(surface, false)[0];
    return hit ? .15 - hit.distance : .045;
  });
}

/** A closed band (outer face, inner face and both rims) around the measured neck. */
export function createCollarGeometry(center: THREE.Vector3, axis: THREE.Vector3, radii: readonly number[]): THREE.BufferGeometry {
  const { side, up } = collarBasis(axis);
  const segments = radii.length;
  const positions: number[] = [], indices: number[] = [];
  const direction = new THREE.Vector3(), p = new THREE.Vector3();
  // Four rings of vertices per surface keep the outer and inner faces smooth
  // while the rims stay crisp: [outer back, outer front, inner back, inner front].
  const ring = (radiusOffset: number, along: number) => {
    const start = positions.length / 3;
    for (let i = 0; i < segments; i++) {
      const a = i * Math.PI * 2 / segments;
      direction.copy(side).multiplyScalar(Math.cos(a)).addScaledVector(up, Math.sin(a));
      p.copy(center).addScaledVector(axis, along).addScaledVector(direction, radii[i] + radiusOffset);
      positions.push(p.x, p.y, p.z);
    }
    return start;
  };
  const half = COLLAR_WIDTH_M / 2, inner = COLLAR_GAP_M, outer = COLLAR_GAP_M + COLLAR_THICKNESS_M;
  const band = (a: number, b: number, flip: boolean) => {
    for (let i = 0; i < segments; i++) {
      const j = (i + 1) % segments;
      if (flip) indices.push(a + i, b + i, a + j, a + j, b + i, b + j);
      else indices.push(a + i, a + j, b + i, a + j, b + j, b + i);
    }
  };
  // Outer face (normals out), inner face (normals in), then the two rims.
  band(ring(outer, -half), ring(outer, half), false);
  band(ring(inner, -half), ring(inner, half), true);
  band(ring(inner, half), ring(outer, half), true);
  band(ring(inner, -half), ring(outer, -half), false);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function createCollarMaterial(faceted = false): THREE.MeshLambertMaterial {
  // Fluorescent blaze holds some of its color in shade and at dusk.
  return new THREE.MeshLambertMaterial({ color: BLAZE_ORANGE, emissive: BLAZE_ORANGE, emissiveIntensity: .22, flatShading: faceted });
}

/** Side (dog's left-right) and up-across-the-neck directions around the neck axis. */
function collarBasis(axis: THREE.Vector3): { side: THREE.Vector3; up: THREE.Vector3 } {
  const side = new THREE.Vector3(1, 0, 0);
  const up = new THREE.Vector3().crossVectors(axis, side).normalize();
  return { side, up };
}
