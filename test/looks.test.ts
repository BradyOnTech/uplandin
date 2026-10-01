import { describe, expect, it } from 'vitest';
import { DEFAULT_LOOK, fieldLook, lookAt, LOOK_IDS, LOOKS, resolveLook } from '../src/three/looks';
import { supportsScreenEffects } from '../src/three/postEffects';

describe('screen-effects looks', () => {
  it('opts in only for a named look', () => {
    for (const id of LOOK_IDS) expect(resolveLook(id)).toBe(id);
    expect(resolveLook(null)).toBeNull();
    expect(resolveLook('')).toBeNull();
    expect(resolveLook('today')).toBeNull();
    expect(resolveLook('Golden')).toBeNull();
  });

  it('renders Crisp autumn on High unless the link asks for another look or none', () => {
    expect(DEFAULT_LOOK).toBe('crisp');
    for (const value of [null, '', 'today', 'Golden', 'crisp']) expect(fieldLook(value, 'high')).toBe('crisp');
    expect(fieldLook('golden', 'high')).toBe('golden');
    expect(fieldLook('natural', 'high')).toBe('natural');
    expect(fieldLook('off', 'high')).toBeNull();
    for (const value of [null, 'crisp', 'golden', 'off']) expect(fieldLook(value, 'lite')).toBeNull();
  });

  it('eases the Crisp grade in low light and on a high sun, leaving the base look alone', () => {
    const crisp = LOOKS.crisp;
    for (const tod of ['dawn', 'morning'] as const) expect(lookAt(crisp, tod)).toBe(crisp);
    expect(lookAt(crisp, 'noon').grade.saturation).toBeLessThan(crisp.grade.saturation);
    const evening = lookAt(crisp, 'evening'), last = lookAt(crisp, 'lastlight');
    expect(evening.grade.contrast).toBeLessThan(crisp.grade.contrast);
    expect(last.grade.contrast).toBeLessThanOrEqual(evening.grade.contrast);
    // Last light lifts the blacks instead of crushing them, with less occlusion and vignette.
    for (const value of last.grade.offset) expect(value).toBeGreaterThanOrEqual(0);
    expect(last.ao.strength).toBeLessThan(crisp.ao.strength);
    expect(last.grade.vignette).toBeLessThan(crisp.grade.vignette);
    // Everything not tweaked carries over, and the base look is unchanged.
    expect(last.haze).toBe(crisp.haze);
    expect(last.ao.radius).toBe(crisp.ao.radius);
    expect(last.grade.slope).toBe(crisp.grade.slope);
    expect(crisp.grade.contrast).toBe(1.12);
  });

  it('needs a renderable half-float format', () => {
    const renderer = (names: string[]) => ({ extensions: { has: (name: string) => names.includes(name) } }) as unknown as Parameters<typeof supportsScreenEffects>[0];
    expect(supportsScreenEffects(renderer(['EXT_color_buffer_float']))).toBe(true);
    expect(supportsScreenEffects(renderer(['EXT_color_buffer_half_float']))).toBe(true);
    expect(supportsScreenEffects(renderer([]))).toBe(false);
  });

  it.each(LOOK_IDS)('keeps %s inside ranges that read as a grade, not a filter', id => {
    const look = LOOKS[id];
    expect(look.label.length).toBeGreaterThan(0);
    expect(look.ao.radius).toBeGreaterThan(.3); expect(look.ao.radius).toBeLessThan(2);
    expect(look.ao.strength).toBeGreaterThanOrEqual(0); expect(look.ao.strength).toBeLessThanOrEqual(1);
    expect(look.ao.maxDistance).toBeGreaterThan(40);
    expect(look.haze.density).toBeGreaterThanOrEqual(0); expect(look.haze.density).toBeLessThan(.01);
    expect(look.haze.falloff).toBeGreaterThan(0);
    expect(look.bloom.threshold).toBeGreaterThan(.5);
    expect(look.bloom.strength).toBeLessThan(1);
    const g = look.grade;
    expect(g.saturation).toBeGreaterThan(.7); expect(g.saturation).toBeLessThan(1.4);
    expect(g.contrast).toBeGreaterThan(.8); expect(g.contrast).toBeLessThan(1.3);
    expect(g.vignette).toBeGreaterThanOrEqual(0); expect(g.vignette).toBeLessThan(.4);
    for (const triple of [g.whiteBalance, g.slope, g.offset, g.power, g.shadowTint, g.highlightTint, look.haze.tint]) {
      expect(triple).toHaveLength(3);
      for (const value of triple) expect(Number.isFinite(value)).toBe(true);
    }
    for (const value of [...g.offset, ...g.shadowTint, ...g.highlightTint]) expect(Math.abs(value)).toBeLessThan(.06);
  });
});
