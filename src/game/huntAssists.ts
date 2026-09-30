import { DEFAULT_DOG_RANGE, parseDogRange, type DogRange } from './dogRange';

/**
 * Difficulty as the hunter's kit and sight picture, not as bird behaviour
 * (that is the hunt challenge). Each assist maps to something a real hunter
 * could carry or leave at home: a GPS collar and handheld, a printed map,
 * a bright aiming aid. Presets set them together; any toggle can be changed
 * on its own, which makes the choice Custom.
 */
export type TrackingAssist = 'bell' | 'beeper' | 'gps' | 'gps-map';
export type AssistPreset = 'guided' | 'standard' | 'seasoned' | 'purist';

export interface HuntAssists {
  /** What tells you where the dog is. */
  tracking: TrackingAssist;
  /** The property survey map (M). */
  surveyMap: boolean;
  /** The ring over the bead when the gun is mounted. Off: the bead alone. */
  aimRing: boolean;
  /** On-screen control hints and first-hunt guidance. */
  hints: boolean;
  /** How far the dog hunts from the gun. A dog preference, not a difficulty. */
  dogRange: DogRange;
}

type AssistSet = Omit<HuntAssists, 'dogRange'>;

export const ASSIST_PRESETS: Record<AssistPreset, { label: string; description: string; assists: AssistSet }> = {
  guided: { label: 'Guided', description: 'GPS collar with the dog on your map, an aiming ring and control hints.',
    assists: { tracking: 'gps-map', surveyMap: true, aimRing: true, hints: true } },
  standard: { label: 'Standard', description: 'GPS handheld shows the dog’s bearing and distance. The map shows the ground, not the dog.',
    assists: { tracking: 'gps', surveyMap: true, aimRing: true, hints: false } },
  seasoned: { label: 'Seasoned', description: 'A beeper collar tells you when the dog is on point, not where. Shoot off the bead.',
    assists: { tracking: 'beeper', surveyMap: true, aimRing: false, hints: false } },
  purist: { label: 'Purist', description: 'Bell only and no map. Read your dog and the country.',
    assists: { tracking: 'bell', surveyMap: false, aimRing: false, hints: false } },
};

export const TRACKING_ASSISTS: Record<TrackingAssist, { label: string; description: string; gearTier: number }> = {
  bell: { label: 'Bell', description: 'Listen for the bell. It goes quiet when the dog stops.', gearTier: 0 },
  beeper: { label: 'Beeper', description: 'The collar beeps when the dog is on point.', gearTier: 1 },
  gps: { label: 'GPS', description: 'Bearing, distance and what the dog is doing.', gearTier: 2 },
  'gps-map': { label: 'GPS + map', description: 'The GPS readout, and the dog on your survey map.', gearTier: 3 },
};

export const DEFAULT_ASSIST_PRESET: AssistPreset = 'guided';
export const HUNT_ASSISTS_KEY = 'uplandin.3d.assists.v1';

export function presetAssists(preset: AssistPreset, dogRange: DogRange = DEFAULT_DOG_RANGE): HuntAssists {
  return { ...ASSIST_PRESETS[preset].assists, dogRange };
}

/** The preset these assists match exactly, or null for a custom set. */
export function matchingPreset(assists: HuntAssists): AssistPreset | null {
  for (const [id, preset] of Object.entries(ASSIST_PRESETS) as [AssistPreset, typeof ASSIST_PRESETS[AssistPreset]][]) {
    const set = preset.assists;
    if (set.tracking === assists.tracking && set.surveyMap === assists.surveyMap && set.aimRing === assists.aimRing && set.hints === assists.hints) return id;
  }
  return null;
}

const TRACKING_IDS = Object.keys(TRACKING_ASSISTS) as TrackingAssist[];
function parseTracking(value: unknown): TrackingAssist | undefined {
  return TRACKING_IDS.includes(value as TrackingAssist) ? value as TrackingAssist : undefined;
}

interface StorageLike { getItem(key: string): string | null; setItem?(key: string, value: string): void }

/** Stored assists, then URL overrides (range, tracking, aim, map, hints). */
export function resolveHuntAssists(search = '', storage: StorageLike | null = null): HuntAssists {
  let assists = presetAssists(DEFAULT_ASSIST_PRESET);
  try {
    const raw = storage?.getItem(HUNT_ASSISTS_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<HuntAssists>;
      assists = {
        tracking: parseTracking(saved.tracking) ?? assists.tracking,
        surveyMap: typeof saved.surveyMap === 'boolean' ? saved.surveyMap : assists.surveyMap,
        aimRing: typeof saved.aimRing === 'boolean' ? saved.aimRing : assists.aimRing,
        hints: typeof saved.hints === 'boolean' ? saved.hints : assists.hints,
        dogRange: parseDogRange(saved.dogRange) ?? assists.dogRange,
      };
    }
  } catch { /* A damaged or unavailable save keeps the defaults. */ }
  const params = new URLSearchParams(search);
  const flag = (name: string) => params.has(name) ? !['0', 'off', 'false'].includes(params.get(name) ?? '') : undefined;
  const preset = params.get('assists') as AssistPreset | null;
  if (preset && preset in ASSIST_PRESETS) assists = presetAssists(preset, assists.dogRange);
  return {
    tracking: parseTracking(params.get('tracking')) ?? assists.tracking,
    surveyMap: flag('map') ?? assists.surveyMap,
    aimRing: flag('ring') ?? assists.aimRing,
    hints: flag('hints') ?? assists.hints,
    dogRange: parseDogRange(params.get('range')) ?? assists.dogRange,
  };
}

export function saveHuntAssists(assists: HuntAssists, storage: StorageLike | null): void {
  try { storage?.setItem?.(HUNT_ASSISTS_KEY, JSON.stringify(assists)); } catch { /* Preference only. */ }
}

/** A career hunter carries what they have earned: assists can take gear away, never add it. */
export function effectiveGearTier(assists: HuntAssists, earnedTier: number | null): number {
  const chosen = TRACKING_ASSISTS[assists.tracking].gearTier;
  return earnedTier === null ? chosen : Math.min(chosen, earnedTier);
}

export const HUNT_ASSISTS_EVENT = 'uplandin:assists-change';
