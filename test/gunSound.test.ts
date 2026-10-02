import { afterEach, describe, expect, it, vi } from 'vitest';
import { landAnswer, REPORT_RATE, synthesizeReport } from '../src/three/sound/gunReport';
import { FOLEY_RATE, foleyCueNames, hullSurface, synthesizeActionCue, synthesizeHullDrop } from '../src/three/sound/gunFoley';
import { peak, rms } from '../src/three/sound/dsp';
import { shotgunCycleCues, shotgunReloadCues, type ShotgunActionCue, type ShotgunMechanism } from '../src/three/shotgunActionTiming';

// The real synthesis, counted.
vi.mock('../src/three/sound/gunReport', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/three/sound/gunReport')>();
  return { ...actual, synthesizeReport: vi.fn(actual.synthesizeReport) };
});
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

function fakeAudio() {
  const nodes: any[] = [];
  const param = (value = 0) => ({ value, setValueAtTime: vi.fn(), setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() });
  const node = (kind: string, extra: object = {}) => {
    const n: any = { kind, gain: param(1), pan: param(), onended: null, connect: vi.fn((to: any) => to), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), ...extra };
    nodes.push(n); return n;
  };
  vi.stubGlobal('AudioContext', class {
    state = 'running'; currentTime = 3; destination = { kind: 'speakers' };
    createGain() { return node('gain'); }
    createStereoPanner() { return node('panner'); }
    createDynamicsCompressor() { return node('limiter', { threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }); }
    createBufferSource() { return node('source'); }
    createBuffer(channels: number, length: number, rate: number) {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return { numberOfChannels: channels, length, sampleRate: rate, getChannelData: (i: number) => data[i] };
    }
  });
  return nodes;
}

const GROUNDS = ['pheasant-coverts', 'sharptail-prairie', 'quail-fields', 'chukar-ridge'];
const MECHANISMS: ShotgunMechanism[] = ['pump', 'semi-auto', 'over-under', 'side-by-side'];
const level = (samples: Float32Array, rate: number, from: number, to: number) =>
  rms(samples, Math.round(from * rate), Math.min(samples.length, Math.round(to * rate)));
const clean = (samples: Float32Array) => samples.every(Number.isFinite) && samples[samples.length - 1] === 0;

describe('the shotgun report', () => {
  it('is the same for a seed and a little different for the next', () => {
    const first = synthesizeReport('over-under', 'chukar-ridge', 1);
    expect(synthesizeReport('over-under', 'chukar-ridge', 1).left).toEqual(first.left);
    const next = synthesizeReport('over-under', 'chukar-ridge', 2);
    expect(next.left).not.toEqual(first.left);
    // A variant, not a different gun: the blast is as loud.
    expect(Math.abs(20 * Math.log10(level(next.left, REPORT_RATE, 0, .05) / level(first.left, REPORT_RATE, 0, .05)))).toBeLessThan(1.5);
  });

  it('never clips and ends in silence, on every ground and with every gun', () => {
    const reports = [...[...GROUNDS, undefined].map(area => synthesizeReport('remington-870', area, 1)),
      ...['semi-auto', 'over-under', 'side-by-side'].map(gun => synthesizeReport(gun, 'quail-fields', 1))];
    for (const report of reports) {
      expect(report.rate).toBe(REPORT_RATE);
      for (const channel of [report.left, report.right]) {
        expect(clean(channel)).toBe(true);
        expect(peak(channel)).toBeLessThanOrEqual(1);
        // Loud: the shot is the loudest thing in the game.
        expect(peak(channel)).toBeGreaterThan(.8);
      }
    }
  });

  it('puts the blast in the middle and the land all around', () => {
    const { left, right } = synthesizeReport('remington-870', 'sharptail-prairie', 1);
    for (let i = 0; i < REPORT_RATE * .015; i++) expect(left[i]).toBe(right[i]);
    let same = 0, power = 0;
    for (let i = Math.round(REPORT_RATE * .6); i < REPORT_RATE * 1.4; i++) { same += left[i] * right[i]; power += left[i] ** 2; }
    expect(same / power).toBeLessThan(.5);
  });

  it('answers from the land: the rimrock hands echoes back, the prairie rolls on', () => {
    const delays = (area: string) => landAnswer(area).echoes.map(echo => echo.delay);
    expect(delays('chukar-ridge')).toHaveLength(3);
    expect(delays('sharptail-prairie')).toEqual([]);
    for (const area of ['chukar-ridge', 'pheasant-coverts', 'quail-fields']) {
      const { left, right } = synthesizeReport('remington-870', area, 1);
      for (const delay of delays(area)) {
        // Each echo stands out of the roll just before it, in at least one ear.
        const lift = Math.max(level(left, REPORT_RATE, delay, delay + .03) / level(left, REPORT_RATE, delay - .07, delay - .04),
          level(right, REPORT_RATE, delay, delay + .03) / level(right, REPORT_RATE, delay - .07, delay - .04));
        expect(lift, `${area} at ${delay} s`).toBeGreaterThan(1.6);
      }
    }
    const prairie = synthesizeReport('remington-870', 'sharptail-prairie', 1), coverts = synthesizeReport('remington-870', 'pheasant-coverts', 1);
    expect(prairie.left.length / REPORT_RATE).toBeGreaterThan(2.4);
    expect(level(prairie.left, REPORT_RATE, 1.4, 1.8)).toBeGreaterThan(2 * level(coverts.left, REPORT_RATE, 1.4, 1.8));
    // A ground without its own answer still has open country's.
    expect(landAnswer('nowhere')).toEqual(landAnswer());
  });
});

describe("the guns' mechanics", () => {
  it('give every cue an action makes its own sound', () => {
    for (const mechanism of MECHANISMS) {
      const heard = new Set<ShotgunActionCue>();
      for (let t = 0; t < 1.2; t += 1 / 60) shotgunCycleCues(mechanism, t, t + 1 / 60, cue => heard.add(cue));
      for (const missing of [1, 2, 4]) {
        const duration = .55 + missing * .38;
        for (let t = 0; t < duration + .1; t += 1 / 60) shotgunReloadCues(mechanism, t, t + 1 / 60, duration, missing, cue => heard.add(cue));
      }
      expect(heard.size, mechanism).toBeGreaterThan(0);
      for (const cue of heard) expect(foleyCueNames(mechanism), `${mechanism} ${cue}`).toContain(cue);
    }
  });

  it('are short, clean and below the report, a touch different each time', () => {
    for (const mechanism of MECHANISMS) for (const cue of foleyCueNames(mechanism)) {
      const first = synthesizeActionCue(mechanism, cue, 1), second = synthesizeActionCue(mechanism, cue, 2);
      expect(first.length / FOLEY_RATE).toBeLessThanOrEqual(.2);
      expect(clean(first)).toBe(true);
      expect(peak(first)).toBeGreaterThan(.02);
      expect(peak(first)).toBeLessThan(.5);
      expect(synthesizeActionCue(mechanism, cue, 1)).toEqual(first);
      expect(second).not.toEqual(first);
      expect(Math.abs(20 * Math.log10(peak(second) / peak(first))), `${mechanism} ${cue}`).toBeLessThan(4);
    }
  });

  it('close a double with a solid clack, louder than the lever or a shell going in', () => {
    const loud = (mechanism: ShotgunMechanism, cue: ShotgunActionCue) => rms(synthesizeActionCue(mechanism, cue, 1));
    for (const mechanism of ['over-under', 'side-by-side'] as const) {
      expect(loud(mechanism, 'lock')).toBeGreaterThan(loud(mechanism, 'latch'));
      expect(loud(mechanism, 'lock')).toBeGreaterThan(2 * loud(mechanism, 'shell'));
    }
    expect(loud('pump', 'lock')).toBeGreaterThan(2 * loud('pump', 'shell'));
  });

  it('let a hull clink on the rimrock and barely tick in the grass', () => {
    expect(hullSurface('chukar-ridge')).toBe('rock');
    expect(['pheasant-coverts', 'sharptail-prairie', 'quail-fields', undefined].map(hullSurface)).toEqual(['soft', 'soft', 'soft', 'soft']);
    const rock = synthesizeHullDrop('rock', 1), soft = synthesizeHullDrop('soft', 1);
    expect(clean(rock) && clean(soft)).toBe(true);
    expect(synthesizeHullDrop('rock', 1)).toEqual(rock);
    expect(peak(rock)).toBeGreaterThan(3 * peak(soft));
    expect(peak(rock)).toBeLessThan(peak(synthesizeActionCue('pump', 'lock', 1)));
  });
});

describe('playing them', () => {
  it('stays silent where there is no audio', async () => {
    const audio = await import('../src/audio');
    expect(() => { audio.playShot('over-under', 'chukar-ridge'); audio.playActionClick('lock', 'pump'); audio.playHullDrop('rock', 1, .5); }).not.toThrow();
  });

  it('plays the report past the world, which dips under it; the action is never dipped', async () => {
    const nodes = fakeAudio(), audio = await import('../src/audio');
    audio.playShot('over-under', 'chukar-ridge');
    const [master, world] = nodes.filter(n => n.kind === 'gain');
    const limiter = nodes.find(n => n.kind === 'limiter');
    expect(master.connect).toHaveBeenCalledWith(limiter);
    expect(limiter.connect).toHaveBeenCalledWith({ kind: 'speakers' });
    expect(world.connect).toHaveBeenCalledWith(master);
    const shot = nodes.find(n => n.kind === 'source'), shotLevel = shot.connect.mock.results[0].value;
    expect(shot.buffer.numberOfChannels).toBe(2);
    expect(shot.buffer.sampleRate).toBe(REPORT_RATE);
    expect(shotLevel.connect).toHaveBeenCalledWith(master);
    expect(world.gain.setTargetAtTime.mock.calls).toEqual([[audio.SHOT_DUCK.depth, 3, audio.SHOT_DUCK.attack], [1, 3 + audio.SHOT_DUCK.hold, audio.SHOT_DUCK.recovery]]);

    // The pump's rack: mono, the gun's own, never dipped.
    world.gain.setTargetAtTime.mockClear();
    audio.playActionClick('rack', 'pump');
    const rack = nodes.filter(n => n.kind === 'source').at(-1);
    expect(rack.buffer.numberOfChannels).toBe(1);
    expect(rack.connect.mock.results[0].value.connect).toHaveBeenCalledWith(master);
    expect(world.gain.setTargetAtTime).not.toHaveBeenCalled();

    // A hull landing is the world's, placed to one side, and lets go of its panner.
    audio.playHullDrop('rock', .6, .5);
    const panner = nodes.find(n => n.kind === 'panner'), drop = nodes.filter(n => n.kind === 'source').at(-1);
    expect(panner.pan.value).toBe(.5);
    expect(panner.connect).toHaveBeenCalledWith(world);
    expect(drop.connect.mock.results[0].value.gain.value).toBeCloseTo(.6);
    drop.onended(); expect(panner.disconnect).toHaveBeenCalledOnce();

    // Three variants taken in turn: the fourth shot is the first again.
    for (let i = 0; i < 3; i++) audio.playShot('over-under', 'chukar-ridge');
    const shots = nodes.filter(n => n.kind === 'source' && n.buffer.numberOfChannels === 2).map(n => n.buffer.getChannelData(0));
    expect(shots).toHaveLength(4);
    expect(shots[3]).toEqual(shots[0]);
    expect(shots[1]).not.toEqual(shots[0]);
  });

  it("makes a gun's sounds before its first shot, a small piece in each idle moment", async () => {
    fakeAudio();
    const idle: ((deadline: { timeRemaining(): number }) => void)[] = [];
    vi.stubGlobal('requestIdleCallback', (work: (deadline: { timeRemaining(): number }) => void) => idle.push(work));
    const audio = await import('../src/audio'), { synthesizeReport: made } = await import('../src/three/sound/gunReport');
    vi.mocked(made).mockClear();
    audio.prepareGunSounds('remington-870', 'chukar-ridge');
    expect(made).not.toHaveBeenCalled();
    let moments = 0;
    while (idle.length) { idle.shift()!({ timeRemaining: () => 0 }); moments++; }
    // Three reports, four variants of each of the pump's four cues, four hulls on stone.
    expect(moments).toBe(3 + 16 + 4);
    expect(made).toHaveBeenCalledTimes(3);
    for (let i = 0; i < 4; i++) audio.playShot('remington-870', 'chukar-ridge');
    expect(made).toHaveBeenCalledTimes(3);
    // With time to spare, the small pieces go together.
    audio.prepareGunSounds('over-under', 'chukar-ridge');
    moments = 0;
    while (idle.length) { idle.shift()!({ timeRemaining: () => 40 }); moments++; }
    expect(moments).toBeLessThan(5);
    expect(made).toHaveBeenCalledTimes(6);
  });
});
