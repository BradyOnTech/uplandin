import { audioReady, playActionClick, playBirdCall, playBirdFlock, playDogBreath, playDogCollar, playFootstep, playHullDrop, playReportSting,
  playShot, playWhistle, prepareBirdSounds, prepareDogSounds, prepareGunSounds, prepareMusic, prepareStepSounds, startFieldAmbience,
  startMenuTheme, type BirdPlacement, type FieldAmbience, type MusicPlayer } from './audio';
import { STEP_SURFACES } from './three/sound/stepSounds';
import type { TimeOfDay } from './three/palette';
import { dogCollarGain } from './three/dogCollarAudio';
import type { WhistleCall } from './three/sound/dogSounds';
import { mulberry32 } from './game/math';
import { AMBIENT_BIRD_GAIN, GROUND_BIRDS, nextGroundBird, QUARRY_CALL_GAIN, QUARRY_VOICES, type GroundBird } from './three/sound/fieldBirds';
import type { BirdCallId } from './three/sound/birdCalls';
import { getArea, OFFERED_AREA_IDS } from './game/areas';
import { GUNS, type GunConfig } from './game/guns';
import { gunMechanism, shotgunCycleCues, shotgunReloadCues, type ShotgunActionCue, type ShotgunMechanism } from './three/shotgunActionTiming';
import { foleyCueNames, hullSurface, type HullSurface } from './three/sound/gunFoley';
import { RELOAD_OPEN_S, RELOAD_PER_SHELL_S } from './three/subsystems/gun';

/**
 * sounds.html: every synthesized sound, played through the game's own mix
 * (audio.ts), so it can be judged on real speakers without walking up on a
 * point. Sequences keep the visible gun's timing (shotgunActionTiming.ts).
 */

const board = document.getElementById('board')!;
const mechanismOf = (gun: GunConfig): ShotgunMechanism => gunMechanism(gun.id);
const doubleGun = (mechanism: ShotgunMechanism) => mechanism === 'over-under' || mechanism === 'side-by-side';
const CUE_NAMES: Record<ShotgunActionCue, string> = { rack: 'Rack', eject: 'Eject', lock: 'Close', shell: 'Shell in', latch: 'Open' };
const MECHANISM_NAMES: Record<ShotgunMechanism, string> = { pump: 'Pump', 'semi-auto': 'Long recoil', 'over-under': 'Over-under', 'side-by-side': 'Side-by-side' };

const GROUNDS: readonly [string, string | undefined][] = [...OFFERED_AREA_IDS.map(id => [getArea(id).name, id] as [string, string]), ['Open country', undefined]];

let timers: number[] = [];
const later = (seconds: number, play: () => void) => { timers.push(window.setTimeout(play, seconds * 1000)); };

/** When an action's cues fall, found frame by frame as the gun finds them at 60 fps. */
function cueTimes(seconds: number, scan: (from: number, to: number, emit: (cue: ShotgunActionCue) => void) => void) {
  const cues: { cue: ShotgunActionCue; at: number }[] = [], frame = 1 / 60;
  for (let t = 0; t < seconds; t += frame) scan(t, t + frame, cue => cues.push({ cue, at: t + frame }));
  return cues;
}

/** A hull's flight, then its first touchdown and one low bounce. */
function hullLands(after: number, surface: HullSurface, pan: number): void {
  later(after + .48, () => playHullDrop(surface, .55, pan));
  later(after + .64, () => playHullDrop(surface, .18, pan));
}

function shoot(gun: GunConfig, areaId?: string): void {
  const mechanism = mechanismOf(gun);
  playShot(gun.id, areaId);
  for (const { cue, at } of cueTimes(1, (from, to, emit) => shotgunCycleCues(mechanism, from, to, emit))) {
    later(at, () => playActionClick(cue, mechanism));
    // Out of the right-hand port, onto the ground at the hunter's right.
    if (cue === 'eject') hullLands(at, hullSurface(areaId), .6);
  }
}

function reload(gun: GunConfig, missing: number): void {
  const mechanism = mechanismOf(gun), duration = RELOAD_OPEN_S + missing * RELOAD_PER_SHELL_S;
  for (const { cue, at } of cueTimes(duration + .05, (from, to, emit) => shotgunReloadCues(mechanism, from, to, duration, missing, emit))) {
    later(at, () => playActionClick(cue, mechanism));
    // A double's ejectors throw the fired hulls back over the shoulder.
    if (cue === 'eject' && doubleGun(mechanism)) hullLands(at, 'soft', -.2);
  }
}

function node<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function button(label: string, play: () => void): HTMLButtonElement {
  const control = node('button', label);
  control.type = 'button';
  control.addEventListener('click', async () => {
    if (!(await audioReady())) return;
    timers.forEach(clearTimeout); timers = [];
    play();
    control.classList.add('playing');
    window.setTimeout(() => control.classList.remove('playing'), 160);
  });
  return control;
}

function section(title: string, note: string): HTMLElement {
  const part = node('section');
  part.append(node('h2', title), node('p', note, 'note'));
  board.append(part);
  return part;
}

function row(parent: HTMLElement, label: string, buttons: HTMLButtonElement[]): void {
  const line = node('div', undefined, 'row');
  line.append(node('span', label), ...buttons);
  parent.append(line);
}

// A shot on each ground: the whole event, as the hunter hears it.
{
  const part = section('A shot on each ground',
    'The report, the land answering it, the action cycling and the hull landing. Doubles don’t cycle; their hulls come out on the reload.');
  const table = node('table'), head = node('tr');
  head.append(node('th', ''), ...GUNS.map(gun => node('th', gun.name)));
  table.append(head);
  for (const [name, areaId] of GROUNDS) {
    const line = node('tr');
    line.append(node('th', name));
    for (const gun of GUNS) { const cell = node('td'); cell.append(button('Shoot', () => shoot(gun, areaId))); line.append(cell); }
    table.append(line);
  }
  const scroll = node('div', undefined, 'scroll');
  scroll.append(table); part.append(scroll);
}

// Reloads, timed as the gun on screen.
{
  const part = section('Reloading', 'From empty, and topping up one shell.');
  for (const gun of GUNS) row(part, gun.name, [button('From empty', () => reload(gun, gun.shells)), button('One shell', () => reload(gun, 1))]);
}

// Each mechanical cue alone.
{
  const part = section('The mechanics, one at a time', 'Each cue as the visible action plays it. Four variants of each, taken in turn.');
  for (const mechanism of Object.keys(MECHANISM_NAMES) as ShotgunMechanism[]) {
    row(part, MECHANISM_NAMES[mechanism], foleyCueNames(mechanism).map(cue => button(CUE_NAMES[cue], () => playActionClick(cue, mechanism))));
  }
}

// Hulls landing.
{
  const part = section('A hull landing', 'On the rimrock’s stone a clink; in grass, stubble or dirt a tick you barely hear.');
  row(part, 'Stone', [button('Lands', () => playHullDrop('rock', .55, 0)), button('Bounces', () => playHullDrop('rock', .18, 0))]);
  row(part, 'Grass and dirt', [button('Lands', () => playHullDrop('soft', .55, 0)), button('Bounces', () => playHullDrop('soft', .18, 0))]);
}

// The birds of each ground, and its quarry's voices.
const BIRD_NAMES: Record<string, string> = {
  meadowlark: 'Meadowlark', 'canyon-wren': 'Canyon wren', raven: 'Ravens', mallard: 'Mallard hen', chickadee: 'Chickadee', cardinal: 'Cardinal',
  'mourning-dove': 'Mourning dove', 'rooster-crow': 'A rooster crowing, far off', redtail: 'Red-tailed hawk', 'horned-lark': 'Horned larks',
  geese: 'Geese going over', cranes: 'Sandhill cranes going over', blackbirds: 'Blackbirds in the cattails',
};
const SPECIES_NAMES: Record<string, string> = { bobwhite: 'Bobwhite', chukar: 'Chukar', hun: 'Huns', sharptail: 'Sharptail', 'prairie-chicken': 'Prairie chicken' };
const random = mulberry32(71);

function groundBirdSound(areaId: string, bird: GroundBird, side = 1): void {
  const ground = GROUND_BIRDS[areaId], distance = (bird.distance[0] + bird.distance[1]) / 2;
  const placement: BirdPlacement = bird.overhead
    ? { distance, direction: { x: -side, y: 1.2, z: -1 }, to: { x: side, y: 1, z: -.4 }, space: ground.space, gain: bird.gain * AMBIENT_BIRD_GAIN }
    : { distance, direction: { x: side * .6, y: .02, z: -1 }, space: ground.space, gain: bird.gain * AMBIENT_BIRD_GAIN };
  if ('flock' in bird) playBirdFlock(bird.flock, placement, 1 + Math.floor(random() * 1e5));
  else playBirdCall(bird.call, placement);
}

function quarryCall(areaId: string, call: BirdCallId, distance: number): void {
  playBirdCall(call, { distance, direction: { x: .7, y: .02, z: -1 }, space: GROUND_BIRDS[areaId].space, gain: QUARRY_CALL_GAIN });
}

{
  const part = section('The birds of each ground',
    'The land’s own birds at their usual distance, in their country: the canyon answers, the prairie barely does. Then the quarry, heard only from real birds in the game: a covey calling at first light, scattered singles calling it back together.');
  for (const [name, areaId] of GROUNDS) {
    if (!areaId) continue;
    const ground = GROUND_BIRDS[areaId];
    row(part, name, [
      ...ground.birds.map(bird => button(BIRD_NAMES['flock' in bird ? bird.flock : bird.call] ?? ('flock' in bird ? bird.flock : bird.call), () => groundBirdSound(areaId, bird))),
      button('First light, sped up', () => {
        for (let i = 0, at = 0; i < 6; i++, at += 2.5 + random() * 2.5) {
          const pick = nextGroundBird(areaId, 'dawn', random);
          if (pick) later(at, () => groundBirdSound(areaId, pick.bird, Math.sin(pick.bearing) < 0 ? -1 : 1));
        }
      }),
    ]);
    for (const share of getArea(areaId).speciesMix) {
      const voice = QUARRY_VOICES[share.speciesId];
      if (!voice) continue;
      const buttons: HTMLButtonElement[] = [];
      if (voice.covey) buttons.push(button('Covey calling, 200 m', () => quarryCall(areaId, voice.covey!.call, 200)));
      if (voice.gather) buttons.push(button('Singles gathering, 80 m', () => quarryCall(areaId, voice.gather!, 80)));
      if (voice.flush) buttons.push(button('Going up', () => playBirdCall(voice.flush!.call, { distance: 15, direction: { x: .3, y: .2, z: -1 }, space: 'open', gain: .45 })));
      row(part, `${SPECIES_NAMES[share.speciesId] ?? share.speciesId}, the quarry`, buttons);
    }
  }
}

// The dog close by, and the handler's whistle.
{
  const part = section('The dog', 'Each dog’s bell has its own voice. A running dog keeps it going; on point it goes silent. Breath quickens with work and stops on point. The whistle: one long blast to whoa, a pip to release, two to cast, three for a dead bird, the trill to come in.');
  const ring = (slot: number, distance: number) => playDogCollar('bell', dogCollarGain('bell', distance), { x: .4, y: -.1, z: -1 }, slot);
  const rings = (slot: number, every: number, seconds: number) => { for (let t = 0; t < seconds; t += every) later(t, () => ring(slot, 25)); };
  row(part, 'Bells', [
    button('First dog', () => ring(0, 15)), button('Second dog', () => ring(1, 15)),
    button('Running, 25 m', () => rings(0, .62, 4)),
    button('Running, then a point', () => rings(0, .62, 2.6)),
    button('A brace, both running', () => { rings(0, .62, 4); for (let t = .3; t < 4; t += .58) later(t, () => ring(1, 40)); }),
  ]);
  const calls: [WhistleCall, string][] = [['whoa', 'Whoa'], ['release', 'Release'], ['cast', 'Cast'], ['dead', 'Dead bird'], ['recall', 'Come in']];
  row(part, 'Whistle', calls.map(([call, label]) => button(label, () => playWhistle(call))));
  const breathe = (cue: 'pant' | 'sniff', every: number, seconds: number, level: number) => {
    for (let t = 0; t < seconds; t += every) later(t, () => playDogBreath(cue, level, { x: .5, y: -.3, z: -1 }));
  };
  row(part, 'Breath, 3 m', [
    button('Blown, after a hard cast', () => breathe('pant', 1 / 3.8, 4, .85)),
    button('Easing off', () => breathe('pant', 1 / 2.3, 4, .5)),
    button('Working scent', () => breathe('sniff', 1.1, 4.5, .7)),
  ]);
}

// Footsteps on each ground, at a walk and at a run.
{
  const part = section('Footsteps', 'Six steps on each kind of ground, as the hunter’s own feet sound: walking, then running.');
  const names: Record<string, string> = { dirt: 'Farm lane, dirt', grass: 'Grass and stubble', cover: 'Tall cover', rock: 'Rimrock', scree: 'Scree', wet: 'Slough mud', water: 'Wading' };
  for (const surface of STEP_SURFACES) {
    const walk = (running: boolean) => { for (let i = 0; i < 6; i++) later(i * (running ? .34 : .56), () => playFootstep(surface, .1, running)); };
    row(part, names[surface], [button('Walking', () => walk(false)), button('Running', () => walk(true))]);
  }
}

// The field itself through the day: the wind by the hour, the evening's crickets.
{
  const part = section('The field by the hour', 'The wind bed of each ground for fifteen seconds at each hour: still at first light, up at midday, laying down at dusk, with crickets in the evening. The birds are above.');
  let bed: FieldAmbience | null = null, bedTimer = 0;
  const hours: [TimeOfDay, string][] = [['dawn', 'Dawn'], ['morning', 'Morning'], ['noon', 'Noon'], ['evening', 'Evening'], ['lastlight', 'Last light']];
  for (const [name, areaId] of GROUNDS) {
    if (!areaId) continue;
    row(part, name, [...hours.map(([hour, label]) => button(label, () => {
      bed?.stop(); window.clearTimeout(bedTimer);
      bed = startFieldAmbience(areaId);
      bed?.setHour?.(hour);
      bedTimer = window.setTimeout(() => { bed?.stop(); bed = null; }, 15000);
    })), button('Stop', () => { bed?.stop(); bed = null; })]);
  }
}

// The score: the menus' theme on the guitar, and the hunt's last bars.
{
  const part = section('Music', 'The menu theme, a slow fingerpicked guitar piece in D that comes round again; moving between menu pages it goes on rather than starting over. Then the few bars as a hunt’s report comes up.');
  let theme: MusicPlayer | null = null;
  row(part, 'Menu theme', [button('Play', () => { theme = startMenuTheme(); }), button('Fade out', () => { theme?.stop(2); theme = null; })]);
  row(part, 'End of the hunt', [button('A full day', () => playReportSting('full')), button('A quiet day', () => playReportSting('quiet'))]);
}

// Made ahead in idle moments, as the game does, so no click waits on a sound.
for (const [, areaId] of GROUNDS) {
  for (const gun of GUNS) prepareGunSounds(gun.id, areaId);
  if (areaId) prepareBirdSounds(areaId, getArea(areaId).speciesMix.map(share => share.speciesId));
}
prepareDogSounds(2);
prepareStepSounds();
prepareMusic();
