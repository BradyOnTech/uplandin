import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Structural check on the shipped English Setter field sheet: four run frames
 * + point + heel + retrieve, matching FieldScene's spritesheet slice (32×20).
 */
describe('English Setter field sheet', () => {
  it('is seven 32×20 cells in public/art', () => {
    const path = resolve(__dirname, '../public/art/english-setter-sheet-alpha.png');
    const buf = readFileSync(path);
    expect(buf[0]).toBe(0x89);
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    expect(width).toBe(224); // 7 × 32
    expect(height).toBe(20);
    expect(width / 32).toBe(7);
  });

  it('FieldScene plays run 0–3 and maps point/heel/retrieve frames', () => {
    const src = readFileSync(resolve(__dirname, '../src/scenes/FieldScene.ts'), 'utf8');
    expect(src).toMatch(/DOG_FRAME_POINT\s*=\s*4/);
    expect(src).toMatch(/DOG_FRAME_HEEL\s*=\s*5/);
    expect(src).toMatch(/DOG_FRAME_RETRIEVE\s*=\s*6/);
    expect(src).toMatch(/frames:\s*\[\s*0\s*,\s*1\s*,\s*2\s*,\s*3\s*\]/);
    expect(src).toMatch(/frameWidth:\s*32/);
    expect(src).toMatch(/frameHeight:\s*20/);
    expect(src).toMatch(/case 'heel'/);
    expect(src).toMatch(/case 'retrieving'/);
  });
});
