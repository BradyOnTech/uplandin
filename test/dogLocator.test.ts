import { expect, it } from 'vitest';
import { dogRelativeBearing, dogWorkLabel, pointApproachCue, trackingApproachCue, trackingApproachGuidance, pheasantPointGuidance } from '../src/three/dogLocator';

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
  expect(dogWorkLabel({ ...dog, state: 'recalled' })).toBe('DOG COMING IN');
  expect(dogWorkLabel({ ...dog, state: 'heel' })).toBe('DOG AT HEEL');
  expect(dogWorkLabel({ ...dog, state: 'retrieving', carryingBirdId: 0 })).toBe('DOG RETURNING');
});

it('distinguishes closing on Pheasant tracking from a quiet approach to a finished point', () => {
  expect(trackingApproachCue(40, 'pheasant-coverts')).toBe('DOG TRACKING · CLOSE THE GAP');
  expect(trackingApproachCue(20, 'pheasant-coverts')).toBe('DOG TRACKING · WORK THE EDGE');
  expect(trackingApproachCue(40, 'quail-fields')).toBeNull();
  expect(pointApproachCue(20, true, 'pheasant-coverts')).toBe('ON POINT · SLOW YOUR APPROACH');
  expect(pointApproachCue(40, false, 'pheasant-coverts')).toBe('ON POINT · WALK IN QUIETLY');
});

it('distinguishes a finished local search from a deliberate whistle heel without masking bird work', () => {
  const dog = { state: 'heel' as const, scentStage: 'none' as const, carryingBirdId: null, searchAreaChecked: true };
  expect(dogWorkLabel(dog, 'pheasant-coverts')).toBe('DOG READY TO MOVE ON');
  expect(dogWorkLabel({ ...dog, state: 'recalled' }, 'pheasant-coverts')).toBe('DOG REJOINING');
  expect(dogWorkLabel({ ...dog, searchAreaChecked: false }, 'pheasant-coverts')).toBe('DOG AT HEEL');
  expect(dogWorkLabel({ ...dog, state: 'tracking', scentStage: 'checking' }, 'pheasant-coverts')).toBe('SCENT CHECK');
  expect(dogWorkLabel({ ...dog, state: 'pointing' }, 'pheasant-coverts')).toBe('DOG ON POINT');
  expect(dogWorkLabel({ ...dog, state: 'retrieving', carryingBirdId: 0 }, 'pheasant-coverts')).toBe('DOG RETURNING');
});

it('describes pheasant scent stages without assuming a hidden bird is running', () => {
  const dog = { state: 'tracking' as const, scentStage: 'checking' as const, carryingBirdId: null };
  for (const [stage,label] of [['checking','SCENT CHECK'],['locating','LOCATING SCENT'],
    ['stalking','DOG CLOSING'],['locking','SETTING POINT'],['none','DOG WORKING SCENT']] as const) {
    expect(dogWorkLabel({...dog,scentStage:stage},'pheasant-coverts')).toBe(label);
  }
  expect(trackingApproachCue(40,'pheasant-coverts','locking')).toBe('SETTING POINT · SLOW YOUR APPROACH');
  expect(trackingApproachCue(40,'pheasant-coverts','stalking')).toBe('DOG CLOSING · CLOSE THE GAP');
  expect(trackingApproachCue(20,'pheasant-coverts','stalking')).toBe('DOG CLOSING · WALK QUIETLY');
  expect(trackingApproachCue(40,'pheasant-coverts','checking')).toBe('SCENT CHECK · GIVE THE DOG ROOM');
});

it('keeps far stalking and waiting advice consistent across both HUD messages', () => {
  const far=trackingApproachGuidance(55,'pheasant-coverts','stalking')!;
  expect(far.headline).toContain('CLOSE THE GAP');
  expect(far.detail).toContain('Move up along dry cover');
  expect(far.detail).not.toContain('Walk quietly and give it room');
  const near=trackingApproachGuidance(20,'pheasant-coverts','stalking')!;
  expect(near.headline).toContain('WALK QUIETLY');expect(near.detail).toContain('Walk quietly');
  for(const stage of ['checking','locating','stalking','locking','none'] as const) {
    const waiting=trackingApproachGuidance(45,'pheasant-coverts',stage,true)!;
    expect(waiting.headline).toBe('DOG HOLDING SCENT · CLOSE UP');
    expect(waiting.detail).toContain('waiting on scent');expect(waiting.detail).toContain('Close the gap');
    expect(dogWorkLabel({state:'tracking',scentStage:stage,carryingBirdId:null,waitingForHandler:true},'pheasant-coverts'))
      .toBe('DOG HOLDING SCENT');
  }
});

it('guides a nearby handler beyond the pointing dog using its body direction', () => {
  for (const [heading, cardinal] of [[0, 'E'], [Math.PI/2, 'S'], [Math.PI, 'W'], [-Math.PI/2, 'N']] as const) {
    expect(pheasantPointGuidance(5, heading)).toContain(`Dog facing ${cardinal} `);
    expect(pheasantPointGuidance(5, heading)).toContain('Close to the dog first');
    expect(pheasantPointGuidance(2, heading)).toContain("Follow the dog's nose");
    expect(pheasantPointGuidance(30, heading)).toContain('Walk toward the point.');
  }
});

it('preserves the nose bearing near a compass-sector boundary', () => {
  // 337 degrees still reads NW, but walking NW (315) from the dog would
  // miss its nose line by roughly 4.6 m after a 12.3 m approach.
  const dogHeading = (337 - 90) * Math.PI / 180;
  expect(pheasantPointGuidance(2, dogHeading)).toContain('NW 337°');
  expect(pheasantPointGuidance(8, dogHeading)).toContain('Close to the dog first');
  expect(pheasantPointGuidance(2, -Math.PI / 2)).toContain('N 000°');
});
