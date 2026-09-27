import * as THREE from 'three';

const right = new THREE.Vector3();
const up = new THREE.Vector3();

/** Keep the directional depth grid fixed in world space as its coverage follows
 * the hunter. Snapping world X/Z independently moves the grid by fractional
 * texels for almost every sun angle, making small paws and stems shimmer. */
export function snapShadowTarget(
  target: THREE.Vector3,
  direction: THREE.Vector3,
  camera: THREE.OrthographicCamera,
  mapSize: THREE.Vector2,
): void {
  right.set(direction.z, 0, -direction.x);
  if (right.lengthSq() < 1e-12) right.set(1, 0, 0);
  else right.normalize();
  up.crossVectors(direction, right).normalize();
  const texelX = (camera.right - camera.left) / mapSize.x;
  const texelY = (camera.top - camera.bottom) / mapSize.y;
  const x = target.dot(right), y = target.dot(up);
  target.addScaledVector(right, Math.round(x / texelX) * texelX - x);
  target.addScaledVector(up, Math.round(y / texelY) * texelY - y);
}
