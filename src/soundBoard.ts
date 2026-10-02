import { audioReady, playActionClick, playHullDrop, playShot, prepareGunSounds } from './audio';
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

// Made ahead in idle moments, as the game does, so no click waits on a sound.
for (const [, areaId] of GROUNDS) for (const gun of GUNS) prepareGunSounds(gun.id, areaId);
