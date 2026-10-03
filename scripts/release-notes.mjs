// npm run release-notes
//
// Run on main just before pushing a release. Adds the subjects of the commits
// a player could notice since the last release to release-notes.json, dated
// today. Edit the lines if you like, then commit the file and push.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PLAYER_FACING_PATHS, RELEASE_NOTES_FILE, addRelease, formatReleaseNotes, parseReleaseNotes, releaseDate } from './releases.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const file = fileURLToPath(new URL(`../${RELEASE_NOTES_FILE}`, import.meta.url));
const text = readFileSync(file, 'utf8');
const releases = parseReleaseNotes(text);
const last = releases[0]?.through;
if (!last) throw new Error(`${RELEASE_NOTES_FILE} has no releases yet; write the first one by hand.`);
const head = git('rev-parse', '--short=7', 'HEAD');
const notes = git('log', `${last}..HEAD`, '--no-merges', '--reverse', '--format=%s', '--', ...PLAYER_FACING_PATHS)
  .split('\n').map(line => line.trim()).filter(Boolean);
const next = addRelease(releases, { date: releaseDate(), through: head, notes });
if (next === releases) {
  console.log(`Nothing a player would notice since ${last}; ${RELEASE_NOTES_FILE} is unchanged.`);
} else {
  writeFileSync(file, formatReleaseNotes(text, next));
  console.log(`Added the ${next[0].date} release, through ${head}:`);
  for (const note of notes) console.log(`  • ${note}`);
  console.log(`Edit ${RELEASE_NOTES_FILE} if you like, then commit it and push.`);
}
