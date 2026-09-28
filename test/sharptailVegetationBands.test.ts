import { describe, expect, it } from 'vitest';
import {
  sampleSharptailVegetationBands, SHARPTAIL_VEGETATION_BAND_ANCHORS,
  SHARPTAIL_VEGETATION_BAND_BOUNDS, SHARPTAIL_VEGETATION_BANDS,
} from '../src/game/sharptailVegetationBands';

const keys = ['grass', 'scrub', 'litter'] as const;
const sample = (x: number, y: number) => {
  const out = { scrub: 0, grass: 0, litter: 0 };
  sampleSharptailVegetationBands(x, y, out);
  return out;
};

describe('western draw vegetation bands', () => {
  it('connects the existing colonies with broad grass while retaining deliberate scrub breaks', () => {
    for (const [x, y] of [[110, 540], [86, 554], [26, 599], [-60, 590], [-120, 647],
      [-180, 620], [-185, 682], [-215, 574], [87, 681], [4, 549], [-25, 572]]) {
      const out = sample(x, y);
      expect(out.grass).toBeGreaterThan(.9);
      expect(out.scrub).toBeGreaterThan(.45);
    }
    for (const [x, y] of [[53, 584], [-92, 615], [58, 658]]) {
      const out = sample(x, y);
      expect(out.grass).toBeGreaterThan(.8);
      expect(out.scrub).toBeLessThan(.01);
    }
    // The broad ground/stand footprint and narrow woody core are intentionally
    // different: these points are well outside the tiny former shrub islands.
    for (const [x, y] of [[-60, 610], [-185, 702], [26, 619]]) {
      expect(sample(x, y).grass).toBeGreaterThan(.5);
      expect(sample(x, y).scrub).toBe(0);
    }
  });

  it('forms one substantial connected footprint on an eight-yard placement grid', () => {
    const occupied = new Set<string>();
    const b = SHARPTAIL_VEGETATION_BAND_BOUNDS;
    for (let y = b.minY; y <= b.maxY; y += 8) for (let x = b.minX; x <= b.maxX; x += 8) {
      const out = sample(x, y);
      for (const key of keys) {
        expect(out[key]).toBeGreaterThanOrEqual(0);
        expect(out[key]).toBeLessThanOrEqual(1);
      }
      if (out.grass > .2) occupied.add(`${x},${y}`);
    }
    // 8-yard samples must resolve continuous ecological masses, not sub-cell
    // dots. The footprint still occupies a minority of the 600x420 yard area.
    expect(occupied.size).toBeGreaterThan(350);
    expect(occupied.size).toBeLessThan(850);
    const count = occupied.size, queue = [occupied.values().next().value!];
    occupied.delete(queue[0]);
    for (let i = 0; i < queue.length; i++) {
      const [x, y] = queue[i].split(',').map(Number);
      for (const dx of [-8, 0, 8]) for (const dy of [-8, 0, 8]) {
        const key = `${x + dx},${y + dy}`;
        if (occupied.delete(key)) queue.push(key);
      }
    }
    expect(queue.length).toBe(count);
    expect(occupied.size).toBe(0);
  });

  it('has compact support and resets reused outputs without changing other parts of the property', () => {
    const out = { scrub: 1, grass: 1, litter: 1 };
    for (const [x, y] of [[-430, 650], [170, 650], [-100, 430], [-100, 850], [250, 535],
      [700, 400], [1000, 300], [0, 0], [-400, 500], [NaN, 600], [-100, Infinity]]) {
      out.scrub = out.grass = out.litter = 1;
      sampleSharptailVegetationBands(x, y, out);
      expect(out).toEqual({ scrub: 0, grass: 0, litter: 0 });
    }
    expect(sample(-290, 630)).toEqual({ scrub: 0, grass: 0, litter: 0 });
  });

  it('keeps first derivatives continuous at authored stations and compact support edges', () => {
    const epsilon = .0001;
    const points = SHARPTAIL_VEGETATION_BANDS.flatMap(band => band.knots.flatMap(k =>
      [0, 3, 10, k[2] / 2].map(offset => band.axis === 'x' ? [k[0], k[1] + offset] : [k[1] + offset, k[0]])));
    for (const [x, y] of points) for (const [dx, dy] of [[1, 0], [0, 1]]) {
      const a = sample(x - epsilon * dx, y - epsilon * dy), m = sample(x, y);
      const b = sample(x + epsilon * dx, y + epsilon * dy);
      for (const key of keys) {
        const left = (m[key] - a[key]) / epsilon, right = (b[key] - m[key]) / epsilon;
        expect(Math.abs(right - left)).toBeLessThan(.0002);
      }
    }
  });

  it('exports stable anchors inside the field rather than compulsory single-file shrub positions', () => {
    const counts = new Map<string, number>();
    for (const anchor of SHARPTAIL_VEGETATION_BAND_ANCHORS) {
      expect(sample(anchor.x, anchor.y).grass).toBeGreaterThan(.7);
      expect(anchor.width).toBeGreaterThanOrEqual(30);
      expect(anchor.width).toBeLessThanOrEqual(90);
      expect(Math.hypot(anchor.crossX, anchor.crossY)).toBe(1);
      const offset = anchor.width * .2;
      expect(sample(anchor.x + anchor.crossX * offset, anchor.y + anchor.crossY * offset).grass).toBeGreaterThan(.4);
      counts.set(anchor.band, (counts.get(anchor.band) ?? 0) + 1);
    }
    expect(counts.size).toBe(4);
    for (const [band, count] of counts) expect(count).toBeGreaterThanOrEqual(band === 'boundary-apron' ? 9 : 11);
  });
});
