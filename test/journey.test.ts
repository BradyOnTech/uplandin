import { describe, expect, it } from 'vitest';
import {
  BRIDGE, createJourneySave, Journey, JOURNEY_HEIGHT, JOURNEY_WIDTH,
  NPCS, parseJourneySave, SATCHEL, SAVE_KEY, SITES,
} from '../src/twod/journey';

function meetWren(game: Journey): void {
  game.player = { ...NPCS[0] };
  expect(game.interact()?.kind).toBe('dialogue');
}

function repairBridge(game: Journey): void {
  meetWren(game);
  game.player = { ...SATCHEL };
  expect(game.interact()?.kind).toBe('dialogue');
  meetWren(game);
}

function observe(game: Journey, id: string, success = true): void {
  const site = SITES.find(bird => bird.id === id)!;
  game.player = { x: site.x, y: site.y };
  expect(game.interact()).toEqual({ kind: 'encounter', species: id });
  game.finishEncounter(id, success);
}

describe('Briar Glen story journey', () => {
  it('takes the lost satchel back to Wren before opening the bridge', () => {
    const game = new Journey();
    game.player = { ...SATCHEL };
    expect(game.context()?.kind).not.toBe('search');
    meetWren(game);
    expect(game.save.introduced).toBe(true);
    game.player = { ...BRIDGE };
    expect(game.context()?.kind).toBe('bridge');
    game.interact();
    expect(game.save.bridgeOpen).toBe(false);
    game.player = { ...SATCHEL };
    expect(game.context()?.kind).toBe('search');
    game.interact();
    expect(game.save.satchelFound).toBe(true);
    expect(game.save.bridgeOpen).toBe(false);
    expect(game.objective()).toMatch(/back to Wren/);
    meetWren(game);
    expect(game.save.bridgeOpen).toBe(true);
    expect(game.save.completed).toBe(false);
  });

  it('lets the dog discover the bag without moving the player or requiring commands', () => {
    const game = new Journey();
    meetWren(game);
    game.player = { x: SATCHEL.x - 100, y: SATCHEL.y };
    const originalPlayer = { ...game.player };
    for (let i = 0; i < 240; i++) game.update(1 / 60);
    expect(game.player).toEqual(originalPlayer);
    expect(game.dogState).toBe('found');
    expect(Math.hypot(game.dog.x - SATCHEL.x, game.dog.y - SATCHEL.y)).toBeLessThan(22);
    expect(game.save.satchelFound).toBe(false);
    game.player = { x: 272, y: 704 };
    game.update(1 / 60);
    expect(game.dogState).toBe('following');
  });

  it('allows bird discovery in any order and replaying a failed observation', () => {
    const game = new Journey();
    meetWren(game);
    observe(game, 'grouse', false);
    expect(game.save.observed).toEqual([]);
    observe(game, 'grouse');
    observe(game, 'robin');
    observe(game, 'quail');
    expect(game.save.observed).toEqual(['grouse', 'robin', 'quail']);
    expect(game.save.completed).toBe(false);
    observe(game, 'robin');
    game.finishEncounter('robin', true);
    expect(game.save.observed).toHaveLength(3);
  });

  it('lets terrain navigation steer the dog around obstacles without moving the player', () => {
    const game = new Journey();
    game.player = { x: 200, y: 200 };
    game.dog = { x: 100, y: 100 };
    let destination: { x: number; y: number } | undefined;
    game.update(.1, (from, to, travel) => {
      destination = to;
      // A terrain navigator can travel sideways before heading toward the player.
      return { x: from.x + travel, y: from.y };
    });
    expect(game.dog.x).toBeCloseTo(113.2);
    expect(game.dog.y).toBe(100);
    expect(destination?.y).toBeGreaterThan(200);
    expect(game.player).toEqual({ x: 200, y: 200 });
    const safe = { ...game.dog };
    game.update(.1, () => ({ x: Number.NaN, y: Infinity }));
    expect(game.dog).toEqual(safe);
  });

  it('requires the bridge and three distinct notes to meet the goldfinch', () => {
    const game = new Journey();
    meetWren(game);
    game.player = { ...SITES[3] };
    expect(game.context()?.kind).not.toBe('observe');
    repairBridge(game);
    game.player = { ...SITES[4] };
    expect(game.interact()?.kind).toBe('dialogue');
    game.finishEncounter('goldfinch', true);
    expect(game.save.completed).toBe(false);
    observe(game, 'robin');
    observe(game, 'quail');
    observe(game, 'kingfisher');
    observe(game, 'goldfinch', false);
    expect(game.save.completed).toBe(false);
    observe(game, 'goldfinch');
    expect(game.save.completed).toBe(true);
    // Finishing the chapter never locks exploration or the remaining journal entry.
    observe(game, 'grouse');
    expect(game.save.observed).toHaveLength(5);
    meetWren(game);
    expect(game.save.observed).toHaveLength(5);
  });

  it('ignores unrelated encounter results and blocks interactions during an encounter', () => {
    const game = new Journey();
    meetWren(game);
    game.player = { ...SITES[0] };
    game.interact();
    expect(game.context()).toBeNull();
    expect(game.interact()).toBeNull();
    game.finishEncounter('quail', true);
    expect(game.save.observed).toHaveLength(0);
    expect(game.context()).toBeNull();
    game.finishEncounter('Robin', true);
    expect(game.save.observed).toEqual(['robin']);
    expect(game.context()?.kind).toBe('observe');
  });

  it('round trips an independent save at every quest stage without losing progress', () => {
    let game = new Journey();
    meetWren(game);
    game = new Journey(parseJourneySave(JSON.stringify(game.snapshot())));
    expect(game.save.introduced).toBe(true);
    game.player = { ...SATCHEL };
    game.interact();
    game = new Journey(parseJourneySave(JSON.stringify(game.snapshot())));
    expect(game.save.satchelFound).toBe(true);
    meetWren(game);
    observe(game, 'robin');
    observe(game, 'quail');
    observe(game, 'grouse');
    observe(game, 'goldfinch');
    const snapshot = game.snapshot();
    const restored = new Journey(parseJourneySave(JSON.stringify(snapshot)));
    snapshot.observed.length = 0;
    snapshot.player.x = 0;
    expect(restored.save.completed).toBe(true);
    expect(restored.save.observed).toHaveLength(4);
    expect(game.save.observed).toHaveLength(4);
    expect(restored.player).toEqual(game.player);
    expect(SAVE_KEY).toBe('uplandin:2d:journey:v1');
  });

  it('repairs malformed state and prevents a closed-bridge save from stranding the player', () => {
    expect(parseJourneySave('broken')).toEqual(createJourneySave());
    expect(parseJourneySave('{"version":9}')).toEqual(createJourneySave());
    expect(parseJourneySave(null)).toEqual(createJourneySave());
    const malformed = parseJourneySave(JSON.stringify({
      ...createJourneySave(), introduced: true, dogName: '   ',
      observed: ['robin', 'robin', 'unknown', 'kingfisher', 'goldfinch', 2],
      completed: true, player: { x: 999, y: 400 },
    }));
    expect(malformed.observed).toEqual(['robin']);
    expect(malformed.completed).toBe(false);
    expect(malformed.player).toEqual(createJourneySave().player);
    expect(malformed.dogName).toBe('Scout');
    const repaired = parseJourneySave(JSON.stringify({
      ...createJourneySave(), bridgeOpen: true, player: { x: -500, y: 99999 },
    }));
    expect(repaired.introduced).toBe(true);
    expect(repaired.satchelFound).toBe(true);
    expect(repaired.player.x).toBeGreaterThan(0);
    expect(repaired.player.x).toBeLessThan(JOURNEY_WIDTH);
    expect(repaired.player.y).toBeLessThan(JOURNEY_HEIGHT);
  });

  it('keeps friendly dog interaction available after the story is complete', () => {
    const game = new Journey({ ...createJourneySave(), introduced: true, satchelFound: true,
      bridgeOpen: true, observed: ['robin', 'quail', 'grouse', 'goldfinch'], completed: true });
    game.player = { x: 272, y: 704 };
    game.dog = { x: 270, y: 708 };
    expect(game.context()?.kind).toBe('pet');
    const reply = game.interact();
    expect(reply?.kind).toBe('dialogue');
    expect(reply && 'speaker' in reply && reply.speaker).toBe('Scout');
    expect(game.save.completed).toBe(true);
    game.update(Number.NaN);
    expect(Number.isFinite(game.dog.x)).toBe(true);
  });
});
