import { describe, expect, it } from 'vitest';
import {
  CAREER_KEY,
  emptyCareer,
  loadCareer,
  recordHunt,
  saveCareer,
  type StorageLike,
} from '../src/game/career';

function memStorage(): StorageLike & { data: Record<string, string> } {
  const data: Record<string, string> = {};
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}

describe('career', () => {
  it('starts empty', () => {
    expect(emptyCareer()).toEqual({ hunts: 0, downed: 0, escaped: 0, areas: {} });
  });

  it('accumulates hunts and per-area bests', () => {
    let c = emptyCareer();
    c = recordHunt(c, 'quail-fields', 3, 2);
    c = recordHunt(c, 'quail-fields', 5, 1);
    c = recordHunt(c, 'grouse-woods', 1, 4);
    expect(c.hunts).toBe(3);
    expect(c.downed).toBe(9);
    expect(c.escaped).toBe(7);
    expect(c.areas['quail-fields']).toEqual({ hunts: 2, downed: 8, escaped: 3, best: 5 });
    expect(c.areas['grouse-woods'].best).toBe(1);
  });

  it('does not mutate the previous career', () => {
    const c0 = emptyCareer();
    const c1 = recordHunt(c0, 'quail-fields', 3, 2);
    expect(c0.hunts).toBe(0);
    expect(c1.hunts).toBe(1);
  });

  it('round-trips through storage', () => {
    const s = memStorage();
    const c = recordHunt(emptyCareer(), 'quail-fields', 4, 2);
    saveCareer(c, s);
    expect(loadCareer(s)).toEqual(c);
  });

  it('survives corrupt storage', () => {
    const s = memStorage();
    s.data[CAREER_KEY] = '{not json';
    expect(loadCareer(s)).toEqual(emptyCareer());
  });

  it('handles missing storage', () => {
    expect(loadCareer(null)).toEqual(emptyCareer());
    expect(() => saveCareer(emptyCareer(), null)).not.toThrow();
  });
});
