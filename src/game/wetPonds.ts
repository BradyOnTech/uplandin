import type { AreaConfig, AreaTrail } from './areas';
import type { Vec2 } from './types';
import { mulberry32 } from './math';

export type WetPondLayout = { px: number; py: number; rx: number; rz: number; angle: number; seed: number; hero?: boolean };

function seeded(seed: number, salt: number): number {
  let value = seed ^ Math.imul(salt, 0x9e3779b1);
  value = Math.imul(value ^ (value >>> 16), 0x85ebca6b);
  return (value ^ (value >>> 13)) >>> 0;
}

function trailLength(trail: AreaTrail): number {
  let length = 0;
  for (let i = 1; i < trail.points.length; i++) {
    const a = trail.points[i - 1];
    const b = trail.points[i];
    length += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return length;
}

function pointAlongTrail(trail: AreaTrail, distance: number): { point: Vec2; tangent: Vec2 } | null {
  let remaining = distance;
  for (let i = 1; i < trail.points.length; i++) {
    const a = trail.points[i - 1];
    const b = trail.points[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    if (length < 0.01) continue;
    if (remaining <= length || i === trail.points.length - 1) {
      const t = Math.max(0, Math.min(1, remaining / length));
      return {
        point: { x: a.x + dx * t, y: a.y + dy * t },
        tangent: { x: dx / length, y: dy / length },
      };
    }
    remaining -= length;
  }
  return null;
}

export function wetPondLayout(area: AreaConfig): WetPondLayout[] {
    const feature = area.landmarks.find(landmark => landmark.id === 'area-feature' && landmark.kind === 'pond');
    const ponds: WetPondLayout[] = [];
    const add = (px: number, py: number, rx: number, rz: number, seed: number, hero = false): void => {
      if (px < area.world.x + 10 || py < area.world.y + 10 || px > area.world.x + area.world.w - 10 || py > area.world.y + area.world.h - 10) return;
      if (area.dropPoints.some(drop => Math.hypot(px - drop.position.x, py - drop.position.y) < 22)) return;
      if (ponds.some(pond => Math.hypot(px - pond.px, py - pond.py) < (Math.max(rx, rz) + Math.max(pond.rx, pond.rz)) * 1.6)) return;
      ponds.push({ px, py, rx, rz, angle: (seed % 17) * 0.13, seed, hero });
    };

    if (feature) add(feature.position.x, feature.position.y, 31, 20, seeded(area.terrain.seed, 3), true);
    const chain = area.trails.find(trail => trail.id === 'pond-chain')
      ?? area.trails.find(trail => trail.id.includes('bottom'))
      ?? area.trails[0];
    if (chain) {
      const length = trailLength(chain);
      const count = Math.min(7, Math.max(3, Math.floor(length / 42)));
      const rng = mulberry32(seeded(area.terrain.seed, 0x504f4e44));
      for (let i = 0; i < count; i++) {
        const distance = length * (0.18 + (i + rng() * 0.22) / count);
        const located = pointAlongTrail(chain, distance);
        if (!located) continue;
        const side = i % 2 === 0 ? 1 : -1;
        const offset = 8 + rng() * 11;
        const px = located.point.x - located.tangent.y * offset * side;
        const py = located.point.y + located.tangent.x * offset * side;
        add(px, py, 7.4 + rng() * 5.1, 4.7 + rng() * 3.9, seeded(area.terrain.seed, 41 + i), false);
      }
    }
    return ponds;
}

export function wetPondRadius(pond: WetPondLayout, x: number, y: number): number {
  const dx = x - pond.px, dy = y - pond.py;
  const c = Math.cos(pond.angle), s = Math.sin(pond.angle);
  return Math.hypot((dx * c + dy * s) / pond.rx, (-dx * s + dy * c) / pond.rz);
}
