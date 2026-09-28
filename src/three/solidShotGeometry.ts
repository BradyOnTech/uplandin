import * as THREE from 'three';

interface Point { x: number; y: number; z: number }

/** Static solid triangles share the rendered geometry and placement. Render
 * culling, foliage, and broad walking circles never determine pellet cover. */
export class SolidShotGeometry {
  private solids: THREE.Mesh[] = [];
  private ray = new THREE.Raycaster();
  private direction = new THREE.Vector3();
  private sphere = new THREE.Sphere();
  private instance = new THREE.Matrix4();
  private hits: THREE.Intersection[] = [];
  private empty = new THREE.BufferGeometry();
  private material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  private proxy = new THREE.Mesh(this.empty, this.material);
  private disposed = false;

  add(mesh: THREE.Mesh): void {
    mesh.geometry.computeBoundingBox();
    mesh.geometry.computeBoundingSphere();
    if (mesh instanceof THREE.InstancedMesh) mesh.computeBoundingSphere();
    this.solids.push(mesh);
  }

  blocks(origin: Point, target: Point): boolean {
    if (!this.solids.length) return false;
    this.direction.set(target.x - origin.x, target.y - origin.y, target.z - origin.z);
    const distance = this.direction.length();
    if (!Number.isFinite(distance) || distance <= .002) return false;
    this.ray.ray.origin.set(origin.x, origin.y, origin.z);
    this.ray.ray.direction.copy(this.direction).divideScalar(distance);
    this.ray.near = .001;
    this.ray.far = distance - .001;
    for (const mesh of this.solids) {
      // Hidden cells can skip renderer matrix updates. Keep physical transforms
      // current, including the parent, without changing visibility/materials.
      mesh.updateWorldMatrix(true, false);
      const bounds = mesh instanceof THREE.InstancedMesh ? mesh.boundingSphere : mesh.geometry.boundingSphere;
      if (bounds) {
        this.sphere.copy(bounds).applyMatrix4(mesh.matrixWorld);
        if (this.sphere.distanceToPoint(this.ray.ray.origin) > distance || !this.ray.ray.intersectsSphere(this.sphere)) continue;
      }
      this.proxy.geometry = mesh.geometry;
      const count = mesh instanceof THREE.InstancedMesh ? mesh.count : 1;
      for (let i = 0; i < count; i++) {
        this.proxy.matrixWorld.copy(mesh.matrixWorld);
        if (mesh instanceof THREE.InstancedMesh) {
          mesh.getMatrixAt(i, this.instance);
          this.proxy.matrixWorld.multiply(this.instance);
        }
        this.hits.length = 0;
        // Mesh.raycast rejects each instance's sphere/box before triangle work.
        // Double-sided physics also catches a ray leaving a closed solid.
        this.proxy.raycast(this.ray, this.hits);
        if (this.hits.length) { this.hits.length = 0; return true; }
      }
    }
    return false;
  }

  dispose(): void {
    this.solids.length = 0;
    this.hits.length = 0;
    this.proxy.geometry = this.empty;
    if (this.disposed) return;
    this.disposed = true;
    this.empty.dispose();
    this.material.dispose();
  }
}
