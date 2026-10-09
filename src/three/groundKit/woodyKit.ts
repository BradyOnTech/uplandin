import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * THE SHARED WOODY KIT: low-poly brush and trees authored in the headless
 * Blender pipeline (tools3d/assets/woody-kit/build.py), one GLB per species
 * and detail: high and lite for the near band, far for the distance.
 *
 * Loaded geometry is flattened to one non-indexed mesh per asset with its
 * vertex paint, normalised to unit height (position.y doubles as the wind
 * bend weight). Foliage normals are softened toward the crown's own
 * roundness so a thicket reads as foliage, not as faceted stone; wood
 * keeps its facets.
 */
export type WoodySpecies =
  | 'buckbrush' | 'chokecherry' | 'buffaloberry' | 'wild-rose'
  | 'sand-plum' | 'shinnery' | 'sand-sage'
  | 'mesquite' | 'hackberry' | 'elm' | 'cottonwood';
export type WoodyDetail = 'high' | 'lite' | 'far';

export interface WoodyAsset {
  /** Unit-height geometry: position, normal, color. */
  geometry: THREE.BufferGeometry;
  /** Authored height, metres. */
  height: number;
}

export type WoodyKit = Map<string, WoodyAsset>;
export const woodyKey = (species: WoodySpecies, detail: WoodyDetail): string => `${species}-${detail}`;

/** How far foliage normals lean from their facet toward the crown's own
 * roundness (0 = faceted, 1 = a smooth ball). */
const FOLIAGE_ROUNDNESS = .6;

export async function loadWoodyKit(species: readonly WoodySpecies[], details: readonly WoodyDetail[]): Promise<WoodyKit> {
  const loader = new GLTFLoader(), kit: WoodyKit = new Map();
  const jobs = species.flatMap(name => details.map(detail => ({ name, detail })));
  const results = await Promise.allSettled(jobs.map(job => loader.loadAsync(`${import.meta.env.BASE_URL}models/woody-kit/${job.name}-${job.detail}.glb`)));
  try {
    results.forEach((result, i) => {
      if (result.status === 'rejected') throw result.reason;
      kit.set(woodyKey(jobs[i].name, jobs[i].detail), flattenWoody(result.value.scene));
    });
    return kit;
  } catch (error) {
    for (const asset of kit.values()) asset.geometry.dispose();
    throw error;
  } finally {
    for (const result of results) if (result.status === 'fulfilled') result.value.scene.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      node.geometry.dispose();
      for (const m of Array.isArray(node.material) ? node.material : [node.material]) m.dispose();
    });
  }
}

/** One loaded asset scene into a single painted, unit-height geometry. */
export function flattenWoody(scene: THREE.Object3D): WoodyAsset {
  scene.updateMatrixWorld(true);
  const positions: number[] = [], normals: number[] = [], colors: number[] = [];
  const parts: { mesh: THREE.Mesh; foliage: boolean }[] = [];
  scene.traverse(node => { if (node instanceof THREE.Mesh) parts.push({ mesh: node, foliage: /foliage/.test(node.name) || /foliage/.test(node.parent?.name ?? '') }); });
  let height = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), r = new THREE.Vector3();
  for (const { mesh, foliage } of parts) {
    const source = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    const geometry = source.index ? source.toNonIndexed() : source;
    if (geometry !== source) source.dispose();
    const p = geometry.getAttribute('position'), paint = geometry.getAttribute('color');
    const tint = (mesh.material as THREE.MeshStandardMaterial).color ?? new THREE.Color(1, 1, 1);
    // The crown's centre, for foliage roundness.
    const centre = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) { centre.x += p.getX(i); centre.y += p.getY(i); centre.z += p.getZ(i); }
    centre.multiplyScalar(1 / Math.max(1, p.count));
    for (let i = 0; i < p.count; i += 3) {
      a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
      n.subVectors(c, b).cross(new THREE.Vector3().subVectors(a, b)).normalize();
      for (const [k, v] of [a, b, c].entries()) {
        positions.push(v.x, v.y, v.z);
        height = Math.max(height, v.y);
        if (foliage) {
          r.subVectors(v, centre); r.y *= 1.6;
          r.normalize().lerp(n, 1 - FOLIAGE_ROUNDNESS).normalize();
          normals.push(r.x, r.y, r.z);
        } else normals.push(n.x, n.y, n.z);
        const j = i + k;
        colors.push((paint ? paint.getX(j) : 1) * tint.r, (paint ? paint.getY(j) : 1) * tint.g, (paint ? paint.getZ(j) : 1) * tint.b);
      }
    }
    geometry.dispose();
  }
  const scale = 1 / Math.max(.01, height);
  for (let i = 0; i < positions.length; i++) positions[i] *= scale;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();
  return { geometry, height };
}
