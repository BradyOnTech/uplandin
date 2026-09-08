import { describe, expect, it } from 'vitest';
import { getArea } from '../src/game/areas';
import { LandscapeModel, PROPERTY_PX_TO_M } from '../src/game/landscape';
import { deriveQuailParkingPose } from '../src/three/subsystems/quailEntrances';
import { buildQuailDistantCover, quailGrassClearingAt, quailGrassDrifts, quailGrassMassAt } from '../src/three/subsystems/quailVegetation';

const area = getArea('quail-fields');

describe('Quail grass groups', () => {
  it('keeps both pickup footprints clear while retaining nearby planted shoulders', () => {
    for (const drop of area.dropPoints) {
      const parking = deriveQuailParkingPose(area, drop.id)!;
      const c = Math.cos(parking.yaw), s = Math.sin(parking.yaw);
      for (const x of [-1.2, 0, 1.2]) for (const z of [-2.405, 0, 2.405]) {
        const px = parking.position.x + (x * c + z * s) / PROPERTY_PX_TO_M;
        const py = parking.position.y + (-x * s + z * c) / PROPERTY_PX_TO_M;
        expect(quailGrassClearingAt(area, px, py)).toBe(true);
      }
      expect(quailGrassClearingAt(area, drop.position.x, drop.position.y)).toBe(true);
    }
    expect(quailGrassClearingAt(area, 494, 652)).toBe(false);
    expect(quailGrassClearingAt(area, 48, 416)).toBe(false);
    expect(quailGrassMassAt(area, 494, 652)).toBe(1);
    expect(quailGrassMassAt(area, 48, 416)).toBe(1);
  });

  it('leaves authoritative habitat and drop coordinates unchanged while building both local views', () => {
    const before = JSON.stringify(area);
    const south = new LandscapeModel(area, 'south-gate'), west = new LandscapeModel(area, 'west-track');
    const a = buildQuailDistantCover(south), b = buildQuailDistantCover(west);
    expect(a.length).toBe(b.length);
    let triangles = 0;
    for (let group = 0; group < a.length; group++) {
      const av = a[group].getAttribute('position'), bv = b[group].getAttribute('position');
      expect(av.count).toBe(bv.count);
      triangles += a[group].index!.count / 3;
      for (let i = 0; i < av.count; i += 7) {
        const ap = south.worldToProperty(av.getX(i), av.getZ(i), { x: 0, y: 0 });
        const bp = west.worldToProperty(bv.getX(i), bv.getZ(i), { x: 0, y: 0 });
        expect(ap.x).toBeCloseTo(bp.x, 3); expect(ap.y).toBeCloseTo(bp.y, 3);
        expect(av.getY(i)).toBeCloseTo(bv.getY(i), 3);
      }
      a[group].dispose(); b[group].dispose();
    }
    expect(triangles).toBeLessThan(5000);
    expect(JSON.stringify(area)).toBe(before);
  });

  it('keeps grouped density finite, bounded and independent of the selected drop', () => {
    expect(quailGrassDrifts(area).length).toBeGreaterThan(150);
    for (let y = 0; y <= 700; y += 17) for (let x = 0; x <= 1200; x += 19) {
      const mass = quailGrassMassAt(area, x, y);
      expect(Number.isFinite(mass)).toBe(true); expect(mass).toBeGreaterThanOrEqual(0); expect(mass).toBeLessThanOrEqual(1);
    }
  });
});
