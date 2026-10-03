// Versions and release notes, shared by the build (vite.config.ts) and
// `npm run release-notes`. Plain JavaScript, so both run on any Node.
//
// A version reads "2026.10.03 · bdf2729": the day of the commit that was
// built, on Brady's calendar, and that commit. release-notes.json, newest
// first, says what changed in each release; the build carries the latest few
// into the game and publishes them with the version at /version.json.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Releases are dated on Brady's calendar, wherever the build runs. */
export const RELEASE_TIME_ZONE = 'America/Chicago';
export const RELEASE_NOTES_FILE = 'release-notes.json';
/** How many releases the game carries for What's new. */
export const RELEASES_IN_GAME = 5;
/**
 * Commits a player could notice: the game's code, its public files and the
 * pages that are built. Docs, tests, tools and the retired 2D game are not.
 */
export const PLAYER_FACING_PATHS = [
  'src', 'public', 'index.html', 'home3d.html', 'index3d.html', 'prepare3d.html', 'shotguns3d.html',
  ':(exclude)src/twod', ':(exclude)src/scenes', ':(exclude)src/ui', ':(exclude)src/main.ts', ':(exclude)src/soundBoard.ts',
];

/** The calendar day of a moment in the release time zone, as 2026-10-03. */
export function releaseDate(when = new Date(), timeZone = RELEASE_TIME_ZONE) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(when).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** 2026.10.03: the version's day. */
export function versionLabel(when = new Date(), timeZone = RELEASE_TIME_ZONE) {
  return releaseDate(when, timeZone).replaceAll('-', '.');
}

/**
 * Release notes, checked strictly: a hand edit that breaks the file stops
 * the build with a plain message instead of shipping a game without notes.
 */
export function parseReleaseNotes(text, file = RELEASE_NOTES_FILE) {
  let parsed;
  try { parsed = JSON.parse(text); } catch (error) { throw new Error(`${file} is not valid JSON: ${error.message}`); }
  const releases = parsed?.releases;
  if (!Array.isArray(releases)) throw new Error(`${file} needs a "releases" list, newest first.`);
  releases.forEach((release, index) => {
    const where = `${file}, release ${index + 1}`;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(release?.date ?? '')) throw new Error(`${where} needs a "date" like 2026-10-03.`);
    if (!/^[0-9a-f]{7,40}$/.test(release.through ?? '')) throw new Error(`${where} needs "through": the commit its notes run up to.`);
    if (!Array.isArray(release.notes) || !release.notes.length || !release.notes.every(note => typeof note === 'string' && note.trim())) {
      throw new Error(`${where} needs "notes": a list of lines.`);
    }
    if (index && release.date > releases[index - 1].date) throw new Error(`${where} is newer than the one above it; keep the newest first.`);
  });
  return releases.map(({ date, through, notes }) => ({ date, through, notes: notes.map(note => note.trim()) }));
}

export function readReleases(root) {
  return parseReleaseNotes(readFileSync(resolve(root, RELEASE_NOTES_FILE), 'utf8'));
}

/** The file with a new release on top, or unchanged when it has nothing new. */
export function addRelease(releases, release) {
  if (!release.notes.length || releases[0]?.through === release.through) return releases;
  return [release, ...releases];
}

/** The file's text: its other fields kept, two-space JSON, one final newline. */
export function formatReleaseNotes(text, releases) {
  return `${JSON.stringify({ ...JSON.parse(text), releases }, null, 2)}\n`;
}

const git = (root, args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

/**
 * What this build is. Cloudflare names the commit it builds; elsewhere git
 * does. The version's day is the commit's own, so rebuilding a commit gives
 * the same game; a copy without git history is dated by its build instead.
 */
export function buildInfo({ root, env = process.env, now = new Date(), run = git }) {
  const ask = args => { try { return String(run(root, args)).trim(); } catch { return ''; } };
  const sha = (env.WORKERS_CI_COMMIT_SHA?.trim() || ask(['rev-parse', 'HEAD'])).toLowerCase();
  const known = /^[0-9a-f]{7,40}$/.test(sha);
  const committed = known ? Date.parse(ask(['log', '-1', '--format=%cI', sha])) : NaN;
  return {
    version: versionLabel(Number.isNaN(committed) ? now : new Date(committed)),
    commit: known ? sha.slice(0, 7) : 'unknown',
    builtAt: now.toISOString(),
    releases: readReleases(root),
  };
}
