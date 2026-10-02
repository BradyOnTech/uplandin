import { afterEach, describe, expect, it, vi } from 'vitest';
import { GUITAR_RATE, midiHz, synthesizePluck } from '../src/three/sound/guitar';
import { STINGS, THEME_BPM, THEME_SECONDS, themeNotes, themePitches } from '../src/three/sound/score';
import { rms } from '../src/three/sound/dsp';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); vi.resetModules(); });

/** A note's pitch from its period, by autocorrelation with a parabolic peak. */
function pitchOf(samples: Float32Array, expected: number): number {
  const start = Math.round(GUITAR_RATE * .1), window = 4096;
  const correlate = (lag: number) => { let sum = 0; for (let i = 0; i < window; i++) sum += samples[start + i] * samples[start + i + lag]; return sum; };
  const guess = Math.round(GUITAR_RATE / expected);
  let best = guess;
  for (let lag = Math.round(guess * .9); lag <= Math.round(guess * 1.1); lag++) if (correlate(lag) > correlate(best)) best = lag;
  const [a, b, c] = [correlate(best - 1), correlate(best), correlate(best + 1)];
  return GUITAR_RATE / (best + (a - c) / (2 * (a - 2 * b + c)));
}
const cents = (a: number, b: number) => 1200 * Math.log2(a / b);
/** Energy at a frequency over a stretch (Goertzel). */
function energyAt(samples: Float32Array, frequency: number, from: number, to: number): number {
  const k = 2 * Math.cos(2 * Math.PI * frequency / GUITAR_RATE);
  let s1 = 0, s2 = 0;
  for (let i = Math.round(from * GUITAR_RATE); i < Math.round(to * GUITAR_RATE); i++) { const s0 = samples[i] + k * s1 - s2; s2 = s1; s1 = s0; }
  return s1 * s1 + s2 * s2 - k * s1 * s2;
}

describe('the guitar', () => {
  it('plays in tune, across the neck', () => {
    for (const midi of [40, 45, 50, 57, 62, 66, 71]) {
      const note = synthesizePluck(midiHz(midi), 3);
      expect(Math.abs(cents(pitchOf(note, midiHz(midi)), midiHz(midi))), `midi ${midi}`).toBeLessThan(3);
    }
  });

  it('rings and dies away, the high strings sooner, and cleanly', () => {
    const low = synthesizePluck(midiHz(43), 1), high = synthesizePluck(midiHz(67), 1);
    for (const note of [low, high]) {
      expect(note.every(Number.isFinite)).toBe(true);
      expect(Math.abs(note[note.length - 1])).toBe(0);
    }
    const kept = (note: Float32Array) => rms(note, GUITAR_RATE, GUITAR_RATE * 1.2) / rms(note, 0, GUITAR_RATE * .2);
    expect(kept(low)).toBeGreaterThan(.1);
    expect(kept(high)).toBeLessThan(kept(low));
    // Struck harder is louder.
    expect(rms(synthesizePluck(midiHz(55), 1, { velocity: 1 }))).toBeGreaterThan(1.5 * rms(synthesizePluck(midiHz(55), 1, { velocity: .2 })));
  });

  it('chimes a harmonic an octave up', () => {
    const f = midiHz(62), open = synthesizePluck(f, 1), chime = synthesizePluck(f, 1, { harmonic: true });
    expect(energyAt(chime, 2 * f, .2, .8) / energyAt(chime, f, .2, .8)).toBeGreaterThan(10 * energyAt(open, 2 * f, .2, .8) / energyAt(open, f, .2, .8));
  });
});

describe('the score', () => {
  const D_MAJOR = new Set([2, 4, 6, 7, 9, 11, 1]);

  it('is a fingerpicked piece in D, the same every time, and comes round again', () => {
    const notes = themeNotes();
    expect(themeNotes()).toEqual(notes);
    expect(notes.length).toBeGreaterThan(150);
    for (const note of notes) {
      expect(D_MAJOR.has(note.midi % 12), `midi ${note.midi}`).toBe(true);
      expect(note.at).toBeGreaterThanOrEqual(0);
      expect(note.at).toBeLessThan(THEME_SECONDS);
      expect(note.velocity).toBeGreaterThan(.3); expect(note.velocity).toBeLessThan(1);
    }
    expect(THEME_SECONDS).toBeGreaterThan(60); expect(THEME_SECONDS).toBeLessThan(120);
    // Eighth notes at the tempo, the thumb on every beat.
    const eighth = 60 / THEME_BPM / 2, bar = eighth * 8;
    const beats = notes.filter(note => note.string === 3 || note.string === 4);
    expect(beats.length).toBe(Math.round(THEME_SECONDS / bar) * 4);
    expect(Math.abs(beats[1].at - beats[0].at - 2 * eighth)).toBeLessThan(.03);
    // The tune comes in only over the last section: above the picking's top string.
    const high = notes.filter(note => note.midi > 67);
    expect(high.length).toBeGreaterThan(4);
    expect(Math.min(...high.map(note => note.at))).toBeGreaterThan(THEME_SECONDS * .6);
    // The bass walks low, the treble sits above it.
    expect(Math.max(...beats.map(note => note.midi))).toBeLessThan(Math.min(...notes.filter(note => note.string === 0).map(note => note.midi)));
  });

  it('ends a hunt in a few bars: warm for a full day, gentle and open for a quiet one', () => {
    for (const kind of ['full', 'quiet'] as const) {
      const sting = STINGS[kind];
      expect(sting.every(note => D_MAJOR.has(note.midi % 12))).toBe(true);
      expect(Math.max(...sting.map(note => note.at))).toBeLessThan(6);
    }
    // The full day lands on D with the high chime; the quiet one is softer.
    expect(STINGS.full.at(-1)).toMatchObject({ midi: 74, harmonic: true });
    const loudness = (kind: 'full' | 'quiet') => STINGS[kind].reduce((sum, note) => sum + note.velocity, 0) / STINGS[kind].length;
    expect(loudness('quiet')).toBeLessThan(loudness('full'));
    expect(themePitches()).toEqual(expect.arrayContaining([...new Set(STINGS.full.map(note => note.midi))]));
  });
});

describe('playing the music', () => {
  function fakeAudio() {
    const nodes: any[] = [];
    let now = 10;
    const param = (value = 0) => ({ value, setValueAtTime: vi.fn(), setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn(), linearRampToValueAtTime: vi.fn() });
    const node = (kind: string, extra: object = {}) => {
      const n: any = { kind, gain: param(1), onended: null, connect: vi.fn((to: any) => to), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), ...extra };
      nodes.push(n); return n;
    };
    vi.stubGlobal('AudioContext', class {
      state = 'running'; sampleRate = 8000; destination = {};
      get currentTime() { return now; }
      createGain() { return node('gain'); }
      createConvolver() { return node('room'); }
      createDynamicsCompressor() { return node('limiter', { threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }); }
      createBufferSource() { return node('source'); }
      createBuffer(channels: number, length: number, rate: number) {
        const data = Array.from({ length: channels }, () => new Float32Array(length));
        return { numberOfChannels: channels, length, sampleRate: rate, getChannelData: (i: number) => data[i] };
      }
    });
    // Time moves on a little at a time, as the scheduler sees it.
    return { nodes, advance: (seconds: number) => { for (let t = 0; t < seconds - 1e-9; t += .05) { now += .05; vi.advanceTimersByTime(50); } } };
  }
  const session = (entries: Record<string, string> = {}) => {
    const data = { ...entries };
    vi.stubGlobal('sessionStorage', { getItem: (key: string) => data[key] ?? null, setItem: (key: string, value: string) => { data[key] = value; } });
    return data;
  };

  it('plays the theme a little ahead, a string struck again stopping its last note, and fades out whole', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'Date'] });
    vi.setSystemTime(new Date('2026-10-02T12:00:00Z'));
    const { nodes, advance } = fakeAudio(), stored = session(), audio = await import('../src/audio');
    const theme = audio.startMenuTheme()!;
    expect(audio.startMenuTheme()).toBe(theme);
    expect(stored[audio.THEME_STARTED_KEY]).toBe(String(Date.now()));
    const sources = () => nodes.filter(n => n.kind === 'source');
    // Only what falls within the look-ahead is scheduled yet.
    const first = sources().length;
    expect(first).toBeGreaterThan(0);
    expect(sources().every(source => source.start.mock.calls[0][0] <= 10 + .1 + .6)).toBe(true);
    advance(4);
    expect(sources().length).toBeGreaterThan(first + 5);
    const notes = themeNotes().filter(note => note.at < 4);
    // The same top string picked twice: the first note is stopped where the second begins.
    const top = notes.filter(note => note.string === 0);
    // (Treble notes are the shorter buffers; the bass rings longer.)
    const treble = Math.round(2.4 * 22050);
    const levels = top.map(note => sources().find(source => source.buffer.length === treble
      && Math.abs(source.start.mock.calls[0][0] - (10.1 + note.at)) < 1e-6)!.connect.mock.results[0].value);
    expect(levels.length).toBeGreaterThanOrEqual(2);
    expect(levels[0].gain.setTargetAtTime).toHaveBeenCalledWith(0, expect.closeTo(10.1 + top[1].at, 6), .025);
    // The room is built once, the music passes the field's dip under a shot.
    expect(nodes.filter(n => n.kind === 'room')).toHaveLength(1);
    theme.stop(2);
    expect(theme.playing).toBe(false);
    const count = sources().length;
    advance(3);
    expect(sources()).toHaveLength(count);
    expect(sources().every(source => source.stop.mock.calls.length <= 1)).toBe(true);
  });

  it('goes on from where it was on the last page, rather than starting over', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'Date'] });
    vi.setSystemTime(new Date('2026-10-02T12:00:30Z'));
    const { nodes } = fakeAudio();
    session({ 'uplandin.theme.started': String(new Date('2026-10-02T12:00:00Z').getTime()) });
    const audio = await import('../src/audio');
    audio.startMenuTheme();
    const starts = nodes.filter(n => n.kind === 'source').map(source => source.start.mock.calls[0][0]);
    // Thirty seconds into the piece: the next notes are the ones after the thirty-second mark.
    const next = themeNotes().filter(note => note.at >= 30);
    expect(starts[0]).toBeCloseTo(10.1 + next[0].at - 30, 5);
  });

  it('plays the end-of-hunt bars once, through the same room', async () => {
    const { nodes } = fakeAudio(); session();
    const audio = await import('../src/audio');
    audio.playReportSting('full');
    const sources = nodes.filter(n => n.kind === 'source');
    expect(sources).toHaveLength(STINGS.full.length);
    expect(sources.map(source => source.start.mock.calls[0][0])).toEqual(STINGS.full.map(note => expect.closeTo(10.05 + note.at, 6)));
    audio.playReportSting('quiet');
    expect(nodes.filter(n => n.kind === 'room')).toHaveLength(1);
  });
});
