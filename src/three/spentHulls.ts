import * as THREE from 'three';

/**
 * Fired hulls thrown clear of the action. A pump or an autoloader flicks its
 * hull out of the ejection port to the right; a double's ejectors kick both
 * hulls back over the shoulder as the gun opens. Each hull tumbles, bounces
 * once or twice on the ground and lies where it lands for a while, so the
 * field keeps a trace of where the shooting happened.
 *
 * One instanced draw for every hull in the world. Purely cosmetic.
 */
export const HULL_RADIUS_M = .0094;
export const HULL_LENGTH_M = .064;
/** How long a hull lies on the ground before it is tidied away. */
export const HULL_REST_S = 90;
const SHRINK_S = .5;
const GRAVITY = 9.81;

export interface HullLaunch {
  /** World position of the hull's centre as it leaves the gun. */
  position: THREE.Vector3;
  /** World velocity, m/s. */
  velocity: THREE.Vector3;
  /** World orientation; the hull's axis is local +Z, brass head toward +Z. */
  orientation: THREE.Quaternion;
  /** World angular velocity, rad/s about each axis. */
  spin: THREE.Vector3;
}

interface Hull {
  active: boolean;
  resting: boolean;
  age: number;
  restAge: number;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  orientation: THREE.Quaternion;
  spin: THREE.Vector3;
  bounces: number;
}

/** A fired 12-bore hull: red plastic tube, brass head with a rim, open mouth. */
function hullGeometry(): THREE.BufferGeometry {
  const plastic = new THREE.Color(0x9e382b), brass = new THREE.Color(0xb89c55), mouth = new THREE.Color(0x3a1611);
  const body = new THREE.CylinderGeometry(HULL_RADIUS_M, HULL_RADIUS_M * 1.03, HULL_LENGTH_M * .78, 8, 1, true);
  body.translate(0, -HULL_LENGTH_M * .11, 0);
  const head = new THREE.CylinderGeometry(HULL_RADIUS_M * 1.06, HULL_RADIUS_M * 1.06, HULL_LENGTH_M * .22, 8, 1);
  head.translate(0, HULL_LENGTH_M * .39, 0);
  // The opened crimp: a dark disc set a little inside the mouth.
  const inside = new THREE.CircleGeometry(HULL_RADIUS_M * .92, 8).rotateX(Math.PI / 2);
  inside.translate(0, -HULL_LENGTH_M * .44, 0);
  const paint = (geometry: THREE.BufferGeometry, color: THREE.Color) => {
    const count = geometry.getAttribute('position').count, colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) color.toArray(colors, i * 3);
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.deleteAttribute('uv');
    return geometry.toNonIndexed();
  };
  const parts = [paint(body, plastic), paint(head, brass), paint(inside, mouth)];
  const positions: number[] = [], colors: number[] = [];
  for (const part of parts) {
    positions.push(...part.getAttribute('position').array);
    colors.push(...part.getAttribute('color').array);
    part.dispose();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  // Cylinders are built along +Y; the hull's axis is +Z, head toward +Z.
  geometry.rotateX(Math.PI / 2);
  geometry.computeVertexNormals();
  [body, head, inside].forEach(source => source.dispose());
  return geometry;
}

const scratchQuat = new THREE.Quaternion();
const scratchAxis = new THREE.Vector3();
const scratchMatrix = new THREE.Matrix4();
const scratchScale = new THREE.Vector3();
const zero = new THREE.Matrix4().makeScale(0, 0, 0);

export class SpentHulls {
  readonly mesh: THREE.InstancedMesh;
  private readonly hulls: Hull[];
  private next = 0;
  private dirty = true;

  constructor(readonly capacity = 12) {
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .55, metalness: .18, flatShading: true });
    this.mesh = new THREE.InstancedMesh(hullGeometry(), material, capacity);
    this.mesh.name = 'Spent hulls';
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = true;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.hulls = Array.from({ length: capacity }, () => ({
      active: false, resting: false, age: 0, restAge: 0, bounces: 0,
      position: new THREE.Vector3(), velocity: new THREE.Vector3(),
      orientation: new THREE.Quaternion(), spin: new THREE.Vector3(),
    }));
    for (let i = 0; i < capacity; i++) this.mesh.setMatrixAt(i, zero);
    this.mesh.visible = false;
  }

  /** Throw one hull. Past capacity the oldest hull in the world is reused. */
  emit(launch: HullLaunch): void {
    const hull = this.hulls[this.next];
    this.next = (this.next + 1) % this.capacity;
    hull.active = true; hull.resting = false; hull.age = 0; hull.restAge = 0; hull.bounces = 0;
    hull.position.copy(launch.position);
    hull.velocity.copy(launch.velocity);
    hull.orientation.copy(launch.orientation).normalize();
    hull.spin.copy(launch.spin);
    this.dirty = true;
    this.mesh.visible = true;
  }

  get count(): number { return this.hulls.reduce((n, hull) => n + (hull.active ? 1 : 0), 0); }

  /** Read-only view of a hull, for tests and capture tooling. */
  hull(i: number): Readonly<{ x: number; y: number; z: number; resting: boolean; axisY: number }> | null {
    const hull = this.hulls[i];
    if (!hull?.active) return null;
    scratchAxis.set(0, 0, 1).applyQuaternion(hull.orientation);
    return { x: hull.position.x, y: hull.position.y, z: hull.position.z, resting: hull.resting, axisY: scratchAxis.y };
  }

  step(dt: number, groundAt: (x: number, z: number) => number): void {
    if (dt <= 0 || !this.mesh.visible) { if (this.dirty) this.write(); return; }
    let any = false;
    for (const hull of this.hulls) {
      if (!hull.active) continue;
      any = true;
      hull.age += dt;
      if (!hull.resting) {
        hull.velocity.y -= GRAVITY * dt;
        // A light plastic hull feels the air: it slows, and tumbles less.
        hull.velocity.multiplyScalar(Math.exp(-.35 * dt));
        hull.position.addScaledVector(hull.velocity, dt);
        const rate = hull.spin.length();
        if (rate > 1e-6) {
          scratchQuat.setFromAxisAngle(scratchAxis.copy(hull.spin).divideScalar(rate), rate * dt);
          hull.orientation.premultiply(scratchQuat).normalize();
        }
        const ground = groundAt(hull.position.x, hull.position.z) + HULL_RADIUS_M;
        if (hull.position.y <= ground) {
          hull.position.y = ground;
          if (hull.velocity.y < -1.1 && hull.bounces < 3) {
            // A hollow plastic tube bounces low and skitters on.
            hull.bounces++;
            hull.velocity.y *= -.3;
            hull.velocity.x *= .5; hull.velocity.z *= .5;
            hull.spin.multiplyScalar(.45);
            hull.spin.y += (hull.bounces % 2 ? 1 : -1) * 6;
          } else this.settle(hull);
        }
      } else {
        hull.restAge += dt;
        if (hull.restAge > HULL_REST_S + SHRINK_S) hull.active = false;
      }
    }
    if (!any) this.mesh.visible = false;
    this.write();
  }

  /** Lie the hull on its side along its last heading, nested into the ground. */
  private settle(hull: Hull): void {
    hull.resting = true; hull.restAge = 0;
    hull.velocity.set(0, 0, 0); hull.spin.set(0, 0, 0);
    scratchAxis.set(0, 0, 1).applyQuaternion(hull.orientation);
    scratchAxis.y = 0;
    if (scratchAxis.lengthSq() < 1e-6) scratchAxis.set(Math.sin(hull.age * 13.7), 0, Math.cos(hull.age * 13.7));
    scratchAxis.normalize();
    // Point the hull's axis along the ground, then roll it a little about
    // that axis so the brass catches light differently on each hull.
    hull.orientation.setFromUnitVectors(new THREE.Vector3(0, 0, 1), scratchAxis);
    scratchQuat.setFromAxisAngle(scratchAxis, hull.age * 9.1 % (Math.PI * 2));
    hull.orientation.premultiply(scratchQuat);
    hull.position.y -= HULL_RADIUS_M * .25;
  }

  private write(): void {
    for (let i = 0; i < this.capacity; i++) {
      const hull = this.hulls[i];
      if (!hull.active) { this.mesh.setMatrixAt(i, zero); continue; }
      const shrink = hull.resting ? 1 - THREE.MathUtils.clamp((hull.restAge - HULL_REST_S) / SHRINK_S, 0, 1) : 1;
      scratchMatrix.compose(hull.position, hull.orientation, scratchScale.setScalar(shrink));
      this.mesh.setMatrixAt(i, scratchMatrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.dirty = false;
  }

  clear(): void {
    for (const hull of this.hulls) hull.active = false;
    this.dirty = true;
    this.write();
    this.mesh.visible = false;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}
