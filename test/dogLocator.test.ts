import { expect, it } from 'vitest';
import { dogRelativeBearing, dogWorkLabel, pointApproachCue, trackingApproachCue } from '../src/three/dogLocator';

it('gives the actual continuous bearing relative to the hunter looking north or west', () => {
  expect(dogRelativeBearing(0, -10, 0)).toBeCloseTo(0);
  expect(dogRelativeBearing(10, 0, 0)).toBeCloseTo(Math.PI / 2);
  expect(Math.abs(dogRelativeBearing(0, 10, 0))).toBeCloseTo(Math.PI);
  expect(dogRelativeBearing(-10, 0, Math.PI / 2)).toBeCloseTo(0);
  const slight = dogRelativeBearing(1, -10, 0);
  expect(slight).toBeGreaterThan(0); expect(slight).toBeLessThan(Math.PI / 8);
});

it('guides the actual walk-in without promising a flush distance or exposing a concealed bird', () => {
  expect(pointApproachCue(45, false)).toBe('ON POINT · FOLLOW THE DOG');
  expect(pointApproachCue(18, false)).toBe('ON POINT · WALK IN QUIETLY');
  expect(pointApproachCue(18, true)).toBe('ON POINT · SLOW YOUR APPROACH');
  expect(pointApproachCue(5, false)).toBe('ON POINT · WATCH THE COVER');
});

it('labels real scent and retrieve behavior instead of calling every scent beat a finished point', () => {
  const dog = { state: 'tracking' as const, scentStage: 'locating' as const, carryingBirdId: null };
  expect(dogWorkLabel(dog)).toBe('LOCATING SCENT');
  expect(dogWorkLabel({ ...dog, waitingForHandler: true }, 'grouse-woods')).toBe('DOG HOLDING SCENT · CLOSE UP');
  expect(dogWorkLabel({ ...dog, scentStage: 'stalking' })).toBe('DOG CLOSING');
  expect(dogWorkLabel({ ...dog, scentStage: 'locking' })).toBe('SETTING POINT');
  expect(dogWorkLabel({ ...dog, state: 'pointing' })).toBe('DOG ON POINT');
  expect(dogWorkLabel({ ...dog, state: 'retrieving', carryingBirdId: 0 })).toBe('DOG RETURNING');
});

it('distinguishes closing on Pheasant tracking from a quiet approach to a finished point', () => {
  expect(trackingApproachCue(40, 'pheasant-coverts')).toBe('DOG TRACKING · CLOSE THE GAP');
  expect(trackingApproachCue(20, 'pheasant-coverts')).toBe('DOG TRACKING · WORK THE EDGE');
  expect(trackingApproachCue(40, 'quail-fields')).toBeNull();
  expect(pointApproachCue(20, true, 'pheasant-coverts')).toBe('ON POINT · SLOW YOUR APPROACH');
  expect(pointApproachCue(40, false, 'pheasant-coverts')).toBe('ON POINT · WALK IN QUIETLY');
});
