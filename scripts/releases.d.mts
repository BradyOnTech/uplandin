export interface Release { date: string; through: string; notes: string[] }
export interface BuildInfo { version: string; commit: string; builtAt: string; releases: Release[] }

export const RELEASE_TIME_ZONE: string;
export const RELEASE_NOTES_FILE: string;
export const RELEASES_IN_GAME: number;
export const PLAYER_FACING_PATHS: readonly string[];
export function releaseDate(when?: Date, timeZone?: string): string;
export function versionLabel(when?: Date, timeZone?: string): string;
export function parseReleaseNotes(text: string, file?: string): Release[];
export function readReleases(root: string): Release[];
export function addRelease(releases: Release[], release: Release): Release[];
export function formatReleaseNotes(text: string, releases: Release[]): string;
export function buildInfo(options: {
  root: string;
  env?: Record<string, string | undefined>;
  now?: Date;
  run?: (root: string, args: string[]) => string;
}): BuildInfo;
