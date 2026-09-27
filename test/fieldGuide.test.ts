import { describe, expect, it } from 'vitest';
import { FIELD_GUIDE_KEY, FieldGuide, readFieldGuide, type FieldGuideSnapshot, type GuideInput } from '../src/three/fieldGuide';

const snapshot = (change: Partial<FieldGuideSnapshot> = {}): FieldGuideSnapshot => ({
  active: true, input: 'touch', areaId: 'quail-fields', x: 0, z: 0, yaw: 0, pitch: 0,
  rise: false, mounted: false, gunId: 'remington-870', shells: 3, reloading: false, retrieved: 0,
  dog: { state: 'quartering', scentStage: 'none', rangeM: 15, heading: 0, carrying: false,
    allAtHeel: false, searchAreaChecked: false, waitingForHandler: false }, ...change,
});
const dog = (changes: Partial<FieldGuideSnapshot['dog']>) => ({ ...snapshot().dog, ...changes });

describe('first-hunt guide', () => {
  it('survives absent, blocked and malformed optional storage without touching career', () => {
    expect(readFieldGuide(null)).toEqual({ disabled: false, learned: [], shown: [] });
    expect(readFieldGuide({ getItem() { throw new Error('blocked'); }, setItem() { throw new Error('must not write'); } })).toEqual(readFieldGuide(null));
    const keys: string[] = [];
    const stored = readFieldGuide({ getItem(key) { keys.push(key); return JSON.stringify({ disabled: true, learned: ['move/touch', 'move/touch', false, '<script>'], shown: {} }); }, setItem() { throw new Error('read only'); } });
    expect(keys).toEqual([FIELD_GUIDE_KEY]); expect(stored).toEqual({ disabled: true, learned: ['move/touch'], shown: [] });
  });
  it('fades an exposed tip without calling it learned and remembers it next visit', () => {
    const guide = new FieldGuide();
    for (let i = 0; i < 40; i++) guide.update(snapshot(), .25);
    expect(guide.snapshot().shown).toContain('move/touch');
    expect(guide.snapshot().learned).not.toContain('move/touch');
    expect(new FieldGuide(guide.snapshot()).update(snapshot(), .1)).toContain('plum');
  });
  it('learns movement from actual walking plus looking, separately for each input', () => {
    const guide = new FieldGuide(); guide.update(snapshot(), .1);
    for (let i = 1; i < 5; i++) guide.update(snapshot({ x: i, yaw: i * .05 }), .2);
    expect(guide.snapshot().learned).toContain('move/touch');
    expect(guide.update(snapshot({ input: 'drag-look' }), .1)).toContain('Drag to look');
    expect(guide.snapshot().learned).not.toContain('move/drag-look');
  });
  it('never teaches over the shot or while paused and does not expire hidden tips', () => {
    const guide = new FieldGuide();
    for (let i = 0; i < 100; i++) expect(guide.update(snapshot({ rise: true }), .25)).toBeNull();
    expect(guide.update(snapshot({ mounted: true }), .2)).toBeNull();
    expect(guide.update(snapshot({ active: false }), .2)).toBeNull();
    expect(guide.snapshot().shown).toEqual([]);
    expect(guide.update(snapshot(), .2)).toContain('Drag left');
  });
  it('uses existing property approach and real approach progress before teaching firing', () => {
    for (const [areaId, cue] of [['quail-fields', 'Walk in quietly'], ['sharptail-prairie', 'covey edge'], ['chukar-ridge', 'high side']]) {
      const guide = new FieldGuide();
      expect(guide.update(snapshot({ areaId, dog: dog({ state: 'pointing', rangeM: 20 }) }), .2)).toContain(cue);
      expect(guide.update(snapshot({ areaId, dog: dog({ state: 'pointing', rangeM: 16 }) }), .2)).toContain('release to fire');
      expect(guide.snapshot().learned).toContain(`point/${areaId}`);
    }
  });
  it('teaches the actual mouse, fallback and touch shooting paths', () => {
    for (const [input, phrase] of [['touch', 'Release over Lower'], ['desktop', 'right mouse'], ['drag-look', 'Space fires']] as [GuideInput, string][]) {
      const guide = new FieldGuide({ disabled: false, shown: [], learned: ['point/quail-fields'] });
      expect(guide.update(snapshot({ input, dog: dog({ state: 'pointing' }) }), .1)).toContain(phrase);
    }
  });
  it('learns firing only from a real shell decrease in the same gun and input', () => {
    const guide = new FieldGuide(); guide.update(snapshot({ mounted: true }), .1);
    guide.update(snapshot({ mounted: true, shells: 2 }), .1);
    expect(guide.snapshot().learned).toContain('shoot/touch');
    const changed = new FieldGuide(); changed.update(snapshot(), .1);
    changed.update(snapshot({ shells: 2, gunId: 'side-by-side' }), .1);
    expect(changed.snapshot().learned).not.toContain('shoot/touch');
  });
  it('preserves pheasant scent advice without claiming a bird location', () => {
    const guide = new FieldGuide();
    expect(guide.update(snapshot({ areaId: 'pheasant-coverts', dog: dog({ state: 'tracking', rangeM: 45, scentStage: 'stalking' }) }), .1)).toContain('close the gap');
    expect(guide.update(snapshot({ areaId: 'chukar-ridge', dog: dog({ state: 'tracking', waitingForHandler: true }) }), .1)).toContain('waiting on scent');
    expect(guide.update(snapshot({ areaId: 'pheasant-coverts', dog: dog({ state: 'pointing' }) }), .1)).toContain('identify the rooster');
  });
  it('does not ask for a whistle during the opening heel pose, or before the brace is home', () => {
    const guide = new FieldGuide();
    expect(guide.update(snapshot({ dog: dog({ state: 'heel', allAtHeel: true }) }), .1)).not.toContain('Whistle');
    guide.update(snapshot(), .1);
    expect(guide.update(snapshot({ dog: dog({ state: 'heel', allAtHeel: false }) }), .1)).not.toContain('Whistle');
    expect(guide.update(snapshot({ dog: dog({ state: 'heel', allAtHeel: true }) }), .1)).toContain('Whistle again');
    guide.update(snapshot(), .1); expect(guide.snapshot().learned).toContain('heel');
  });
  it('distinguishes checked ground from a deliberate heel and actual delivery from pickup', () => {
    const guide = new FieldGuide(); guide.update(snapshot(), .1);
    expect(guide.update(snapshot({ dog: dog({ state: 'heel', allAtHeel: true, searchAreaChecked: true }) }), .1)).toContain('fresh cover');
    guide.update(snapshot(), .1); expect(guide.snapshot().learned).not.toContain('heel');
    expect(guide.update(snapshot({ dog: dog({ state: 'retrieving', carrying: true }) }), .1)).toContain('No pickup button');
    expect(guide.snapshot().learned).not.toContain('retrieve');
    guide.update(snapshot({ retrieved: 1 }), .1); expect(guide.snapshot().learned).toContain('retrieve');
  });
  it('dismisses across visits, can repeat tips, and never mutates its input snapshot', () => {
    const guide = new FieldGuide(); guide.setEnabled(false);
    const state = snapshot(); const before = structuredClone(state);
    expect(new FieldGuide(guide.snapshot()).update(state, .2)).toBeNull(); expect(state).toEqual(before);
    guide.reset(); expect(guide.update(state, .2)).toContain('Drag left');
  });
  it('does not learn a shot from a loadout change across pause', () => {
    const guide = new FieldGuide(); guide.update(snapshot(), .1); guide.suspend();
    guide.update(snapshot({ shells: 2 }), .1); expect(guide.snapshot().learned).not.toContain('shoot/touch');
  });
});
