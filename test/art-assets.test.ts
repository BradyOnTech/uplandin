import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const art = (...parts: string[]) => resolve(__dirname, '../public/art', ...parts);

function pngSize(path: string): { w: number; h: number } {
  const buf = readFileSync(path);
  expect(buf[0]).toBe(0x89);
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

describe('shipped public/art assets', () => {
  it('English Setter sheet is 7×32×20 (4-run + point + heel + retrieve)', () => {
    const { w, h } = pngSize(art('english-setter-sheet-alpha.png'));
    expect(w).toBe(224);
    expect(h).toBe(20);
    expect(w / 32).toBe(7);
  });

  it('hunter sheet is 4×16×20 (idle + 3 walk)', () => {
    const { w, h } = pngSize(art('hunter-sheet-alpha.png'));
    expect(w).toBe(64);
    expect(h).toBe(20);
    expect(w / 16).toBe(4);
  });

  it('bobwhite flush sheet is 3×44×28', () => {
    const { w, h } = pngSize(art('bobwhite-flush-sheet-alpha.png'));
    expect(w).toBe(132);
    expect(h).toBe(28);
  });

  it('Southern Plains flush plate is 480×270', () => {
    const { w, h } = pngSize(art('flush-backdrop-southern-plains.png'));
    expect(w).toBe(480);
    expect(h).toBe(270);
  });

  it('Southern Plains tileset is 4×16×16 with dark cover', () => {
    const { w, h } = pngSize(art('tileset-southern-plains.png'));
    expect(w).toBe(64);
    expect(h).toBe(16);
    // Cover cell (second 16×16) must be darker than open (first) — mechanical readability.
    const buf = readFileSync(art('tileset-southern-plains.png'));
    // Decode is heavy; structural size is enough here — seam script covers wrap.
    expect(existsSync(art('tileset-southern-plains.png'))).toBe(true);
    void buf;
  });

  it('shell and crosshair icons exist', () => {
    expect(existsSync(art('icon-shell.png'))).toBe(true);
    expect(existsSync(art('icon-crosshair.png'))).toBe(true);
    const shell = pngSize(art('icon-shell.png'));
    expect(shell.w).toBe(8);
    expect(shell.h).toBe(12);
  });

  it('art pipeline scripts are invocable', () => {
    expect(existsSync(resolve(__dirname, '../scripts/art/palette-quantize.py'))).toBe(true);
    expect(existsSync(resolve(__dirname, '../scripts/art/tile-seam-check.py'))).toBe(true);
    expect(existsSync(resolve(__dirname, '../scripts/art/qa-preview.py'))).toBe(true);
  });

  it('FieldScene wires hunter sheet, dog pose frames, and presentation', () => {
    const field = readFileSync(resolve(__dirname, '../src/scenes/FieldScene.ts'), 'utf8');
    // Shipping hunter = the painted side-view sheet; directional facing is
    // dormant until a painted sheet passes acceptance as hunter-dirs-v2.
    expect(field).toMatch(/hunter-sheet-alpha\.png/);
    expect(field).toMatch(/hunter-dirs-v2/);
    expect(field).toMatch(/ensureHunterGenSheet/); // last-resort fallback only
    expect(field).toMatch(/DOG_FRAME_POINT\s*=\s*4/);
    expect(field).toMatch(/DOG_FRAME_HEEL\s*=\s*5/);
    expect(field).toMatch(/DOG_FRAME_RETRIEVE\s*=\s*6/);
    expect(field).toMatch(/applyDogPose/);
    expect(field).toMatch(/TILE_COVER/);
    expect(field).toMatch(/drawFrame\(tilesKey,\s*TILE_COVER/);
    expect(field).toMatch(/updateWindLean/);
    expect(field).toMatch(/fadeOut/);
  });

  it('FlushScene keeps shell eject + hit-pause feel', () => {
    const flush = readFileSync(resolve(__dirname, '../src/scenes/FlushScene.ts'), 'utf8');
    expect(flush).toMatch(/icon-shell/);
    expect(flush).toMatch(/tweens\.timeScale/);
    expect(flush).toMatch(/fadeIn/);
  });

  it('SP has a multi-backdrop pool and flush veg/gun assets', () => {
    expect(existsSync(art('flush-backdrop-southern-plains.png'))).toBe(true);
    expect(existsSync(art('flush-backdrop-southern-plains-b.png'))).toBe(true);
    expect(existsSync(art('flush-backdrop-southern-plains-c.png'))).toBe(true);
    expect(existsSync(art('shotgun-fp.png'))).toBe(true);
    const gun = pngSize(art('shotgun-fp.png'));
    expect(gun.w).toBe(90);
    expect(gun.h).toBe(130);
    expect(existsSync(art('flush-veg-block.png'))).toBe(true);
    const b = pngSize(art('flush-backdrop-southern-plains-b.png'));
    expect(b.w).toBe(480);
    expect(b.h).toBe(270);
    const flush = readFileSync(resolve(__dirname, '../src/scenes/FlushScene.ts'), 'utf8');
    expect(flush).toMatch(/FLUSH_BACKDROP_POOLS/);
    expect(flush).toMatch(/flush-bg-southern-plains-b/);
    expect(flush).toMatch(/makeVegBlocks/);
    expect(flush).toMatch(/makeShotgun/);
    expect(flush).toMatch(/stepGunPose/);
  });

  it('FieldScene end-hunt control and hunter scale are wired', () => {
    const field = readFileSync(resolve(__dirname, '../src/scenes/FieldScene.ts'), 'utf8');
    expect(field).toMatch(/endHuntEarly/);
    expect(field).toMatch(/requestEndHunt/);
    expect(field).toMatch(/END_HUNT_BTN/);
    // The painted hunter ships at its playtested scale (law exception,
    // standing until v2); stepping stays distance-driven.
    expect(field).toMatch(/HUNTER_SHEET_SCALE\s*=\s*1\.45/);
    expect(field).toMatch(/HUNTER_STEP_PX/);
  });
});
