import { describe, expect, it } from 'vitest';
import { getArea } from '../src/game/areas';
import { TerrainSystem } from '../src/three/subsystems/terrain';

describe('3D location terrain', () => {
  it('rebuilds the same named location identically', () => {
    const profile = getArea('pheasant-coverts').terrain;
    const first = new TerrainSystem(profile);
    const second = new TerrainSystem(profile);
    expect(first.heightAt(42, -73)).toBe(second.heightAt(42, -73));
    expect(first.heightAt(-110, 18)).toBe(second.heightAt(-110, 18));
  });

  it('gives different locations different landforms', () => {
    const prairie = new TerrainSystem(getArea('quail-fields').terrain);
    const alpineProfile = getArea('timberline-parks').terrain;
    const alpine = new TerrainSystem(alpineProfile);
    const alpineWithoutGrade = new TerrainSystem({ ...alpineProfile, gradeX: 0, gradeZ: 0 });
    expect(prairie.heightAt(80, -55)).not.toBe(alpine.heightAt(80, -55));
    expect(alpine.heightAt(100, 0) - alpineWithoutGrade.heightAt(100, 0))
      .toBeCloseTo(alpineProfile.gradeX, 8);
  });
});
