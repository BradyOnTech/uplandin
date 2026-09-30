import type { DogWork, HuntState } from './state';

/**
 * The after-hunt read on a dog: the numbers that describe its work and one to
 * three plain notes on what went well or what to handle differently. Pure
 * text from the shared tally, so both renderers and the journal agree.
 */
export interface DogReport {
  name: string;
  stats: { label: string; value: number }[];
  notes: string[];
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const times = (n: number) => n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`;

export function dogReport(name: string, work: DogWork): DogReport {
  // Older tallies only counted points that produced a flush.
  const points = Math.max(work.pointFlushes, (work.points ?? 0) + (work.relocations ?? 0));
  const stats = [
    { label: 'Points', value: points },
    { label: 'Held to the flush', value: work.pointFlushes },
    { label: 'Retrieves', value: work.retrieves },
    { label: 'Backs', value: work.backs ?? 0 },
    { label: 'Broke', value: work.breaks ?? 0 },
    { label: 'Bumped', value: work.bumps ?? 0 },
  ].filter((stat, i) => i < 3 || stat.value > 0);

  // Most useful first: habits to fix, then the good work worth knowing about.
  const notes: string[] = [];
  const breaks = work.breaks ?? 0, crowding = (work.bumps ?? 0) + (work.creeps ?? 0);
  if (breaks > 0) notes.push(`Broke and chased ${times(breaks)}. Whoa (Z) on point steadies it before the flush.`);
  if (crowding >= 2) notes.push(`Crowded its birds ${times(crowding)}. Whoa it as you walk in.`);
  else if ((work.bumps ?? 0) === 1) notes.push('Bumped one bird before you could get there.');
  if ((work.unproductive ?? 0) > 0) notes.push(`${plural(work.unproductive!, 'bird')} slipped away from its points. Hunt on (X) sends it in to relocate a runner.`);
  if ((work.relocations ?? 0) > 0) notes.push(`Relocated ${plural(work.relocations!, 'running bird')} to a fresh point.`);
  if ((work.deadFinds ?? 0) > 0) notes.push(`Found ${plural(work.deadFinds!, 'unmarked fall')} with its nose.`);
  if ((work.deadMisses ?? 0) > 0) notes.push(`Came up empty hunting dead ${times(work.deadMisses!)}.`);
  if ((work.unheard ?? 0) >= 2) notes.push(`Was out of earshot for ${plural(work.unheard!, 'command')}. Stay closer when it is working.`);
  if ((work.backs ?? 0) > 0) notes.push(`Backed its bracemate's point ${times(work.backs!)}.`);
  if (points >= 2 && breaks === 0 && crowding === 0) notes.push(points >= 4 ? 'Handled every point cleanly. A finished performance.' : 'Handled its points cleanly.');
  if (!notes.length) notes.push(points === 0 ? 'No points today. Walk it into fresh cover and give it time.' : 'A steady day’s work.');
  return { name, stats, notes: notes.slice(0, 3) };
}

/** Handler lines that belong to the hunt, not the dog. */
export function handlerNotes(hunt: HuntState): string[] {
  const notes: string[] = [];
  const lost = hunt.lostBirds ?? 0;
  if (lost > 0) notes.push(`${plural(lost, 'downed bird')} never recovered. Mark falls, and send the dog with Dead bird (V).`);
  const low = hunt.safety?.lowShots ?? 0, line = hunt.safety?.dogInLine ?? 0;
  if (line > 0) notes.push(`Fired with a dog in the line ${times(line)}. Never swing through your dog.`);
  if (low > 0) notes.push(`${plural(low, 'low shot')} at birds skimming the cover.`);
  return notes;
}
