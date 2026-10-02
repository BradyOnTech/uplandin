import { CAREER_KEY, readCareer, type Career, type StorageLike } from './career';
import { BREEDS } from './breeds';

/**
 * Save export and import: the career (kennel, journal, season, hunter) and
 * the player's settings in one JSON file, to keep a copy or carry a hunting
 * life to another browser or device. The career is read back through the
 * same migration as a load; a file that isn't a sound Uplandin save is
 * refused whole, never half applied.
 */
export const SAVE_APP = 'uplandin';
export const SAVE_VERSION = 1;
/** A save with a full journal of prints is about 150 KB; anything far past that is not one. */
export const SAVE_MAX_BYTES = 4_000_000;

/** Settings that travel with a save. Drafts and install caches stay with the device. */
export const SAVE_SETTING_KEYS: readonly string[] = [
  'uplandin.quick.v1', 'uplandin.gameplay-mode.v1', 'uplandin.3d.hunt-challenge.v1', 'uplandin.3d.assists.v1',
  'uplandin.3d.shot-assistance.v1', 'uplandin.3d.controls', 'uplandin.3d.sight', 'uplandin.3d.touch.look',
  'uplandin.3d.touch.swing', 'uplandin.3d.quality', 'uplandin.3d.sound', 'uplandin.3d.dogstyle', 'uplandin.3d.field-guide.v1',
];
const SETTING_MAX_CHARS = 16_000;

export interface SaveFile {
  app: typeof SAVE_APP;
  version: typeof SAVE_VERSION;
  exportedAt: string;
  career: Career;
  settings: Record<string, string>;
}

export type SaveRead = { ok: true; save: SaveFile } | { ok: false; message: string };

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const whole = (value: unknown, min = 0): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= min;

/** The career on this device and the settings worth keeping. */
export function exportSave(storage: StorageLike, now = new Date()): SaveFile {
  const settings: Record<string, string> = {};
  for (const key of SAVE_SETTING_KEYS) {
    const value = storage.getItem(key);
    if (value !== null && value.length <= SETTING_MAX_CHARS) settings[key] = value;
  }
  let career: Career | null = null;
  try { career = readCareer(JSON.parse(storage.getItem(CAREER_KEY) ?? 'null')); } catch { career = null; }
  return { app: SAVE_APP, version: SAVE_VERSION, exportedAt: now.toISOString(), career: career ?? readCareer({ version: 2 })!, settings };
}

/** "uplandin-save-2026-10-02.json" */
export function saveFileName(now = new Date()): string {
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return `uplandin-save-${day}.json`;
}

/** The kennel, calendar and hunter a game can stand on, after migration. */
function soundCareer(career: Career): boolean {
  const breeds = new Set(BREEDS.map((breed) => breed.id));
  return whole(career.hunts) && whole(career.downed) && whole(career.escaped)
    && record(career.date) && whole(career.date.season, 1) && whole(career.date.week)
    && record(career.hunter) && whole(career.hunter.level, 1) && whole(career.hunter.xp) && typeof career.hunter.shotgunId === 'string'
    && Array.isArray(career.regionsUnlocked) && career.regionsUnlocked.every((id) => typeof id === 'string')
    && record(career.areas)
    && Array.isArray(career.kennel) && career.kennel.length <= 24 && new Set(career.kennel.map((dog) => dog.id)).size === career.kennel.length
    && career.kennel.every((dog) => record(dog) && typeof dog.id === 'string' && typeof dog.name === 'string' && dog.name.length > 0
      && dog.name.length <= 120 && breeds.has(dog.breedId) && whole(dog.level, 1) && whole(dog.xp) && whole(dog.bornSeason, 1))
    && (career.activeDogId === null || career.kennel.some((dog) => dog.id === career.activeDogId))
    && (career.braceDogId === null || career.kennel.some((dog) => dog.id === career.braceDogId));
}

/** Read a save file's text. Pure; nothing is written. */
export function parseSave(text: string): SaveRead {
  if (text.length > SAVE_MAX_BYTES) return { ok: false, message: 'That file is too large to be an Uplandin save.' };
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { return { ok: false, message: 'That file isn’t an Uplandin save.' }; }
  if (!record(parsed) || parsed.app !== SAVE_APP) return { ok: false, message: 'That file isn’t an Uplandin save.' };
  if (parsed.version !== SAVE_VERSION) return { ok: false, message: 'That save comes from a newer version of Uplandin. Update the game, then import it.' };
  const career = readCareer(parsed.career);
  if (!career || !soundCareer(career)) return { ok: false, message: 'That save is damaged, so it was left alone.' };
  const settings: Record<string, string> = {};
  if (record(parsed.settings)) {
    for (const key of SAVE_SETTING_KEYS) {
      const value = parsed.settings[key];
      if (typeof value === 'string' && value.length <= SETTING_MAX_CHARS) settings[key] = value;
    }
  }
  const exportedAt = typeof parsed.exportedAt === 'string' && !Number.isNaN(Date.parse(parsed.exportedAt)) ? parsed.exportedAt : '';
  return { ok: true, save: { app: SAVE_APP, version: SAVE_VERSION, exportedAt, career, settings } };
}

/** Put a read save on this device: the career, and the settings it carries. */
export function applySave(save: SaveFile, storage: StorageLike): boolean {
  try {
    storage.setItem(CAREER_KEY, JSON.stringify(save.career));
    for (const [key, value] of Object.entries(save.settings)) if (SAVE_SETTING_KEYS.includes(key)) storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/** "Season 4 · 51 hunts · Belle, Scout" for the import confirmation. */
export function describeCareer(career: Career): string {
  const dogs = career.kennel.filter((dog) => dog.retiredSeason === undefined).map((dog) => dog.name);
  if (career.hunts === 0 && dogs.length === 0) return 'No career yet';
  return [`Season ${career.date.season}`, `${career.hunts} hunt${career.hunts === 1 ? '' : 's'}`, ...(dogs.length ? [dogs.slice(0, 3).join(', ') + (dogs.length > 3 ? '…' : '')] : [])].join(' · ');
}
