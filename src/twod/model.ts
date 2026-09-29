/**
 * The self-contained rules for the 2D field adventure.
 *
 * The presentation can choose how much of this state to show. In particular,
 * cover outcomes and clue locations are intentionally represented as hidden
 * state until the dog and hunter work them out together.
 */
export type Vec = { x: number; y: number };

export const WORLD_WIDTH = 1280;
export const WORLD_HEIGHT = 960;

export const LANDMARKS = [
  { id: 'camp', name: 'Juniper Camp', description: 'A warm fire, a full canteen, and a place to tell the day’s stories.', x: 250, y: 810 },
  { id: 'meadow', name: 'Goldgrass Meadow', description: 'Bobwhite whistles drift through a sea of golden grass.', x: 420, y: 610 },
  { id: 'marsh', name: 'Copperreed Marsh', description: 'Dragonflies skim the water where pheasants hide in the reeds.', x: 1010, y: 570 },
  { id: 'orchard', name: 'Old Apple Orchard', description: 'An abandoned orchard, full of windfall apples and secret trails.', x: 720, y: 260 },
  { id: 'overlook', name: 'Bluebird Overlook', description: 'The whole valley opens below you. Stay a moment and listen.', x: 1040, y: 200 },
] as const;

export type SpeciesId = 'bobwhite' | 'pheasant' | 'grouse';
export const SPECIES: Record<SpeciesId, { name: string; description: string; color: string; speed: number }> = {
  bobwhite: { name: 'Northern Bobwhite', description: 'Small, sociable, and quick on the wing. Listen for a bright “bob-white!” from the meadow.', color: '#d9b373', speed: 165 },
  pheasant: { name: 'Ring-necked Pheasant', description: 'A copper-colored flash above the reeds, with a long tail and an unmistakable cackle.', color: '#d17d46', speed: 205 },
  grouse: { name: 'Ruffed Grouse', description: 'A woodland ghost with a fan-shaped tail. The old orchard is a favorite hiding place.', color: '#9e8769', speed: 235 },
};

export type Patch = { id: string; name: string; species: SpeciesId; x: number; y: number; radius: number };
export const PATCHES: readonly Patch[] = [
  { id: 'meadow-covey', name: 'Goldgrass covey', species: 'bobwhite', x: 440, y: 555, radius: 65 },
  { id: 'marsh-covey', name: 'Copperreed cover', species: 'pheasant', x: 975, y: 570, radius: 65 },
  { id: 'orchard-covey', name: 'Orchard thicket', species: 'grouse', x: 650, y: 285, radius: 62 },
];

export type Save = {
  version: 1;
  dogName: string;
  xp: number;
  outings: number;
  totalBirds: number;
  journal: string[];
  bestScore: number;
};

export const SAVE_KEY = 'uplandin:2d:field-adventure:v1';
const JOURNAL_IDS = new Set<string>([...Object.keys(SPECIES), ...LANDMARKS.filter(place => place.id !== 'camp').map(place => place.id)]);

export function createSave(): Save {
  return { version: 1, dogName: 'Scout', xp: 0, outings: 0, totalBirds: 0, journal: [], bestScore: 0 };
}

/** Older 3D careers and malformed browser storage are deliberately never imported. */
export function parseSave(raw: string | null): Save {
  if (!raw) return createSave();
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return createSave();
    const saved = value as Record<string, unknown>;
    const counters = ['xp', 'outings', 'totalBirds', 'bestScore'] as const;
    if (saved.version !== 1 || typeof saved.dogName !== 'string' || !Array.isArray(saved.journal)
      || counters.some(key => typeof saved[key] !== 'number' || !Number.isSafeInteger(saved[key]) || (saved[key] as number) < 0)) return createSave();
    return {
      version: 1,
      dogName: saved.dogName.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 24) || 'Scout',
      xp: saved.xp as number,
      outings: saved.outings as number,
      totalBirds: saved.totalBirds as number,
      bestScore: saved.bestScore as number,
      journal: [...new Set(saved.journal.filter((entry): entry is string => typeof entry === 'string' && JOURNAL_IDS.has(entry)))],
    };
  } catch {
    return createSave();
  }
}

// Levels begin at 1. Lifetime thresholds: 0, 60, 140, 240, 360, 500 …
function xpFloor(level: number): number { return 10 * level * level + 30 * level - 40; }
export function dogLevel(xp: number): number {
  const safeXp = Number.isFinite(xp) ? Math.max(0, xp) : 0;
  return Math.max(1, Math.floor((-30 + Math.sqrt(2500 + 40 * safeXp)) / 20));
}
export function levelProgress(xp: number): number {
  const safeXp = Number.isFinite(xp) ? Math.max(0, xp) : 0;
  const level = dogLevel(safeXp);
  return Math.max(0, Math.min(1, (safeXp - xpFloor(level)) / (xpFloor(level + 1) - xpFloor(level))));
}

/** Growing experience makes a cast reach a little farther, but never discovers cover by itself. */
export function dogSearchRadius(xp: number): number {
  return 130 + Math.min(28, (dogLevel(xp) - 1) * 4);
}

/** The stamina bar is an outing resource and is deliberately not persisted. */
export function dogStaminaMax(xp: number): number {
  return 100 + Math.min(24, Math.max(0, dogLevel(xp) - 1) * 6);
}

/** Trust is a readable partnership level derived from the existing 2D save XP. */
export function dogTrustLevel(xp: number): number {
  return Math.max(1, Math.min(10, dogLevel(xp)));
}

export function dogTrustFromXp(xp: number): number {
  const level = dogTrustLevel(xp);
  return Math.max(0, Math.min(100, 24 + level * 9 + levelProgress(xp) * 9));
}

export type WindDirection = 'north' | 'northeast' | 'east' | 'southeast' | 'south' | 'southwest' | 'west' | 'northwest';
export type Wind = { direction: WindDirection; vector: Vec; speed: number; label: string };
export const WIND_VECTORS: Record<WindDirection, Vec> = {
  north: { x: 0, y: -1 }, northeast: { x: 0.707, y: -0.707 }, east: { x: 1, y: 0 }, southeast: { x: 0.707, y: 0.707 },
  south: { x: 0, y: 1 }, southwest: { x: -0.707, y: 0.707 }, west: { x: -1, y: 0 }, northwest: { x: -0.707, y: -0.707 },
};

export type ScentSignal = {
  sourceId: string;
  strength: number;
  confidence: number;
  distance: number;
  bearing: number;
  windDirection: WindDirection;
  label: 'lost' | 'faint' | 'promising' | 'strong';
  text: string;
};

const vectorLength = (value: Vec): number => Math.hypot(value.x, value.y);
const normalize = (value: Vec): Vec => {
  const length = vectorLength(value);
  return length < 0.001 ? { x: 0, y: 0 } : { x: value.x / length, y: value.y / length };
};
export const distanceBetween = (a: Vec, b: Vec): number => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (value: number, minimum: number, maximum: number): number => Math.max(minimum, Math.min(maximum, value));

/**
 * Calculates a scent reading from source to listener. `windVector` points in
 * the direction the scent is drifting, so a hunter downwind gets a stronger
 * reading and a hunter upwind gets a weaker one.
 */
export function calculateScentSignal(source: Vec, listener: Vec, windVector: Vec, sourceId = 'cover', windDirection: WindDirection = 'east'): ScentSignal {
  const offset = { x: listener.x - source.x, y: listener.y - source.y };
  const distance = vectorLength(offset);
  const downwind = normalize(windVector);
  const fromSource = normalize(offset);
  const alignment = fromSource.x * downwind.x + fromSource.y * downwind.y;
  const distanceFactor = clamp(1 - distance / 430, 0, 1);
  const strength = clamp(0.16 + distanceFactor * 0.38 + alignment * 0.38, 0, 1);
  const confidence = clamp(strength * 0.82 + (alignment > 0.12 ? 0.16 : 0), 0, 1);
  const label = strength >= 0.78 ? 'strong' : strength >= 0.53 ? 'promising' : strength >= 0.3 ? 'faint' : 'lost';
  const bearing = (Math.atan2(source.y - listener.y, source.x - listener.x) * 180 / Math.PI + 360) % 360;
  const text = label === 'strong' ? 'A strong cone of scent is coming through the cover.'
    : label === 'promising' ? 'There is a promising thread of scent in the breeze.'
      : label === 'faint' ? 'A faint trace hangs on the edge of the wind.'
        : 'The wind has carried the scent away.';
  return { sourceId, strength, confidence, distance, bearing, windDirection, label, text };
}

export type ClueKind = 'feather' | 'track' | 'dropping' | 'rustle';
export type CoverClue = { id: string; kind: ClueKind; x: number; y: number; text: string };
export type CoverOutcome = 'hidden' | 'false-trail' | 'covey' | 'roaming';
export type CoverState = 'undiscovered' | 'casting' | 'trail' | 'pointing' | 'paused' | 'false-trail' | 'flushed' | 'escaped' | 'worked' | 'roaming';

export type AdventurePatch = Patch & {
  /** The outcome is hidden from the player until all clues have been searched. */
  outcome: CoverOutcome;
  outcomeKnown: boolean;
  state: CoverState;
  clues: CoverClue[];
  revealedClues: string[];
  currentClueIndex: number;
  clueReady: boolean;
  searchProgress: number;
  castCount: number;
  found: boolean;
  completed: boolean;
};

export type DogState = 'following' | 'searching' | 'pointing' | 'holding' | 'retrieving' | 'returning' | 'tired';
export type DogCommand = 'cast' | 'heel' | 'hold';
export type ApproachStrategy = 'careful' | 'steady' | 'rush';
export type ApproachTiming = 'quick' | 'settled' | 'late';

export type ContextualAction = {
  label: string;
  kind: 'flush' | 'discover' | 'camp' | 'whistle' | 'cast' | 'heel' | 'hold' | 'search' | 'approach' | 'recover';
  detail: string;
};
export type Interaction = 'encounter' | 'discovery' | 'summary' | 'whistle' | 'search' | 'command' | 'approach' | 'recover' | 'none';

export type CommandResult = {
  accepted: boolean;
  command: DogCommand;
  message: string;
  energy: number;
  state: DogState;
};
export type ApproachResult = {
  accepted: boolean;
  strategy: ApproachStrategy;
  quality: number;
  bonus: number;
  message: string;
};
export type EncounterBrief = {
  sectorId: string;
  species: SpeciesId;
  birds: number;
  strategy: ApproachStrategy;
  timing: ApproachTiming;
  quality: number;
  bonus: number;
  scentStrength: number;
  windDirection: WindDirection;
};
export type RoamingBird = { id: string; species: SpeciesId; x: number; y: number; sourcePatchId: string; ttl: number };

export type AdventureOptions = {
  seed?: number;
  windDirection?: WindDirection;
  /** Test and replay hook. Normal play should leave outcomes to the outing seed. */
  outcomes?: readonly ('covey' | 'false-trail')[];
};

const CLUE_BLUEPRINTS: Record<SpeciesId, Array<{ dx: number; dy: number; kind: ClueKind; text: string }>> = {
  bobwhite: [
    { dx: -35, dy: 22, kind: 'feather', text: 'A pale feather trembles in the goldgrass.' },
    { dx: 26, dy: -19, kind: 'track', text: 'Tiny tracks cross a patch of bare soil.' },
    { dx: 5, dy: 35, kind: 'rustle', text: 'Something small rustles deep in the grass.' },
  ],
  pheasant: [
    { dx: -30, dy: -23, kind: 'feather', text: 'A copper feather catches on a reed.' },
    { dx: 33, dy: 15, kind: 'dropping', text: 'Fresh sign lies beneath the sheltering reeds.' },
    { dx: -4, dy: 34, kind: 'rustle', text: 'The cover shakes once, then goes still.' },
  ],
  grouse: [
    { dx: -27, dy: 18, kind: 'track', text: 'Broad tracks disappear under the orchard leaves.' },
    { dx: 22, dy: -28, kind: 'feather', text: 'A dark barred feather rests by the roots.' },
    { dx: 4, dy: 31, kind: 'rustle', text: 'A soft drum rolls somewhere beyond the thicket.' },
  ],
};

function random(seed: number): () => number {
  let value = Number.isFinite(seed) ? Math.floor(seed) | 0 : 20260907;
  return () => {
    value = (value + 0x6d2b79f5) | 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function outcomeOrder(rng: () => number): Array<'covey' | 'false-trail'> {
  const values: Array<'covey' | 'false-trail'> = ['covey', 'covey', 'false-trail'];
  for (let index = values.length - 1; index > 0; index--) {
    const swap = Math.floor(rng() * (index + 1));
    [values[index], values[swap]] = [values[swap], values[index]];
  }
  return values;
}

function count(value: number, maximum: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(maximum, Math.floor(value))) : 0;
}

function directionLabel(direction: WindDirection): string {
  return `${direction[0].toUpperCase()}${direction.slice(1)} wind`;
}

export class Adventure {
  save: Save;
  player: Vec = { x: 250, y: 810 };
  dog: Vec = { x: 285, y: 800 };
  dogState: DogState = 'following';
  phase: 'explore' | 'encounter' | 'retrieve' | 'summary' = 'explore';
  time = 0;
  target: Vec | null = null;
  patches: AdventurePatch[];
  discovered: string[] = [];
  activePatch: AdventurePatch | null = null;
  birdsBagged = 0;
  shotsFired = 0;
  points = 0;
  message: string;
  retrieveTime = 0;

  /** Public HUD contract for the 2D presentation. */
  readonly maxEnergy: number;
  energy: number;
  trust: number;
  readonly windDirection: WindDirection;
  readonly windVector: Vec;
  scentClue: ScentSignal | null = null;
  selectedApproach: ApproachStrategy = 'steady';
  approachQuality = 0;
  encounterBrief: EncounterBrief | null = null;
  roamingBirds: RoamingBird[] = [];

  private pendingXp = 0;
  private settled = false;
  private readonly rng: () => number;
  private readonly outcomes: Array<'covey' | 'false-trail'>;
  private commandMode: DogCommand = 'heel';
  private recallUntil = 0;
  private holdStartedAt: number | null = null;
  private lastPlayerPosition: Vec = { ...this.player };
  private playerSpeed = 0;
  private activeRoaming: RoamingBird | null = null;
  /**
   * Motion is kept outside the public bird shape so renderers can continue to
   * consume the simple `{ x, y, ttl }` contract. The seeded values make every
   * escape path reproducible while still giving each bird its own rhythm.
   */
  private readonly roamingMotion = new Map<string, { phase: number; speed: number }>();
  private approachChosen = false;
  private approachRewarded = false;

  constructor(save: Save = createSave(), options: AdventureOptions = {}) {
    // Keep an outing's in-memory save independent from the caller's object.
    this.save = parseSave(JSON.stringify(save));
    this.rng = random(options.seed ?? 20260907 + this.save.outings * 977 + this.save.xp * 13);
    this.outcomes = outcomeOrder(this.rng);
    const outingWinds: WindDirection[] = ['east', 'south', 'northwest', 'west', 'northeast', 'southwest'];
    this.windDirection = options.windDirection ?? outingWinds[this.save.outings % outingWinds.length];
    this.windVector = { ...WIND_VECTORS[this.windDirection] };
    this.maxEnergy = dogStaminaMax(this.save.xp);
    this.energy = this.maxEnergy;
    this.trust = dogTrustFromXp(this.save.xp);
    this.patches = PATCHES.map((patch, index) => this.createPatch(patch, options.outcomes?.[index] ?? this.outcomes[index]));
    this.message = `${this.save.dogName} is ready. Read the breeze, then cast into a cover when you’re ready.`;
  }

  /** Aliases keep the contract discoverable to keyboard, touch, and simple UI callers. */
  get dogStamina(): number { return this.energy; }
  get stamina(): number { return this.energy; }
  set stamina(value: number) { this.energy = clamp(Number.isFinite(value) ? value : 0, 0, this.maxEnergy); }
  get dogTrust(): number { return this.trust; }
  get trustLevel(): number { return dogTrustLevel(Math.max(0, this.save.xp + Math.max(0, this.trust - dogTrustFromXp(this.save.xp)))); }
  get wind(): Wind { return { direction: this.windDirection, vector: { ...this.windVector }, speed: 1, label: directionLabel(this.windDirection) }; }
  get coverProgress(): number { return this.activePatch?.searchProgress ?? 0; }
  get coverProgressBySector(): Array<{ id: string; progress: number; state: CoverState; completed: boolean }> {
    return this.patches.map(patch => ({ id: patch.id, progress: patch.searchProgress, state: patch.state, completed: patch.completed }));
  }
  get currentClue(): CoverClue | null {
    const patch = this.activePatch;
    if (!patch || patch.currentClueIndex >= patch.clues.length) return null;
    return patch.clues[patch.currentClueIndex];
  }
  get scentSignal(): ScentSignal | null { return this.scentClue; }
  get activeRoamingBird(): RoamingBird | null { return this.activeRoaming; }

  update(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0 || this.phase === 'summary') return;
    const step = Math.min(dt, 0.1);
    this.time += step;
    this.updatePlayerMotion(step);
    this.updateRoaming(step);
    if (this.phase === 'encounter') return;

    if (this.phase === 'retrieve') {
      this.updateRetrieve(step);
      return;
    }

    this.updateEnergy(step);
    this.refreshScent();
    if (this.time < this.recallUntil) {
      this.dogState = distanceBetween(this.dog, this.player) > 42 ? 'returning' : 'following';
      moveToward(this.dog, this.followPosition(), step * 225);
      return;
    }

    if (this.activeRoaming) {
      this.updateRoamingSearch(step);
      return;
    }

    const patch = this.activePatch;
    if (!patch) {
      this.commandMode = 'heel';
      this.dogState = this.energy < 10 ? 'tired' : 'following';
      moveToward(this.dog, this.followPosition(), step * 175);
      return;
    }

    if (this.commandMode === 'heel') {
      this.dogState = distanceBetween(this.dog, this.player) > 42 ? 'returning' : 'following';
      moveToward(this.dog, this.followPosition(), step * 215);
      return;
    }
    if (this.commandMode === 'hold' || (patch.found && (patch.state === 'pointing' || patch.state === 'paused'))) {
      // A freshly established point remains visually distinct until the
      // hunter explicitly asks for a hold; this lets the UI celebrate the
      // point while still treating hold as the default command mode.
      this.dogState = patch.found && this.holdStartedAt === null ? 'pointing' : 'holding';
      return;
    }

    // Casting deliberately stops at each clue. The hunter must move in and
    // search it before the dog receives the next lead.
    this.updateCasting(step, patch);
  }

  /** Send the setter out, call them back, or ask them to hold their ground. */
  dogCommand(command: DogCommand): CommandResult {
    if (command === 'cast') return this.startCast();
    if (command === 'heel') return this.startHeel();
    if (command === 'hold') return this.startHold();
    return this.commandResult(command, false, 'That command is not available in this outing.');
  }

  commandDog(command: DogCommand): CommandResult { return this.dogCommand(command); }
  cast(): CommandResult { return this.dogCommand('cast'); }
  heel(): CommandResult { return this.dogCommand('heel'); }
  hold(): CommandResult { return this.dogCommand('hold'); }

  /** Existing recall button and R key continue to map to heel. */
  whistle(): void { this.startHeel(); }

  contextualAction(): ContextualAction {
    if (this.phase !== 'explore') {
      return { label: 'Wait', kind: 'whistle', detail: this.phase === 'retrieve' ? `${this.save.dogName} is bringing the bird back.` : 'Finish the moment in front of you.' };
    }

    if (this.activeRoaming && this.dogState === 'pointing' && distanceBetween(this.player, this.dog) <= 105) {
      return { label: 'Recover bird', kind: 'recover', detail: 'A bird that escaped the flush is holding in the open.' };
    }

    const patch = this.activePatch;
    if (patch) {
      const nearDog = distanceBetween(this.player, this.dog) <= 105;
      const clue = this.currentClue;
      if (patch.clueReady && clue) {
        if (nearDog || distanceBetween(this.player, clue) <= 82) {
          return { label: 'Investigate clue', kind: 'search', detail: 'Move close and inspect what your dog found.' };
        }
        return { label: 'Approach clue', kind: 'approach', detail: 'Walk to your dog before the trail goes cold.' };
      }
      if (patch.found && (this.dogState === 'pointing' || this.dogState === 'holding')) {
        if (nearDog) {
          return { label: 'Flush birds', kind: 'flush', detail: `${this.save.dogName} has a covey held tight. Choose when to send them up.` };
        }
        return { label: 'Approach quietly', kind: 'approach', detail: 'Get within range while staying on the quiet side of the wind.' };
      }
      if (this.dogState === 'searching') {
        return { label: 'Hold dog', kind: 'hold', detail: 'Ask your partner to wait while you read the cover.' };
      }
      if (this.dogState === 'tired') {
        return { label: 'Heel', kind: 'heel', detail: 'Let your partner recover before another cast.' };
      }
    }

    const landmark = this.nearbyUndiscoveredLandmark();
    if (landmark) return { label: 'Discover place', kind: 'discover', detail: landmark.name };
    if (distanceBetween(this.player, LANDMARKS[0]) <= 90) {
      const started = this.patches.some(patchItem => patchItem.completed) || this.discovered.length > 0;
      return { label: started ? 'Finish outing' : 'At camp', kind: 'camp', detail: started ? 'Rest by the fire and save your adventure.' : 'Choose a cover and cast your dog.' };
    }

    const nearby = this.nearestCastablePatch();
    if (nearby) {
      const signal = calculateScentSignal(nearby, this.player, this.windVector, nearby.id, this.windDirection);
      return { label: 'Cast Scout', kind: 'cast', detail: signal.label === 'lost' ? 'The wind is difficult here, but a careful cast may pick up a lead.' : `${signal.text} Send ${this.save.dogName} into the cover.` };
    }
    if (this.dogState !== 'following' && this.dogState !== 'tired') {
      return { label: 'Heel', kind: 'heel', detail: `Call ${this.save.dogName} back to your side.` };
    }
    return { label: 'Cast', kind: 'cast', detail: 'Move closer to one of the three covers before casting.' };
  }

  /**
   * Search the clue currently held by the dog. This is the small player-led
   * investigation that separates a real covey from a false trail.
   */
  search(): Interaction {
    if (this.phase !== 'explore' || !this.activePatch || !this.currentClue || !this.activePatch.clueReady) return 'none';
    const clue = this.currentClue;
    if (distanceBetween(this.player, this.dog) > 110 && distanceBetween(this.player, clue) > 85) {
      this.message = `Walk closer to ${this.save.dogName}; the clue is waiting by the cover.`;
      return 'none';
    }
    const patch = this.activePatch;
    patch.revealedClues.push(clue.id);
    patch.clueReady = false;
    patch.currentClueIndex += 1;
    patch.searchProgress = patch.revealedClues.length / patch.clues.length;
    this.points += 8;
    this.pendingXp += 4;
    this.trust = clamp(this.trust + 1.5, 0, 100);
    if (patch.currentClueIndex < patch.clues.length) {
      patch.state = 'casting';
      this.commandMode = 'cast';
      this.dogState = 'searching';
      this.message = `${clue.text} ${this.save.dogName} has another thread. Follow their nose.`;
      this.refreshScent();
      return 'search';
    }

    if (patch.outcome === 'covey') {
      patch.found = true;
      patch.outcomeKnown = true;
      patch.state = 'pointing';
      this.commandMode = 'hold';
      this.dogState = 'pointing';
      this.holdStartedAt = null;
      this.points += 18;
      this.pendingXp += 8;
      this.scentClue = this.scentClue ? { ...this.scentClue, strength: 1, confidence: 1, label: 'strong', text: 'The scent is unmistakable. Birds are holding in the cover.' } : null;
      this.message = `${clue.text} A covey is holding. Choose your approach and your moment.`;
    } else {
      this.resolveFalseTrail(patch, clue);
    }
    return 'search';
  }

  /** Pick a quiet, steady, or fast approach before the flush. */
  chooseApproach(strategy: ApproachStrategy): ApproachResult {
    const patch = this.activePatch;
    if (this.phase !== 'explore' || !patch || !patch.found || (this.dogState !== 'pointing' && this.dogState !== 'holding')) {
      return { accepted: false, strategy, quality: 0, bonus: 0, message: 'There is no held covey to approach yet.' };
    }
    if (distanceBetween(this.player, this.dog) > 118) {
      return { accepted: false, strategy, quality: 0, bonus: 0, message: `Walk closer to ${this.save.dogName} before choosing an approach.` };
    }
    const fromCover = normalize({ x: this.player.x - patch.x, y: this.player.y - patch.y });
    const wind = normalize(this.windVector);
    const downwind = fromCover.x * wind.x + fromCover.y * wind.y;
    const quiet = clamp(1 - this.playerSpeed / 135, 0, 1);
    const base = strategy === 'careful' ? 0.76 : strategy === 'steady' ? 0.58 : 0.3;
    const windBonus = strategy === 'careful' ? -downwind * 0.17 : -downwind * 0.08;
    const holdBonus = this.holdStartedAt === null ? 0 : clamp((this.time - this.holdStartedAt) / 4, 0, 1) * 0.12;
    const quality = clamp(base + quiet * 0.14 + windBonus + holdBonus, 0, 1);
    const bonus = Math.round(quality * 28);
    this.selectedApproach = strategy;
    this.approachQuality = quality;
    this.approachChosen = true;
    if (!this.approachRewarded) {
      this.pendingXp += strategy === 'careful' ? 5 : 2;
      this.trust = clamp(this.trust + (strategy === 'careful' ? 2 : 0.5), 0, 100);
      this.approachRewarded = true;
    }
    const message = strategy === 'careful' ? 'You ease in on the quiet side of the wind.' : strategy === 'rush' ? 'You move quickly. The covey will not wait long.' : 'You settle into a steady approach.';
    this.message = `${message} Flush when you are ready.`;
    return { accepted: true, strategy, quality, bonus, message: this.message };
  }

  /** Start the encounter only when the hunter chooses to flush a held covey. */
  flush(strategy?: ApproachStrategy): Interaction {
    const patch = this.activePatch;
    if (this.phase !== 'explore' || !patch || !patch.found || (this.dogState !== 'pointing' && this.dogState !== 'holding')) return 'none';
    if (distanceBetween(this.player, this.dog) > 118) {
      this.message = `Walk closer to ${this.save.dogName} before flushing.`;
      return 'none';
    }
    if (strategy) {
      const approach = this.chooseApproach(strategy);
      if (!approach.accepted) return 'none';
    } else if (!this.approachChosen) {
      this.chooseApproach('steady');
    }
    const holdDuration = this.holdStartedAt === null ? 0 : this.time - this.holdStartedAt;
    const timing: ApproachTiming = holdDuration < 0.8 ? 'quick' : holdDuration > 5 ? 'late' : 'settled';
    const timingBonus = timing === 'settled' ? 7 : timing === 'late' ? 2 : 0;
    const quality = clamp(this.approachQuality + timingBonus / 100, 0, 1);
    const bonus = Math.round(quality * 28) + timingBonus;
    this.encounterBrief = {
      sectorId: patch.id, species: patch.species, birds: 3, strategy: this.selectedApproach, timing,
      quality, bonus, scentStrength: this.scentClue?.strength ?? 0, windDirection: this.windDirection,
    };
    patch.state = 'flushed';
    this.phase = 'encounter';
    this.target = null;
    this.remember(patch.species);
    this.message = 'Birds up! Lead your shot and make the moment count.';
    return 'encounter';
  }

  /** Recover an escaped bird if the dog finds it during a later cast. */
  recoverRoaming(id?: string): Interaction {
    if (this.phase !== 'explore' || this.dogState !== 'pointing' || !this.activeRoaming) return 'none';
    if (distanceBetween(this.player, this.dog) > 110) return 'none';
    const target = id ? this.roamingBirds.find(bird => bird.id === id) : this.activeRoaming;
    if (!target) return 'none';
    this.roamingBirds = this.roamingBirds.filter(bird => bird.id !== target.id);
    this.activeRoaming = null;
    this.activePatch = null;
    this.birdsBagged += 1;
    this.points += 140;
    this.pendingXp += 18;
    this.trust = clamp(this.trust + 3, 0, 100);
    this.commandMode = 'heel';
    this.dogState = 'following';
    this.message = `${this.save.dogName} found one that got away. A patient partner pays off.`;
    return 'recover';
  }

  /** Existing interaction entry point, with optional explicit action for touch controls. */
  interact(explicit?: DogCommand | ApproachStrategy): Interaction {
    if (this.phase !== 'explore') return 'none';
    if (explicit === 'cast' || explicit === 'heel' || explicit === 'hold') {
      const result = this.dogCommand(explicit);
      return result.accepted ? 'command' : 'none';
    }
    if (explicit === 'careful' || explicit === 'steady' || explicit === 'rush') {
      return this.chooseApproach(explicit).accepted ? 'approach' : 'none';
    }
    const action = this.contextualAction();
    if (action.kind === 'search') return this.search();
    if (action.kind === 'recover') return this.recoverRoaming();
    if (action.kind === 'flush') return this.flush();
    if (action.kind === 'approach') return this.chooseApproach('careful').accepted ? 'approach' : 'none';
    if (action.kind === 'cast') return this.dogCommand('cast').accepted ? 'command' : 'none';
    if (action.kind === 'hold') return this.dogCommand('hold').accepted ? 'command' : 'none';
    if (action.kind === 'heel' || action.kind === 'whistle') return this.dogCommand('heel').accepted ? 'whistle' : 'none';
    if (action.kind === 'discover') {
      const landmark = this.nearbyUndiscoveredLandmark();
      if (!landmark) return 'none';
      this.discovered.push(landmark.id);
      this.remember(landmark.id);
      this.points += 25;
      this.pendingXp += 8;
      this.trust = clamp(this.trust + 1, 0, 100);
      this.message = `${landmark.name}. ${landmark.description}`;
      return 'discovery';
    }
    if (action.kind === 'camp') {
      if (!this.patches.some(patch => patch.completed) && this.discovered.length === 0) {
        this.message = `Adventure is waiting! Choose a cover and cast ${this.save.dogName}.`;
        return 'none';
      }
      this.finishOuting();
      return 'summary';
    }
    return 'none';
  }

  finishEncounter(hits: number, shots: number): void {
    if (this.phase !== 'encounter' || !this.activePatch || this.activePatch.completed) return;
    const patch = this.activePatch;
    const fired = count(shots, 30);
    const bagged = Math.min(count(hits, 30), fired);
    const brief = this.encounterBrief;
    patch.completed = true;
    patch.outcomeKnown = true;
    patch.state = bagged > 0 ? 'worked' : 'escaped';
    this.shotsFired += fired;
    this.birdsBagged += bagged;
    this.points += bagged * 100;
    if (bagged > 0) this.points += brief?.bonus ?? 0;
    this.pendingXp += 12 + bagged * 12 + (bagged > 0 && brief?.strategy === 'careful' ? 8 : 0);
    if (bagged < 3) this.spawnRoaming(patch, Math.max(1, 3 - bagged));
    this.approachChosen = false;
    this.approachRewarded = false;
    this.holdStartedAt = null;
    if (bagged > 0) {
      this.phase = 'retrieve';
      this.retrieveTime = 0;
      this.dogState = 'retrieving';
      this.commandMode = 'heel';
      this.message = bagged === 3 ? `A clean flush. ${this.save.dogName} is making the retrieve.` : `${bagged} bird${bagged === 1 ? '' : 's'} down. ${this.save.dogName} is making the retrieve.`;
    } else {
      this.phase = 'explore';
      this.activePatch = null;
      this.dogState = 'following';
      this.commandMode = 'heel';
      this.message = 'They got away and scattered. Cast again later if you want to recover a roaming bird.';
    }
  }

  finishOuting(): void {
    if (this.settled || this.phase === 'encounter' || this.phase === 'retrieve') return;
    this.settled = true;
    this.phase = 'summary';
    this.target = null;
    const completed = this.patches.filter(patch => patch.completed).length;
    const explored = completed > 0 || this.discovered.length > 0;
    if (explored) {
      if (distanceBetween(this.player, LANDMARKS[0]) <= 90) this.points += 50;
      if (completed === this.patches.length) { this.points += 60; this.pendingXp += 24; }
      const trustReward = Math.floor(Math.max(0, this.trust - dogTrustFromXp(this.save.xp)) / 4);
      this.save.xp = Math.min(Number.MAX_SAFE_INTEGER, this.save.xp + this.pendingXp + 20 + trustReward);
      this.save.outings = Math.min(Number.MAX_SAFE_INTEGER, this.save.outings + 1);
      this.save.totalBirds = Math.min(Number.MAX_SAFE_INTEGER, this.save.totalBirds + this.birdsBagged);
      this.save.bestScore = Math.max(this.save.bestScore, this.points);
    }
    this.message = `An outing to remember. ${this.save.dogName} has earned a rest.`;
  }

  private createPatch(patch: Patch, outcome: 'covey' | 'false-trail'): AdventurePatch {
    const blueprint = CLUE_BLUEPRINTS[patch.species];
    const clues = blueprint.map((clue, index) => ({
      id: `${patch.id}-clue-${index + 1}`,
      kind: clue.kind,
      x: patch.x + clue.dx + Math.round((this.rng() - 0.5) * 8),
      y: patch.y + clue.dy + Math.round((this.rng() - 0.5) * 8),
      text: clue.text,
    }));
    return {
      ...patch, outcome, outcomeKnown: false, state: 'undiscovered', clues, revealedClues: [], currentClueIndex: 0,
      clueReady: false, searchProgress: 0, castCount: 0, found: false, completed: false,
    };
  }

  private startCast(): CommandResult {
    if (this.phase !== 'explore') return this.commandResult('cast', false, 'Wait until the current moment is finished.');
    if (this.energy < 14) {
      this.dogState = 'tired';
      this.message = `${this.save.dogName} needs a breather before another cast.`;
      return this.commandResult('cast', false, this.message);
    }
    if (this.activeRoaming) {
      this.message = `${this.save.dogName} is already working the bird that escaped.`;
      return this.commandResult('cast', false, this.message);
    }
    const roaming = this.nearestRoamingBird();
    if (roaming) {
      this.energy = clamp(this.energy - 14, 0, this.maxEnergy);
      this.activeRoaming = roaming;
      this.activePatch = this.patches.find(patchItem => patchItem.id === roaming.sourcePatchId) ?? null;
      if (this.activePatch) this.activePatch.state = 'roaming';
      this.commandMode = 'cast';
      this.dogState = 'searching';
      this.message = `${this.save.dogName} catches a moving bird's trail. Cast after it.`;
      return this.commandResult('cast', true, this.message);
    }
    let patch = this.activePatch;
    if (!patch || patch.completed) patch = this.nearestCastablePatch();
    if (!patch) {
      this.message = 'Move closer to a cover before sending your dog out.';
      return this.commandResult('cast', false, this.message);
    }
    if (distanceBetween(this.player, patch) > this.castRange()) {
      this.message = 'That cover is beyond a useful cast. Follow the country a little farther.';
      return this.commandResult('cast', false, this.message);
    }
    if (patch.found && (patch.state === 'pointing' || patch.state === 'paused')) {
      this.activePatch = patch;
      this.commandMode = 'hold';
      this.dogState = 'pointing';
      patch.state = 'pointing';
      this.message = `${this.save.dogName} is still holding the covey. Choose your approach.`;
      return this.commandResult('cast', true, this.message);
    }
    this.energy = clamp(this.energy - 14, 0, this.maxEnergy);
    this.activePatch = patch;
    patch.castCount += 1;
    patch.state = 'casting';
    patch.clueReady = false;
    this.commandMode = 'cast';
    this.dogState = 'searching';
    this.holdStartedAt = null;
    this.refreshScent();
    this.message = `${this.save.dogName} casts into ${patch.name.toLowerCase()}. Watch where the nose takes them.`;
    return this.commandResult('cast', true, this.message);
  }

  private startHeel(): CommandResult {
    if (this.phase !== 'explore') return this.commandResult('heel', false, 'There is no dog command during this moment.');
    this.commandMode = 'heel';
    this.recallUntil = this.time + 1.2;
    this.holdStartedAt = null;
    if (this.activePatch && !this.activePatch.completed) this.activePatch.state = 'paused';
    this.dogState = 'returning';
    this.message = `${this.save.dogName}, heel. Come check in before the next cast.`;
    return this.commandResult('heel', true, this.message);
  }

  private startHold(): CommandResult {
    if (this.phase !== 'explore') return this.commandResult('hold', false, 'There is no dog command during this moment.');
    const hasActiveCover = Boolean(this.activePatch && !this.activePatch.completed);
    if (!hasActiveCover && !this.activeRoaming) {
      const message = `${this.save.dogName} has nothing to hold yet. Cast into a cover or follow a moving bird first.`;
      this.message = message;
      return this.commandResult('hold', false, message);
    }
    this.commandMode = 'hold';
    this.holdStartedAt = this.time;
    this.dogState = 'holding';
    if (this.activePatch && !this.activePatch.completed) this.activePatch.state = this.activePatch.found ? 'pointing' : 'trail';
    this.message = this.activePatch?.found ? `${this.save.dogName} holds steady. Take your time with the approach.` : `${this.save.dogName} will hold here while you read the cover.`;
    return this.commandResult('hold', true, this.message);
  }

  private commandResult(command: DogCommand, accepted: boolean, message: string): CommandResult {
    return { accepted, command, message, energy: this.energy, state: this.dogState };
  }

  private updateCasting(step: number, patch: AdventurePatch): void {
    if (this.energy <= 0) {
      this.commandMode = 'heel';
      this.dogState = 'tired';
      this.message = `${this.save.dogName} is tired. Heel them back and let the nose recover.`;
      return;
    }
    const clue = this.currentClue;
    if (!clue) return;
    moveToward(this.dog, clue, step * (125 + this.trust * 0.55));
    if (distanceBetween(this.dog, clue) <= 16) {
      patch.clueReady = true;
      patch.state = 'trail';
      this.dogState = 'searching';
      this.scentClue = calculateScentSignal(clue, this.player, this.windVector, clue.id, this.windDirection);
      this.message = `${this.save.dogName} found a lead. Walk in and investigate the ${clue.kind}.`;
    } else {
      this.dogState = 'searching';
    }
  }

  private updateRetrieve(step: number): void {
    this.retrieveTime += step;
    const patch = this.activePatch;
    if (this.retrieveTime < 1.5 && patch) {
      this.dogState = 'retrieving';
      moveToward(this.dog, { x: patch.x + 65, y: patch.y - 35 }, step * 175);
    } else {
      this.dogState = 'returning';
      moveToward(this.dog, this.player, step * 220);
    }
    if (this.retrieveTime >= 3.2 && (distanceBetween(this.dog, this.player) <= 55 || this.retrieveTime >= 5)) {
      this.phase = 'explore';
      this.dogState = 'following';
      this.commandMode = 'heel';
      this.trust = clamp(this.trust + 6, 0, 100);
      this.energy = clamp(this.energy + 12, 0, this.maxEnergy);
      this.activePatch = null;
      this.message = `${this.save.dogName} brings your bird back. Good dog! ${this.remainingHint()}`;
    }
  }

  private updateEnergy(step: number): void {
    if (this.commandMode === 'cast' && this.activePatch) this.energy = clamp(this.energy - step * 3.6, 0, this.maxEnergy);
    else if (this.commandMode === 'hold') this.energy = clamp(this.energy - step * 1.15, 0, this.maxEnergy);
    else this.energy = clamp(this.energy + step * 8, 0, this.maxEnergy);
    if (this.energy <= 0 && this.commandMode === 'cast') this.dogState = 'tired';
  }

  private updatePlayerMotion(step: number): void {
    const moved = distanceBetween(this.player, this.lastPlayerPosition);
    this.playerSpeed = moved / Math.max(step, 0.001);
    this.lastPlayerPosition = { ...this.player };
  }

  private updateRoaming(step: number): void {
    const wind = normalize(this.windVector);
    const crosswind = { x: -wind.y, y: wind.x };
    const updated = this.roamingBirds.map(bird => {
      const motion = this.roamingMotion.get(bird.id) ?? this.seedRoamingMotion(bird.id);
      const phase = this.time * 2.1 + motion.phase;
      // Birds drift with the breeze, then weave across it so a missed covey
      // becomes a moving second chance rather than a static collectible.
      const drift = motion.speed + Math.sin(phase) * 4;
      const weave = Math.sin(this.time * 5.2 + motion.phase * 1.7) * 7;
      return {
        ...bird,
        x: clamp(bird.x + (wind.x * drift + crosswind.x * weave) * step, 45, WORLD_WIDTH - 45),
        y: clamp(bird.y + (wind.y * drift + crosswind.y * weave) * step, 45, WORLD_HEIGHT - 45),
        ttl: bird.ttl - step,
      };
    }).filter(bird => bird.ttl > 0);
    this.roamingBirds = updated;
    const alive = new Set(updated.map(bird => bird.id));
    for (const id of this.roamingMotion.keys()) if (!alive.has(id)) this.roamingMotion.delete(id);
    if (this.activeRoaming) {
      this.activeRoaming = this.roamingBirds.find(bird => bird.id === this.activeRoaming?.id) ?? null;
      if (!this.activeRoaming) this.activePatch = null;
    }
  }

  private updateRoamingSearch(step: number): void {
    const bird = this.activeRoaming;
    if (!bird) return;
    moveToward(this.dog, bird, step * (145 + this.trust * 0.4));
    if (distanceBetween(this.dog, bird) <= 18) {
      this.dogState = 'pointing';
      this.message = `${this.save.dogName} has relocated a bird that escaped. Move close to recover it.`;
    } else this.dogState = 'searching';
  }

  private refreshScent(): void {
    const source = this.currentClue ?? this.activePatch ?? this.nearestCastablePatch();
    if (!source) { this.scentClue = null; return; }
    this.scentClue = calculateScentSignal(source, this.player, this.windVector, source.id, this.windDirection);
  }

  private resolveFalseTrail(patch: AdventurePatch, clue: CoverClue): void {
    patch.outcomeKnown = true;
    patch.completed = true;
    patch.state = 'false-trail';
    patch.clueReady = false;
    this.activePatch = null;
    this.commandMode = 'heel';
    this.dogState = 'following';
    this.points += 12;
    this.pendingXp += 5;
    this.message = `${clue.text} The trail fades out. Good fieldcraft—there was no covey here.`;
  }

  private spawnRoaming(patch: AdventurePatch, number: number): void {
    const direction = normalize(this.windVector);
    for (let index = 0; index < number; index++) {
      const drift = 90 + this.rng() * 90;
      const id = `${patch.id}-roaming-${this.time.toFixed(2)}-${index}`;
      this.roamingMotion.set(id, { phase: this.rng() * Math.PI * 2, speed: 17 + this.rng() * 9 });
      this.roamingBirds.push({
        id,
        species: patch.species,
        x: clamp(patch.x + direction.x * drift + (this.rng() - 0.5) * 80, 45, WORLD_WIDTH - 45),
        y: clamp(patch.y + direction.y * drift + (this.rng() - 0.5) * 80, 45, WORLD_HEIGHT - 45),
        sourcePatchId: patch.id,
        ttl: 190,
      });
    }
  }

  private seedRoamingMotion(id: string): { phase: number; speed: number } {
    // This fallback keeps manually supplied/replayed roaming birds moving in
    // a stable way without requiring the public save shape to carry motion.
    let hash = 0;
    for (let index = 0; index < id.length; index++) hash = (hash * 31 + id.charCodeAt(index)) | 0;
    const phase = ((hash >>> 0) % 6283) / 1000;
    const speed = 17 + ((hash >>> 8) % 900) / 100;
    const motion = { phase, speed };
    this.roamingMotion.set(id, motion);
    return motion;
  }

  private nearestCastablePatch(): AdventurePatch | null {
    const candidates = this.patches.filter(patch => !patch.completed && distanceBetween(this.player, patch) <= this.castRange());
    candidates.sort((a, b) => {
      const aSignal = calculateScentSignal(a, this.player, this.windVector, a.id, this.windDirection).strength;
      const bSignal = calculateScentSignal(b, this.player, this.windVector, b.id, this.windDirection).strength;
      return (distanceBetween(this.player, a) - aSignal * 70) - (distanceBetween(this.player, b) - bSignal * 70);
    });
    return candidates[0] ?? null;
  }

  private nearestRoamingBird(): RoamingBird | null {
    return this.roamingBirds
      .filter(bird => distanceBetween(this.player, bird) <= this.castRange())
      .sort((a, b) => distanceBetween(this.player, a) - distanceBetween(this.player, b))[0] ?? null;
  }

  private castRange(): number {
    return 155 + dogSearchRadius(this.save.xp) * 0.7 + Math.max(0, this.trust - 30) * 0.45;
  }

  private followPosition(): Vec {
    return { x: Math.max(24, Math.min(WORLD_WIDTH - 24, this.player.x + 35)), y: Math.max(24, Math.min(WORLD_HEIGHT - 24, this.player.y - 18)) };
  }

  private nearbyUndiscoveredLandmark() {
    return LANDMARKS.find(place => place.id !== 'camp' && !this.discovered.includes(place.id) && distanceBetween(this.player, place) <= 80);
  }

  private remember(id: string): void {
    if (!this.save.journal.includes(id)) this.save.journal.push(id);
  }

  private remainingHint(): string {
    const remaining = this.patches.filter(patch => !patch.completed).length;
    return remaining > 0 ? `${remaining} more ${remaining === 1 ? 'cover' : 'covers'} to explore.` : 'All three covers explored. Return to camp when you’re ready.';
  }
}

function moveToward(actor: Vec, destination: Vec, amount: number): void {
  const length = distanceBetween(actor, destination);
  if (length <= amount || length < 0.01) { actor.x = destination.x; actor.y = destination.y; return; }
  actor.x += (destination.x - actor.x) / length * amount;
  actor.y += (destination.y - actor.y) / length * amount;
}
