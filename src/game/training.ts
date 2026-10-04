import { getBreed } from './breeds';
import { awardDogXp, awaitsFirstPoint, isRetired, type Career, type KennelDog, type StorageLike } from './career';
import { developDog, DOG_SKILLS, readDevelopment, type DogDevelopment, type DogSkill } from './dogDevelopment';
import type { AreaConfig } from './areas';
import type { Bird } from './birds';
import type { Dog } from './dog';
import type { Rect } from './field';
import type { HuntSimulationEvent } from './huntSimulation';
import type { SeasonDate } from './season';
import type { HuntState } from './state';
import type { Vec2 } from './types';
import { dist, mulberry32 } from './math';
import { PROPERTY_PX_TO_M } from './worldUnits';
import type { WindStrength } from './wind';

export const TRAINING_DRILLS = {
  'planted-birds': { name: 'Planted birds', description: 'Find a planted pigeon, hold your point, and walk in quietly.', skills: ['scent', 'steadiness'] },
  'marked-retrieve': { name: 'Marked retrieve', description: 'Throw a bumper, keep the dog steady, then send it to bring the bumper to hand.', skills: ['retrieving', 'steadiness'] },
  'hunt-dead': { name: 'Hunt dead', description: 'A bumper is hidden in cover. Read the wind and send the dog to hunt dead.', skills: ['scent', 'retrieving'] },
  quartering: { name: 'Quartering course', description: 'Cast the dog through each marked piece of cover without skipping ground.', skills: ['handling', 'scent'] },
  whoa: { name: 'Whoa and release', description: 'Stop the dog, walk away, and keep it standing through a pigeon distraction.', skills: ['steadiness', 'handling'] },
  recall: { name: 'Recall to heel', description: 'Let the dog work out, whistle it to heel, then send it hunting again.', skills: ['handling'] },
  honoring: { name: 'Honor a point', description: 'A finished mentor has a pigeon on point. Your dog should back without stealing.', skills: ['steadiness', 'handling'] },
  relocation: { name: 'Runner relocation', description: 'A planted rooster slips forward. Send the dog to establish a fresh point.', skills: ['scent', 'steadiness'] },
  conditioning: { name: 'Conditioning circuit', description: 'Work the marked route together, take a short rest at heel, and finish with energy.', skills: ['conditioning', 'handling'] },
  'field-trial': { name: 'Mixed field trial', description: 'Two planted birds, a marked retrieve, and a hidden bumper in one scored course.', skills: ['scent', 'steadiness', 'retrieving', 'handling'] },
} as const satisfies Record<string, { name: string; description: string; skills: readonly DogSkill[] }>;
export type TrainingDrill = keyof typeof TRAINING_DRILLS;
export type TrainingDifficulty = 'foundation' | 'field' | 'advanced';
export type TrainingCover = 'light' | 'heavy';
export interface TrainingConfig {
  drill: TrainingDrill; mode: 'career' | 'quick'; difficulty: TrainingDifficulty;
  cover: TrainingCover; wind: WindStrength; seed: number;
}

export function parseTraining(search: string): TrainingConfig | null {
  const p = new URLSearchParams(search), drill = p.get('training');
  if (!drill || !Object.hasOwn(TRAINING_DRILLS, drill)) return null;
  const seed = Number(p.get('seed') ?? 9107);
  return { drill: drill as TrainingDrill, mode: p.get('play') === 'career' ? 'career' : 'quick',
    difficulty: p.get('trainingDifficulty') === 'advanced' ? 'advanced' : p.get('trainingDifficulty') === 'field' ? 'field' : 'foundation',
    cover: p.get('trainingCover') === 'heavy' ? 'heavy' : 'light',
    wind: p.get('wind') === 'strong' ? 'strong' : p.get('wind') === 'calm' ? 'calm' : 'breezy',
    seed: Number.isSafeInteger(seed) && seed >= 0 && seed <= 0xffffffff ? seed : 9107 };
}

export const TRAINING_WEEKLY_SKILL_XP = 16;
export const TRAINING_WEEKLY_DOG_XP = 8;
export const TRAINING_RECORD_KEY = 'uplandin.training.records.v1';
export interface TrainingRoundResult { drill: TrainingDrill; score: number; seconds: number; completed: boolean; note: string }
export interface TrainingResult {
  sessionId: string; config: TrainingConfig; rounds: TrainingRoundResult[];
  score: number; medal: 'Gold' | 'Silver' | 'Bronze' | 'Practice'; seconds: number;
  completed: boolean; skillGains: Partial<DogDevelopment>; dogXp: number;
}
export interface TrainingAward {
  career: Career; dogId: string; gained: DogDevelopment; dogXp: number; newLevel: number;
  remaining: number; message: string;
}

export function trainingBudget(dog: KennelDog, date: SeasonDate): { skillXp: number; dogXp: number } {
  const old = dog.training;
  return old?.season === date.season && old.week === date.week
    ? { skillXp: Math.max(0, TRAINING_WEEKLY_SKILL_XP - old.skillXp), dogXp: Math.max(0, TRAINING_WEEKLY_DOG_XP - old.dogXp) }
    : { skillXp: TRAINING_WEEKLY_SKILL_XP, dogXp: TRAINING_WEEKLY_DOG_XP };
}

/** Training settles separately from hunts: no bag, hunter unlock, calendar,
 * lifetime hunt count or first-wild-point milestone is manufactured here. */
export function settleTraining(career: Career, dogId: string, result: TrainingResult, started: SeasonDate): TrainingAward {
  const dog = career.kennel.find(d => d.id === dogId), empty = readDevelopment(null);
  const unchanged = (message: string): TrainingAward => ({ career, dogId, gained: empty, dogXp: 0, newLevel: dog?.level ?? 1, remaining: dog ? trainingBudget(dog, career.date).skillXp : 0, message });
  if (result.config.mode !== 'career' || !dog || isRetired(dog)) return unchanged('Practice complete. No career reward is available.');
  if (career.date.season !== started.season || career.date.week !== started.week) return unchanged('Your career calendar changed during this session. Practice was recorded without a reward.');
  const previous = dog.training?.season === started.season && dog.training.week === started.week ? dog.training : undefined;
  if (previous?.sessionIds?.includes(result.sessionId)) return unchanged('This session has already been credited.');
  const budget = trainingBudget(dog, started), rate = getBreed(dog.breedId).xpRate;
  const requested = DOG_SKILLS.reduce((sum, key) => sum + Math.max(0, result.skillGains[key] ?? 0) * rate, 0);
  const scale = requested > 0 ? Math.min(1, budget.skillXp / requested) : 0;
  const practice = developDog(readDevelopment(dog.development, dog.level), result.skillGains, rate * scale);
  const credited = DOG_SKILLS.reduce((sum, key) => sum + practice.gained[key], 0);
  const dogXp = Math.min(budget.dogXp, Math.max(0, Math.round(result.dogXp * rate)));
  const developed: Career = { ...career, kennel: career.kennel.map(d => d.id === dogId ? {
    ...d, development: practice.development,
    ...(awaitsFirstPoint(d) && !d.lifetime ? { lifetime: { hunts: 0, points: 0, retrieves: 0 } } : {}),
    training: { ...started, skillXp: (previous?.skillXp ?? 0) + credited, dogXp: (previous?.dogXp ?? 0) + dogXp,
      sessions: (previous?.sessions ?? 0) + 1, sessionIds: [...(previous?.sessionIds ?? []), result.sessionId] },
  } : d) };
  const award = awardDogXp(developed, dogId, dogXp);
  const remaining = Math.max(0, budget.skillXp - credited);
  return { career: award.career, dogId, gained: practice.gained, dogXp, newLevel: award.newLevel, remaining,
    message: credited > 0 ? 'Skills developed. Your hunting weekend is still available.'
      : remaining === 0 ? 'This week’s training reward is complete. Keep practicing, or hunt to open a new week.' : 'Useful practice. These skills are already at their potential, or this repetition needs more work.' };
}

export interface TrainingStage {
  drill: TrainingDrill; hunter: Vec2; dogs: Vec2[]; heading: number; birds: Bird[];
  patches: Rect[]; markers: Vec2[]; target: Vec2;
}
export interface TrainingSnapshot {
  title: string; instruction: string; round: number; rounds: number;
  score: number; elapsed: number; phase: 'working' | 'round-complete' | 'complete';
  action: 'throw' | 'next' | 'send' | null; marker: Vec2 | null; markerLabel: string;
}

/** Seeded drills use the existing property's cover, outside every truck zone. */
export function trainingStage(area: AreaConfig, config: TrainingConfig, round: number): TrainingStage {
  const rng = mulberry32((config.seed + round * 7919) >>> 0);
  const candidates = area.patches.filter(p => area.dropPoints.every(d => dist(d.position, { x: p.x + p.w / 2, y: p.y + p.h / 2 }) > d.safetyRadius + 38));
  const sorted = [...candidates].sort((a, b) => (config.cover === 'heavy' ? b.w * b.h - a.w * a.h : a.w * a.h - b.w * b.h) || a.y - b.y);
  const patch = sorted[round % Math.max(1, Math.min(3, sorted.length))] ?? area.patches[0];
  const target = { x: patch.x + patch.w * (.4 + rng() * .2), y: patch.y + patch.h * (.4 + rng() * .2) };
  const distance = (config.difficulty === 'advanced' ? 36 : config.difficulty === 'field' ? 31 : 26) / PROPERTY_PX_TO_M;
  const heading = -Math.PI / 2;
  const hunter = { x: target.x, y: target.y + distance };
  const drills: TrainingDrill[] = config.drill === 'field-trial' ? ['planted-birds', 'planted-birds', 'marked-retrieve', 'hunt-dead'] : [config.drill];
  const drill = drills[round % drills.length];
  const live = ['planted-birds', 'whoa', 'honoring', 'relocation'].includes(drill);
  const retrieve = drill === 'hunt-dead' || drill === 'marked-retrieve';
  const bird: Bird = { id: 10000 + round, coveyId: 10000 + round, speciesId: drill === 'relocation' ? 'ringneck' : 'training-pigeon',
    pos: { ...target }, state: live ? 'hidden' : 'downed', runs: false, runEnergy: 0, restingMs: 0,
    nerveMs: config.difficulty === 'advanced' ? 22000 : 60000, ...(drill === 'relocation' ? { sex: 'rooster' as const } : {}),
    ...(retrieve ? { trainingObject: 'bumper' as const, marked: drill === 'marked-retrieve', fallPos: { ...target }, fallPending: drill === 'marked-retrieve' } : {}) };
  const dogs = [{ x: hunter.x - 2, y: hunter.y - 5 }];
  if (drill === 'honoring') {
    dogs[0] = { x: target.x - 12, y: target.y + 20 };
    dogs.push({ x: target.x, y: target.y + 12 });
  }
  const markers = drill === 'conditioning' || drill === 'quartering'
    ? [{ x: target.x - 12, y: hunter.y - 12 }, { x: target.x + 12, y: hunter.y - 26 }, { x: target.x, y: hunter.y - 40 }]
    : [];
  const patches = markers.length ? markers.map(p => ({ x: p.x - 7, y: p.y - 7, w: 14, h: 14 })) : [{ ...patch }];
  return { drill, hunter, dogs, heading, birds: live || retrieve ? [bird] : [], patches, markers, target };
}

/** Drill orchestration observes real simulation outcomes. It never declares
 * a dog pointed, fetched, or delivered solely because an animation played. */
export class TrainingSession {
  readonly results: TrainingRoundResult[] = [];
  stage: TrainingStage;
  readonly roundCount: number;
  private roundMs = 0;
  private totalMs = 0;
  private finished = false;
  private roundDone = false;
  private heldMs = 0;
  private restMs = 0;
  private points = 0;
  private commands = 0;
  private mistakes = 0;
  private gate = 0;
  private relocated = false;
  private distraction = false;
  private thrownAt: number | null = null;
  private sent = false;
  private wasRecalled = false;
  private wasReleased = false;
  private cleanFlush = false;
  private flushAt: number | null = null;
  private lastInstruction = '';
  constructor(readonly config: TrainingConfig, private area: AreaConfig, readonly sessionId: string) {
    this.roundCount = config.drill === 'field-trial' ? 4 : 3;
    this.stage = trainingStage(area, config, 0);
  }
  get complete(): boolean { return this.finished; }
  get waitingRetrieve(): boolean { return this.stage.drill === 'marked-retrieve' && !this.sent; }
  get throwProgress(): number | null { return this.thrownAt === null ? null : Math.min(1, (this.roundMs - this.thrownAt) / 1400); }
  get currentMarker(): Vec2 | null { return this.stage.markers[this.gate] ?? null; }
  next(): boolean {
    if (!this.roundDone || this.finished) return false;
    if (this.results.length >= this.roundCount) { this.finished = true; return false; }
    this.stage = trainingStage(this.area, this.config, this.results.length);
    this.roundMs = this.heldMs = this.restMs = this.points = this.commands = this.mistakes = this.gate = 0;
    this.relocated = this.distraction = this.sent = this.wasRecalled = this.wasReleased = this.cleanFlush = false;
    this.thrownAt = this.flushAt = null; this.roundDone = false; this.lastInstruction = '';
    return true;
  }
  throwBumper(dog: Dog, birds: Bird[], rng: () => number): boolean {
    if (this.roundDone || this.stage.drill !== 'marked-retrieve' || this.thrownAt !== null) return false;
    const bird = birds[0]; if (!bird) return false;
    this.thrownAt = this.roundMs;
    const broke = dog.onFlush(rng, bird.pos, [bird.id]);
    bird.marked = !broke;

    return true;
  }
  /** The simulation supplies an ordinary flush for the distraction. */
  needsDistraction(): boolean {
    return !this.roundDone && this.stage.drill === 'whoa' && !this.distraction && this.heldMs >= 3000;
  }
  update(dtMs: number, hunt: HuntState, dogs: readonly Dog[], events: readonly HuntSimulationEvent[]): void {
    if (this.finished || this.roundDone) return;
    this.roundMs += dtMs; this.totalMs += dtMs;
    const dog = dogs[0], bird = hunt.birds[0], drill = this.stage.drill;
    if (!dog) return;
    for (const event of events) {
      if (event.type === 'command' && ((drill === 'marked-retrieve' && event.kind === 'release' && event.responses[0] === 'busy' && dog.state === 'quartering') || ['released', 'relocating', 'cast', 'hunting-dead', 'stopped', 'steadied'].includes(event.responses[0]))) {
        this.commands++;
        if (event.kind === 'release') {
          this.wasReleased = true;
          if (drill === 'marked-retrieve' && this.thrownAt !== null) {
            this.sent = true; if ((this.throwProgress ?? 0) < 1) this.mistakes++;
          }
        }
      }
      if (event.type === 'dog-pointed' && event.dogIndex === 0) this.points++;
      if (event.type === 'dog-note' && event.dogIndex === 0 && ['break', 'bump', 'creep'].includes(event.kind)) this.mistakes++;
      if (event.type === 'covey-flushed') {
        this.flushAt = this.roundMs;
        this.cleanFlush = event.pointCredit && event.pointingSlot === 0;
        if (drill === 'whoa') this.distraction = true;
      }
    }
    if (drill === 'marked-retrieve' && bird && this.throwProgress === 1) bird.fallPending = false;
    if (dog.state === 'heel') { this.restMs += dtMs; if (this.roundMs > 2500) this.wasRecalled = true; }
    if (dog.state === 'pointing' || dog.state === 'honoring' || dog.state === 'whoa') this.heldMs += dtMs;
    if (drill === 'relocation' && this.points === 1 && !this.relocated && this.heldMs >= 2500 && bird?.state === 'hidden') {
      bird.pos.y -= 9 / PROPERTY_PX_TO_M; this.relocated = true;
    }
    if (drill === 'quartering' && this.currentMarker && dist(dog.pos, this.currentMarker) < 8 && dist(hunt.hunterPos, dog.pos) < 28 && this.commands > this.gate) this.gate++;
    if (drill === 'conditioning' && this.currentMarker && dist(hunt.hunterPos, this.currentMarker) < 6 && dist(hunt.hunterPos, dog.pos) < 28) this.gate++;
    if (drill === 'planted-birds' && this.flushAt !== null && this.roundMs - this.flushAt >= 3000) this.finishRound(this.cleanFlush && this.heldMs >= 1000,
      this.cleanFlush && this.heldMs >= 1000 ? 'Bird found and produced. Keep the dog steady through the rise.'
        : this.cleanFlush ? 'The point was brief. Let the dog hold for a moment before walking in.' : 'The bird flushed before a clean point. Work the wind and approach quietly.');
    if (drill === 'relocation' && this.flushAt !== null && this.roundMs - this.flushAt >= 3000) this.finishRound(this.cleanFlush && this.points >= 2, this.points >= 2 ? 'Runner relocated to a fresh point.' : 'Send Hunt on after the bird moves, then work the fresh point.');
    if ((drill === 'marked-retrieve' || drill === 'hunt-dead') && bird?.state === 'retrieved') this.finishRound(true, this.mistakes ? 'Bumper delivered. Steady the dog and let the throw land before sending.' : 'Bumper brought cleanly to hand.');
    const manualBack = drill === 'honoring' && dog.state === 'whoa' && dogs[1]?.state === 'pointing'
      && dist(dog.pos, dogs[1].pos) < 26 && dist(dog.pos, this.stage.target) > 8;
    if (drill === 'honoring' && (dog.state === 'honoring' || manualBack) && this.heldMs >= 5000) this.finishRound(true, manualBack ? 'Stopped on Whoa and held a respectful back behind the mentor.' : 'Backed the mentor and held its position.');
    if (drill === 'honoring' && dog.state === 'pointing') this.finishRound(false, 'Stole the mentor’s point. Whoa can steady the dog on the next repetition.');
    if (drill === 'whoa' && this.distraction && this.roundMs - (this.flushAt ?? this.roundMs) > 2500 && this.wasReleased) this.finishRound(this.heldMs >= 3000 && this.mistakes === 0 && dist(hunt.hunterPos, this.stage.hunter) > 4, 'Hold the dog while you move away, stand through the pigeon, then release.');
    if (drill === 'recall' && this.wasRecalled && this.restMs >= 2000 && this.wasReleased && dog.state === 'quartering') this.finishRound(true, 'Came to heel, waited, and returned to work.');
    if (drill === 'quartering' && this.gate >= this.stage.markers.length) this.finishRound(true, 'Every marked cover patch was worked with a directed cast.');
    if (drill === 'conditioning' && this.gate >= this.stage.markers.length && this.restMs >= 5000 && this.roundMs >= 18000) this.finishRound(true, 'Worked the route and recovered at heel.');
    if (this.roundMs >= (drill === 'conditioning' ? 150000 : 100000)) this.finishRound(false, 'Time for a fresh repetition. Read the instruction and work closer to the dog.');
  }
  private finishRound(completed: boolean, note: string): void {
    const progress = Math.min(55, this.points * 15 + Math.min(15, this.commands * 3) + this.gate * 12 + Math.min(15, this.heldMs / 500));
    const clean = completed ? Math.max(60, 100 - this.mistakes * 15) : progress;
    // Speed is a small bonus after clean work; puppies can learn on partial attempts.
    const score = Math.round(Math.min(100, clean - (completed ? Math.min(8, Math.max(0, this.roundMs / 1000 - 40) / 10) : 0)));
    this.results.push({ drill: this.stage.drill, score, seconds: Math.round(this.roundMs / 1000), completed, note });
    this.roundDone = true;
    if (this.results.length >= this.roundCount) this.finished = true;
  }
  end(): void {
    if (!this.finished && !this.roundDone && this.roundMs > 0) this.finishRound(false, 'Session ended during this repetition. Completed work still counts.');
    this.finished = true;
  }
  result(): TrainingResult {
    const score = Math.round(this.results.reduce((sum, r) => sum + r.score, 0) / this.roundCount);
    const completed = this.results.length === this.roundCount && this.results.every(r => r.completed);
    const skillGains: Partial<DogDevelopment> = {};
    for (const round of this.results) {
      const skills = TRAINING_DRILLS[round.drill].skills;
      const quality = round.score / 100;
      const challenge = this.config.difficulty === 'advanced' ? 1.3 : this.config.difficulty === 'field' ? 1.15 : 1;
      for (const skill of skills) skillGains[skill] = (skillGains[skill] ?? 0) + quality * challenge * 4 / skills.length;
    }
    return { sessionId: this.sessionId, config: this.config, rounds: [...this.results], score,
      medal: completed && score >= 90 ? 'Gold' : completed && score >= 75 ? 'Silver' : completed && score >= 60 ? 'Bronze' : 'Practice',
      seconds: Math.round(this.totalMs / 1000), completed, skillGains, dogXp: Math.round(this.results.reduce((sum, r) => sum + r.score / 100 * 2, 0)) };
  }
  snapshot(): TrainingSnapshot {
    const drill = this.stage.drill, marker = this.currentMarker;
    let instruction: string = TRAINING_DRILLS[drill].description;
    if (drill === 'marked-retrieve') instruction = this.thrownAt === null ? 'Whoa the dog, then throw the bumper (E).' : (this.throwProgress ?? 0) < 1 ? 'Watch the throw. Keep the dog steady until it lands.' : !this.sent ? 'Send the dog (X). Stay still for delivery to hand.' : 'Let the dog find, pick up, and deliver the bumper. Stay still at handoff.';
    if (drill === 'relocation' && this.relocated) instruction = this.points >= 2 ? 'Fresh point established. Whoa (Z), then walk in quietly for the flush.' : 'The rooster moved forward. Hunt on (X) to relocate; hold the new point and walk in.';
    if (drill === 'whoa') instruction = !this.distraction ? 'Whoa (Z), then walk several yards away while the dog stands. A pigeon will rise.' : 'Hold through the pigeon distraction, then Hunt on (X).';
    if (drill === 'recall') instruction = !this.wasRecalled ? 'Walk out with the dog, then whistle (Q) to bring it to heel.' : 'Wait two seconds at heel, then Hunt on (X) to resume work.';
    if (marker) instruction = drill === 'quartering' ? `Cover ${this.gate + 1} of ${this.stage.markers.length}: face the marker and cast (C). Follow the dog.` : `Gate ${this.gate + 1} of ${this.stage.markers.length}: walk through with your dog. Whistle for a five-second rest at heel during the route.`;
    if (drill === 'conditioning' && !marker && this.restMs < 5000) instruction = 'Route worked. Whistle (Q) and let the dog rest five seconds at heel.';
    if (this.roundDone) instruction = this.results.at(-1)?.note ?? instruction;
    this.lastInstruction = instruction;
    return { title: TRAINING_DRILLS[this.config.drill].name, instruction: this.lastInstruction,
      round: Math.min(this.roundCount, this.results.length + (this.roundDone ? 0 : 1)), rounds: this.roundCount,
      score: this.result().score, elapsed: Math.round(this.totalMs / 1000), phase: this.finished ? 'complete' : this.roundDone ? 'round-complete' : 'working',
      action: this.roundDone && !this.finished ? 'next' : drill === 'marked-retrieve' && this.thrownAt === null ? 'throw' : this.waitingRetrieve && this.throwProgress === 1 ? 'send' : null,
      marker: marker ?? (drill === 'hunt-dead' && this.config.difficulty === 'foundation' ? this.stage.target : null), markerLabel: marker ? `Station ${this.gate + 1}` : 'Search cover' };
  }
}

export function trainingRecordId(config: TrainingConfig, breedId: string, level: number): string {
  return [config.drill, config.difficulty, config.cover, config.wind, config.seed, breedId, level].join(':');
}
export interface TrainingRecord { score: number; medal: TrainingResult['medal']; seconds: number; attempts: number }
export function readTrainingRecord(storage: StorageLike | null, id: string): TrainingRecord | null {
  try {
    const saved = JSON.parse(storage?.getItem(TRAINING_RECORD_KEY) ?? '{}')[id] as TrainingRecord | undefined;
    return saved && Number.isFinite(saved.score) && saved.score >= 0 && saved.score <= 100 && Number.isFinite(saved.seconds) && saved.seconds >= 0 && Number.isSafeInteger(saved.attempts) && saved.attempts > 0 && ['Gold', 'Silver', 'Bronze', 'Practice'].includes(saved.medal) ? saved : null;
  } catch { return null; }
}
export function recordTraining(storage: StorageLike | null, id: string, result: TrainingResult): { best: TrainingRecord; improved: boolean } {
  const previous = readTrainingRecord(storage, id);
  const improved = !previous || result.score > previous.score || (result.score === previous.score && result.seconds < previous.seconds);
  const best: TrainingRecord = { ...(improved ? { score: result.score, medal: result.medal, seconds: result.seconds } : previous!), attempts: (previous?.attempts ?? 0) + 1 };
  try { const records = JSON.parse(storage?.getItem(TRAINING_RECORD_KEY) ?? '{}'); storage?.setItem(TRAINING_RECORD_KEY, JSON.stringify({ ...records, [id]: best })); } catch { /* Practice remains playable with unavailable storage. */ }
  return { best, improved };
}
