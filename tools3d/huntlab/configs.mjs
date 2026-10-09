// Hunt-lab config sets.
//   node tools3d/huntlab/configs.mjs pacing [areas] > /tmp/uplandin-huntlab/pacing.json
// 'pacing': every core ground x each entry x 6 seeds x three hunters, with a
// level-1 pup and a level-8 dog of two breeds, 10-minute hunts, shooting.
import { pathToFileURL } from 'node:url';

export const CORE_AREAS = ['quail-fields', 'pheasant-coverts', 'sharptail-prairie', 'chukar-ridge'];
export const SEEDS = [48291, 1184004868, 41, 7, 2026, 90210];
export const HUNTERS = ['follow', 'trail', 'tactic'];
export const DOGS = [['gsp', 8], ['english-setter', 8], ['gsp', 1]];

/** Entries per ground; newer checkouts may have more than two. */
export function pacingConfigs(areas = CORE_AREAS, entries = {}) {
  const out = [];
  for (const area of areas)
    for (const drop of entries[area] ?? ['south-gate', 'west-track'])
      for (const seed of SEEDS)
        for (const [breed, level] of DOGS)
          for (const hunter of HUNTERS)
            out.push({ area, drop, seed, breed, level, wind: 'breezy', weather: 'frost', hunter, seconds: 600 });
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [set = 'pacing', areaList, entryJson] = process.argv.slice(2);
  const areas = areaList ? areaList.split(',') : CORE_AREAS;
  const entries = entryJson ? JSON.parse(entryJson) : {};
  if (set !== 'pacing') throw new Error(`unknown set ${set}`);
  process.stdout.write(JSON.stringify(pacingConfigs(areas, entries)));
}
