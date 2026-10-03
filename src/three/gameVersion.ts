/**
 * Which version this copy of the game is, what changed in it, and what the
 * server has now.
 *
 * The build writes the version in (vite.config.ts, scripts/releases.mjs): the
 * commit it was built from and that commit's day, read
 * "Version 2026.10.03 · bdf2729", with the latest release notes from
 * release-notes.json. The same build publishes them at /version.json, which
 * is never cached, so a copy can tell when production has moved on.
 */
export interface Release { date: string; through: string; notes: string[] }
export interface GameBuild { version: string; commit: string; releases: Release[] }
/** /version.json: what production is serving now. */
export interface PublishedVersion extends GameBuild { label: string; builtAt: string }

declare const __UPLANDIN_BUILD__: GameBuild | undefined;

const UNBUILT: GameBuild = { version: 'unversioned', commit: 'local', releases: [] };

export function thisBuild(): GameBuild {
  return typeof __UPLANDIN_BUILD__ === 'undefined' ? UNBUILT : __UPLANDIN_BUILD__;
}

export function versionText(build: Pick<GameBuild, 'version' | 'commit'>): string {
  return `Version ${build.version} · ${build.commit}`;
}

/** 2026-10-03 as a reader says it: October 3, 2026. */
export function releaseDay(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' })
    .format(new Date(Date.UTC(year, month - 1, day)));
}

/**
 * Releases newer than the one whose notes ran through `since`, newest first,
 * at most `limit`. Just the newest when `since` is unknown or too old to be
 * among them; none when `since` is the newest.
 */
export function releasesAfter(releases: readonly Release[], since: string | null | undefined, limit = 3): Release[] {
  const index = since ? releases.findIndex(release => release.through === since) : -1;
  return releases.slice(0, Math.min(limit, index < 0 ? 1 : index));
}

export interface ReadingRun { day: string | null; notes: string[] }

/**
 * Release notes to read, newest day first. Releases on the same day read as
 * one. Each day's notes come in short runs, so a page of the no-scroll menu
 * never has to cut one; only a day's first run names the day.
 */
export function readingRuns(releases: readonly Release[], size = 3): ReadingRun[] {
  const days: { date: string; notes: string[] }[] = [];
  for (const release of releases) {
    const last = days[days.length - 1];
    if (last?.date === release.date) last.notes.push(...release.notes);
    else days.push({ date: release.date, notes: [...release.notes] });
  }
  return days.flatMap(({ date, notes }) => Array.from({ length: Math.ceil(notes.length / size) }, (_, run) => ({
    day: run ? null : releaseDay(date), notes: notes.slice(run * size, run * size + size),
  })));
}

/** The newest release notes this player has been shown. */
export const WHATS_NEW_SEEN_KEY = 'uplandin.whats-new-seen.v1';
interface SeenStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  readonly length: number;
  key(index: number): string | null;
}

/**
 * The releases to show once, by themselves, after an update: those since the
 * newest ones this player was shown. A first visit shows nothing. A player
 * from before the game had versions (any saved Uplandin setting) sees the
 * newest release. Without storage nothing is shown, rather than every time.
 */
export function takeUnseenReleases(releases: readonly Release[], storage: SeenStorage | null | undefined): Release[] {
  const newest = releases[0];
  if (!newest || !storage) return [];
  try {
    const seen = storage.getItem(WHATS_NEW_SEEN_KEY);
    if (seen === newest.through) return [];
    const unseen = seen !== null || playedBefore(storage) ? releasesAfter(releases, seen) : [];
    storage.setItem(WHATS_NEW_SEEN_KEY, newest.through);
    return unseen;
  } catch {
    return [];
  }
}

function playedBefore(storage: SeenStorage): boolean {
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (key?.startsWith('uplandin') && key !== WHATS_NEW_SEEN_KEY) return true;
  }
  return false;
}

const isRelease = (value: unknown): value is Release => {
  const release = value as Release | null;
  return typeof release?.date === 'string' && typeof release.through === 'string'
    && Array.isArray(release.notes) && release.notes.every(note => typeof note === 'string');
};

export function parsePublishedVersion(value: unknown): PublishedVersion | null {
  const published = value as Partial<Record<keyof PublishedVersion, unknown>> | null;
  if (typeof published?.version !== 'string' || typeof published.commit !== 'string') return null;
  const version = published.version, commit = published.commit;
  return {
    label: typeof published.label === 'string' ? published.label : versionText({ version, commit }),
    version, commit,
    builtAt: typeof published.builtAt === 'string' ? published.builtAt : '',
    releases: Array.isArray(published.releases) ? published.releases.filter(isRelease) : [],
  };
}

/** What production serves now, never from a cache; null offline or in development. */
export async function fetchPublishedVersion(page: string = location.href, request: typeof fetch = fetch): Promise<PublishedVersion | null> {
  try {
    const response = await request(new URL('version.json', page), { cache: 'no-store' });
    return response.ok ? parsePublishedVersion(await response.json()) : null;
  } catch {
    return null;
  }
}
