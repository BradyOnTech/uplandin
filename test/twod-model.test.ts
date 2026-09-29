import { describe, expect, it } from 'vitest';
import {
  Adventure,
  calculateScentSignal,
  createSave,
  dogLevel,
  dogSearchRadius,
  dogStaminaMax,
  dogTrustLevel,
  distanceBetween,
  LANDMARKS,
  levelProgress,
  parseSave,
  PATCHES,
  SAVE_KEY,
  WIND_VECTORS,
} from '../src/twod/model';

function advance(game: Adventure, seconds: number): void {
  for (let elapsed = 0; elapsed < seconds; elapsed += 1 / 60) game.update(1 / 60);
}

/** Put the hunter beside the clue so tests exercise the same explicit action a touch button uses. */
function investigateCurrentClue(game: Adventure): void {
  const clue = game.currentClue;
  if (!clue) throw new Error('expected a clue');
  game.dog = { x: clue.x, y: clue.y };
  game.player = { x: clue.x, y: clue.y };
  advance(game, 0.1);
  expect(game.contextualAction().kind).toBe('search');
  expect(game.search()).toBe('search');
}

function castInto(game: Adventure, index = 0): void {
  const patch = game.patches[index];
  game.player = { x: patch.x, y: patch.y + 40 };
  game.dog = { x: patch.x, y: patch.y + 40 };
  expect(game.dogCommand('cast').accepted).toBe(true);
  advance(game, 0.2);
  expect(game.activePatch?.id).toBe(patch.id);
}

function investigateAllClues(game: Adventure): void {
  while (game.currentClue) investigateCurrentClue(game);
}

describe('standalone 2D field adventure', () => {
  it('requires a deliberate cast and a short player-led clue search before a point', () => {
    const game = new Adventure(createSave(), { outcomes: ['covey', 'covey', 'false-trail'] });
    game.player = { x: PATCHES[0].x, y: PATCHES[0].y + 40 };
    advance(game, 4);
    expect(game.activePatch).toBeNull();
    expect(game.dogState).toBe('following');

    castInto(game);
    expect(game.patches[0].revealedClues).toHaveLength(0);
    expect(game.patches[0].found).toBe(false);
    investigateCurrentClue(game);
    expect(game.patches[0].revealedClues).toHaveLength(1);
    expect(game.patches[0].found).toBe(false);
    investigateAllClues(game);
    expect(game.patches[0].found).toBe(true);
    expect(game.patches[0].outcomeKnown).toBe(true);
    expect(game.dogState).toBe('pointing');
    expect(game.contextualAction().kind).toBe('flush');
  });

  it('can resolve a sector as a false trail without ever creating an encounter', () => {
    const game = new Adventure(createSave(), { outcomes: ['false-trail', 'covey', 'covey'] });
    castInto(game);
    investigateAllClues(game);
    const patch = game.patches[0];
    expect(patch.outcome).toBe('false-trail');
    expect(patch.outcomeKnown).toBe(true);
    expect(patch.state).toBe('false-trail');
    expect(patch.completed).toBe(true);
    expect(patch.found).toBe(false);
    expect(game.phase).toBe('explore');
    expect(game.activePatch).toBeNull();
    expect(game.message).toMatch(/no covey/i);
  });

  it('supports heel and hold commands, and casting spends stamina that recovers at heel', () => {
    const game = new Adventure(createSave(), { outcomes: ['covey', 'covey', 'false-trail'] });
    castInto(game);
    const afterCast = game.energy;
    expect(afterCast).toBeLessThan(game.maxEnergy);
    game.dogCommand('hold');
    expect(game.dogState).toBe('holding');
    advance(game, 1);
    expect(game.energy).toBeLessThan(afterCast);
    game.dogCommand('heel');
    expect(game.dogState).toBe('returning');
    advance(game, 2);
    expect(game.dogState).toBe('following');
    expect(game.energy).toBeGreaterThan(afterCast - 2);
  });

  it('rejects hold when there is no active cover or roaming bird', () => {
    const game = new Adventure();
    const result = game.dogCommand('hold');
    expect(result.accepted).toBe(false);
    expect(result.state).toBe('following');
    expect(result.message).toMatch(/nothing to hold/i);
    expect(game.dogState).toBe('following');
    expect(game.message).toBe(result.message);
  });

  it('changes scent strength as the hunter moves with or against the wind', () => {
    const source = { x: 500, y: 500 };
    const eastReading = calculateScentSignal(source, { x: 620, y: 500 }, WIND_VECTORS.east, 'sector', 'east');
    const westReading = calculateScentSignal(source, { x: 380, y: 500 }, WIND_VECTORS.east, 'sector', 'east');
    expect(eastReading.strength).toBeGreaterThan(westReading.strength);
    expect(eastReading.windDirection).toBe('east');
    expect(eastReading.text).toMatch(/scent/i);

    const game = new Adventure(createSave(), { windDirection: 'north' });
    game.player = { x: PATCHES[0].x, y: PATCHES[0].y + 40 };
    advance(game, 0.1);
    expect(game.scentClue?.windDirection).toBe('north');
  });

  it('lets the hunter choose timing and approach, awarding a careful quiet flush', () => {
    const game = new Adventure(createSave(), { outcomes: ['covey', 'covey', 'false-trail'], windDirection: 'east' });
    castInto(game);
    investigateAllClues(game);
    game.dogCommand('hold');
    advance(game, 1);
    const approach = game.chooseApproach('careful');
    expect(approach.accepted).toBe(true);
    expect(approach.quality).toBeGreaterThan(0.7);
    expect(game.flush()).toBe('encounter');
    expect(game.encounterBrief).toMatchObject({ strategy: 'careful', timing: 'settled', sectorId: PATCHES[0].id });
    expect(game.encounterBrief!.bonus).toBeGreaterThan(20);
    expect(game.message).toMatch(/birds up/i);
  });

  it('spawns roaming birds after a miss and allows a later dog recovery', () => {
    const game = new Adventure(createSave(), { outcomes: ['covey', 'covey', 'false-trail'] });
    castInto(game);
    investigateAllClues(game);
    expect(game.flush('rush')).toBe('encounter');
    game.finishEncounter(0, 3);
    expect(game.phase).toBe('explore');
    expect(game.roamingBirds).toHaveLength(3);
    expect(game.patches[0].completed).toBe(true);

    const escaped = game.roamingBirds[0];
    const escapedPosition = { x: escaped.x, y: escaped.y };
    advance(game, 1);
    const drifting = game.roamingBirds.find(bird => bird.id === escaped.id);
    expect(drifting).toBeDefined();
    expect(distanceBetween(drifting!, escapedPosition)).toBeGreaterThan(0.1);
    game.player = { x: escaped.x, y: escaped.y };
    game.dog = { x: escaped.x, y: escaped.y };
    expect(game.dogCommand('cast').accepted).toBe(true);
    advance(game, 0.2);
    expect(game.dogState).toBe('pointing');
    expect(game.contextualAction().kind).toBe('recover');
    expect(game.recoverRoaming()).toBe('recover');
    expect(game.birdsBagged).toBe(1);
    expect(game.roamingBirds).toHaveLength(2);
  });

  it('plays a complete outing and settles only once while preserving the existing encounter API', () => {
    const game = new Adventure(createSave(), { outcomes: ['covey', 'false-trail', 'covey'] });
    castInto(game, 0);
    investigateAllClues(game);
    expect(game.interact('careful')).toBe('approach');
    expect(game.interact()).toBe('encounter');
    game.finishEncounter(2, 3);
    expect(game.phase).toBe('retrieve');
    const hunter = { ...game.player };
    advance(game, 4);
    expect(game.player).toEqual(hunter);
    expect(game.phase).toBe('explore');
    expect(game.patches[0].completed).toBe(true);
    expect(game.birdsBagged).toBe(2);
    expect(game.shotsFired).toBe(3);
    game.player = { ...LANDMARKS[0] };
    expect(game.interact()).toBe('summary');
    const saved = structuredClone(game.save);
    game.finishOuting();
    expect(game.save).toEqual(saved);
  });

  it('does not grant XP or outings for an empty camp loop and isolates saves', () => {
    const game = new Adventure();
    expect(game.interact()).toBe('none');
    game.finishOuting();
    expect(game.save).toEqual(createSave());
    const next = new Adventure({ ...createSave(), dogName: '  Willow\u0000  ', xp: 145, journal: ['bobwhite', 'overlook', 'bobwhite', 'unknown'] });
    expect(next.save.dogName).toBe('Willow');
    expect(next.save.journal).toEqual(['bobwhite', 'overlook']);
    next.save.journal.push('grouse');
    expect(game.save.journal).toEqual([]);
  });
});

describe('2D save and companion progression', () => {
  it('keeps the versioned save schema and progression boundaries stable', () => {
    expect(SAVE_KEY).toBe('uplandin:2d:field-adventure:v1');
    expect(parseSave(null)).toEqual(createSave());
    expect(parseSave('not json')).toEqual(createSave());
    expect(parseSave(JSON.stringify({ ...createSave(), xp: -1 }))).toEqual(createSave());
    expect(dogLevel(0)).toBe(1);
    expect(dogLevel(59)).toBe(1);
    expect(dogLevel(60)).toBe(2);
    expect(dogLevel(140)).toBe(3);
    expect(levelProgress(30)).toBe(0.5);
    expect(levelProgress(60)).toBe(0);
    expect(dogSearchRadius(0)).toBe(130);
    expect(dogStaminaMax(0)).toBe(100);
    expect(dogTrustLevel(240)).toBe(4);
  });
});
