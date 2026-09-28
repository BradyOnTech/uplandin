import { describe, expect, it } from 'vitest';
import { getArea } from '../src/game/areas';
import { createHunt } from '../src/game/state';
import { mulberry32 } from '../src/game/math';
import { careerFieldNotes, fieldNotes } from '../src/three/fieldNotes';
import { addDogToKennel, emptyCareer } from '../src/game/career';
import { settleCareerHunt } from '../src/game/huntResults';
import { HUNTER_LEVEL_CAP } from '../src/game/progression';

describe('Property field notes', () => {
  it.each(['pheasant-coverts', 'quail-fields', 'sharptail-prairie', 'chukar-ridge'])('counts only completed retrieves and active dog work on %s, without exposing unseen birds', (area) => {
    const hunt = createHunt(getArea(area), mulberry32(1));
    hunt.birds[0].state = 'retrieved'; hunt.birds[1].state = 'downed'; hunt.birds[2].state = 'carried';
    hunt.downed = 3; hunt.escaped = 2;
    hunt.dogWork[0].pointFlushes = 4; hunt.dogWork[1].pointFlushes = 8;
    const notes = fieldNotes(hunt, 1, 245);
    expect(notes.retrieved).toBe(1);
    expect(notes.rows).toEqual([{ label: 'Point flushes', value: '4' }, { label: 'Birds escaped', value: '2' }, { label: 'Time afield', value: '4 min' }]);
    hunt.birds.push({ ...hunt.birds[3], id: 99999, state: 'hidden' });
    expect(fieldNotes(hunt, 1, 245)).toEqual(notes);
  });
  it('reports an empty short hunt and preserves the protected-hen consequence', () => {
    const hunt = createHunt(getArea('pheasant-coverts'), mulberry32(1));
    expect(fieldNotes(hunt, 1, 5)).toMatchObject({ retrieved: 0, note: 'No birds in the bag this time.' });
    expect(fieldNotes(hunt, 1, 5).rows[2].value).toBe('<1 min');
    hunt.henDowns = 1;
    expect(fieldNotes(hunt, 1, 5).note).toContain('1 protected hen was downed');
    hunt.doubles = 1;
    expect(fieldNotes(hunt, 1, 5).rows).toContainEqual({ label: 'Doubles', value: '1' });
  });
});

describe('Career field notes', () => {
  it('shows real hunter and dog level gains, earned unlocks and progress without settling again', () => {
    const added = addDogToKennel(emptyCareer(), 'Sage', 'gsp');
    added.career.hunter.xp = 9;
    added.dog.xp = 19;
    const hunt = createHunt(getArea('quail-fields'), mulberry32(12));
    hunt.dogWork[0].pointFlushes = 1;
    const result = settleCareerHunt(added.career, hunt, [added.dog]);
    const before = JSON.stringify(result);
    const notes = careerFieldNotes(result);
    expect(notes.heading).toBe('Hunter level 2 reached');
    expect(notes.hunterAward).toBe('+2 XP');
    expect(notes.progress).toEqual({ earned: 1, required: 28, remaining: 27, nextLevel: 3 });
    expect(notes.unlocks).toContain('the truck — the whole map is open');
    expect(notes.dogs[0]).toMatchObject({ name: 'Sage', level: 'Level 2 reached', advanced: true });
    expect(notes.dogs[0].next).toBe('56 XP to level 3 · Stronger scenting and steadier points');
    expect(JSON.stringify(result)).toBe(before);
    expect(careerFieldNotes(result)).toEqual(notes);
  });

  it('explains the end of a career season and the protected-hen XP consequence', () => {
    const career = emptyCareer(); career.date.week = 21;
    const hunt = createHunt(getArea('pheasant-coverts'), mulberry32(8));
    hunt.henDowns = 1; hunt.downed = 1;
    const result = settleCareerHunt(career, hunt, []);
    const notes = careerFieldNotes(result);
    expect(notes.hunterAward).toBe('+0 XP · protected-hen penalty applied (4 XP)');
    expect(notes.calendar).toContain('season 1 — over');
    expect(notes.next).toBe('The season is complete. Return to hunt preparation and choose Start season 2 to begin again with your kennel.');
    expect(notes.dogs).toEqual([]);
    expect(notes.unlocks).toEqual([]);
  });

  it('does not offer a nonexistent hunter level after the cap', () => {
    const career = emptyCareer(); career.hunter.level = HUNTER_LEVEL_CAP; career.hunter.xp = 100_000;
    const result = settleCareerHunt(career, createHunt(getArea('quail-fields'), mulberry32(2)), []);
    expect(careerFieldNotes(result).progress).toBeNull();
  });

  it('keeps capped dogs and missing legacy award snapshots honest', () => {
    const { career, dog } = addDogToKennel(emptyCareer(), 'Sage', 'gsp');
    dog.level = 10; dog.xp = 100_000;
    const result = settleCareerHunt(career, createHunt(getArea('quail-fields'), mulberry32(2)), [dog]);
    expect(careerFieldNotes(result).dogs[0].next).toBe('Maximum experience reached');
    result.career = { ...result.career, kennel: [] };
    expect(careerFieldNotes(result).dogs[0]).toMatchObject({ name: 'Sage', award: '+0 XP', next: null });
  });
});
