import { describe, expect, it } from 'vitest';
import { getArea } from '../src/game/areas';
import { addDogToKennel, emptyCareer, setHomeRegion } from '../src/game/career';
import { dogReport, handlerNotes } from '../src/game/dogReport';
import { DOG_IN_LINE_FINE_XP, LOST_BIRD_FINE_XP, settleCareerHunt } from '../src/game/huntResults';
import { formatHuntJournalEntry } from '../src/game/huntJournal';
import { mulberry32 } from '../src/game/math';
import { createHunt, emptyDogWork } from '../src/game/state';
import { dogCommandFeedback, dogNoteFeedback } from '../src/three/dogFeedback';

describe('the after-hunt dog report', () => {
  it('leads with the habit to fix, then the good work', () => {
    const report = dogReport('Sage', { ...emptyDogWork(), points: 4, pointFlushes: 3, retrieves: 2, breaks: 1, bumps: 1, creeps: 1, deadFinds: 1 });
    expect(report.stats.map(s => s.label)).toEqual(['Points', 'Held to the flush', 'Retrieves', 'Broke', 'Bumped']);
    expect(report.notes[0]).toMatch(/Broke and chased once/);
    expect(report.notes[1]).toMatch(/Crowded its birds twice/);
    expect(report.notes).toHaveLength(3);
  });
  it('praises a clean day and names runners it relocated', () => {
    const clean = dogReport('Belle', { ...emptyDogWork(), points: 3, pointFlushes: 3, relocations: 1 });
    expect(clean.notes).toContain('Relocated 1 running bird to a fresh point.');
    expect(clean.notes.at(-1)).toMatch(/cleanly/);
  });
  it('tells the handler about lost birds and unsafe shots', () => {
    const hunt = createHunt(getArea('quail-fields'), mulberry32(4));
    hunt.lostBirds = 2; hunt.safety = { lowShots: 1, dogInLine: 1 };
    expect(handlerNotes(hunt)).toEqual([
      '2 downed birds never recovered. Mark falls, and send the dog with Dead bird (V).',
      'Fired with a dog in the line once. Never swing through your dog.',
      '1 low shot at birds skimming the cover.',
    ]);
  });
  it('charges lost birds and unsafe shots against hunter XP and records them in the journal', () => {
    const added = addDogToKennel(setHomeRegion(emptyCareer(), 'southern-plains'), 'Sage', 'gsp');
    const hunt = createHunt(getArea('quail-fields'), mulberry32(4));
    hunt.downed = 6; hunt.lostBirds = 1; hunt.safety = { lowShots: 0, dogInLine: 1 };
    const result = settleCareerHunt(added.career, hunt, [added.dog]);
    expect(result.lostFine).toBe(LOST_BIRD_FINE_XP);
    expect(result.safetyFine).toBe(DOG_IN_LINE_FINE_XP);
    expect(result.hunterGained).toBe(Math.max(0, 6 + 2 - LOST_BIRD_FINE_XP - DOG_IN_LINE_FINE_XP));
    const entry = result.career.recentHunts![0];
    expect(entry).toMatchObject({ lost: 1, unsafe: 1 });
    expect(formatHuntJournalEntry(entry).resultLabel).toMatch(/1 lost · 1 unsafe shot$/);
  });
});

describe('handler feedback', () => {
  it('says what each dog did with a command', () => {
    expect(dogCommandFeedback('whoa', ['stopped'], ['whoa'], ['Sage'])).toBe('Whoa · Sage stops');
    expect(dogCommandFeedback('whoa', ['steadied', 'stopped'], ['pointing', 'whoa'], ['Sage', 'Belle']))
      .toBe('Whoa · Sage steady on point · Belle stops');
    expect(dogCommandFeedback('cast', ['cast', 'cast'], ['quartering', 'quartering'], ['Sage', 'Belle'])).toBe('This way · Sage and Belle cast out');
    expect(dogCommandFeedback('dead', ['busy'], ['pointing'], ['Sage'])).toBe('Dead bird · Sage is on point');
    expect(dogCommandFeedback('release', ['out-of-earshot'], ['quartering'], ['Sage'])).toBe("Hunt on · Sage can't hear you · get closer");
  });
  it('only announces the notable moments', () => {
    expect(dogNoteFeedback('dead-lost', 'Sage')).toMatch(/couldn't find/);
    expect(dogNoteFeedback('point', 'Sage')).toBeNull();
  });
});
