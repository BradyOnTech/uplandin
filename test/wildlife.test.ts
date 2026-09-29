import { describe, expect, it } from 'vitest';
import { advanceWildlife, createWildlifeState, wildlifeClue } from '../src/twod/wildlife';

describe('woodland wildlife meetings', () => {
  it.each(['robin', 'quail', 'grouse', 'kingfisher', 'goldfinch'])('lets patient observation earn a %s sketch in three meaningful turns', species => {
    let state = createWildlifeState(species);
    for (let turn = 0; turn < 3; turn++) {
      expect(wildlifeClue(state).length).toBeGreaterThan(20);
      state = advanceWildlife(state, state.stance === 'curious' ? 'watch' : 'wait');
    }
    expect(state.trust).toBe(3);
    expect(state.stance).toBe('relaxed');
    expect(state.turns).toBe(3);
    expect(advanceWildlife(state, 'sketch').outcome).toBe('sketched');
  });

  it('lets the dog help once without allowing repeated help to skip the encounter', () => {
    let state = advanceWildlife(createWildlifeState('robin'), 'dog');
    expect(state.trust).toBe(1);
    expect(state.dogHelpUsed).toBe(true);
    state = advanceWildlife(state, 'dog');
    expect(state.trust).toBe(1);
    expect(state.turns).toBe(1);
    expect(wildlifeClue(state)).toMatch(/watch/i);
  });

  it('allows a startled bird to settle and recover instead of locking the player out', () => {
    let state = createWildlifeState('robin');
    state = advanceWildlife(state, 'wait');
    state = advanceWildlife(state, 'wait');
    expect(state.trust).toBe(0);
    expect(state.stance).toBe('shy');
    for (let turn = 0; turn < 3; turn++) state = advanceWildlife(state, state.stance === 'curious' ? 'watch' : 'wait');
    expect(advanceWildlife(state, 'sketch').outcome).toBe('sketched');
  });

  it('never collects an unfinished sketch and allows leaving at any time', () => {
    const state = createWildlifeState('kingfisher');
    expect(advanceWildlife(state, 'sketch').outcome).toBe('playing');
    const left = advanceWildlife(state, 'leave');
    expect(left.outcome).toBe('left');
    expect(advanceWildlife(left, 'dog')).toBe(left);
  });

  it('falls back safely for an unknown saved species identifier', () => {
    expect(createWildlifeState('missing-bird').species).toBe('robin');
    expect(createWildlifeState('__proto__').species).toBe('robin');
  });
});
