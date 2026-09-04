import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { mulberry32 } from '../../game/math';
import type { LandscapeModel } from '../../game/landscape';
import type { Ctx, Subsystem } from '../engine';
import { P } from '../palette';
import type { Hunt3DSystem, WorldPatch } from './hunt3d';
import type { TerrainSystem } from './terrain';

/*
 * PROPS subsystem: authored environment heroes (Kenney Nature Kit, CC0,
 * under public/models/kenney + License.txt) placed inside the prairie
 * composition. The PoC proved the same renderer reads production with
 * authored shapes; this system is the shipping path for that result.
 *
 *  - Area-gated: quail-fields only until other areas get their own sets.
 *  - Deterministic: fixed authored placements, rejected (skipped, never
 *    re-rolled) inside sim cover patches + margin so the dog's cover stays
 *    readable and the composition survives seed/drop changes.
 *  - Normalized at load (the asset-compiler step in miniature): Kenney GLBs
 *    ship metalness 1 with no env map (renders black) and sRGB numbers in
 *    baseColorFactor — both are fixed here, then albedo is lerp-tinted
 *    toward palette roles so packs sit in the world instead of on it.
 *  - Cheap: ~13 meshes, on for both quality tiers. Async init is awaited by
 *    Engine.start, so ?capture=1 frames never catch props mid-load.
 *  - Zero per-frame work; dispose() releases everything.
 */

type TintRole = 'leaf' | 'wood' | 'stone' | 'accent';

interface PropDef {
  /** Model file under public/models/. .glb = Kenney, .fbx = Quaternius. */
  file: string;
  x: number;
  z: number;
  /** World scale multiplier. NOTE: Quaternius FBX ships in centimeters, so
   *  its defs bake ×0.01 into s (a 312-unit tree at s=0.014 stands 4.4 m). */
  s: number;
  ry: number;
  sink: number;
  tint: TintRole;
}

const QUAIL_PROPS: readonly PropDef[] = [
  // NOTE: tree_pineDefaultA is quarantined (renders black in headless
  // captures despite healthy geometry — possibly a SwiftShader flat-shading
  // quirk; needs an on-device check before use). tree_detailed carries all
  // tree placements until then; file stays in public/models/kenney.
  { file: 'tree_detailed.glb', x: -13, z: 22, s: 3.2, ry: 0.4, sink: 0.1, tint: 'leaf' },
  { file: 'tree_detailed.glb', x: 11, z: 18, s: 2.4, ry: 2.2, sink: 0.1, tint: 'leaf' },
  { file: 'tree_detailed.glb', x: 26, z: 4, s: 3.4, ry: 3.6, sink: 0.1, tint: 'leaf' },
  { file: 'tree_detailed.glb', x: -25, z: 0, s: 2.6, ry: 1.1, sink: 0.1, tint: 'leaf' },
  { file: 'tree_detailed.glb', x: 5, z: -12, s: 2.2, ry: 5.0, sink: 0.1, tint: 'leaf' },
  { file: 'rock_largeA.glb', x: -6, z: 26, s: 1.6, ry: 0.7, sink: 0.2, tint: 'stone' },
  { file: 'rock_smallD.glb', x: 14, z: 28, s: 1.4, ry: 2.9, sink: 0.08, tint: 'stone' },
  { file: 'rock_largeA.glb', x: -18, z: 34, s: 1.3, ry: 4.4, sink: 0.2, tint: 'stone' },
  { file: 'plant_bushDetailed.glb', x: -11, z: 22, s: 2.0, ry: 0.2, sink: 0.15, tint: 'leaf' },
  { file: 'plant_bushDetailed.glb', x: -16, z: 27, s: 2.4, ry: 2.0, sink: 0.15, tint: 'leaf' },
  { file: 'plant_bushDetailed.glb', x: -7, z: 18, s: 1.6, ry: 4.0, sink: 0.15, tint: 'leaf' },
  { file: 'plant_bushDetailed.glb', x: 14, z: 12, s: 2.0, ry: 1.4, sink: 0.15, tint: 'leaf' },
  { file: 'plant_bushDetailed.glb', x: -20, z: 16, s: 2.2, ry: 3.0, sink: 0.15, tint: 'leaf' },
  // Scrub variety (bush family), more rocks, deadfall, hero grass tufts.
  { file: 'plant_bushLarge.glb', x: -8, z: 26, s: 2.4, ry: 0.9, sink: 0.12, tint: 'leaf' },
  { file: 'plant_bushLarge.glb', x: 18, z: 22, s: 2.8, ry: 2.4, sink: 0.12, tint: 'leaf' },
  { file: 'plant_bushLarge.glb', x: -22, z: 10, s: 2.2, ry: 4.1, sink: 0.12, tint: 'leaf' },
  { file: 'plant_bushSmall.glb', x: -4, z: 34, s: 2.2, ry: 0.3, sink: 0.12, tint: 'leaf' },
  { file: 'plant_bushSmall.glb', x: 8, z: 36, s: 2.4, ry: 1.7, sink: 0.12, tint: 'leaf' },
  { file: 'plant_bushSmall.glb', x: 22, z: 14, s: 2.0, ry: 3.3, sink: 0.12, tint: 'leaf' },
  { file: 'plant_bushTriangle.glb', x: 30, z: -2, s: 2.6, ry: 1.2, sink: 0.12, tint: 'leaf' },
  { file: 'plant_bushTriangle.glb', x: -30, z: 28, s: 2.4, ry: 5.1, sink: 0.12, tint: 'leaf' },
  { file: 'plant_bush.glb', x: -14, z: 34, s: 2.2, ry: 2.8, sink: 0.12, tint: 'leaf' },
  { file: 'plant_bush.glb', x: 4, z: 8, s: 2.0, ry: 0.6, sink: 0.12, tint: 'leaf' },
  { file: 'rock_largeB.glb', x: -16, z: 14, s: 1.6, ry: 1.9, sink: 0.18, tint: 'stone' },
  { file: 'rock_largeC.glb', x: 20, z: 30, s: 1.5, ry: 0.4, sink: 0.18, tint: 'stone' },
  { file: 'rock_smallA.glb', x: 4, z: 24, s: 1.6, ry: 2.2, sink: 0.12, tint: 'stone' },
  { file: 'rock_smallA.glb', x: -10, z: 38, s: 1.5, ry: 4.7, sink: 0.12, tint: 'stone' },
  { file: 'rock_smallA.glb', x: 16, z: 6, s: 1.7, ry: 1.1, sink: 0.12, tint: 'stone' },
  { file: 'rock_smallB.glb', x: -24, z: 20, s: 1.6, ry: 3.8, sink: 0.12, tint: 'stone' },
  { file: 'rock_smallB.glb', x: 28, z: 26, s: 1.5, ry: 5.5, sink: 0.12, tint: 'stone' },
  { file: 'log_large.glb', x: -2, z: 16, s: 2.0, ry: 1.2, sink: 0.2, tint: 'wood' },
  { file: 'log_large.glb', x: 24, z: 20, s: 1.8, ry: 2.6, sink: 0.2, tint: 'wood' },
  { file: 'log.glb', x: 12, z: 32, s: 2.2, ry: 0.5, sink: 0.15, tint: 'wood' },
  { file: 'grass_large.glb', x: -3, z: 46, s: 2.2, ry: 0.8, sink: 0.03, tint: 'leaf' },
  { file: 'grass_large.glb', x: 6, z: 48, s: 2.5, ry: 2.5, sink: 0.03, tint: 'leaf' },
  { file: 'grass_large.glb', x: -7, z: 58, s: 2.4, ry: 4.2, sink: 0.03, tint: 'leaf' },
  { file: 'grass_large.glb', x: 10, z: 60, s: 2.6, ry: 1.5, sink: 0.03, tint: 'leaf' },
  { file: 'grass.glb', x: 2, z: 54, s: 2.5, ry: 3.1, sink: 0.03, tint: 'leaf' },
  { file: 'grass.glb', x: -5, z: 62, s: 2.2, ry: 5.8, sink: 0.03, tint: 'leaf' },
  // Quaternius Ultimate Nature (CC0, FBX in centimeters — s bakes ×0.01).
  // Dead snags are the prairie signature the Kenney set lacks.
  { file: 'CommonTree_2.fbx', x: 16, z: 2, s: 0.014, ry: 1.8, sink: 0.02, tint: 'leaf' },
  { file: 'CommonTree_Dead_2.fbx', x: -18, z: 8, s: 0.015, ry: 0.7, sink: 0.02, tint: 'wood' },
  { file: 'Willow_Dead_1.fbx', x: 30, z: 34, s: 0.013, ry: 2.9, sink: 0.02, tint: 'wood' },
  { file: 'Bush_1.fbx', x: -10, z: 28, s: 0.009, ry: 0.5, sink: 0.05, tint: 'leaf' },
  { file: 'Bush_1.fbx', x: 10, z: 20, s: 0.008, ry: 2.1, sink: 0.05, tint: 'leaf' },
  { file: 'Bush_2.fbx', x: 24, z: 10, s: 0.009, ry: 1.4, sink: 0.05, tint: 'leaf' },
  { file: 'Bush_2.fbx', x: -28, z: 36, s: 0.01, ry: 3.7, sink: 0.05, tint: 'leaf' },
  { file: 'Rock_3.fbx', x: -4, z: 20, s: 0.014, ry: 0.9, sink: 0.1, tint: 'stone' },
  { file: 'Rock_Moss_2.fbx', x: 8, z: 28, s: 0.015, ry: 2.3, sink: 0.1, tint: 'stone' },
  { file: 'TreeStump.fbx', x: 14, z: 38, s: 0.01, ry: 1.1, sink: 0.05, tint: 'wood' },
  { file: 'WoodLog_Moss.fbx', x: -12, z: 44, s: 0.011, ry: 1.1, sink: 0.15, tint: 'wood' },
  { file: 'Grass.fbx', x: -5, z: 50, s: 0.008, ry: 0.4, sink: 0.02, tint: 'leaf' },
  { file: 'Grass_2.fbx', x: 7, z: 56, s: 0.009, ry: 2.7, sink: 0.02, tint: 'leaf' },
];

/**
 * Seeded scatter ring: the Firewatch mass step. Fixed heroes compose the
 * near frame; this fills the 25–90 m band with scrub/rock/tuft variety so
 * the midground isn't an empty plain. Same rejection rules as heroes, plus
 * the hero-view corridor (|x| < 3 on the az-0 axis) and the drop/truck disc
 * stay clear. One fixed stream — identical every boot, both tiers.
 */
const SCATTER_COUNT = 24;
const SCATTER_SEED = 0x9c41c3;
const SCATTER_TYPES: readonly { file: string; s0: number; s1: number; sink: number; tint: TintRole }[] = [
  { file: 'plant_bushSmall.glb', s0: 1.8, s1: 2.6, sink: 0.12, tint: 'leaf' },
  { file: 'plant_bushTriangle.glb', s0: 2.0, s1: 2.8, sink: 0.12, tint: 'leaf' },
  { file: 'plant_bush.glb', s0: 1.8, s1: 2.6, sink: 0.12, tint: 'leaf' },
  { file: 'rock_smallA.glb', s0: 1.2, s1: 2.0, sink: 0.12, tint: 'stone' },
  { file: 'rock_smallB.glb', s0: 1.2, s1: 2.0, sink: 0.12, tint: 'stone' },
  { file: 'grass_large.glb', s0: 1.8, s1: 2.8, sink: 0.03, tint: 'leaf' },
];

/** Rejection margin around sim cover (world meters) — props never sit in it. */
const PATCH_MARGIN = 3;

/**
 * Per-file foliage grade: Kenney's mint-teal greens need a hard pull toward
 * the palette (bushes/tufts hardest — they sit in full sun at eye level).
 * Quaternius greens ship near-palette already, so they grade lightly.
 */
function leafGrade(file: string): number {
  const f = file.toLowerCase();
  if (f.endsWith('.fbx')) return 0.3;
  if (f.startsWith('plant_bush') || f.startsWith('grass')) return 0.9;
  if (f.startsWith('rock_')) return 0.85;
  return 0.7;
}

function tintFor(name: string, file: string, fallback: TintRole): { role: TintRole; k: number } {
  const n = name.toLowerCase();
  const fbx = file.toLowerCase().endsWith('.fbx');
  // Authored character accents (berries, mushrooms) — never graded.
  if (n.includes('berry') || n.includes('mushroom')) return { role: 'accent', k: 0 };
  if (n.includes('leaf') || n.includes('grass') || n.includes('green')) return { role: 'leaf', k: 0 };
  // Kenney 'dirt' runs hot terracotta in direct sun — grade it harder.
  if (n.includes('dirt') || n.includes('soil')) return { role: 'wood', k: 0.8 };
  if (n.includes('wood') || n.includes('bark')) return { role: 'wood', k: fbx ? 0.3 : 0.5 };
  if (n.includes('rock')) return { role: 'stone', k: 0.35 };
  return { role: fallback, k: fallback === 'leaf' ? leafGrade(file) : fallback === 'wood' ? 0.5 : 0.35 };
}

export class PropsSystem implements Subsystem {
  readonly id = 'props';

  constructor(private readonly landscape: LandscapeModel) {}

  private group = new THREE.Group();
  private geos = new Set<THREE.BufferGeometry>();
  private mats = new Set<THREE.Material>();
  private leaf = new THREE.Color(P.canopyGreen);
  private wood = new THREE.Color(P.soilBrown);
  private stone = new THREE.Color(P.stoneGray);

  async init(ctx: Ctx): Promise<void> {
    if (this.landscape.area.id !== 'quail-fields') return;
    const terrain = ctx.get<TerrainSystem>('terrain');
    const hunt = ctx.get<Hunt3DSystem>('hunt3d');
    const patches = hunt.coverPatches();

    const gltfLoader = new GLTFLoader();
    const fbxLoader = new FBXLoader();
    const root = `${import.meta.env.BASE_URL}models/`;
    const pathFor = (file: string): string =>
      file.toLowerCase().endsWith('.fbx') ? `quaternius/${file}` : `kenney/${file}`;
    // Normalized source scenes (fixed once per file; placements share them).
    const cache = new Map<string, THREE.Object3D>();
    const load = async (file: string, tint: TintRole): Promise<THREE.Object3D | null> => {
      const hit = cache.get(file);
      if (hit) return hit;
      try {
        const url = root + pathFor(file);
        const parsed = file.toLowerCase().endsWith('.fbx')
          ? await fbxLoader.loadAsync(url)
          : await gltfLoader.loadAsync(url);
        // GLTF parses to { scene }, FBX parses straight to an Object3D.
        const src: THREE.Object3D = (parsed as { scene?: THREE.Object3D }).scene ?? (parsed as THREE.Object3D);
        // Material-agnostic normalize: Kenney ships Standard with a metalness
        // quirk, Quaternius ships Phong. Both get flat matte shading, palette
        // grading, and a whisper of shade-side fill. FBX colors are used
        // as-loaded (verified against the sRGB Kenney quirk, which converts).
        const fbx = file.toLowerCase().endsWith('.fbx');
        src.traverse((c) => {
          if (!(c instanceof THREE.Mesh)) return;
          const m = (c.material as THREE.MeshStandardMaterial).clone() as THREE.MeshStandardMaterial
            & { shininess?: number };
          if ('metalness' in m) m.metalness = 0;
          if ('roughness' in m) m.roughness = 0.9;
          if (typeof m.shininess === 'number') m.shininess = 0;
          m.flatShading = true;
          if (m.color) {
            const { role, k } = tintFor(m.name, file, tint);
            if (role === 'leaf') {
              // Graded by eye, not derived: narrow cones catch almost no sky
              // under hemisphere-only light, so converted greens land near-
              // black. The file value used as-is and pulled toward the
              // palette reads as sunlit sage instead.
              m.color.lerp(this.leaf, leafGrade(file));
            } else if (role === 'accent') {
              m.emissive.copy(m.color);
              m.emissiveIntensity = 0.06;
            } else {
              if (!fbx) m.color.convertSRGBToLinear();
              if (role === 'wood') m.color.lerp(this.wood, k);
              else m.color.lerp(this.stone, k);
            }
            if (role !== 'accent') {
              // Shade-side fill at a whisper dose: enough that backlit faces
              // stay readable, never enough to make saturated albedo glow.
              m.emissive.copy(m.color);
              m.emissiveIntensity = 0.12;
            }
          }
          c.material = m;
          c.castShadow = true;
          c.receiveShadow = true;
          this.mats.add(m);
          this.geos.add(c.geometry as THREE.BufferGeometry);
        });
        cache.set(file, src);
        return src;
      } catch (err) {
        console.warn(`[props] missing ${file}, skipping`, err);
        return null;
      }
    };

    for (const def of QUAIL_PROPS) {
      if (this.inCover(patches, def.x, def.z)) continue;
      const src = await load(def.file, def.tint);
      if (!src) continue;
      const o = src.clone();
      o.position.set(def.x, terrain.heightAt(def.x, def.z) - def.sink, def.z);
      o.scale.setScalar(def.s);
      o.rotation.y = def.ry;
      this.group.add(o);
    }

    // Scatter ring (fixed stream: type, angle, radius, scale, yaw always
    // drawn so a rejection never re-rolls the rest of the ring).
    const srng = mulberry32(SCATTER_SEED);
    for (let i = 0; i < SCATTER_COUNT; i++) {
      const t = SCATTER_TYPES[Math.floor(srng() * SCATTER_TYPES.length)];
      const a = srng() * Math.PI * 2;
      const r = 25 + srng() * 65;
      const s = t.s0 + srng() * (t.s1 - t.s0);
      const ry = srng() * Math.PI * 2;
      const x = Math.sin(a) * r;
      const z = 20 + Math.cos(a) * r;
      if (this.inCover(patches, x, z)) continue;
      if (Math.abs(x) < 3 && z > -30 && z < 60) continue; // hero corridor
      if (Math.hypot(x - 0, z - 42) < 12) continue; // drop/truck disc
      const src = await load(t.file, t.tint);
      if (!src) continue;
      const o = src.clone();
      o.position.set(x, terrain.heightAt(x, z) - t.sink, z);
      o.scale.setScalar(s);
      o.rotation.y = ry;
      // Scatter skips the shadow map (halves its draw cost — small scrub at
      // 25–90 m throws no readable shadow anyway). Fixed heroes keep theirs:
      // near-camera contact grounding is load-bearing for the read.
      o.traverse((c) => {
        if (c instanceof THREE.Mesh) c.castShadow = false;
      });
      this.group.add(o);
    }
    ctx.scene.add(this.group);
  }

  private inCover(patches: readonly WorldPatch[], x: number, z: number): boolean {
    for (const p of patches) {
      if (Math.abs(x - p.cx) < p.hx + PATCH_MARGIN && Math.abs(z - p.cz) < p.hz + PATCH_MARGIN) return true;
    }
    return false;
  }

  dispose(ctx: Ctx): void {
    ctx.scene.remove(this.group);
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
    this.geos.clear();
    this.mats.clear();
  }
}
