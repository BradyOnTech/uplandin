import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { getArea } from '../src/game/areas';
import { LandscapeModel } from '../src/game/landscape';
import { sharptailHorizonGrowth, sharptailHorizonHeight } from '../src/game/sharptailHorizon';
import { buildSharptailHorizonGeometries } from '../src/three/subsystems/sharptailHorizonGeometry';

const landscape = new LandscapeModel(getArea('sharptail-prairie'));
const height = (x: number, y: number) => landscape.heightAtProperty(x, y);
const outside = (x: number, y: number) => Math.hypot(Math.max(-x, 0, x - 1400), Math.max(-y, 0, y - 800));
const growth = () => ({ crown: 0, hollow: 0, exposed: 0 });

// Sample the renderer's actual joined geometry, not a denser analytic height
// field or the now-retired unequal horizon grids.
function renderedSurface() {
  const geometries = buildSharptailHorizonGeometries(landscape, (_landscape, _x, _y, out) => out.set(0xffffff));
  const material = new THREE.MeshBasicMaterial();
  const meshes = geometries.map(geometry => new THREE.Mesh(geometry, material));
  const ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0));
  const world = { x: 0, z: 0 };
  return {
    heightAt(x: number, y: number) {
      if (outside(x, y) === 0) return height(x, y);
      landscape.propertyToWorld(x, y, world);
      ray.ray.origin.set(world.x, 1000, world.z);
      const hits = ray.intersectObjects(meshes, false);
      if (hits.length === 0) throw new Error(`No exterior triangle at ${x}, ${y}`);
      return hits[0].point.y;
    },
    dispose() { geometries.forEach(geometry => geometry.dispose()); material.dispose(); },
  };
}

describe('western exterior prairie', () => {
  it('adds no height or paint inside the complete hunting property and 24-yard normal collar', () => {
    const out = growth();
    let samples = 0;
    for (let y = -24; y <= 824; y += 8) for (let x = -24; x <= 1424; x += 8) {
      if (outside(x, y) > 24) continue;
      expect(sharptailHorizonHeight(x, y)).toBe(0);
      // A reused object must be reset even after an exterior sample.
      out.crown = out.hollow = out.exposed = 1;
      sharptailHorizonGrowth(x, y, out);
      expect(out).toEqual({ crown: 0, hollow: 0, exposed: 0 }); samples++;
    }
    expect(samples).toBeGreaterThan(19000);
  });

  it('joins the collar with a zero slope and keeps the exterior broadly rolling', () => {
    for (const [x, y, dx, dy] of [[-24, 480, -1, 0], [1424, 480, 1, 0], [700, -24, 0, -1], [700, 824, 0, 1]]) {
      expect(sharptailHorizonHeight(x, y)).toBe(0);
      expect(Math.abs(sharptailHorizonHeight(x + dx * .01, y + dy * .01) / .01)).toBeLessThan(.0001);
    }
    let maxSlope = 0;
    for (let y = 0; y <= 1800; y += 24) for (let x = -1000; x <= 0; x += 24) {
      const slope = Math.hypot(height(x + .5, y) - height(x - .5, y), height(x, y + .5) - height(x, y - .5)) / .9144;
      maxSlope = Math.max(maxSlope, slope);
    }
    // Incised exterior banks may be steeper than the huntable prairie, but
    // remain slopes rather than cliffs. No part of this relief enters play.
    expect(maxSlope).toBeLessThan(.6);
  });

  it('resolves a low, varied western skyline from normal eye height on the actual joined meshes', () => {
    const surface = renderedSurface();
    const eye = height(135, 495) + 1.62;
    const skyline = (degrees: number) => {
      const bearing = degrees * Math.PI / 180;
      let highest = -Infinity;
      for (let distance = 20; distance < 1250; distance += 4) {
        const x = 135 + Math.sin(bearing) * distance, y = 495 - Math.cos(bearing) * distance;
        if (x < -1000 || y > 1800) break;
        highest = Math.max(highest, Math.atan2(surface.heightAt(x, y) - eye, distance * .9144) * 180 / Math.PI);
      }
      return highest;
    };
    try {
      const angles = [195, 209, 220, 232, 242, 252, 265, 280].map(skyline);
      // Wide open country needs low relief, with a shoulder and an opening,
      // rather than a tall enclosing wall or one constant-height ramp.
      expect(Math.min(...angles)).toBeGreaterThan(-2);
      expect(Math.max(...angles)).toBeLessThan(6);
      expect(Math.max(...angles) - Math.min(...angles)).toBeGreaterThan(2);
      expect(skyline(209)).toBeLessThan(2);
      expect(skyline(242)).toBeGreaterThan(1);
    } finally { surface.dispose(); }
  });

  it('renders two independent western ridgelines with a broad low valley between them', () => {
    const surface = renderedSurface(), paint = growth();
    try {
      // Cross-sections span several coarse renderer cells. Locate the actual
      // triangle crests and bed; no spline stations or formulas are copied.
      for (const y of [400, 550, 850]) {
        const section: { x: number; height: number }[] = [];
        for (let x = -980; x <= -75; x += 5) section.push({ x, height: surface.heightAt(x, y) });
        const crest = (left: number, right: number) => section.filter(p => p.x >= left && p.x <= right)
          .reduce((best, p) => p.height > best.height ? p : best);
        const near = crest(-360, -75), far = crest(-980, -550);
        const bed = section.filter(p => p.x >= -570 && p.x <= -370)
          .reduce((best, p) => p.height < best.height ? p : best);
        expect(near.height - bed.height).toBeGreaterThan(8);
        expect(far.height - bed.height).toBeGreaterThan(35);
        expect(near.x - far.x).toBeGreaterThan(350);
        const lowGround = section.filter(p => p.x > far.x && p.x < near.x && p.height < bed.height + 3);
        expect(lowGround.at(-1)!.x - lowGround[0].x).toBeGreaterThan(100);
        for (const p of section.filter(p => p.x >= lowGround[0].x && p.x <= lowGround.at(-1)!.x)) {
          expect(p.height).toBeLessThan(bed.height + 3);
        }
        // The crown paint follows both real crests, not the low connecting bed.
        for (const peak of [near, far]) {
          sharptailHorizonGrowth(peak.x, y, paint);
          expect(paint.crown).toBeGreaterThan(.3);
          expect(paint.crown).toBeGreaterThan(paint.hollow);
          expect(paint.exposed).toBeLessThan(.15);
        }
      }
      // The low land continues between the slices; it is not three isolated
      // depressions beneath otherwise joined hills.
      for (let y = 400; y <= 850; y += 25) expect(surface.heightAt(-470, y)).toBeLessThan(14);
    } finally { surface.dispose(); }
  });

  it('places sheltered green paint in an actual tributary and dry paint on its raised banks', () => {
    const surface = renderedSurface(), paint = growth();
    try {
      for (const x of [-180, -240]) {
        const samples = [];
        for (let y = 610; y <= 720; y++) {
          sharptailHorizonGrowth(x, y, paint);
          samples.push({ y, ...paint });
        }
        const bed = samples.reduce((best, p) => p.hollow > best.hollow ? p : best);
        const bank = samples.reduce((best, p) => p.exposed > best.exposed ? p : best);
        const bedHeight = surface.heightAt(x, bed.y);
        const shoulders = (surface.heightAt(x, bed.y - 50) + surface.heightAt(x, bed.y + 50)) / 2;
        expect(shoulders - bedHeight).toBeGreaterThan(2);
        expect(bed.hollow).toBeGreaterThan(.7);
        expect(bank.exposed).toBeGreaterThan(.3);
        expect(Math.abs(bank.y - bed.y)).toBeGreaterThan(20);
        expect(surface.heightAt(x, bank.y) - bedHeight).toBeGreaterThan(.5);
        expect(bank.exposed).toBeGreaterThan(bed.exposed + .2);
      }
    } finally { surface.dispose(); }
  });

  it('shares bounded, continuous crown and coulee paint with the exterior relief', () => {
    const out = growth(), neighbor = growth();
    const maxima = growth();
    for (let y = 100; y <= 1700; y += 37) for (let x = -950; x <= -25; x += 31) {
      sharptailHorizonGrowth(x, y, out); sharptailHorizonGrowth(x + .01, y + .01, neighbor);
      for (const key of ['crown', 'hollow', 'exposed'] as const) {
        expect(out[key]).toBeGreaterThanOrEqual(0); expect(out[key]).toBeLessThanOrEqual(1);
        expect(Math.abs(neighbor[key] - out[key])).toBeLessThan(.001);
        maxima[key] = Math.max(maxima[key], out[key]);
      }
    }
    expect(maxima.crown).toBeGreaterThan(.5); expect(maxima.hollow).toBeGreaterThan(.8); expect(maxima.exposed).toBeGreaterThan(.4);
  });

  it('fades paint continuously through the compact ridge feet and ends', () => {
    const out = growth(), east = growth(), south = growth();
    const largestStep = growth();
    // A fine pass across the whole profile catches a hard support boundary
    // even when the coarser boundedness grid lands on either side of it.
    for (let y = -280; y <= 1700; y += 31) for (let x = -1000; x <= -25; x += .5) {
      sharptailHorizonGrowth(x, y, out);
      sharptailHorizonGrowth(x + .5, y, east);
      sharptailHorizonGrowth(x, y + .5, south);
      for (const key of ['crown', 'hollow', 'exposed'] as const) {
        largestStep[key] = Math.max(largestStep[key], Math.abs(east[key] - out[key]), Math.abs(south[key] - out[key]));
      }
    }
    for (const value of Object.values(largestStep)) expect(value).toBeLessThan(.06);
  });

});
