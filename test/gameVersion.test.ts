import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  fetchPublishedVersion, parsePublishedVersion, readingRuns, releaseDay, releasesAfter, takeUnseenReleases, thisBuild,
  versionText, WHATS_NEW_SEEN_KEY, type Release,
} from '../src/three/gameVersion';
import { RELEASES_IN_GAME, readReleases } from '../scripts/releases.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const release = (date: string, through: string, ...notes: string[]): Release => ({ date, through, notes });
const RELEASES = [
  release('2026-10-04', 'ccccccc', 'Third'),
  release('2026-10-03', 'bbbbbbb', 'Second a', 'Second b'),
  release('2026-10-03', 'aaaaaaa', 'First'),
];

class MemoryStorage {
  data = new Map<string, string>();
  broken = false;
  constructor(entries: Record<string, string> = {}) { for (const [key, value] of Object.entries(entries)) this.data.set(key, value); }
  get length() { return this.data.size; }
  key(index: number) { return [...this.data.keys()][index] ?? null; }
  getItem(key: string) { if (this.broken) throw new Error('blocked'); return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { if (this.broken) throw new Error('blocked'); this.data.set(key, value); }
}

describe('the version line', () => {
  it('reads as the commit’s day and the commit', () => {
    expect(versionText({ version: '2026.10.03', commit: 'bdf2729' })).toBe('Version 2026.10.03 · bdf2729');
  });

  it('is written into the game with the latest checked-in release notes', () => {
    const build = thisBuild();
    expect(build.version).toMatch(/^\d{4}\.\d{2}\.\d{2}$/);
    expect(build.commit).toMatch(/^(?:[0-9a-f]{7}|unknown)$/);
    expect(build.releases).toEqual(readReleases(root).slice(0, RELEASES_IN_GAME));
  });
});

describe('release notes for reading', () => {
  it('name each day as a reader says it, whatever the reader’s time zone', () => {
    expect(releaseDay('2026-10-03')).toBe('October 3, 2026');
    expect(releaseDay('2027-01-01')).toBe('January 1, 2027');
  });

  it('read newest first, one day at a time, in runs short enough for any page', () => {
    expect(readingRuns(RELEASES, 2)).toEqual([
      { day: 'October 4, 2026', notes: ['Third'] },
      // Two releases on one day read as one; only the day's first run names it.
      { day: 'October 3, 2026', notes: ['Second a', 'Second b'] },
      { day: null, notes: ['First'] },
    ]);
    expect(readingRuns([])).toEqual([]);
  });

  it('find what came after the notes a copy already has', () => {
    expect(releasesAfter(RELEASES, 'ccccccc')).toEqual([]);
    expect(releasesAfter(RELEASES, 'bbbbbbb')).toEqual(RELEASES.slice(0, 1));
    expect(releasesAfter(RELEASES, 'aaaaaaa')).toEqual(RELEASES.slice(0, 2));
    expect(releasesAfter(RELEASES, 'aaaaaaa', 1)).toEqual(RELEASES.slice(0, 1));
    // Unknown or too old: just the newest, never the whole history.
    expect(releasesAfter(RELEASES, 'fffffff')).toEqual(RELEASES.slice(0, 1));
    expect(releasesAfter(RELEASES, null)).toEqual(RELEASES.slice(0, 1));
  });
});

describe('What’s new after an update', () => {
  it('stays quiet on a first visit, and remembers what there was', () => {
    const storage = new MemoryStorage();
    expect(takeUnseenReleases(RELEASES, storage)).toEqual([]);
    expect(storage.getItem(WHATS_NEW_SEEN_KEY)).toBe('ccccccc');
    expect(takeUnseenReleases(RELEASES, storage)).toEqual([]);
  });

  it('shows a player from before versions the newest release, once', () => {
    const storage = new MemoryStorage({ 'uplandin.quick.v1': '{}' });
    expect(takeUnseenReleases(RELEASES, storage)).toEqual(RELEASES.slice(0, 1));
    expect(takeUnseenReleases(RELEASES, storage)).toEqual([]);
  });

  it('shows everything since the notes last shown, once', () => {
    const storage = new MemoryStorage({ [WHATS_NEW_SEEN_KEY]: 'aaaaaaa' });
    expect(takeUnseenReleases(RELEASES, storage)).toEqual(RELEASES.slice(0, 2));
    expect(takeUnseenReleases(RELEASES, storage)).toEqual([]);
    const next = [release('2026-10-05', 'ddddddd', 'Fourth'), ...RELEASES];
    expect(takeUnseenReleases(next, storage)).toEqual(next.slice(0, 1));
    expect(storage.getItem(WHATS_NEW_SEEN_KEY)).toBe('ddddddd');
  });

  it('never nags when there is nothing to show or nowhere to remember it', () => {
    expect(takeUnseenReleases([], new MemoryStorage({ 'uplandin.quick.v1': '{}' }))).toEqual([]);
    expect(takeUnseenReleases(RELEASES, undefined)).toEqual([]);
    const broken = new MemoryStorage({ 'uplandin.quick.v1': '{}' }); broken.broken = true;
    expect(takeUnseenReleases(RELEASES, broken)).toEqual([]);
  });
});

describe('what production serves', () => {
  const published = { label: 'Version 2026.10.04 · 9c1e2f0', version: '2026.10.04', commit: '9c1e2f0', builtAt: '2026-10-04T17:02:11.000Z', releases: RELEASES };

  it('is read from version.json beside the page, never from a cache', async () => {
    const request = vi.fn(async () => new Response(JSON.stringify(published)));
    expect(await fetchPublishedVersion('https://game.test/play/home3d.html?x=1', request as unknown as typeof fetch)).toEqual(published);
    expect(request).toHaveBeenCalledWith(new URL('https://game.test/play/version.json'), { cache: 'no-store' });
  });

  it('is unknown offline, in development, or when the file is not a version', async () => {
    const page = 'https://game.test/play/index.html';
    const answer = (body: string, status = 200) => vi.fn(async () => new Response(body, { status })) as unknown as typeof fetch;
    expect(await fetchPublishedVersion(page, answer('missing', 404))).toBeNull();
    expect(await fetchPublishedVersion(page, answer('<!doctype html>'))).toBeNull();
    expect(await fetchPublishedVersion(page, vi.fn(async () => { throw new TypeError('offline'); }) as unknown as typeof fetch)).toBeNull();
    expect(parsePublishedVersion({ version: 2026, commit: 'x' })).toBeNull();
    expect(parsePublishedVersion(null)).toBeNull();
  });

  it('tolerates a sparse file and drops malformed notes', () => {
    expect(parsePublishedVersion({ version: '2026.10.04', commit: '9c1e2f0', releases: [RELEASES[0], { date: 1 }, 'x'] })).toEqual({
      label: 'Version 2026.10.04 · 9c1e2f0', version: '2026.10.04', commit: '9c1e2f0', builtAt: '', releases: [RELEASES[0]],
    });
  });

  it('is always revalidated by the host', () => {
    const headers = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8');
    expect(headers).toMatch(/^\/version\.json\n {2}Cache-Control: no-cache$/m);
  });
});
