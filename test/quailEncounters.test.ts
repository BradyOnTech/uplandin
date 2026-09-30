import { expect, it } from 'vitest';
import { getArea } from '../src/game/areas';
import { createThreeHuntSetup } from '../src/game/gameplayMode';
import { huntStreamSeed, nextHuntUrl, parseHuntSeed, prepareHuntUrl, REVIEW_HUNT_SEED } from '../src/game/huntSeed';
import { mulberry32, dist } from '../src/game/math';
import { QUAIL_COVEY_SPACING, QUAIL_FIELD_BIRD_COUNT, quailEncounterAnchors } from '../src/game/quailEncounters';

it('keeps a visit stable across reload/settings, while Hunt again requests a fresh seed', () => {
  const original = 'https://example.test/index3d.html?area=quail-fields&drop=west-track&challenge=wild&quality=lite';
  const first = prepareHuntUrl(original, () => 41);
  expect(parseHuntSeed(first.search)).toBe(41);
  expect(prepareHuntUrl(first.href, () => 99).href).toBe(first.href);
  const next = prepareHuntUrl(nextHuntUrl(first.href).href, () => 99);
  expect(parseHuntSeed(next.search)).toBe(99);
  expect(next.searchParams.get('drop')).toBe('west-track');
  expect(next.searchParams.get('challenge')).toBe('wild');
  expect(next.searchParams.get('quality')).toBe('lite');
  expect(parseHuntSeed(prepareHuntUrl(original + '&capture=1', () => 99).search)).toBe(REVIEW_HUNT_SEED);
  for (const invalid of ['', '-1', '1.2', 'Infinity', '4294967296', 'abc']) expect(parseHuntSeed('?seed=' + invalid)).toBeUndefined();
  expect(parseHuntSeed('?seed=0')).toBe(0);
  expect(parseHuntSeed('?seed=4294967295')).toBe(0xffffffff);
});

it('places varied, separated coveys in physical cover outside both parking clearings', () => {
  const area = getArea('quail-fields'), original = JSON.stringify(area);
  for (const drop of area.dropPoints) {
    const openings = new Set<string>();
    for (let seed = 1; seed <= 50; seed++) {
      const anchors = quailEncounterAnchors(area, drop.id, mulberry32(huntStreamSeed(seed, 0xc07e)));
      expect(anchors.length).toBeGreaterThanOrEqual(12);
      openings.add(`${Math.round(anchors[0].x)},${Math.round(anchors[0].y)}`);
      expect(dist(anchors[0], drop.position)).toBeGreaterThanOrEqual(70);
      expect(dist(anchors[0], drop.position)).toBeLessThanOrEqual(180);
      for (let i = 0; i < anchors.length; i++) {
        const anchor = anchors[i];
        expect(area.patches.some(p => anchor.x >= p.x + 10 && anchor.x <= p.x + p.w - 10 && anchor.y >= p.y + 10 && anchor.y <= p.y + p.h - 10)).toBe(true);
        for (const entry of area.dropPoints) expect(dist(anchor, entry.position)).toBeGreaterThanOrEqual(entry.safetyRadius + 16);
        for (const other of anchors.slice(0, i)) expect(dist(anchor, other)).toBeGreaterThanOrEqual(QUAIL_COVEY_SPACING);
      }
    }
    expect(openings.size).toBeGreaterThan(40);
  }
  expect(JSON.stringify(area)).toBe(original);
});

it('keeps wind, the common birds and the potential layout stable across challenge choices', () => {
  for (const seed of [0, 1, 7, 41, 981, 0xffffffff]) {
    const setup = (challenge: string) => createThreeHuntSetup(`?area=quail-fields&seed=${seed}&challenge=${challenge}`, () => { throw Error('Explicit seed must not consume outside randomness'); }, null);
    const relaxed = setup('relaxed'), balanced = setup('balanced'), wild = setup('wild');
    expect([relaxed.hunt.birds.length, balanced.hunt.birds.length, wild.hunt.birds.length]).toEqual([Math.round(QUAIL_FIELD_BIRD_COUNT * 1.6), QUAIL_FIELD_BIRD_COUNT, Math.round(QUAIL_FIELD_BIRD_COUNT * .85)]);
    expect([relaxed.hunt.wind, wild.hunt.wind]).toEqual([balanced.hunt.wind, balanced.hunt.wind]);
    expect(new Set(balanced.hunt.birds.map(b => b.coveyId)).size).toBeGreaterThanOrEqual(7);
    for (let i = 0; i < wild.hunt.birds.length; i++) {
      expect(relaxed.hunt.birds[i].pos).toEqual(balanced.hunt.birds[i].pos);
      expect(wild.hunt.birds[i].pos).toEqual(balanced.hunt.birds[i].pos);
    }
  }
});

it('keeps the entire stocked population in cover and outside parking for both entrances', () => {
  const area = getArea('quail-fields');
  for (const drop of area.dropPoints) for (let seed = 1; seed <= 50; seed++) {
    const { hunt } = createThreeHuntSetup(`?area=quail-fields&drop=${drop.id}&seed=${seed}&challenge=relaxed`, () => 0, null);
    for (const bird of hunt.birds) {
      expect(area.patches.some(p => bird.pos.x >= p.x && bird.pos.x <= p.x + p.w && bird.pos.y >= p.y && bird.pos.y <= p.y + p.h)).toBe(true);
      for (const entry of area.dropPoints) expect(dist(bird.pos, entry.position)).toBeGreaterThan(entry.safetyRadius);
    }
  }
});
