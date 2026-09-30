import * as THREE from 'three';
import type { AreaConfig } from '../../game/areas';
import { PROPERTY_PX_TO_M } from '../../game/landscape';
import { pheasantHomesteadYard } from '../../game/pheasantHabitat';
import { PHEASANT_GRAIN_BIN } from './pheasantHomestead';
import { createPheasantHomesteadGround } from '../../game/pheasantHomesteadGround';

type FarmPaint = (x: number, y: number, variation: number, color: THREE.Color) => void;
type Segment = { ax: number; az: number; dx: number; dz: number; lengthSquared: number };

/** A maintained farmyard has a working apron and quieter mown margins.
 * This presentation-only paint never changes cover, terrain or route authority.
 * Inputs remain in property yards; local shapes use the barn's actual metres. */
export function createPheasantFarmPainter(area: AreaConfig): FarmPaint | undefined {
  if (area.id !== 'pheasant-coverts') return undefined;
  const yard = pheasantHomesteadYard(area.landmarks);
  const barn = area.landmarks.find(landmark => landmark.id === 'old-homestead');
  if (!yard || !barn) return undefined;
  const minX = yard.x - 5, maxX = yard.x + yard.w + 5;
  const minY = yard.y - 5, maxY = yard.y + yard.h + 5;
  const localX = (x: number) => (x - barn.position.x) * PROPERTY_PX_TO_M;
  const localZ = (y: number) => (y - barn.position.y) * PROPERTY_PX_TO_M;
  const segments: Segment[] = [];
  let approachX = 0, approachZ = 12, approachDistance = Infinity;
  for (const trail of area.trails) for (let i = 1; i < trail.points.length; i++) {
    const a = trail.points[i - 1], b = trail.points[i];
    if (Math.max(a.x, b.x) < minX || Math.min(a.x, b.x) > maxX
      || Math.max(a.y, b.y) < minY || Math.min(a.y, b.y) > maxY) continue;
    const ax = localX(a.x), az = localZ(a.y);
    const dx = localX(b.x) - ax, dz = localZ(b.y) - az;
    const lengthSquared = dx * dx + dz * dz;
    if (lengthSquared < .001) continue;
    segments.push({ ax, az, dx, dz, lengthSquared });
    // Link the visible front doors to the existing access lane, without
    // extending the authoritative trail or adding a physical obstacle.
    const t = THREE.MathUtils.clamp((-ax * dx + (8 - az) * dz) / lengthSquared, 0, 1);
    const x = ax + t * dx, z = az + t * dz;
    const distance = x * x + (z - 8) * (z - 8);
    if (distance < approachDistance) {
      approachDistance = distance; approachX = x; approachZ = z;
    }
  }
  if (Number.isFinite(approachDistance)) {
    const dz = approachZ - 8;
    segments.push({ ax: 0, az: 8, dx: approachX, dz,
      lengthSquared: Math.max(.001, approachX * approachX + dz * dz) });
  }
  const soil = new THREE.Color(0x968a70);
  const gravel = new THREE.Color(0xbcb49e);
  const shortSward = new THREE.Color(0x9a9a72);
  const dryClipping = new THREE.Color(0xb6a87d);
  const quietGround = new THREE.Color();
  const ground = createPheasantHomesteadGround(area)!;
  const classification = { upper: 0, turnout: 0, drive: 0, bank: 0, grading: 0 };
  const workingEarth = new THREE.Color(0xa1947a);
  const bankSward = new THREE.Color(0x929470);
  const bankDry = new THREE.Color(0xa9a079);
  const bankColor = new THREE.Color();
  const smooth = THREE.MathUtils.smoothstep;
  return (x, y, variation, color) => {
    // Most property vertices never inspect routes. The original five-yard
    // exterior boundary is retained, with no allocations while sampling.
    if (x <= minX || x >= maxX || y <= minY || y >= maxY) return;
    const outside = Math.hypot(Math.max(yard.x - x, 0, x - yard.x - yard.w),
      Math.max(yard.y - y, 0, y - yard.y - yard.h));
    const maintained = 1 - smooth(outside, 0, 5);
    if (maintained === 0) return;
    const px = localX(x), pz = localZ(y);
    const edgeShift = Math.sin(px * .14 + .7) * .09 + Math.cos(pz * .18) * .06;
    const front = 1 - smooth(Math.hypot((px - 1) / 15, (pz - 7) / 17) + edgeShift, .58, 1.18);
    const bin = PHEASANT_GRAIN_BIN;
    const service = 1 - smooth(Math.hypot((px - bin.x) / 8, (pz - bin.z) / 9), .58, 1.2);
    let nearestSquared = 100;
    for (const segment of segments) {
      const t = THREE.MathUtils.clamp(((px - segment.ax) * segment.dx
        + (pz - segment.az) * segment.dz) / segment.lengthSquared, 0, 1);
      const dx = px - segment.ax - t * segment.dx;
      const dz = pz - segment.az - t * segment.dz;
      nearestSquared = Math.min(nearestSquared, dx * dx + dz * dz);
    }
    const access = 1 - smooth(Math.sqrt(nearestSquared), 2.3, 5.8 + edgeShift * 3);
    const apron = Math.max(front, service, access);
    // Late-October yard grass is half cured: more straw than lawn.
    quietGround.copy(shortSward).lerp(dryClipping, .38 + variation * .42);
    color.lerp(quietGround, maintained * .88);
    color.lerp(soil, maintained * (.12 + apron * .80));
    color.lerp(gravel, maintained * apron * (.09 + variation * .15));
    ground.sample(x, y, classification);
    // Compact earth surfaces and connected grassy shoulders share exactly
    // the placement masks. Leave the old exterior transition untouched.
    const working = Math.max(classification.upper, classification.turnout, classification.drive);
    bankColor.copy(bankSward).lerp(bankDry, .12 + variation * .25);
    color.lerp(bankColor, classification.bank * .96);
    color.lerp(workingEarth, working * .92);
  };
}
