import { describe, expect, it } from 'vitest';
import { getArea } from '../src/game/areas';
import { getBreed } from '../src/game/breeds';
import { addDogToKennel, advanceCareerWeeks, awaitsFirstPoint, CAREER_KEY, emptyCareer, saveCareer, type StorageLike } from '../src/game/career';
import { developmentForLevel, DOG_SKILLS } from '../src/game/dogDevelopment';
import { Dog, type HandlerCommand } from '../src/game/dog';
import { build3DPreparationHref, createThreeHuntSetup } from '../src/game/gameplayMode';
import { HuntSimulation } from '../src/game/huntSimulation';
import { dist, mulberry32 } from '../src/game/math';
import { createHunt, emptyDogWork } from '../src/game/state';
import { parseTraining, readTrainingRecord, recordTraining, settleTraining, TRAINING_DRILLS, trainingBudget, trainingRecordId, TrainingSession, trainingStage, type TrainingConfig, type TrainingDrill, type TrainingResult } from '../src/game/training';
import { PROPERTY_PX_TO_M } from '../src/game/worldUnits';

const area = getArea('quail-fields');
const config = (drill: TrainingDrill, mode: 'quick' | 'career' = 'quick'): TrainingConfig => ({ drill, mode, difficulty: 'foundation', cover: 'light', wind: 'breezy', seed: 9107 });
function storage(): StorageLike & { data: Record<string, string> } { const data: Record<string, string> = {}; return { data, getItem: key => data[key] ?? null, setItem: (key, value) => { data[key] = value; } }; }
function result(mode: 'career' | 'quick' = 'career', id = 'one'): TrainingResult {
  return { sessionId: id, config: config('planted-birds', mode), score: 100, medal: 'Gold', seconds: 120, completed: true,
    rounds: [], skillGains: { scent: 12, steadiness: 12 }, dogXp: 8 };
}

describe('training rewards and isolation', () => {
  it('limits all drills together per dog and career week, with idempotent settlement', () => {
    const { career, dog } = addDogToKennel(emptyCareer(), 'Sage', 'gsp');
    const first = settleTraining(career, dog.id, result(), career.date);
    expect(DOG_SKILLS.reduce((n, key) => n + first.gained[key], 0)).toBeCloseTo(16);
    expect(first.career.hunts).toBe(0); expect(first.career.hunter).toEqual(career.hunter);
    expect(awaitsFirstPoint(first.career.kennel[0])).toBe(true);
    expect(first.career.date).toEqual(career.date); expect(first.career.kennel[0].firstPoint).toBeUndefined();
    expect(settleTraining(first.career, dog.id, result(), career.date).career).toBe(first.career);
    const repeat = settleTraining(first.career, dog.id, result('career', 'two'), career.date);
    expect(repeat.dogXp).toBe(0); expect(repeat.gained.scent).toBe(0);
    const nextWeek = advanceCareerWeeks(repeat.career, 1);
    expect(trainingBudget(nextWeek.kennel[0], nextWeek.date).skillXp).toBe(16);
    expect(settleTraining(nextWeek, dog.id, result('career', 'three'), nextWeek.date).gained.scent).toBeGreaterThan(0);
  });
  it('rejects career rewards for quick sessions, retired dogs, and stale calendar sessions', () => {
    const { career, dog } = addDogToKennel(emptyCareer(), 'Sage', 'gsp');
    expect(settleTraining(career, dog.id, result('quick'), career.date).career).toBe(career);
    const next = advanceCareerWeeks(career, 1);
    expect(settleTraining(next, dog.id, result(), career.date).career).toBe(next);
    const retired = { ...career, kennel: [{ ...dog, retiredSeason: 1 }] };
    expect(settleTraining(retired, dog.id, result(), career.date).career).toBe(retired);
  });
  it('quick training launches, records, and replay leave the career and ordinary quick setup unchanged', () => {
    const memory = storage(), { career } = addDogToKennel(emptyCareer(), 'Sage', 'gsp'); saveCareer(career, memory);
    const before = memory.data[CAREER_KEY];
    const setup = createThreeHuntSetup('?play=quick&training=honoring&breed=gsp&level=3&seed=9107', () => .5, memory);
    expect(setup.area.id).toBe('quail-fields'); expect(setup.level).toBe(3); expect(setup.brace?.level).toBe(10);
    recordTraining(memory, trainingRecordId(config('honoring'), 'gsp', 3), result('quick'));
    expect(memory.data[CAREER_KEY]).toBe(before); expect(memory.data['uplandin.quick.v1']).toBeUndefined();
  });
  it('compares personal bests only within matching courses, conditions, and dog presets', () => {
    const memory = storage(), key = trainingRecordId(config('planted-birds'), 'gsp', 3);
    recordTraining(memory, key, { ...result('quick'), score: 80, medal: 'Silver' });
    recordTraining(memory, key, { ...result('quick'), score: 60, seconds: 50 });
    expect(readTrainingRecord(memory, key)).toMatchObject({ score: 80, seconds: 120, attempts: 2 });
    expect(readTrainingRecord(memory, trainingRecordId(config('planted-birds'), 'gsp', 10))).toBeNull();
  });
  it('returns to the same training setup without altering ordinary hunt choices', () => {
    const href = build3DPreparationHref('?play=quick&training=hunt-dead&trainingDifficulty=advanced&trainingCover=heavy&wind=calm&seed=12&breed=griffon&level=7&challenge=loaded', area.id, area.dropPoints[0].id);
    expect(href).toContain('training3d.html?');
    const p = new URLSearchParams(href.split('?')[1]);
    expect(Object.fromEntries(p)).toEqual({ training: 'hunt-dead', trainingDifficulty: 'advanced', trainingCover: 'heavy', wind: 'calm', seed: '12', breed: 'griffon', level: '7', mode: 'quick' });
  });
  it('normalizes malformed choices and gives every drill seeded, safe property locations', () => {
    expect(parseTraining('training=unknown')).toBeNull();
    expect(parseTraining('training=whoa&seed=NaN&wind=bad')).toMatchObject({ seed: 9107, wind: 'breezy' });
    for (const drill of Object.keys(TRAINING_DRILLS) as TrainingDrill[]) for (const cover of ['light', 'heavy'] as const) for (let round = 0; round < 4; round++) {
      const stage = trainingStage(area, { ...config(drill), cover }, round);
      expect(stage).toEqual(trainingStage(area, { ...config(drill), cover }, round));
      for (const point of [stage.hunter, ...stage.dogs, ...stage.markers, ...stage.birds.map(b => b.pos)]) {
        expect(point.x).toBeGreaterThan(area.world.x); expect(point.x).toBeLessThan(area.world.x + area.world.w);
        expect(point.y).toBeGreaterThan(area.world.y); expect(point.y).toBeLessThan(area.world.y + area.world.h);
      }
      for (const bird of stage.birds) for (const drop of area.dropPoints) expect(dist(bird.pos, drop.position)).toBeGreaterThan(drop.safetyRadius);
    }
  });
});

/** Exercise complete lessons through normal commands and the real shared dog
 * AI. There are no forced points, pickups, deliveries or success events. */
function play(drill: TrainingDrill, level = 10, conditions: Partial<TrainingConfig> = {}): TrainingSession {
  const session = new TrainingSession({ ...config(drill), ...conditions }, area, `test-${drill}`);
  const rng = mulberry32(77);
  let loops = 0;
  while (!session.complete && loops++ < 5) {
    const stage = session.stage, hunt = createHunt(area, rng), breed = getBreed('gsp');
    hunt.birds = stage.birds; hunt.hunterPos = { ...stage.hunter }; hunt.wind = Math.PI / 2; hunt.windStrength = session.config.wind; hunt.condition = 'frost'; hunt.preserve = true;
    const dogs = stage.dogs.map((pos, i) => new Dog({ ...pos }, { breed: i ? getBreed('english-setter') : breed, level: i ? 10 : level, development: developmentForLevel(i ? 10 : level) }, rng, area.world));
    dogs.forEach(dog => { dog.heading = stage.heading; });
    if (stage.drill === 'marked-retrieve') dogs[0].state = 'whoa';
    if (stage.drill === 'hunt-dead') dogs[0].state = 'heel';
    if (stage.drill === 'honoring') { dogs[1].state = 'pointing'; dogs[1].pointedBirdId = hunt.birds[0].id; dogs[1].steadied = true; }
    hunt.dogsPos = dogs.map(d => d.pos); hunt.dogWork = dogs.map(() => emptyDogWork());
    const sim = new HuntSimulation({ hunt, dogs, area, continuousEncounter: true, rng });
    let castAt = -1, recallAt = -1, released = false, stopped = false;
    for (let ms = 0; ms < 155000 && session.snapshot().phase === 'working'; ms += 50) {
      const commands: HandlerCommand[] = [], snapshot = session.snapshot(), dog = dogs[0];
      const move = (target: { x: number; y: number }) => { const d = dist(hunt.hunterPos, target); if (d > .1) { const step = Math.min(d, .09); hunt.hunterPos = { x: hunt.hunterPos.x + (target.x - hunt.hunterPos.x) / d * step, y: hunt.hunterPos.y + (target.y - hunt.hunterPos.y) / d * step }; } };
      let recall = false;
      if (stage.drill === 'marked-retrieve') { if (snapshot.action === 'throw') session.throwBumper(dog, hunt.birds, rng); if (snapshot.action === 'send') commands.push({ kind: 'release' }); }
      if (stage.drill === 'hunt-dead' && ms === 0) commands.push({ kind: 'dead', target: { ...stage.target } });
      if (stage.drill === 'planted-birds' || stage.drill === 'relocation') {
        if (dog.state === 'pointing') {
          if (!dog.steadied) commands.push({ kind: 'whoa' });
          if (stage.drill === 'relocation' && !released && session.snapshot().instruction.includes('moved')) { commands.push({ kind: 'release' }); released = true; }
          else if (ms > 5000 && (stage.drill !== 'relocation' || released)) move(hunt.birds[0].pos);
        } else if (ms % 12000 === 0) commands.push({ kind: 'cast', target: { ...stage.target } });
      }
      if (stage.drill === 'whoa') {
        if (!stopped) { commands.push({ kind: 'whoa' }); stopped = true; }
        move({ x: stage.hunter.x + 7, y: stage.hunter.y });
        if (snapshot.instruction.includes('distraction, then') && ms > 6500 && !released) { commands.push({ kind: 'release' }); released = true; }
      }
      if (stage.drill === 'recall') {
        if (ms === 3500) { recall = true; recallAt = ms; }
        if (dog.state === 'heel' && ms > recallAt + 5000 && !released) { commands.push({ kind: 'release' }); released = true; }
      }
      if (stage.drill === 'quartering' && snapshot.marker) {
        const marker = stage.markers.indexOf(snapshot.marker);
        if (castAt !== marker) { commands.push({ kind: 'cast', target: { ...snapshot.marker } }); castAt = marker; }
        move(snapshot.marker);
      }
      if (stage.drill === 'conditioning') {
        if (ms < 2500 || ms > 11000) { if (snapshot.marker) move(snapshot.marker); }
        if (ms === 2500) recall = true;
        if (ms > 10500 && dog.state === 'heel' && !released) { commands.push({ kind: 'release' }); released = true; }
      }
      const events = sim.update(50, { hunterPos: { ...hunt.hunterPos }, recall, commands, workPatches: stage.patches, practice: true, waitForRetrieve: session.waitingRetrieve,
        dogMotion: dogs.map(() => ({ movementScale: .05, effortScale: .05, rangeRadius: 34 / PROPERTY_PX_TO_M, workAnchor: stage.target, retrieveTurnRate: 5 })) });
      if (session.needsDistraction()) { const event = sim.flushBird(hunt.birds[0].id, 'startle', null); if (event) events.push(event); }
      session.update(50, hunt, dogs, events);
    }
    if (!session.complete) session.next();
  }
  return session;
}

describe('playable training lessons', () => {
  it('lets a puppy hold a commanded back behind the mentor', () => {
    const session = new TrainingSession(config('honoring'), area, 'manual-back'), stage = session.stage, rng = () => .99;
    const hunt = createHunt(area, rng); hunt.birds = stage.birds; hunt.hunterPos = { ...stage.hunter };
    const dogs = stage.dogs.map((pos, i) => new Dog({ ...pos }, { breed: getBreed(i ? 'english-setter' : 'gsp'), level: i ? 10 : 1 }, rng, area.world));
    dogs[1].state = 'pointing'; dogs[1].pointedBirdId = hunt.birds[0].id; dogs[1].steadied = true;
    hunt.dogsPos = dogs.map(d => d.pos); hunt.dogWork = dogs.map(() => emptyDogWork());
    const sim = new HuntSimulation({ hunt, dogs, area, continuousEncounter: true, rng });
    for (let ms = 0; ms < 5500; ms += 50) {
      const events = sim.update(50, { hunterPos: stage.hunter, practice: true, commands: ms === 0 ? [{ kind: 'whoa' }] : [] });
      session.update(50, hunt, dogs, events);
    }
    expect(session.result().rounds[0]).toMatchObject({ completed: true, note: 'Stopped on Whoa and held a respectful back behind the mentor.' });
  });
  it('keeps a steady dog marking after the bumper lands until a delayed send', () => {
    const session = new TrainingSession(config('marked-retrieve'), area, 'delayed-send'), stage = session.stage, rng = () => .99;
    const hunt = createHunt(area, rng); hunt.birds = stage.birds; hunt.hunterPos = { ...stage.hunter };
    const dog = new Dog({ ...stage.dogs[0] }, { breed: getBreed('gsp'), level: 10 }, rng, area.world);
    dog.state = 'whoa'; hunt.dogsPos = [dog.pos]; hunt.dogWork = [emptyDogWork()];
    const sim = new HuntSimulation({ hunt, dogs: [dog], area, continuousEncounter: true, rng });
    expect(session.throwBumper(dog, hunt.birds, rng)).toBe(true);
    for (let ms = 0; ms < 12000; ms += 50) {
      const events = sim.update(50, { hunterPos: stage.hunter, practice: true, waitForRetrieve: session.waitingRetrieve });
      session.update(50, hunt, [dog], events);
    }
    expect(dog.state).toBe('marking'); expect(hunt.birds[0].fallPending).toBe(false);
    const events = sim.update(50, { hunterPos: stage.hunter, commands: [{ kind: 'release' }], practice: true, waitForRetrieve: true });
    session.update(50, hunt, [dog], events);
    expect(session.waitingRetrieve).toBe(false);
  });
  for (const drill of Object.keys(TRAINING_DRILLS) as TrainingDrill[]) it(`${drill} can complete with real dog work`, () => {
    const session = play(drill);
    expect(session.complete).toBe(true);
    expect(session.result().rounds, JSON.stringify(session.result().rounds)).toHaveLength(session.roundCount);
    expect(session.result().rounds.every(r => r.completed), JSON.stringify(session.result().rounds)).toBe(true);
    expect(session.result().score).toBeGreaterThanOrEqual(75);
  });
  for (const drill of ['marked-retrieve', 'hunt-dead', 'recall', 'quartering', 'conditioning'] as TrainingDrill[]) it(`a puppy can develop through ${drill}`, () => {
    const result = play(drill, 1).result();
    expect(result.completed, JSON.stringify(result.rounds)).toBe(true);
    expect(Object.values(result.skillGains).some(gain => gain! > 0)).toBe(true);
  });
  for (const drill of ['marked-retrieve', 'hunt-dead', 'field-trial'] as TrainingDrill[]) it(`advanced ${drill} is reachable in heavy cover`, () => {
    const result = play(drill, 10, { difficulty: 'advanced', cover: 'heavy', wind: 'strong', seed: 2201 }).result();
    expect(result.completed, JSON.stringify(result.rounds)).toBe(true);
  });
  it('does not award a medal or full session credit to an early exit', () => {
    const session = new TrainingSession(config('field-trial'), area, 'abandoned'); session.end();
    expect(session.result()).toMatchObject({ score: 0, medal: 'Practice', dogXp: 0, completed: false });
  });
});
