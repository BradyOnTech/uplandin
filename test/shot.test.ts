import { describe, expect, it } from 'vitest';
import { escapeVelocity, hitTest } from '../src/game/shot';

describe('hitTest', () => {
  it('connects inside the spread', () => {
    expect(hitTest({ x: 100, y: 100 }, { x: 108, y: 100 }, 14)).toBe(true);
  });

  it('misses outside the spread', () => {
    expect(hitTest({ x: 100, y: 100 }, { x: 120, y: 100 }, 14)).toBe(false);
  });
});

describe('escapeVelocity', () => {
  it('always climbs', () => {
    for (let i = 0; i < 50; i++) {
      expect(escapeVelocity().y).toBeLessThan(0);
    }
  });
});
