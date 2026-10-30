import { describe, expect, it } from 'vitest';
import { SIGHT_COVER_M, SightingClock, SIGHTING_GAP_MS, SIGHTING_MAX_MS, SIGHTINGS_PER_HUNT, sightingHolds, sightingKind, type SightingCandidate } from '../src/game/sightings';
import { placeSign, SIGN_SHARE } from '../src/three/groundSign';

const seen = (patch: Partial<SightingCandidate>): SightingCandidate => ({
  id: 1, coveyId: 1, speciesId: 'ringneck', sex: 'rooster', x: 0, z: 0, ground: 0, moved: .8, climbed: 0,
  range: 40, hunterGround: 0, crown: .2, open: true, trackM: 1, inSight: true, skyBehind: false, onCrest: false, ...patch,
});

describe('birds before the flush, only where a hunter sees them', () => {
  it('sees a rooster on the move on a two-track, but never a hen, a still bird, or one off the track', () => {
    expect(sightingKind(seen({}), false)).toBe('crossing');
    expect(sightingKind(seen({ sex: 'hen' }), false)).toBeNull();
    expect(sightingKind(seen({ moved: 0 }), false)).toBeNull();
    expect(sightingKind(seen({ trackM: 9 }), false)).toBeNull();
  });

  it('sees chukar running uphill above him on open slope, not level with him, not going down, not in sage', () => {
    const chukar = (patch: Partial<SightingCandidate>) => seen({ speciesId: 'chukar', sex: undefined, trackM: 99, ground: 20, climbed: .4, range: 70, ...patch });
    expect(sightingKind(chukar({}), false)).toBe('uphill');
    expect(sightingKind(chukar({ ground: 1 }), false)).toBeNull();
    expect(sightingKind(chukar({ climbed: -.3 }), false)).toBeNull();
    expect(sightingKind(chukar({ open: false }), false)).toBeNull();
  });

  it('sees sharptails sitting on a crest against the sky, and only at dawn', () => {
    const sharp = (patch: Partial<SightingCandidate>) => seen({ speciesId: 'sharptail', sex: undefined, moved: 0, onCrest: true, skyBehind: true, trackM: 99, range: 110, ...patch });
    expect(sightingKind(sharp({}), true)).toBe('skyline');
    expect(sightingKind(sharp({}), false)).toBeNull();
    expect(sightingKind(sharp({ skyBehind: false }), true)).toBeNull();
    expect(sightingKind(sharp({ onCrest: false }), true)).toBeNull();
  });

  it('never draws a bird in cover or out of his sight, and drops one that walks into cover', () => {
    expect(sightingKind(seen({ crown: SIGHT_COVER_M }), false)).toBeNull();
    expect(sightingKind(seen({ inSight: false }), false)).toBeNull();
    expect(sightingHolds(seen({}), 'crossing')).toBe(true);
    expect(sightingHolds(seen({ crown: 1.6 }), 'crossing')).toBe(false);
    expect(sightingHolds(seen({ inSight: false }), 'crossing')).toBe(false);
  });

  it('keeps them rare: one at a time, a gap after each, a few a hunt, none outstaying its time', () => {
    const clock = new SightingClock();
    let now = 0, shown = 0;
    for (let i = 0; i < 20; i++) {
      if (!clock.mayBegin(now)) { now += SIGHTING_GAP_MS; continue; }
      clock.begin('crossing', i, now); shown++;
      expect(clock.mayBegin(now)).toBe(false);
      now += SIGHTING_MAX_MS.crossing;
      expect(clock.expired(now)).toBe(true);
      clock.end(now);
      expect(clock.mayBegin(now + SIGHTING_GAP_MS - 1)).toBe(false);
      now += SIGHTING_GAP_MS;
    }
    expect(shown).toBe(SIGHTINGS_PER_HUNT);
  });
});

describe('sign on the ground', () => {
  const coveys = Array.from({ length: 200 }, (_, i) => ({ speciesId: ['bobwhite', 'ringneck', 'chukar', 'sharptail'][i % 4], x: i * 50, z: 0,
    track: i % 4 === 1 ? { x: i * 50, z: 4, heading: 0 } : undefined }));

  it('lies near about the share of coveys it should, true to each bird, and only on open ground', () => {
    const spots = placeSign(coveys, 7, () => true);
    const main = spots.filter(spot => spot.kind !== 'feather');
    expect(main.length / coveys.length).toBeGreaterThan(SIGN_SHARE - .1);
    expect(main.length / coveys.length).toBeLessThan(SIGN_SHARE + .1);
    expect(new Set(main.filter(s => s.speciesId === 'bobwhite').map(s => s.kind))).toEqual(new Set(['roost']));
    expect(new Set(main.filter(s => s.speciesId === 'ringneck').map(s => s.kind))).toEqual(new Set(['tracks']));
    expect(new Set(main.filter(s => s.speciesId === 'sharptail').map(s => s.kind))).toEqual(new Set(['dusting']));
    for (const spot of main) {
      const covey = coveys.find(c => Math.abs(c.x - spot.x) < 12)!;
      expect(Math.hypot(spot.x - covey.x, spot.z - covey.z)).toBeLessThanOrEqual(9.5);
    }
    // In cover everywhere: no sign at all.
    expect(placeSign(coveys, 7, () => false)).toEqual([]);
    // The same hunt lays the same sign.
    expect(placeSign(coveys, 7, () => true)).toEqual(spots);
  });
});
