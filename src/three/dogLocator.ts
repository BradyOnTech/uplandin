import type { DogScentStage, DogState } from '../game/dog';
import { huntingDoctrine } from '../game/huntDoctrine';

export function dogRelativeBearing(dx: number, dz: number, cameraYaw: number): number {
  return Math.atan2(dx * Math.cos(cameraYaw) - dz * Math.sin(cameraYaw),
    dx * -Math.sin(cameraYaw) + dz * -Math.cos(cameraYaw));
}

/** World -z is north, matching the field map. */
export function fieldCompassHeading(cameraYaw: number): { degrees: number; cardinal: string } {
  const degrees = ((Math.round(-cameraYaw * 180 / Math.PI) % 360) + 360) % 360;
  const cardinals = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return { degrees, cardinal: cardinals[Math.round(degrees / 45) % cardinals.length] };
}

export function fieldSearchGuidance(areaId: string): string {
  return huntingDoctrine(areaId).guidance;
}

export function trackingApproachGuidance(dogDistanceM: number, areaId: string, stage: DogScentStage = 'none', waitingForHandler = false): { headline: string; detail: string } | null {
  if (huntingDoctrine(areaId).style !== 'pheasant') return null;
  if (waitingForHandler) return {
    headline: 'DOG HOLDING SCENT · CLOSE UP',
    detail: 'The dog is waiting on scent. Close the gap along dry cover so it can continue.',
  };
  if (stage === 'locking') return {
    headline: 'SETTING POINT · SLOW YOUR APPROACH',
    detail: 'The dog is setting its point. Slow down and let it finish.',
  };
  if (stage === 'checking') return {
    headline: 'SCENT CHECK · GIVE THE DOG ROOM',
    detail: 'The dog has checked scent. Give it room to locate the source.',
  };
  if (stage === 'locating') return {
    headline: 'LOCATING SCENT · WORK THE EDGE',
    detail: 'Stay with the cover edge and give the dog room to locate the scent.',
  };
  const far = dogDistanceM > 30;
  if (stage === 'stalking') return {
    headline: far ? 'DOG CLOSING · CLOSE THE GAP' : 'DOG CLOSING · WALK QUIETLY',
    detail: far ? 'Move up along dry cover while the dog closes on scent. Slow when it starts setting its point.'
      : 'The dog is closing on scent. Walk quietly and give it room.',
  };
  return {
    headline: far ? 'DOG TRACKING · CLOSE THE GAP' : 'DOG TRACKING · WORK THE EDGE',
    detail: far ? 'Move up along dry cover while the dog tracks. Walk when it points.'
      : 'Stay with the cover edge and give the dog room to finish.',
  };
}

export function trackingApproachCue(dogDistanceM: number, areaId: string, stage: DogScentStage = 'none', waitingForHandler = false): string | null {
  return trackingApproachGuidance(dogDistanceM, areaId, stage, waitingForHandler)?.headline ?? null;
}

/** Guidance refers to the visible dog's work and hunter's pace, never the
 * concealed birds' positions, nerve or an assumed guaranteed shooting range. */
export function pheasantPointGuidance(dogDistanceM: number, dogHeading: number): string {
  if (dogDistanceM > 12) return 'Walk toward the point. Watch above the cover and identify the rooster before firing.';
  // The dog's body direction is observable; never aim this cue at a hidden bird.
  // Dog headings use +x east and +y south in property coordinates.
  const heading = fieldCompassHeading(-dogHeading - Math.PI / 2);
  const direction = `${heading.cardinal} ${String(heading.degrees).padStart(3, '0')}°`;
  if (dogDistanceM > 3) return `Dog facing ${direction}. Close to the dog first, then follow its nose into cover.`;
  return `Follow the dog's nose ${direction} into cover. Identify the bird before firing.`;
}

export function pointApproachCue(dogDistanceM: number, running: boolean, areaId = ''): string {
  const style = huntingDoctrine(areaId).style;
  if (style === 'pheasant') return running ? 'ON POINT · SLOW YOUR APPROACH'
    : dogDistanceM > 9 ? 'ON POINT · WALK IN QUIETLY' : 'ON POINT · WATCH THE COVER';
  if (areaId === 'sharptail-prairie' && dogDistanceM < 42) return 'ON POINT · HOLD THE COVEY EDGE';
  if (style === 'chukar' && dogDistanceM < 42) return 'ON POINT · HOLD THE HIGH SIDE';
  if (style === 'bench-covey' && dogDistanceM < 42) return 'ON POINT · FLANK THE BENCH';
  if (style === 'desert-wash' && dogDistanceM < 42) return 'ON POINT · HOLD THE SHADE';
  if (style === 'alpine-edge' && dogDistanceM < 42) return 'ON POINT · KEEP THE WIND';
  if (style === 'oak-savanna' && dogDistanceM < 42) return 'ON POINT · WORK THE OAK SKIRT';
  if (areaId === 'woodcock-bottoms' && dogDistanceM < 20) return 'ON POINT · WAIT FOR THE CANOPY';
  if (areaId === 'mearns-canyons' && dogDistanceM < 20) return 'ON POINT · STEP INTO THE DRAW';
  if (areaId === 'grouse-woods' && dogDistanceM < 20) return 'ON POINT · CLOSE THE OPENING';
  if ((style === 'woods' || style === 'bottoms' || style === 'canyon') && dogDistanceM < 20) return 'ON POINT · STEP IN QUIETLY';
  if (running && dogDistanceM < 28) return 'ON POINT · SLOW YOUR APPROACH';
  if (dogDistanceM > 28) return 'ON POINT · FOLLOW THE DOG';
  if (dogDistanceM > 9) return 'ON POINT · WALK IN QUIETLY';
  return 'ON POINT · WATCH THE COVER';
}

const SEARCH_LABELS: Record<string, string> = {
  'quail-fields': 'DOG CASTING PLUM EDGES',
  'pheasant-coverts': 'DOG HOLDING COVER EDGE',
  'sharptail-prairie': 'DOG CASTING WIND LANES',
  'grouse-woods': 'DOG CHECKING TIMBER GAPS',
  'woodcock-bottoms': 'DOG COMBING WET ALDER',
  'hun-benches': 'DOG FLANKING THE BENCH',
  'chukar-ridge': 'DOG WORKING HIGH SIDE',
  'desert-washes': 'DOG LINKING SHADE',
  'mearns-canyons': 'DOG COMBING OAK DRAW',
  'timberline-parks': 'DOG CHECKING TIMBER FINGERS',
  'valley-oaks': 'DOG CASTING OAK SKIRTS',
};

export function dogWorkLabel(dog: { state: DogState; scentStage: DogScentStage; carryingBirdId: number | null; waitingForHandler?: boolean; searchAreaChecked?: boolean }, areaId = ''): string {
  const style = huntingDoctrine(areaId).style;
  if (dog.carryingBirdId !== null) return 'DOG RETURNING';
  if (dog.state === 'pointing') return 'DOG ON POINT';
  if (dog.waitingForHandler) return style === 'pheasant' ? 'DOG HOLDING SCENT' : 'DOG HOLDING SCENT · CLOSE UP';
  if (dog.state === 'tracking') {
    if (style === 'pheasant') {
      if (dog.scentStage === 'checking') return 'SCENT CHECK';
      if (dog.scentStage === 'locating') return 'LOCATING SCENT';
      if (dog.scentStage === 'stalking') return 'DOG CLOSING';
      if (dog.scentStage === 'locking') return 'SETTING POINT';
      return 'DOG WORKING SCENT';
    }
    if (areaId === 'sharptail-prairie') return 'DOG WORKING THE WIND LANE';
    if (style === 'chukar') return 'DOG CLIMBING SCENT';
    if (style === 'bench-covey') return 'DOG WORKING THE BENCH';
    if (style === 'desert-wash') return 'DOG LINKING THE WASH';
    if (style === 'alpine-edge') return 'DOG WORKING TIMBER EDGE';
    if (style === 'oak-savanna') return 'DOG WORKING OAK SHADE';
    if (areaId === 'woodcock-bottoms') return 'DOG WORKING WET ALDER';
    if (areaId === 'mearns-canyons') return 'DOG WORKING OAK DRAW';
    if (areaId === 'grouse-woods') return 'DOG WORKING TIMBER OPENING';
    if (style === 'woods' || style === 'bottoms' || style === 'canyon') return 'DOG WORKING THICK COVER';
    if (dog.scentStage === 'checking') return 'SCENT CHECK';
    if (dog.scentStage === 'locating') return 'LOCATING SCENT';
    if (dog.scentStage === 'stalking') return 'DOG CLOSING';
    if (dog.scentStage === 'locking') return 'SETTING POINT';
    return 'DOG WORKING SCENT';
  }
  if (dog.state === 'marking') return 'DOG MARKING THE RISE';
  if (dog.state === 'retrieving') return 'DOG HUNTING DEAD';
  if (dog.state === 'recalled') return dog.searchAreaChecked ? 'DOG REJOINING' : 'DOG COMING IN';
  if (dog.state === 'heel') return dog.searchAreaChecked ? 'DOG READY TO MOVE ON' : 'DOG AT HEEL';
  if (dog.state === 'honoring') return 'DOG BACKING POINT';
  if (dog.state === 'breaking') return 'DOG CHASING';
  if (dog.state === 'quartering') return SEARCH_LABELS[areaId] ?? 'DOG SEARCHING';
  return 'DOG SEARCHING';
}
