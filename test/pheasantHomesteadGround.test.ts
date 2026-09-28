import { describe, expect, it } from 'vitest';
import { getArea } from '../src/game/areas';
import { LandscapeModel, PROPERTY_PX_TO_M } from '../src/game/landscape';
import { createPheasantHomesteadGround } from '../src/game/pheasantHomesteadGround';

const area = getArea('pheasant-coverts');
const barn = area.landmarks.find(l => l.id === 'old-homestead')!.position;
const property = (x: number, z: number) => ({ x: barn.x + x / PROPERTY_PX_TO_M, y: barn.y + z / PROPERTY_PX_TO_M });
const sample = () => ({ upper: 0, turnout: 0, drive: 0, bank: 0, grading: 0 });

describe('Homestead shared working ground', () => {
  it('preserves actual foundations and all exterior heights without changing property content', () => {
    const before = JSON.stringify(area), ground = createPheasantHomesteadGround(area)!;
    const raw = (x: number, y: number) => 10 + Math.sin(x * .03) - Math.cos(y * .02);
    ground.prepare(raw);
    let checked = 0;
    for (let z = -36; z < 55; z += 1) for (let x = -45; x < 50; x += 1) {
      const p = property(x, z);
      const exterior = p.x <= ground.bounds.x || p.x >= ground.bounds.x + ground.bounds.w
        || p.y <= ground.bounds.y || p.y >= ground.bounds.y + ground.bounds.h;
      const foundation = (Math.abs(x) <= 7.4 && Math.abs(z) <= 3.35) || Math.hypot(x - 14, z + 9) <= 3.2;
      if (exterior || foundation) { expect(ground.apply(p.x, p.y, raw(p.x, p.y))).toBe(raw(p.x, p.y)); checked++; }
    }
    expect(checked).toBeGreaterThan(3000);
    expect(createPheasantHomesteadGround(getArea('quail-fields'))).toBeUndefined();
    expect(createPheasantHomesteadGround(getArea('sharptail-prairie'))).toBeUndefined();
    expect(JSON.stringify(area)).toBe(before);
  });

  it('keeps authored lane centres free of bank growth and connects the barn service court', () => {
    const ground = createPheasantHomesteadGround(area)!, out = sample();
    for (const trail of area.trails) for (let i = 1; i < trail.points.length; i++) {
      const a = trail.points[i - 1], b = trail.points[i];
      const count = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y));
      for (let j = 0; j <= count; j++) {
        ground.sample(a.x + (b.x - a.x) * j / count, a.y + (b.y - a.y) * j / count, out);
        expect(out.bank).toBeLessThan(1e-10);
      }
    }
    for (const [x, z] of [[0, 5], [14, -9], [-9.4, 15.65], [-16, 27.432], [7.3152, 27.432]]) {
      const p = property(x, z); ground.sample(p.x, p.y, out);
      expect(Math.max(out.upper, out.turnout, out.drive)).toBeGreaterThan(.95);
      expect(out.bank).toBeLessThan(.05);
    }
    for (const [x, z] of [[-22, 17], [24, 23]]) {
      const p = property(x, z); ground.sample(p.x, p.y, out); expect(out.bank).toBeGreaterThan(.8);
    }
  });

  it('gives both entries the same continuous supported bank and traversable service grades', () => {
    const a = new LandscapeModel(area, 'south-gate'), b = new LandscapeModel(area, 'west-track');
    let maximumGrade = 0;
    for (let z = -26; z < 44; z += 2) for (let x = -32; x < 40; x += 2) {
      const p = property(x, z), eps = .1 / PROPERTY_PX_TO_M;
      const h = a.heightAtProperty(p.x, p.y);
      expect(b.heightAtProperty(p.x, p.y)).toBeCloseTo(h, 11);
      const gx = (a.heightAtProperty(p.x + eps, p.y) - a.heightAtProperty(p.x - eps, p.y)) / .2;
      const gz = (a.heightAtProperty(p.x, p.y + eps) - a.heightAtProperty(p.x, p.y - eps)) / .2;
      maximumGrade = Math.max(maximumGrade, Math.hypot(gx, gz));
      expect(Math.abs(a.heightAtProperty(p.x + .001, p.y) - h)).toBeLessThan(.001);
    }
    expect(maximumGrade).toBeLessThan(.40);
  });
});
