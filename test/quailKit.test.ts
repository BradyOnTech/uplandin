import { describe, expect, it } from 'vitest';
import { getArea } from '../src/game/areas';
import { quailCoverAt } from '../src/game/quailLandscape';
import { quailKitPlacements, quailKitOccupies } from '../src/three/subsystems/quailKit';
import { quailTrackDistanceAt } from '../src/three/subsystems/quailTracks';

describe('South Gate authored kit placement', () => {
  it('uses existing habitat, preserves the track and does not mutate the area', () => {
    const area=getArea('quail-fields'),before=JSON.stringify(area),placements=quailKitPlacements(area);
    expect(placements.length).toBeGreaterThan(24);
    // The authored kit must reach both the entry and draw habitat rather than
    // clustering all of its visual guidance at the parking end of the route.
    expect(placements.some(p=>p.y>570)).toBe(true);
    expect(placements.some(p=>p.y<375)).toBe(true);
    expect(new Set(placements.map(p=>p.habit)).size).toBe(3);
    for(const p of placements) {
      expect(quailCoverAt(area,p.x,p.y)).toBeGreaterThanOrEqual(.9);
      expect(quailTrackDistanceAt(area,p.x,p.y,16)).toBeGreaterThanOrEqual(4);
      expect(quailKitOccupies(area,p.x,p.y)).toBe(true);
    }
    expect(quailKitPlacements(area)).toEqual(placements);
    expect(JSON.stringify(area)).toBe(before);
    expect(quailKitOccupies(area,504,658)).toBe(false);
  });
  it('does not populate other hunting areas', () => {
    expect(quailKitPlacements(getArea('chukar-ridge'))).toEqual([]);
    expect(quailKitPlacements(getArea('pheasant-coverts'))).toEqual([]);
  });
});
