import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  addRelease, buildInfo, formatReleaseNotes, parseReleaseNotes, readReleases, releaseDate, RELEASES_IN_GAME, versionLabel,
} from '../scripts/releases.mjs';
import viteConfig from '../vite.config';

const root = fileURLToPath(new URL('..', import.meta.url));
const notesFile = (releases: unknown, extra: Record<string, unknown> = {}) => JSON.stringify({ ...extra, releases });

describe('a release’s day', () => {
  it('is Brady’s calendar day, wherever the build runs', () => {
    // Central daylight time, then standard time.
    expect(releaseDate(new Date('2026-10-03T04:30:00Z'))).toBe('2026-10-02');
    expect(releaseDate(new Date('2026-10-03T05:30:00Z'))).toBe('2026-10-03');
    expect(releaseDate(new Date('2026-12-01T05:30:00Z'))).toBe('2026-11-30');
    expect(versionLabel(new Date('2026-10-03T16:00:00Z'))).toBe('2026.10.03');
  });
});

describe('release-notes.json', () => {
  it('is checked in, newest first, each release through a commit with something to say', () => {
    const releases = readReleases(root);
    expect(releases.length).toBeGreaterThan(0);
    for (const [index, release] of releases.entries()) {
      expect(release.through).toMatch(/^[0-9a-f]{7}$/);
      expect(release.notes.length).toBeGreaterThan(0);
      if (index) expect(release.date <= releases[index - 1].date).toBe(true);
    }
    expect(new Set(releases.map(release => release.through)).size).toBe(releases.length);
  });

  it('stops a build with a plain message when a hand edit breaks it', () => {
    const good = { date: '2026-10-03', through: 'bdf2729', notes: ['A line'] };
    expect(() => parseReleaseNotes('{"releases": [')).toThrow(/release-notes\.json is not valid JSON/);
    expect(() => parseReleaseNotes('{}')).toThrow(/needs a "releases" list/);
    expect(() => parseReleaseNotes(notesFile([{ ...good, date: 'Oct 3' }]))).toThrow(/release 1 needs a "date"/);
    expect(() => parseReleaseNotes(notesFile([{ ...good, through: 'HEAD' }]))).toThrow(/release 1 needs "through"/);
    expect(() => parseReleaseNotes(notesFile([{ ...good, notes: [] }]))).toThrow(/release 1 needs "notes"/);
    expect(() => parseReleaseNotes(notesFile([{ ...good, notes: ['  '] }]))).toThrow(/release 1 needs "notes"/);
    expect(() => parseReleaseNotes(notesFile([good, { ...good, through: '5b7ce89', date: '2026-10-04' }]))).toThrow(/release 2 is newer/);
    expect(parseReleaseNotes(notesFile([{ ...good, notes: ['  A line  '] }]))).toEqual([good]);
  });

  it('gains a release on top only when there is something new, keeping its other fields', () => {
    const text = `${JSON.stringify({ about: 'Newest first.', releases: [{ date: '2026-10-02', through: '5b7ce89', notes: ['Old'] }] }, null, 2)}\n`;
    const releases = parseReleaseNotes(text);
    expect(addRelease(releases, { date: '2026-10-03', through: 'bdf2729', notes: [] })).toBe(releases);
    expect(addRelease(releases, { date: '2026-10-03', through: '5b7ce89', notes: ['Again'] })).toBe(releases);
    const next = addRelease(releases, { date: '2026-10-03', through: 'bdf2729', notes: ['New'] });
    expect(next.map(release => release.through)).toEqual(['bdf2729', '5b7ce89']);
    const written = formatReleaseNotes(text, next);
    expect(written.endsWith('}\n')).toBe(true);
    expect(JSON.parse(written)).toEqual({ about: 'Newest first.', releases: next });
    expect(written).toContain('\n  "releases": [\n    {\n      "date": "2026-10-03"');
  });
});

describe('a build’s version', () => {
  it('is the commit Cloudflare builds, dated by that commit on Brady’s calendar', () => {
    const run = vi.fn((_root: string, args: string[]) => (args[0] === 'log' ? '2026-10-02T23:30:00-05:00\n' : 'should not be asked'));
    const sha = '9C1E2F0D4B5A69788776655443322110FFEEDDCC';
    const now = new Date('2026-10-04T17:00:00Z');
    expect(buildInfo({ root, env: { WORKERS_CI_COMMIT_SHA: sha }, now, run })).toEqual({
      version: '2026.10.02', commit: '9c1e2f0', builtAt: '2026-10-04T17:00:00.000Z', releases: readReleases(root),
    });
    expect(run).toHaveBeenCalledWith(root, ['log', '-1', '--format=%cI', sha.toLowerCase()]);
  });

  it('asks git for the commit outside Cloudflare, and is dated by the build without git', () => {
    const run = vi.fn((_root: string, args: string[]) => (args[0] === 'rev-parse' ? 'bdf27291234567890abcdef1234567890abcdef1' : '2026-10-03T06:44:29-05:00'));
    expect(buildInfo({ root, env: {}, now: new Date('2026-10-09T12:00:00Z'), run })).toMatchObject({ version: '2026.10.03', commit: 'bdf2729' });
    const noGit = () => { throw new Error('not a git repository'); };
    expect(buildInfo({ root, env: {}, now: new Date('2026-10-09T03:00:00Z'), run: noGit })).toMatchObject({ version: '2026.10.08', commit: 'unknown' });
  });

  it('goes into the game and out to version.json, with the latest notes', () => {
    const define = (viteConfig as { define: Record<string, string> }).define;
    const inGame = JSON.parse(define.__UPLANDIN_BUILD__);
    expect(Object.keys(inGame)).toEqual(['version', 'commit', 'releases']);
    expect(inGame.releases).toEqual(readReleases(root).slice(0, RELEASES_IN_GAME));
    const plugin = (viteConfig as { plugins: { name: string; generateBundle?: () => void }[] }).plugins.find(entry => entry.name === 'game-version')!;
    const emitted: { fileName: string; source: string }[] = [];
    plugin.generateBundle!.call({ emitFile: (file: { fileName: string; source: string }) => emitted.push(file) });
    expect(emitted.map(file => file.fileName)).toEqual(['version.json']);
    const published = JSON.parse(emitted[0].source);
    expect(Object.keys(published)).toEqual(['label', 'version', 'commit', 'builtAt', 'releases']);
    expect(published).toMatchObject({ label: `Version ${inGame.version} · ${inGame.commit}`, version: inGame.version, commit: inGame.commit, releases: inGame.releases });
    expect(Number.isNaN(Date.parse(published.builtAt))).toBe(false);
  });
});

describe('npm run release-notes', () => {
  const author = ['-c', 'user.name=Notes Test', '-c', 'user.email=notes@example.com', '-c', 'commit.gpgsign=false'];

  function repository() {
    const directory = mkdtempSync(join(tmpdir(), 'uplandin-notes-'));
    // A minute between commits, as in life: the notes read in the order they were made.
    let minute = 0;
    const git = (...args: string[]) => {
      const when = new Date(Date.UTC(2026, 9, 3, 12, minute++)).toISOString();
      return execFileSync('git', [...author, ...args], { cwd: directory, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_DATE: when, GIT_COMMITTER_DATE: when } }).trim();
    };
    const change = (file: string, subject: string) => {
      mkdirSync(dirname(join(directory, file)), { recursive: true });
      writeFileSync(join(directory, file), `${subject}\n`, { flag: 'a' });
      git('add', file); git('commit', '-q', '-m', subject);
    };
    mkdirSync(join(directory, 'scripts'));
    for (const file of ['releases.mjs', 'release-notes.mjs']) copyFileSync(join(root, 'scripts', file), join(directory, 'scripts', file));
    git('init', '-q', '-b', 'main');
    change('src/three/home.ts', 'First release');
    const first = git('rev-parse', '--short=7', 'HEAD');
    writeFileSync(join(directory, 'release-notes.json'), notesFile([{ date: '2026-10-02', through: first, notes: ['First release'] }], { about: 'Newest first.' }));
    git('add', '.'); git('commit', '-q', '-m', 'Release notes');
    const notes = () => execFileSync('node', ['scripts/release-notes.mjs'], { cwd: directory, encoding: 'utf8' });
    const read = () => readFileSync(join(directory, 'release-notes.json'), 'utf8');
    return { git, change, notes, read, first };
  }

  it('adds the subjects of the commits a player could notice since the last release, in order', () => {
    const repo = repository();
    repo.change('src/three/dog.ts', 'Steadier points');
    repo.change('docs/notes.md', 'Write up the playtest');
    repo.change('test/dog.test.ts', 'Test the points');
    repo.change('src/twod/field.ts', 'Retired 2D tweak');
    repo.git('switch', '-q', '-c', 'dawn');
    repo.change('public/textures/sky.txt', 'A brighter dawn');
    repo.git('switch', '-q', 'main');
    repo.change('home3d.html', 'A clearer home screen');
    repo.git('merge', '-q', '--no-ff', '-m', 'Merge the dawn', 'dawn');
    const head = repo.git('rev-parse', '--short=7', 'HEAD');
    const before = releaseDate();
    const output = repo.notes();
    const after = releaseDate();
    const written = JSON.parse(repo.read());
    expect(written.about).toBe('Newest first.');
    expect(written.releases).toHaveLength(2);
    expect([before, after]).toContain(written.releases[0].date);
    expect(written.releases[0]).toMatchObject({ through: head, notes: ['Steadier points', 'A brighter dawn', 'A clearer home screen'] });
    expect(written.releases[1].through).toBe(repo.first);
    expect(output).toContain(`through ${head}`);
  });

  it('leaves the file alone when nothing a player would notice has changed', () => {
    const repo = repository();
    repo.change('docs/notes.md', 'Write up the playtest');
    repo.change('scripts/tool.mjs', 'A new tool');
    const text = repo.read();
    expect(repo.notes()).toMatch(/Nothing a player would notice since [0-9a-f]{7}/);
    expect(repo.read()).toBe(text);
  });
});
