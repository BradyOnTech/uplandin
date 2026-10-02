import { describe, expect, it } from 'vitest';
import { getArea } from '../src/game/areas';
import { bagCount, bagLines, bagRuleFor, bagRules, limitedOut, limitFilled, limitsFilled, limitsLabel } from '../src/game/bagLimits';
import type { Bird } from '../src/game/birds';
import { getBreed } from '../src/game/breeds';
import { addDogToKennel, emptyCareer } from '../src/game/career';
import { Dog } from '../src/game/dog';
import { handlerNotes } from '../src/game/dogReport';
import { formatHuntJournalEntry, sanitizeHuntJournal } from '../src/game/huntJournal';
import type { HuntChallenge } from '../src/game/huntChallenge';
import { OVER_LIMIT_FINE_XP, settleCareerHunt } from '../src/game/huntResults';
import { HuntSimulation } from '../src/game/huntSimulation';
import { mulberry32 } from '../src/game/math';
import { createHunt } from '../src/game/state';
import { careerFieldNotes, fieldNotes } from '../src/three/fieldNotes';

const bird = (id: number, speciesId: string, extra: Partial<Bird> = {}): Bird => ({
  id, coveyId: id, speciesId, pos: { x: 200 + id * 20, y: 200 }, state: 'flushed', runs: false, runEnergy: 2500, restingMs: 0,
  nerveMs: 60000, ...extra,
});
function field(areaId: string, birds: Bird[], challenge?: HuntChallenge) {
  const area = getArea(areaId), hunt = createHunt(area, mulberry32(4), { wind: 'calm', condition: 'mild' });
  hunt.birds = birds;
  const dog = new Dog({ x: 100, y: 100 }, { breed: getBreed('gsp'), level: 6 }, mulberry32(5), area.world);
  return { hunt, sim: new HuntSimulation({ hunt, dogs: [dog], area, rng: mulberry32(6), continuousEncounter: true, challenge }) };
}

describe('daily bag limits', () => {
  it('counts each core ground the way its region\'s regulations do', () => {
    expect(bagRules('pheasant-coverts').map(rule => [rule.label, rule.limit])).toEqual([['roosters', 3], ['prairie grouse', 3], ['partridge', 5]]);
    // South Dakota counts sharptails and prairie chickens together.
    expect(bagRuleFor('sharptail-prairie', 'sharptail')).toBe(bagRuleFor('sharptail-prairie', 'prairie-chicken'));
    expect(bagRuleFor('sharptail-prairie', 'hun')?.limit).toBe(5);
    expect(bagRuleFor('quail-fields', 'bobwhite')?.limit).toBe(8);
    // Nevada's chukar and Huns share one limit of six.
    expect(bagRuleFor('chukar-ridge', 'chukar')).toEqual(bagRuleFor('chukar-ridge', 'hun'));
    expect(bagRuleFor('chukar-ridge', 'chukar')?.limit).toBe(6);
    expect(limitsLabel('pheasant-coverts', ['ringneck', 'hun'])).toBe('3 roosters · 5 partridge');
    expect(limitsLabel('sharptail-prairie', ['sharptail', 'prairie-chicken', 'hun'])).toBe('3 prairie grouse · 5 partridge');
  });

  it('counts legal birds down, carried or in hand, never a hen or a bird that got away', () => {
    const { hunt } = field('pheasant-coverts', [
      bird(1, 'ringneck', { state: 'downed', sex: 'rooster' }), bird(2, 'ringneck', { state: 'carried', sex: 'rooster' }),
      bird(3, 'ringneck', { state: 'retrieved', sex: 'rooster' }), bird(4, 'ringneck', { state: 'downed', sex: 'hen' }),
      bird(5, 'ringneck', { state: 'escaped', sex: 'rooster' }), bird(6, 'hun', { state: 'retrieved' }), bird(7, 'hun', { state: 'hidden' }),
    ]);
    const roosters = bagRuleFor('pheasant-coverts', 'ringneck')!;
    expect(bagCount(hunt, roosters)).toBe(3);
    expect(limitFilled(hunt, 'ringneck')).toBe(true);
    expect(limitFilled(hunt, 'hun')).toBe(false);
    expect(bagLines(hunt).map(line => `${line.count}/${line.rule.limit} ${line.rule.label}`)).toEqual(['3/3 roosters', '1/5 partridge']);
    expect(limitsFilled(hunt)).toEqual(['roosters']);
    expect(limitedOut(hunt)).toBe(false);
  });

  it('counts a bird past the limit as a violation, and fines it', () => {
    const roosters = [1, 2, 3, 4].map(id => bird(id, 'ringneck', { sex: 'rooster' }));
    const { hunt, sim } = field('pheasant-coverts', [...roosters, bird(5, 'ringneck', { sex: 'hen' })]);
    for (const id of [1, 2, 3]) expect(sim.resolveBird(id, 'downed')).toBe(true);
    expect(hunt.overLimit ?? 0).toBe(0);
    expect(limitFilled(hunt, 'ringneck')).toBe(true);
    // A hen is its own violation, never a limit bird.
    sim.resolveBird(5, 'downed');
    expect(hunt.henDowns).toBe(1); expect(hunt.overLimit ?? 0).toBe(0);
    sim.resolveBird(4, 'downed');
    expect(hunt.overLimit).toBe(1);

    const added = addDogToKennel(emptyCareer(), 'Millie', 'gsp');
    const result = settleCareerHunt(added.career, hunt, [added.dog]);
    expect(result.limitFine).toBe(OVER_LIMIT_FINE_XP);
    expect(result.hunterGained).toBe(Math.max(0, 5 + 2 - 4 - OVER_LIMIT_FINE_XP));
    const entry = result.career.recentHunts![0];
    expect(entry).toMatchObject({ overLimit: 1, limits: ['roosters'] });
    expect(formatHuntJournalEntry(entry)).toMatchObject({ bagLabel: 'Limit of roosters' });
    expect(formatHuntJournalEntry(entry).resultLabel).toContain('1 over the limit');
    expect(careerFieldNotes(result).hunterAward).toContain(`over-limit penalty (${OVER_LIMIT_FINE_XP} XP)`);
    expect(handlerNotes(hunt).join(' ')).toContain('1 bird past the daily limit');
    expect(fieldNotes(hunt, 1, 600).rows[0]).toEqual({ label: 'Bag', value: '4 of 3 roosters' });
  });

  it('sets no limit on a preserve day', () => {
    const { hunt, sim } = field('quail-fields', Array.from({ length: 10 }, (_, i) => bird(i + 1, 'bobwhite')), 'loaded');
    for (let id = 1; id <= 10; id++) sim.resolveBird(id, 'downed');
    expect(hunt.preserve).toBe(true);
    expect(hunt.overLimit ?? 0).toBe(0);
    expect(limitFilled(hunt, 'bobwhite')).toBe(false);
    expect(fieldNotes(hunt, 1, 60).rows[0]).toEqual({ label: 'Daily limit', value: 'None on a preserve day' });
  });

  it('calls a full limit of everything on the ground limited out', () => {
    const { hunt, sim } = field('quail-fields', Array.from({ length: 8 }, (_, i) => bird(i + 1, 'bobwhite')));
    for (let id = 1; id <= 8; id++) sim.resolveBird(id, 'downed');
    expect(hunt.overLimit ?? 0).toBe(0);
    expect(limitedOut(hunt)).toBe(true);
    expect(fieldNotes(hunt, 1, 60).note).toContain('Limited out');
  });

  it('keeps old journal entries and drops a corrupt limit list', () => {
    const base = { huntNumber: 2, areaId: 'quail-fields', date: { season: 1, week: 3 }, retrieved: 1, downed: 1, escaped: 0,
      pointFlushes: 1, doubles: 0, henDowns: 0, hunterXp: 3, dogs: [{ name: 'Millie', breedId: 'gsp' }] };
    expect(sanitizeHuntJournal([base])[0]).not.toHaveProperty('limits');
    expect(sanitizeHuntJournal([{ ...base, limits: [42], overLimit: -1 }])[0]).not.toHaveProperty('limits');
    expect(sanitizeHuntJournal([{ ...base, limits: ['quail'], overLimit: 2 }])[0]).toMatchObject({ limits: ['quail'], overLimit: 2 });
  });
});
