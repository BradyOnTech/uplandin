import { noiseSource } from './dsp';

/**
 * The menu theme, for one fingerpicked steel-string guitar: a slow
 * Travis-picked piece in D, the thumb walking the bass between root and
 * fifth, the fingers picking the chord above it, and a plain tune over the
 * last section before it comes round again. Written as data; a scheduler
 * plays it a little ahead of time (audio.ts). And two short stings for the
 * hunt's end: a full day, and a quiet one.
 */
/** A note on a string: a string struck again stops its last note ringing. */
export interface ScoreNote { at: number; midi: number; velocity: number; string: number; harmonic?: boolean }

/** A chord as the hand holds it: bass, alternate bass, and three treble notes high to low. */
interface Shape { bass: number; alt: number; treble: readonly [number, number, number] }
const SHAPES = {
  D: { bass: 50, alt: 45, treble: [66, 62, 57] },
  Dsus4: { bass: 50, alt: 45, treble: [67, 62, 57] },
  'G/D': { bass: 50, alt: 55, treble: [67, 62, 59] },
  Bm: { bass: 47, alt: 54, treble: [66, 62, 59] },
  G: { bass: 43, alt: 50, treble: [67, 59, 55] },
  A: { bass: 45, alt: 52, treble: [64, 61, 57] },
  Asus4: { bass: 45, alt: 52, treble: [64, 62, 57] },
  'D/F#': { bass: 42, alt: 50, treble: [66, 62, 57] },
  Em: { bass: 40, alt: 47, treble: [64, 59, 55] },
  Em7: { bass: 40, alt: 47, treble: [62, 59, 55] },
} as const satisfies Record<string, Shape>;
type ShapeName = keyof typeof SHAPES;

export const THEME_BPM = 74;
const EIGHTH = 60 / THEME_BPM / 2, BAR = EIGHTH * 8;

/** Bars, each one chord or two (half a bar each), with an optional tune over it. */
interface Bar { chords: readonly ShapeName[]; tune?: readonly (number | null)[] }
const INTRO: Bar[] = [{ chords: ['D'] }, { chords: ['Dsus4', 'D'] }];
const VERSE: Bar[] = [
  { chords: ['D'] }, { chords: ['G/D'] }, { chords: ['Bm'] }, { chords: ['G'] },
  { chords: ['D'] }, { chords: ['G/D'] }, { chords: ['Asus4', 'A'] }, { chords: ['D'] },
];
const BRIDGE: Bar[] = [
  { chords: ['G'] }, { chords: ['D/F#'] }, { chords: ['Em7'] }, { chords: ['A'] },
  { chords: ['G'] }, { chords: ['D/F#'] }, { chords: ['Em'] }, { chords: ['Asus4', 'A'] },
];
// The tune: one note on each half bar, carried over the verse's chords.
const TUNE: readonly (readonly (number | null)[])[] = [
  [66, 69], [71, 69], [66, 64], [62, 59], [66, 69], [71, 74], [73, 71], [69, null],
];
const SONG: Bar[] = [...INTRO, ...VERSE, ...BRIDGE, ...VERSE.map((bar, i) => ({ ...bar, tune: TUNE[i] }))];
export const THEME_SECONDS = SONG.length * BAR;

// Thumb on the beats (root, fifth), fingers on the offbeats; a pinch on the one and the three.
const PATTERN: readonly (readonly ('bass' | 'alt' | 0 | 1 | 2)[])[] = [['bass', 0], [2], ['alt'], [1], ['bass', 0], [1], ['alt'], [2]];

/** Every note of one pass through the theme, from its start. Deterministic. */
export function themeNotes(): ScoreNote[] {
  const notes: ScoreNote[] = [], vary = noiseSource(0x6d2b79f5);
  SONG.forEach((bar, index) => {
    const start = index * BAR;
    // A breath at the end of each section: the last bar before a new one lingers a touch.
    const lingering = index === INTRO.length - 1 || index === INTRO.length + VERSE.length - 1;
    PATTERN.forEach((step, eighth) => {
      const shape = SHAPES[bar.chords[bar.chords.length > 1 && eighth >= 4 ? 1 : 0]];
      const swing = lingering && eighth >= 6 ? (eighth - 5) * .03 : 0;
      for (const voice of step) {
        // A tune note takes the place of the top string on the beat it falls.
        const tune = bar.tune && voice === 0 && (eighth === 0 || eighth === 4) ? bar.tune[eighth / 4] : undefined;
        if (tune === null) continue;
        const midi = tune ?? (voice === 'bass' ? shape.bass : voice === 'alt' ? shape.alt : shape.treble[voice]);
        const accent = eighth === 0 ? .12 : eighth === 4 ? .06 : 0;
        const velocity = (tune ? .78 : voice === 'bass' || voice === 'alt' ? .62 : .46) + accent + vary() * .05;
        // The thumb's two strings, then the three the fingers pick, high to low.
        const string = voice === 'bass' ? 3 : voice === 'alt' ? 4 : voice;
        notes.push({ at: Math.max(0, start + eighth * EIGHTH + swing + vary() * .008), midi, velocity, string });
      }
    });
  });
  return notes.sort((a, b) => a.at - b.at);
}

/** The notes a pass uses, to make them ahead of time. */
export function themePitches(): number[] {
  return [...new Set([...themeNotes().map(note => note.midi), ...STING_PITCHES])].sort((a, b) => a - b);
}

/** The hunt is over. A full day resolves warm; a quiet one is gentler and ends open. */
export type StingKind = 'full' | 'quiet';
// A strum down across the strings, low to high: each note on its own string.
const strum = (at: number, notes: readonly number[], velocity: number, spread = .028): ScoreNote[] =>
  notes.map((midi, i) => ({ at: at + i * spread, midi, velocity: velocity - i * .02, string: 10 + i }));
export const STINGS: Readonly<Record<StingKind, readonly ScoreNote[]>> = {
  full: [
    ...strum(0, [50, 57, 62, 66], .7), ...strum(.95, [49, 57, 64, 69], .62), ...strum(1.9, [47, 54, 59, 62, 66], .6),
    ...strum(2.85, [43, 50, 55, 59, 67], .62), ...strum(4.1, [50, 57, 62, 66, 69], .72, .045),
    { at: 4.9, midi: 74, velocity: .5, string: 20, harmonic: true },
  ],
  quiet: [
    ...strum(0, [40, 47, 55, 59, 64], .5, .05), ...strum(1.3, [45, 52, 57, 62, 64], .48, .05),
    ...strum(2.7, [50, 57, 62, 64, 69], .46, .07),
  ],
};
const STING_PITCHES = [...new Set(Object.values(STINGS).flat().map(note => note.midi))];
export const STING_SECONDS = 7;
