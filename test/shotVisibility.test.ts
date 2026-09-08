import { expect, it } from 'vitest';
import { terrainBlocksShot } from '../src/three/shotVisibility';

it('blocks a target behind a ridge even when both endpoints are above ground', () => {
  const ridge = (x: number) => Math.max(0, 3 - Math.abs(x - 5));
  expect(terrainBlocksShot({ x: 0, y: 1.6, z: 0 }, { x: 10, y: 1.6, z: 0 }, ridge)).toBe(true);
  expect(terrainBlocksShot({ x: 0, y: 4, z: 0 }, { x: 10, y: 4, z: 0 }, ridge)).toBe(false);
});

it('handles a rising shot over a crest and a downhill shot into the slope', () => {
  const slope = (x: number) => x * .2;
  expect(terrainBlocksShot({ x: 0, y: 1.6, z: 0 }, { x: 10, y: 5, z: 0 }, slope)).toBe(false);
  expect(terrainBlocksShot({ x: 0, y: 1.6, z: 0 }, { x: 10, y: 1, z: 0 }, slope)).toBe(true);
});

it('supports vertical shots and does not falsely block a path just grazing flat ground', () => {
  expect(terrainBlocksShot({ x: 0, y: 1.6, z: 0 }, { x: 0, y: 8, z: 0 }, () => 0)).toBe(false);
  expect(terrainBlocksShot({ x: 0, y: 1.6, z: 0 }, { x: 0, y: -1, z: 0 }, () => 0)).toBe(true);
  expect(terrainBlocksShot({ x: -10, y: .03, z: -10 }, { x: 10, y: .03, z: 10 }, () => .04)).toBe(false);
});
