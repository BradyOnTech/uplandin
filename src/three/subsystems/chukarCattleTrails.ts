import * as THREE from 'three';
import { chukarHeight } from '../../game/chukarCanyon';
import { chukarGroundAt, type ChukarGround } from '../../game/chukarHabitat';
import { isoLines, valueNoise } from '../../game/featureLandform';
import { PROPERTY_PX_TO_M, type LandscapeModel } from '../../game/landscape';
import type { Quality } from '../engine';
import { applyQuailTrackGroundLod, groundQuailTrackGeometry } from './quailGroundGeometry';

/**
 * Cattle trails: the contour stripes that cross every grazed chukar slope.
 * Thin worn lines follow the contours across the cheat and bunchgrass,
 * broken where the ground steepens into talus or flattens onto a bench, so
 * the slopes read as steep from across the canyon. Scenery only.
 */
const LEVEL_STEP = 3.6; // metres between stripes
const GRID = 4; // yards
const WIDTH = .5; // metres
const gate = valueNoise(7751);

export function chukarCattleTrails(landscape: LandscapeModel, detail: { near: number; far: number; range: number }, quality: Quality): THREE.Mesh | null {
  const world = landscape.area.world, cols = Math.ceil(world.w / GRID), rows = Math.ceil(world.h / GRID);
  const heights = new Float32Array((cols + 1) * (rows + 1));
  let lo = Infinity, hi = -Infinity;
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
    const h = chukarHeight(world.x + i * GRID, world.y + j * GRID);
    heights[j * (cols + 1) + i] = h; lo = Math.min(lo, h); hi = Math.max(hi, h);
  }
  const sample = (x: number, y: number) => heights[Math.round((y - world.y) / GRID) * (cols + 1) + Math.round((x - world.x) / GRID)];
  const ground: ChukarGround = { cover: 'cheat', sage: 0, cheat: 0, bunchgrass: 0, talus: 0, rimrock: 0, seep: 0, s: 0, band: '', draw: 0, crest: 0, southness: 0 };
  const keep = (x: number, y: number) => {
    chukarGroundAt(x, y, ground);
    const gx = sample(Math.min(world.x + world.w, x + GRID), y) - sample(Math.max(world.x, x - GRID), y);
    const gy = sample(x, Math.min(world.y + world.h, y + GRID)) - sample(x, Math.max(world.y, y - GRID));
    const slope = Math.hypot(gx, gy) / (2 * GRID * PROPERTY_PX_TO_M);
    return slope > .26 && slope < .9 && ground.talus < .3 && ground.rimrock < .2 && ground.seep < .2 && ground.sage < .55
      && gate(x * .02, y * .02) > (quality === 'lite' ? .5 : .4);
  };
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  const color = new THREE.Color(0x8f7d5e), scratch = { x: 0, z: 0 };
  const bounds = { x: world.x, y: world.y, w: cols * GRID, h: rows * GRID };
  for (let level = Math.ceil(lo / LEVEL_STEP) * LEVEL_STEP; level < hi; level += LEVEL_STEP) {
    for (const line of isoLines(sample, bounds, GRID, level)) {
      let run: { x: number; y: number }[] = [];
      const flush = () => {
        if (run.length >= 4) for (let i = 1; i < run.length; i++) {
          const a = run[i - 1], b = run[i], dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
          const ox = -dy / len * WIDTH / PROPERTY_PX_TO_M / 2, oy = dx / len * WIDTH / PROPERTY_PX_TO_M / 2;
          const base = positions.length / 3;
          for (const [px, py] of [[a.x - ox, a.y - oy], [a.x + ox, a.y + oy], [b.x - ox, b.y - oy], [b.x + ox, b.y + oy]]) {
            landscape.propertyToWorld(px, py, scratch); positions.push(scratch.x, 0, scratch.z);
            const fade = i === 1 || i === run.length - 1 ? .3 : .72;
            colors.push(color.r, color.g, color.b, fade);
          }
          indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
        }
        run = [];
      };
      for (const p of line) { if (keep(p.x, p.y)) run.push(p); else flush(); }
      flush();
    }
  }
  if (!indices.length) return null;
  const source = new THREE.BufferGeometry();
  source.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  source.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  source.setIndex(indices);
  const geometry = groundQuailTrackGeometry(landscape, source, detail);
  source.dispose();
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  applyQuailTrackGroundLod(material, quality, detail.range);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Chukar contour cattle trails'; mesh.receiveShadow = true; mesh.renderOrder = -1;
  return mesh;
}
