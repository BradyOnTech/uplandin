import { describe, expect, it } from 'vitest';
import { attachHuntPhoto, JOURNAL_PHOTOS_KEPT, readHuntJournal, sanitizeHuntJournal, type CareerJournalEntry } from '../src/game/huntJournal';
import { TAILGATE_MAX_BIRDS, TAILGATE_WIDTH_M, tailgateLayout, tailgateSide } from '../src/three/tailgatePhoto';
import { tailgateFileName } from '../src/three/tailgatePhotoView';

const print = `data:image/webp;base64,${'A'.repeat(4000)}`;
const entry = (huntNumber: number): CareerJournalEntry => ({
  huntNumber, areaId: 'quail-fields', date: { season: 1, week: huntNumber }, retrieved: 2, downed: 2, escaped: 1,
  pointFlushes: 2, doubles: 0, henDowns: 0, hunterXp: 4, dogs: [{ name: 'Millie', breedId: 'gsp' }],
});

describe('the tailgate photo', () => {
  it('lays the bag side by side across the gate, biggest birds first', () => {
    const slots = tailgateLayout([{ speciesId: 'hun' }, { speciesId: 'ringneck', sex: 'rooster' }, { speciesId: 'ringneck', sex: 'rooster' }]);
    expect(slots.map(slot => slot.bird.speciesId)).toEqual(['ringneck', 'ringneck', 'hun']);
    // Centred on the gate, edge to edge: two roosters at 0.21 m and a Hun at 0.15 m make 0.57 m.
    expect(slots.map(slot => +slot.lateral.toFixed(3))).toEqual([-0.18, 0.03, 0.21]);
    expect(tailgateLayout([])).toEqual([]);
  });

  it('squeezes a full limit of small birds onto the gate, and caps a preserve day', () => {
    const quail = tailgateLayout(Array.from({ length: 8 }, () => ({ speciesId: 'bobwhite' })));
    expect(quail).toHaveLength(8);
    expect(quail.at(-1)!.lateral - quail[0].lateral).toBeLessThan(TAILGATE_WIDTH_M);
    const preserve = tailgateLayout(Array.from({ length: 30 }, () => ({ speciesId: 'ringneck', sex: 'rooster' as const })));
    expect(preserve).toHaveLength(TAILGATE_MAX_BIRDS);
    expect(Math.max(...preserve.map(slot => Math.abs(slot.lateral)))).toBeLessThan(TAILGATE_WIDTH_M / 2);
    // Laid by hand, but the same way every time.
    expect(tailgateLayout(Array.from({ length: 8 }, () => ({ speciesId: 'bobwhite' })))).toEqual(quail);
    expect(new Set(quail.map(slot => slot.turn)).size).toBeGreaterThan(1);
  });

  it('is taken from the side of the truck with the sun behind the photographer', () => {
    // A truck backed toward +Z: its right, seen from behind, is +X.
    expect(tailgateSide({ x: 0, z: 1 }, 90)).toBe(1);
    expect(tailgateSide({ x: 0, z: 1 }, 270)).toBe(-1);
    expect(tailgateSide({ x: 1, z: 0 }, 180)).toBe(1);
  });

  it('keeps its print with the hunt in the journal, for the newest hunts', () => {
    const career = { recentHunts: Array.from({ length: 20 }, (_, i) => entry(i + 1)) };
    const withPrint = attachHuntPhoto(career, 20, print);
    expect(readHuntJournal(withPrint)[0].photo).toBe(print);
    // Not a print of ours, or no such hunt: nothing changes.
    expect(attachHuntPhoto(career, 20, 'javascript:alert(1)')).toBe(career);
    expect(attachHuntPhoto(career, 20, `data:image/webp;base64,${'A'.repeat(70_000)}`)).toBe(career);
    expect(attachHuntPhoto(career, 99, print)).toBe(career);
    const every = { recentHunts: career.recentHunts.map(hunt => ({ ...hunt, photo: print })) };
    const kept = sanitizeHuntJournal(every.recentHunts);
    expect(kept.filter(hunt => hunt.photo)).toHaveLength(JOURNAL_PHOTOS_KEPT);
    expect(kept.slice(0, JOURNAL_PHOTOS_KEPT).every(hunt => hunt.photo === print)).toBe(true);
    expect(kept[JOURNAL_PHOTOS_KEPT]).not.toHaveProperty('photo');
  });

  it('saves under the ground and the day', () => {
    expect(tailgateFileName('chukar-ridge', new Date(2026, 9, 2))).toBe('uplandin-chukar-ridge-2026-10-02.jpg');
  });
});
