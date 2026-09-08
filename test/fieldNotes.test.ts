import { describe, expect, it } from 'vitest';
import { getArea } from '../src/game/areas';
import { createHunt } from '../src/game/state';
import { mulberry32 } from '../src/game/math';
import { fieldNotes } from '../src/three/fieldNotes';

describe('Pheasant field notes', () => {
  it('counts only completed retrieves and active dog work, without exposing unseen birds', () => {
    const hunt = createHunt(getArea('pheasant-coverts'), mulberry32(1));
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
  });
});
