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

  it('resolves a low western skyline from the screenshot approach on the actual joined meshes', () => {
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
    const opening = skyline(242), left = skyline(232), right = skyline(252);
    surface.dispose();
    expect(opening).toBeGreaterThan(2); expect(opening).toBeLessThan(4);
    expect(left - opening).toBeGreaterThan(1); expect(right - opening).toBeGreaterThan(1);
    expect(Math.max(left, right)).toBeLessThan(6);
  });

  it('carries a connected low draw and bank paint through the western shoulders', () => {
    const surface = renderedSurface(), bed = growth(), shoulder = growth();
    for (const x of [-300, -450, -650]) {
      const u = (-x - 20) / 980, y = 610 + 475 * u - 40 * Math.sin(Math.PI * u);
      const low = surface.heightAt(x, y);
      const across = (surface.heightAt(x, y - 140) + surface.heightAt(x, y + 140)) / 2;
      expect(across - low).toBeGreaterThan(5);
      sharptailHorizonGrowth(x, y, bed);
      sharptailHorizonGrowth(x, y - .84 * (85 + 40 * u), shoulder);
      expect(bed.hollow).toBeGreaterThan(.8);
      expect(shoulder.exposed).toBeGreaterThan(.5);
    }
    surface.dispose();
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
    expect(maxima.crown).toBeGreaterThan(.5); expect(maxima.hollow).toBeGreaterThan(.8); expect(maxima.exposed).toBeGreaterThan(.5);
  });
});
