import { describe, expect, it } from 'vitest';
import { addDogToKennel, CAREER_KEY, emptyCareer, loadCareer, setHomeRegion, type StorageLike } from '../src/game/career';
import { applySave, describeCareer, exportSave, parseSave, SAVE_MAX_BYTES, saveFileName } from '../src/game/saveFile';

const memory = (entries: Record<string, string> = {}): StorageLike & { data: Record<string, string> } => ({
  data: { ...entries }, getItem(key) { return this.data[key] ?? null; }, setItem(key, value) { this.data[key] = value; },
});
function careerWithHistory() {
  const first = addDogToKennel(setHomeRegion(emptyCareer(), 'prairie-pothole'), 'Belle', 'english-setter', 'orange-belton');
  const second = addDogToKennel(first.career, 'Scout', 'gsp');
  return { ...second.career, hunts: 51, downed: 140, date: { season: 4, week: 6 },
    recentHunts: [{ huntNumber: 51, areaId: 'pheasant-coverts', date: { season: 4, week: 5 }, retrieved: 3, downed: 3, escaped: 1,
      pointFlushes: 4, doubles: 0, henDowns: 0, hunterXp: 7, dogs: [{ name: 'Belle', breedId: 'english-setter' }], limits: ['roosters'] }] };
}

describe('save export and import', () => {
  it('carries the career and the settings worth keeping, and nothing tied to this device', () => {
    const career = careerWithHistory();
    const device = memory({ [CAREER_KEY]: JSON.stringify(career), 'uplandin.3d.quality': 'high', 'uplandin.3d.touch.look': '1.4',
      'uplandin.quick.v1': '{"areaId":"chukar-ridge"}', 'uplandin.3d.preparation-update-draft.v1': '{"draft":1}', 'unrelated': 'x' });
    const save = exportSave(device, new Date('2026-10-02T15:00:00Z'));
    expect(save).toMatchObject({ app: 'uplandin', version: 1, exportedAt: '2026-10-02T15:00:00.000Z' });
    expect(save.career.kennel.map(dog => dog.name)).toEqual(['Belle', 'Scout']);
    expect(save.settings).toEqual({ 'uplandin.3d.quality': 'high', 'uplandin.3d.touch.look': '1.4', 'uplandin.quick.v1': '{"areaId":"chukar-ridge"}' });

    // Round trip onto a fresh device.
    const read = parseSave(JSON.stringify(save));
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    const fresh = memory();
    expect(applySave(read.save, fresh)).toBe(true);
    expect(loadCareer(fresh)).toEqual(loadCareer(device));
    expect(fresh.data['uplandin.3d.quality']).toBe('high');
    expect(fresh.data).not.toHaveProperty('uplandin.3d.preparation-update-draft.v1');
    expect(describeCareer(loadCareer(fresh))).toBe('Season 4 · 51 hunts · Belle, Scout');
  });

  it('refuses anything that is not a sound save, whole', () => {
    const save = exportSave(memory({ [CAREER_KEY]: JSON.stringify(careerWithHistory()) }));
    expect(parseSave('not json')).toEqual({ ok: false, message: 'That file isn’t an Uplandin save.' });
    expect(parseSave(JSON.stringify({ ...save, app: 'other-game' })).ok).toBe(false);
    expect(parseSave(JSON.stringify({ ...save, version: 2 }))).toMatchObject({ ok: false, message: expect.stringContaining('newer version') });
    expect(parseSave('x'.repeat(SAVE_MAX_BYTES + 1)).ok).toBe(false);
    const damaged = (career: object) => parseSave(JSON.stringify({ ...save, career }));
    expect(damaged({ ...save.career, kennel: 'nope' }).ok).toBe(false);
    expect(damaged({ ...save.career, kennel: [{ ...save.career.kennel[0], breedId: 'poodle' }] }).ok).toBe(false);
    expect(damaged({ ...save.career, activeDogId: 'dog-99' }).ok).toBe(false);
    expect(damaged({ ...save.career, date: { season: 0, week: 2 } }).ok).toBe(false);
    expect(damaged(['career']).ok).toBe(false);
    // Unknown settings and oversized values never ride along.
    const read = parseSave(JSON.stringify({ ...save, settings: { 'uplandin.3d.sound': 'off', 'evil.key': '1', 'uplandin.3d.sight': 'x'.repeat(20_000) } }));
    expect(read.ok && read.save.settings).toEqual({ 'uplandin.3d.sound': 'off' });
  });

  it('keeps a damaged journal entry from costing the career', () => {
    const save = exportSave(memory({ [CAREER_KEY]: JSON.stringify(careerWithHistory()) }));
    const read = parseSave(JSON.stringify({ ...save, career: { ...save.career, recentHunts: [...save.career.recentHunts!, { huntNumber: 'x' }] } }));
    expect(read.ok && read.save.career.recentHunts).toHaveLength(1);
  });

  it('exports an empty career from a new device, and names the file by the day', () => {
    const save = exportSave(memory());
    expect(save.career.kennel).toEqual([]);
    expect(parseSave(JSON.stringify(save)).ok).toBe(true);
    expect(describeCareer(save.career)).toBe('No career yet');
    expect(saveFileName(new Date(2026, 9, 2))).toBe('uplandin-save-2026-10-02.json');
  });
});
