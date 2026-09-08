import { describe, expect, it } from 'vitest';
import { getArea } from '../src/game/areas';
import { addDogToKennel, emptyCareer, setHomeRegion } from '../src/game/career';
import { settleCareerHunt } from '../src/game/huntResults';
import { mulberry32 } from '../src/game/math';
import { createHunt, endFieldSession } from '../src/game/state';

describe('shared career hunt settlement', () => {
  it('awards the same player and dog regardless of presentation adapter', () => {
    const added = addDogToKennel(setHomeRegion(emptyCareer(), 'southern-plains'), 'Millie', 'gsp');
    const hunt = createHunt(getArea('quail-fields'), mulberry32(12));
    hunt.downed = 2;
    hunt.escaped = 3;
    hunt.doubles = 1;
    hunt.dogWork[0] = { pointFlushes: 2, retrieves: 1, downedOverPoint: 1 };

    const result = settleCareerHunt(added.career, hunt, [added.dog]);
    expect(result.career.hunts).toBe(1);
    expect(result.career.downed).toBe(2);
    expect(result.career.areas['quail-fields'].escaped).toBe(3);
    expect(result.dogAwards[0]).toMatchObject({ name: 'Millie', gained: 8 });
    expect(result.career.kennel[0].xp).toBe(8);
    expect(result.hunterGained).toBe(5);
    expect(result.weeks).toBe(1);
    expect(result.career.date.week).toBe(1);
  });

  it('records only actual escapes when an exploratory field session ends', () => {
    const added = addDogToKennel(emptyCareer(), 'Millie', 'gsp');
    const hunt = createHunt(getArea('quail-fields'), mulberry32(12));
    hunt.birds[0].state = 'escaped';
    hunt.escaped = 1;
    hunt.birds[1].state = 'retrieved';
    hunt.downed = 1;
    hunt.dogWork[0].retrieves = 1;
    expect(endFieldSession(hunt)).toBe(true);
    const result = settleCareerHunt(added.career, hunt, [added.dog]);
    expect(result.career.areas['quail-fields'].escaped).toBe(1);
    expect(result.career.downed).toBe(1);
    expect(result.dogAwards[0].gained).toBe(1);
    expect(hunt.birds.filter((bird) => bird.state === 'hidden').length).toBeGreaterThan(0);
  });

  it('applies protected-hen fines before hunter XP', () => {
    const added = addDogToKennel(emptyCareer(), 'Sage', 'english-setter');
    const hunt = createHunt(getArea('quail-fields'), mulberry32(2));
    hunt.downed = 1;
    hunt.henDowns = 1;
    const result = settleCareerHunt(added.career, hunt, [added.dog]);
    expect(result.henFine).toBe(4);
    expect(result.hunterGained).toBe(0);
  });
});
