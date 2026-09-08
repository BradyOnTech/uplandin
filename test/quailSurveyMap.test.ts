import { describe, expect, it, vi } from 'vitest';

// Only Phaser's color arithmetic is used by this drawing helper. Record its
// drawing commands in Node while using the real shared landscape and area.
vi.mock('phaser', () => ({ default: {
  Display: { Color: {
    IntegerToRGB: (n: number) => ({ r: n >> 16 & 255, g: n >> 8 & 255, b: n & 255 }),
    GetColor: (r: number, g: number, b: number) => r << 16 | g << 8 | b,
  } },
  Math: { Clamp: (n: number, min: number, max: number) => Math.max(min, Math.min(max, n)) },
} }));

import { getArea } from '../src/game/areas';
import { QUAIL_DRAINAGE, distanceToLine } from '../src/game/quailLandscape';
import { drawPropertyRelief } from '../src/scenes/dropMapTerrain';

function recorder() {
  let color = 0;
  const cells: { x: number; y: number; width: number; height: number; color: number }[] = [];
  const contours: number[][] = [];
  const graphics = {
    fillStyle(value: number) { color = value; return this; },
    fillRect(x: number, y: number, width: number, height: number) { cells.push({ x, y, width, height, color }); return this; },
    lineStyle() { return this; },
    lineBetween(...points: number[]) { contours.push(points); return this; },
  };
  return { cells, contours, graphics: graphics as unknown as Parameters<typeof drawPropertyRelief>[0] };
}

describe('Quail survey map', () => {
  it('shows the actual continuous draw in shared property coordinates, including both map edges', () => {
    const area = getArea('quail-fields');
    const map = { x: 41, y: 75, w: 267, h: 143 };
    const recorded = recorder();
    expect(drawPropertyRelief(recorded.graphics, area, map)).toBe(true);
    // Cool gray-green pixels distinguish the vegetated draw from the warm
    // uplands. Their location must follow the real drainage, not a painted
    // horizontal band or a separate illustration of the property.
    const cool = recorded.cells.filter(cell => (cell.color & 255) / (cell.color >> 16 & 255) > 0.9);
    expect(cool.length).toBeGreaterThan(40);
    for (const cell of cool) {
      const px = (cell.x + (cell.width - 0.45) / 2 - map.x) / map.w * area.world.w;
      const py = (cell.y + (cell.height - 0.45) / 2 - map.y) / map.h * area.world.h;
      expect(distanceToLine(px, py, QUAIL_DRAINAGE)).toBeLessThan(23);
    }
    expect(Math.min(...cool.map(cell => cell.x))).toBe(map.x);
    expect(Math.max(...cool.map(cell => cell.x))).toBeGreaterThan(map.x + map.w * 0.98);
    expect(new Set(recorded.cells.map(cell => cell.color)).size).toBeGreaterThan(100);
    expect(recorded.contours.length).toBeGreaterThan(100);
  });

  it('does not mutate cover, trails, landmarks, or drop coordinates when painting the survey', () => {
    const area = getArea('quail-fields'); const before = JSON.stringify(area);
    const recorded = recorder();
    const rect = { x: 41, y: 75, w: 267, h: 143 };
    drawPropertyRelief(recorded.graphics, area, rect);
    expect(JSON.stringify(area)).toBe(before);
  });

  it('leaves other prairie properties on their existing map rendering', () => {
    const otherPrairie = { ...getArea('quail-fields'), id: 'other-prairie-property' };
    const recorded = recorder();
    expect(drawPropertyRelief(recorded.graphics, otherPrairie, { x: 0, y: 0, w: 267, h: 143 })).toBe(false);
    expect(recorded.cells).toHaveLength(0);
    expect(recorded.contours).toHaveLength(0);
  });
});
