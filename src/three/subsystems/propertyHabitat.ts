import * as THREE from 'three';
import { HUNT_WORLD_ANCHOR, PROPERTY_PX_TO_M, type GroundSample, type LandscapeModel } from '../../game/landscape';
import { mulberry32 } from '../../game/math';
import { huntingDoctrine, type HuntStyle } from '../../game/huntDoctrine';
import type { Ctx, Subsystem } from '../engine';

type HabitatKind = 'trunk' | 'canopy' | 'shrub' | 'reed' | 'rock' | 'cactus' | 'log';

interface HabitatProfile {
  /** Property pixels between candidate sites. */
  step: number;
  /** Keep the authored drop and nearby camera frame readable. */
  nearClear: number;
  maxSlope: number;
  kinds: readonly HabitatKind[];
  chances: Partial<Record<HabitatKind, number>>;
  colors: Record<HabitatKind, readonly number[]>;
  scale: Partial<Record<HabitatKind, readonly [number, number]>>;
}

interface HabitatPlacement {
  x: number;
  y: number;
  z: number;
  gradeX: number;
  gradeZ: number;
  scale: number;
  yOffset: number;
  yaw: number;
  color: number;
  /** Hero placements are preserved ahead of the deterministic fill cap. */
  hero?: boolean;
}

const DEFAULT_COLORS: Record<HabitatKind, readonly number[]> = {
  trunk: [0x5f4936], canopy: [0x4f633d, 0x627449], shrub: [0x6f7046, 0x7e7a4a],
  reed: [0x9c9460, 0xb0a36a], rock: [0x777266, 0x8b8070], cactus: [0x647548, 0x728451],
  log: [0x5a4434, 0x6b513b],
};

function profileFor(style: HuntStyle, lite: boolean): HabitatProfile {
  const colors = (overrides: Partial<Record<HabitatKind, readonly number[]>> = {}) => ({ ...DEFAULT_COLORS, ...overrides });
  const base = {
    step: lite ? 25 : 18,
    nearClear: 26,
    maxSlope: 1.1,
    kinds: ['shrub'] as readonly HabitatKind[],
    chances: { shrub: .22 } as Partial<Record<HabitatKind, number>>,
    colors: colors(),
    scale: { shrub: [.62, 1.12] as [number, number] } as Partial<Record<HabitatKind, readonly [number, number]>>,
  } satisfies HabitatProfile;
  switch (style) {
    case 'pheasant':
      return { ...base, step: lite ? 22 : 15, nearClear: 22, kinds: ['reed', 'shrub', 'trunk', 'canopy'],
        chances: { reed: .28, shrub: .12, trunk: .025 },
        colors: colors({ reed: [0x9b9365, 0xb3a975], shrub: [0x6f7048, 0x7f794c], trunk: [0x66503a], canopy: [0x586947] }),
        scale: { reed: [.7, 1.2], shrub: [.6, .95], trunk: [2.8, 5.2], canopy: [1.8, 3.1] }, };
    case 'woods':
      // Ruffed grouse timber is shaped by old cuts and fallen slash. A few
      // downed logs break the otherwise vertical silhouette and give the
      // close, quick-point hunt a readable ground-level edge. They share the
      // existing instanced habitat path, so the extra vocabulary is one draw
      // call and remains bounded on the lite tier.
      return { ...base, step: 8, nearClear: 9, kinds: ['trunk', 'canopy', 'shrub', 'rock', 'log'],
        chances: { trunk: .68, shrub: .21, rock: .015, log: .04 },
        colors: colors({ trunk: [0x858074, 0xa09a82, 0x665747], canopy: [0x536344, 0x778050, 0x8b8850], shrub: [0x536b46, 0x6c784a], rock: [0x62675f], log: [0x514033, 0x674b37] }),
        scale: { trunk: [3.2, 8.4], canopy: [2.8, 5.4], shrub: [.7, 1.55], rock: [.42, .9], log: [1.35, 3.2] }, };
    case 'bottoms':
      return { ...base, step: lite ? 22 : 15, nearClear: 18, kinds: ['reed', 'trunk', 'canopy', 'shrub'],
        chances: { reed: .3, trunk: .06, shrub: .17 },
        colors: colors({ reed: [0x8d956a, 0xa5a16e], trunk: [0x58483a], canopy: [0x53694a], shrub: [0x56704f, 0x657c56] }),
        scale: { reed: [.72, 1.25], trunk: [3.8, 7], canopy: [2.2, 4], shrub: [.65, 1.2] }, };
    case 'desert-wash':
      return { ...base, step: lite ? 28 : 20, nearClear: 22, maxSlope: .9, kinds: ['cactus', 'shrub', 'rock'],
        chances: { cactus: .08, shrub: .27, rock: .08 },
        colors: colors({ cactus: [0x607246, 0x71804c], shrub: [0x81794a, 0x968452], rock: [0x897663, 0xa08b72] }),
        scale: { cactus: [1.1, 2.2], shrub: [.5, 1], rock: [.45, 1.05] }, };
    case 'canyon':
      // Oak Canyons has an authored tree-and-draw composition in
      // CanyonOakSystem. Keep the generic fill to low scrub and scattered
      // talus so trunks and crowns do not duplicate the hero oaks or turn
      // the draw into a generic woodland.
      return { ...base, step: lite ? 25 : 18, nearClear: 20, maxSlope: 1.2, kinds: ['shrub', 'rock'],
        chances: { shrub: .28, rock: .045 },
        colors: colors({ shrub: [0x686c3b, 0x7e7943], rock: [0x877963, 0x9b896e] }),
        scale: { shrub: [.55, 1.1], rock: [.4, .95] }, };
    case 'alpine-edge':
      return { ...base, step: lite ? 26 : 19, nearClear: 20, maxSlope: 1.3, kinds: ['trunk', 'canopy', 'shrub', 'rock'],
        chances: { trunk: .09, shrub: .12, rock: .07 },
        colors: colors({ trunk: [0x4a4138, 0x5b493a], canopy: [0x2f4a42, 0x3c5b4a], shrub: [0x526d54, 0x68805c], rock: [0x777b76, 0x929287] }),
        scale: { trunk: [5, 9.5], canopy: [2.5, 5], shrub: [.55, 1.1], rock: [.45, 1.05] }, };
    case 'oak-savanna':
      return { ...base, step: lite ? 25 : 18, nearClear: 23, kinds: ['trunk', 'canopy', 'shrub', 'rock'],
        chances: { trunk: .075, shrub: .14, rock: .025 },
        colors: colors({ trunk: [0x604936, 0x76563a], canopy: [0x56633a, 0x6d773f], shrub: [0x6f7540, 0x828149], rock: [0x817362] }),
        scale: { trunk: [4.2, 8], canopy: [2.7, 5.2], shrub: [.6, 1.25], rock: [.4, .86] }, };
    case 'chukar':
    case 'bench-covey':
      return { ...base, step: lite ? 27 : 20, nearClear: 20, maxSlope: 1.3, kinds: ['shrub', 'rock'],
        chances: { shrub: .24, rock: .12 },
        colors: colors({ shrub: [0x6d7049, 0x7d784c], rock: [0x786f63, 0x91816c] }),
        scale: { shrub: [.45, .95], rock: [.38, .95] }, };
    case 'open-covey':
      // Sharptail country is still open grass, but the long view needs a
      // sparse shelterbelt to give the dog and hunter a line to work toward.
      // The low tree chance keeps the prairie open while making that route
      // read as a real destination instead of another shrub scatter.
      return { ...base, step: lite ? 28 : 22, nearClear: 28, kinds: ['shrub', 'trunk', 'canopy', 'rock'],
        chances: { shrub: .13, trunk: .018, rock: .018 },
        colors: colors({ shrub: [0x8b7e4c, 0xa28b53], trunk: [0x6b5439, 0x7b6040], canopy: [0x667048, 0x788052], rock: [0x8f816b, 0xa19378] }),
        scale: { shrub: [.48, .92], trunk: [3.2, 5.8], canopy: [1.7, 3.1], rock: [.35, .82] }, };
    case 'quail':
      return { ...base, step: lite ? 25 : 18, nearClear: 24, kinds: ['shrub', 'trunk', 'canopy', 'rock'],
        chances: { shrub: .2, trunk: .035, rock: .025 },
        colors: colors({ shrub: [0x657342, 0x7d7b47], trunk: [0x654a35], canopy: [0x52683e], rock: [0x817663] }),
        scale: { shrub: [.55, 1.1], trunk: [3.8, 6.8], canopy: [2.2, 4], rock: [.4, .86] }, };
    default:
      return base;
  }
}

function hashCell(x: number, y: number, seed: number): number {
  let h = seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function distanceToSegment(x: number, y: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(x - (ax + dx * t), y - (ay + dy * t));
}

/** Keep the generic fill legible around the authored route and set pieces.
 * Margins are supplied in world metres and converted once here, while all
 * authored map geometry remains in its stable property-pixel coordinates. */
function propertyPositionClear(area: LandscapeModel['area'], x: number, y: number, marginMeters: number, routeHalfWidth = 3.4): boolean {
  const margin = marginMeters / PROPERTY_PX_TO_M;
  for (const trail of area.trails) {
    for (let i = 1; i < trail.points.length; i++) {
      const a = trail.points[i - 1], b = trail.points[i];
      if (distanceToSegment(x, y, a.x, a.y, b.x, b.y) < routeHalfWidth + margin) return false;
    }
  }
  for (const drop of area.dropPoints) {
    if (Math.hypot(x - drop.position.x, y - drop.position.y) < 8 + margin) return false;
  }
  for (const landmark of area.landmarks) {
    const setPieceMargin = landmark.kind === 'barn' ? 18
      : landmark.kind === 'pond' ? 15
        : landmark.kind === 'fence' ? 7
          : landmark.kind === 'windmill' ? 12 : 8;
    if (Math.hypot(x - landmark.position.x, y - landmark.position.y) < setPieceMargin + margin) return false;
  }
  return true;
}

interface CanopyLobe {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  yaw: number;
}

/**
 * A single faceted sphere reads as a game marker once it is repeated across
 * a property. Keep one instanced mesh, but give the crown a small, asymmetric
 * cluster of low-poly lobes. The silhouette then carries the habitat: tight
 * upright young timber for grouse, broad oak umbrellas for the dry country,
 * and irregular cottonwood crowns in wet ground. Twenty triangles per lobe
 * keeps the whole cluster inexpensive on the lite tier.
 */
function canopyGeometry(style: HuntStyle): THREE.BufferGeometry {
  const lobes: readonly CanopyLobe[] = style === 'woods'
    ? [
      { x: -.35, y: .02, z: .02, sx: .55, sy: .76, sz: .58, yaw: -.18 },
      { x: .18, y: .17, z: -.03, sx: .62, sy: .88, sz: .61, yaw: .32 },
      { x: -.02, y: .48, z: .04, sx: .44, sy: .58, sz: .46, yaw: .08 },
    ]
    : style === 'oak-savanna'
      ? [
        { x: -.5, y: .02, z: .1, sx: .7, sy: .4, sz: .62, yaw: -.24 },
        { x: .08, y: .13, z: -.04, sx: .78, sy: .47, sz: .7, yaw: .18 },
        { x: .56, y: .01, z: .06, sx: .55, sy: .36, sz: .58, yaw: .43 },
        { x: -.08, y: .36, z: -.1, sx: .46, sy: .34, sz: .5, yaw: -.1 },
      ]
      : style === 'canyon'
        ? [
          { x: -.42, y: .01, z: .08, sx: .65, sy: .42, sz: .6, yaw: -.32 },
          { x: .16, y: .16, z: -.08, sx: .73, sy: .5, sz: .68, yaw: .16 },
          { x: .52, y: .03, z: .12, sx: .43, sy: .34, sz: .5, yaw: .56 },
        ]
        : style === 'bottoms' || style === 'pheasant'
          ? [
            { x: -.36, y: .03, z: .04, sx: .57, sy: .67, sz: .6, yaw: -.24 },
            { x: .2, y: .15, z: -.06, sx: .7, sy: .8, sz: .67, yaw: .2 },
            { x: .02, y: .5, z: .08, sx: .42, sy: .48, sz: .46, yaw: .08 },
          ]
          : style === 'open-covey'
            ? [
              { x: -.3, y: .02, z: .06, sx: .55, sy: .38, sz: .5, yaw: -.2 },
              { x: .25, y: .08, z: -.04, sx: .62, sy: .44, sz: .57, yaw: .27 },
            ]
            : style === 'quail'
              ? [
                { x: -.38, y: .01, z: .05, sx: .58, sy: .46, sz: .56, yaw: -.24 },
                { x: .17, y: .13, z: -.05, sx: .7, sy: .54, sz: .64, yaw: .21 },
                { x: .47, y: .02, z: .1, sx: .4, sy: .35, sz: .44, yaw: .52 },
              ]
              : [{ x: 0, y: 0, z: 0, sx: 1, sy: .82, sz: .94, yaw: 0 }];

  const positions: number[] = [];
  for (const lobe of lobes) {
    // Non-indexed geometry lets each lobe be concatenated without bringing
    // an index offset or a second draw submission into the instanced crown.
    const source = new THREE.IcosahedronGeometry(1, 0);
    const position = source.getAttribute('position');
    const c = Math.cos(lobe.yaw), s = Math.sin(lobe.yaw);
    for (let index = 0; index < position.count; index++) {
      const localX = position.getX(index) * lobe.sx;
      const localZ = position.getZ(index) * lobe.sz;
      positions.push(
        lobe.x + localX * c - localZ * s,
        lobe.y + position.getY(index) * lobe.sy,
        lobe.z + localX * s + localZ * c,
      );
    }
    source.dispose();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function geometryFor(kind: HabitatKind, style: HuntStyle): THREE.BufferGeometry {
  if (kind === 'trunk') {
    const geo = new THREE.CylinderGeometry(.16, .28, 1, 6, 2);
    geo.translate(0, .5, 0); return geo;
  }
  if (kind === 'canopy') {
    // High-country blue grouse live at the timberline, where the trees read
    // as narrow conifers against the park sky. Young grouse woods get their
    // own upright crown; oak, alder, and cottonwood cover retain broad,
    // faceted crowns.
    if (style === 'alpine-edge') return new THREE.ConeGeometry(1, 2, 7, 2);
    return canopyGeometry(style);
  }
  if (kind === 'reed') {
    const geo = new THREE.ConeGeometry(.035, 1, 5, 1);
    geo.translate(0, .5, 0); return geo;
  }
  if (kind === 'cactus') {
    const geo = new THREE.CylinderGeometry(.17, .25, 1.55, 7, 2);
    geo.translate(0, .775, 0); return geo;
  }
  if (kind === 'log') {
    // The cylinder is authored along X so its instanced yaw lays slash
    // across the opening. A small lift keeps the low-poly ends from sinking
    // into the ground when the terrain has a shallow grade.
    const geo = new THREE.CylinderGeometry(.12, .19, 1, 6, 1);
    geo.rotateZ(Math.PI / 2);
    geo.translate(0, .15, 0);
    return geo;
  }
  if (kind === 'rock') {
    const geo = new THREE.DodecahedronGeometry(1, 0);
    geo.scale(1.25, .65, .95); geo.translate(0, .5, 0); return geo;
  }
  if (kind === 'shrub' && style === 'woods') {
    const geo = canopyGeometry('woods');
    // Understory crowns sit below the hunter's view and retain separate
    // lobes instead of a torso-high, solid boulder silhouette.
    geo.scale(1.05, .28, .95);
    geo.translate(0, .22, 0);
    return geo;
  }
  const geo = new THREE.DodecahedronGeometry(1, 0);
  geo.scale(1, .58, .86); geo.translate(0, .48, 0); return geo;
}

/**
 * A small, deterministic habitat layer for properties that do not yet have
 * a bespoke prop kit. It supplies a species-specific silhouette vocabulary
 * across the whole authored map while staying to a handful of instanced
 * draw calls and a mobile-sized vertex budget.
 */
export class PropertyHabitatSystem implements Subsystem {
  readonly id = 'property-habitat';
  private meshes: THREE.InstancedMesh[] = [];
  private geometries: THREE.BufferGeometry[] = [];
  private materials: THREE.Material[] = [];
  private surface: GroundSample = {
    height: 0, slope: 0, gradeX: 0, gradeZ: 0, rockiness: 0, vegetation: 0, moisture: 0,
  };
  private world = { x: 0, z: 0 };
  private up = new THREE.Vector3(0, 1, 0);
  private normal = new THREE.Vector3();
  private position = new THREE.Vector3();
  private scale = new THREE.Vector3();
  private rotation = new THREE.Quaternion();
  private yaw = new THREE.Quaternion();
  private matrix = new THREE.Matrix4();
  private color = new THREE.Color();
  private wind = { value: 0 };
  private obstacles: { x: number; z: number; radius: number }[] = [];

  collisionCircles(): readonly { x: number; z: number; radius: number }[] { return this.obstacles; }

  constructor(private readonly landscape: LandscapeModel) {}

  init(ctx: Ctx): void {
    const doctrine = huntingDoctrine(this.landscape.area.id);
    const woodland = doctrine.style === 'woods';
    const profile = profileFor(doctrine.style, ctx.quality === 'lite');
    const lists = new Map<HabitatKind, HabitatPlacement[]>();
    for (const kind of profile.kinds) lists.set(kind, []);
    const area = this.landscape.area;
    const minX = area.world.x, maxX = area.world.x + area.world.w;
    const minY = area.world.y, maxY = area.world.y + area.world.h;
    const step = profile.step;

    // A few large, species-specific silhouettes establish a remembered
    // landmark in the middle distance. They use the same instanced meshes as
    // the fill, so a hero cluster costs no extra draw call and remains easy to
    // thin on the lite tier. Their placement follows authored map anchors,
    // rather than a camera-dependent scatter.
    const anchors = area.landmarks
      .filter((landmark) => landmark.kind !== 'gate')
      .map((landmark) => landmark.position);
    for (const trail of area.trails) {
      const middle = trail.points[Math.floor(trail.points.length / 2)];
      if (middle) anchors.push(middle);
    }
    const addHero = (kind: HabitatKind, x: number, y: number, size: number, yaw: number, yOffset = 0): void => {
      if (!lists.has(kind) || x < minX + 8 || x > maxX - 8 || y < minY + 8 || y > maxY - 8) return;
      this.landscape.propertyToWorld(x, y, this.world);
      if (Math.hypot(this.world.x - HUNT_WORLD_ANCHOR.x, this.world.z - HUNT_WORLD_ANCHOR.z) < profile.nearClear + 6) return;
      // Use the paired crown's footprint for the trunk too, so a route
      // clearance cannot accept one half of a tree and reject the other.
      const clearanceRadius = kind === 'canopy' ? size * .82 : kind === 'trunk' ? size * .55 * .82 : kind === 'rock' ? size * .72 : size * .45;
      if (!propertyPositionClear(area, x, y, clearanceRadius)) return;
      this.landscape.surfaceAtProperty(x, y, this.surface);
      const palette = profile.colors[kind];
      lists.get(kind)!.push({
        x: this.world.x,
        y: this.surface.height,
        z: this.world.z,
        gradeX: this.surface.gradeX,
        gradeZ: this.surface.gradeZ,
        scale: size,
        yOffset,
        yaw,
        color: palette[0],
        hero: true,
      });
    };
    const heroAnchors = anchors.slice(0, doctrine.style === 'open-covey' ? 2 : 3);
    for (const [index, anchor] of heroAnchors.entries()) {
      const yaw = (index * 1.73 + area.terrain.seed * 0.0007) % (Math.PI * 2);
      const side = index % 2 === 0 ? 1 : -1;
      if (doctrine.style === 'open-covey') {
        addHero('shrub', anchor.x + side * 10, anchor.y + 5, 1.55, yaw);
        addHero('shrub', anchor.x - side * 7, anchor.y - 4, 1.2, yaw + 1.1);
        addHero('rock', anchor.x + side * 4, anchor.y - 9, 1.05, yaw + .4);
        if (this.landscape.area.id === 'sharptail-prairie') {
          addHero('trunk', anchor.x + side * 15, anchor.y + 7, 1.9, yaw + .3);
          addHero('canopy', anchor.x + side * 15, anchor.y + 7, 1.9 * .55, yaw + .6, 1.16 * 1.9);
          addHero('trunk', anchor.x + side * 21, anchor.y + 9, 1.5, yaw + .7);
          addHero('canopy', anchor.x + side * 21, anchor.y + 9, 1.5 * .55, yaw + 1, 1.16 * 1.5);
        }
      } else if (doctrine.style === 'woods') {
        addHero('trunk', anchor.x + side * 8, anchor.y + 6, 1.55, yaw);
        addHero('canopy', anchor.x + side * 8, anchor.y + 6, 1.55 * .55, yaw + .4, 1.16 * 1.55);
        addHero('trunk', anchor.x - side * 7, anchor.y - 5, 1.25, yaw + 1.2);
        addHero('canopy', anchor.x - side * 7, anchor.y - 5, 1.25 * .55, yaw + 1.8, 1.16 * 1.25);
      } else if (doctrine.style === 'bottoms') {
        addHero('reed', anchor.x + side * 6, anchor.y + 4, 1.6, yaw);
        addHero('reed', anchor.x - side * 8, anchor.y - 3, 1.28, yaw + .7);
        addHero('trunk', anchor.x + side * 10, anchor.y - 7, 1.35, yaw + .9);
        addHero('canopy', anchor.x + side * 10, anchor.y - 7, 1.35 * .55, yaw + 1.4, 1.16 * 1.35);
      } else if (doctrine.style === 'desert-wash') {
        addHero('cactus', anchor.x + side * 8, anchor.y + 4, 1.55, yaw);
        addHero('rock', anchor.x - side * 8, anchor.y - 5, 1.35, yaw + .5);
        addHero('shrub', anchor.x + side * 4, anchor.y - 9, 1.1, yaw + 1.2);
      } else if (doctrine.style === 'canyon') {
        addHero('trunk', anchor.x + side * 8, anchor.y + 3, 1.48, yaw);
        addHero('canopy', anchor.x + side * 8, anchor.y + 3, 1.48 * .55, yaw + .8, 1.16 * 1.48);
        addHero('rock', anchor.x - side * 8, anchor.y - 5, 2.35, yaw + .4);
        addHero('rock', anchor.x - side * 14, anchor.y - 1, 1.45, yaw + 1.1);
      } else if (doctrine.style === 'alpine-edge') {
        addHero('trunk', anchor.x + side * 8, anchor.y + 4, 1.65, yaw);
        addHero('canopy', anchor.x + side * 8, anchor.y + 4, 1.65 * .55, yaw + .8, 1.16 * 1.65);
        addHero('rock', anchor.x - side * 8, anchor.y - 6, 1.3, yaw + .4);
      } else if (doctrine.style === 'oak-savanna') {
        addHero('trunk', anchor.x + side * 9, anchor.y + 4, 1.58, yaw);
        addHero('canopy', anchor.x + side * 9, anchor.y + 4, 1.58 * .55, yaw + .8, 1.16 * 1.58);
        addHero('shrub', anchor.x - side * 8, anchor.y - 5, 1.28, yaw + .4);
      }
    }

    for (let cellX = minX; cellX < maxX; cellX += step) {
      for (let cellY = minY; cellY < maxY; cellY += step) {
        const ix = Math.floor(cellX / step), iy = Math.floor(cellY / step);
        const rng = mulberry32((area.terrain.seed + ix * 0x9e3779b9 + iy * 0x85ebca6b) >>> 0);
        const px = Math.min(maxX - .5, cellX + rng() * step);
        const py = Math.min(maxY - .5, cellY + rng() * step);
        this.landscape.propertyToWorld(px, py, this.world);
        if (Math.hypot(this.world.x - HUNT_WORLD_ANCHOR.x, this.world.z - HUNT_WORLD_ANCHOR.z) < profile.nearClear) continue;
        const coverMargin = woodland ? 1 : profile.kinds.includes('trunk') && profile.kinds.includes('canopy') ? 2.8 : 1.5;
        if (!propertyPositionClear(area, px, py, coverMargin, woodland ? 1.1 : 3.4)) continue;
        this.landscape.surfaceAtProperty(px, py, this.surface);
        if (this.surface.slope > profile.maxSlope) continue;
        const cover = area.patches.some((patch) => px >= patch.x - 3 && px <= patch.x + patch.w + 3 && py >= patch.y - 3 && py <= patch.y + patch.h + 3);
        const moisture = this.surface.moisture;
        let pick: HabitatKind | null = null;
        let cursor = rng();
        for (const kind of profile.kinds) {
          const chance = (profile.chances[kind] ?? 0) * (kind === 'reed' ? .55 + moisture * .9 : kind === 'shrub' ? .8 + (cover ? .45 : 0) : 1);
          if (cursor < chance) { pick = kind; break; }
          cursor -= chance;
        }
        if (!pick) continue;
        const add = (kind: HabitatKind, size: number, yOffset = 0): void => {
          const palette = profile.colors[kind];
          const tint = palette[Math.floor(rng() * palette.length)];
          lists.get(kind)?.push({ x: this.world.x, y: this.surface.height, z: this.world.z,
            gradeX: this.surface.gradeX, gradeZ: this.surface.gradeZ, scale: size, yOffset,
            yaw: rng() * Math.PI * 2, color: tint });
        };
        const range = profile.scale[pick] ?? [.6, 1] as const;
        const size = range[0] + rng() * (range[1] - range[0]);
        if (pick === 'trunk') {
          // Trees are authored as a matched trunk/canopy pair so a sparse
          // forest never produces floating crowns or bare poles.
          add('trunk', size);
          add('canopy', size * .55, size * 1.16);
        } else add(pick, size);
      }
    }

    for (const kind of profile.kinds) {
      const placements = lists.get(kind)!;
      // Hard caps keep a worst-case wide map within a predictable mobile
      // budget; deterministic order means the cutoff never shimmers.
      const cap = woodland ? 12000 : ctx.quality === 'lite' ? 420 : kind === 'canopy' || kind === 'trunk' ? 280 : 760;
      const heroes = placements.filter((placement) => placement.hero);
      const candidates = placements.filter((placement) => !placement.hero);
      const fillBudget = Math.min(candidates.length, Math.max(0, cap - heroes.length));
      // Spread the budget across the entire property instead of exhausting
      // it along the first columns visited by the placement loop.
      const fill = Array.from({ length: fillBudget }, (_, i) => candidates[Math.floor(i * candidates.length / fillBudget)]);
      const selected = [...heroes.slice(0, cap), ...fill];
      if (selected.length === 0) continue;
      const geometry = geometryFor(kind, doctrine.style);
      // Colors come from instances; these geometries have no vertex-color
      // attribute. Enabling vertexColors multiplies their tint by black.
      const material = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
      material.onBeforeCompile = (shader) => {
        shader.uniforms.uPropertyHabitatWind = this.wind;
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nuniform float uPropertyHabitatWind;')
          .replace('#include <begin_vertex>', `#include <begin_vertex>
            #ifdef USE_INSTANCING
            float habitatPhase = instanceMatrix[3].x * .065 + instanceMatrix[3].z * .051;
            float habitatSway = sin(uPropertyHabitatWind * .82 + habitatPhase) * ${kind === 'reed' ? '.14' : kind === 'shrub' || kind === 'cactus' ? '.055' : kind === 'canopy' ? '.018' : '0.0'};
            transformed.x += habitatSway * (position.y + .12);
            transformed.z += sin(uPropertyHabitatWind * .61 + habitatPhase * 1.27) * habitatSway * .58 * (position.y + .12);
            #endif`);
      };
      material.customProgramCacheKey = () => `property-habitat-${kind}-wind-v1`;
      const batches = new Map<string, HabitatPlacement[]>();
      for (const item of selected) {
        const key = woodland ? `${Math.floor(item.x / 80)},${Math.floor(item.z / 80)}` : 'property';
        const batch = batches.get(key) ?? [];
        batch.push(item); batches.set(key, batch);
      }
      this.geometries.push(geometry); this.materials.push(material);
      for (const batch of batches.values()) {
        const mesh = new THREE.InstancedMesh(geometry, material, batch.length);
        mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(batch.length * 3), 3);
        // Tree trunks and cactus columns need to participate in the high-tier
        // shadow pass so the habitat reads as grounded at noon and at the
        // long Firewatch-style evening angles. Lite keeps the cheaper shadow
        // path for mobile. Rocks already cast; reeds and shrubs remain
        // receiver-only because their thin silhouettes add little shadow value.
        mesh.castShadow = ctx.quality === 'high'
          && (kind === 'canopy' || kind === 'trunk' || kind === 'cactus' || kind === 'rock' || kind === 'log');
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        for (const [i, item] of batch.entries()) {
          this.position.set(item.x, item.y + item.yOffset, item.z);
          // Paired canopies carry a y offset; all other geometry is rooted at 0.
          // Woody silhouettes should stay upright on a hillside. Fully
          // aligning a tree to the terrain normal makes a steep rim or canyon
          // turn the whole trunk and crown into a leaning marker. Keep a small
          // grade response for natural variation while letting loose ground
          // forms (rocks, shrubs, reeds) settle into the slope.
          const gradeResponse = kind === 'trunk' || kind === 'canopy' ? .12
            : kind === 'cactus' ? .2
              : kind === 'reed' ? .38
                : kind === 'log' ? .55 : 1;
          this.normal.set(-item.gradeX * gradeResponse, 1, -item.gradeZ * gradeResponse).normalize();
          this.rotation.setFromUnitVectors(this.up, this.normal);
          this.yaw.setFromAxisAngle(this.up, item.yaw);
          this.rotation.multiply(this.yaw);
          this.scale.setScalar(item.scale);
          if (kind === 'trunk') this.scale.set(item.scale * (woodland ? .16 : .62), item.scale * 1.3, item.scale * (woodland ? .16 : .62));
          if (woodland && kind === 'trunk') {
            // Match the rooted cylinder's widest radius; rendering distance
            // and quality must never remove physical timber from the hunt.
            this.obstacles.push({ x: item.x, z: item.z, radius: .28 * this.scale.x });
          }
          if (kind === 'canopy') this.scale.set(item.scale * 1.2, item.scale * .95, item.scale);
          if (kind === 'cactus') this.scale.set(item.scale, item.scale, item.scale);
          if (kind === 'log') this.scale.set(item.scale, item.scale * .72, item.scale * .72);
          mesh.setMatrixAt(i, this.matrix.compose(this.position, this.rotation, this.scale));
          this.color.setHex(item.color).multiplyScalar(.9 + hashCell(i, selected.length, this.landscape.area.terrain.seed) * .16);
          mesh.setColorAt(i, this.color);
        }
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.name = `${area.name} ${kind} habitat`;
        mesh.computeBoundingSphere();
        mesh.userData.habitatRange = woodland ? (kind === 'trunk' || kind === 'canopy' ? 310 : ctx.quality === 'lite' ? 85 : 130) : Infinity;
        ctx.scene.add(mesh);
        this.meshes.push(mesh);
      }
    }
    this.update(ctx);
  }

  update(ctx: Ctx): void {
    this.wind.value = ctx.time;
    for (const mesh of this.meshes) {
      const sphere = mesh.boundingSphere!;
      const distance = Math.hypot(ctx.camera.position.x - sphere.center.x, ctx.camera.position.z - sphere.center.z);
      mesh.visible = distance < mesh.userData.habitatRange + sphere.radius;
    }
  }

  dispose(ctx: Ctx): void {
    for (const mesh of this.meshes) ctx.scene.remove(mesh);
    this.meshes.length = 0;
    this.obstacles.length = 0;
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.geometries.length = 0; this.materials.length = 0;
  }
}
