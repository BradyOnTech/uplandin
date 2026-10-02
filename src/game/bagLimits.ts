import type { Bird } from './birds';
import { regionOfArea } from './regions';
import type { HuntState } from './state';

/**
 * Daily bag limits, counted the way each region's regulations count them.
 * Several species can share one limit: South Dakota counts sharptails and
 * prairie chickens together as prairie grouse, and Nevada's chukar and Huns
 * share a partridge limit. Hen pheasants are protected outright (henDowns),
 * so they never count toward a limit.
 *
 * A Loaded field day is a preserve hunt on released birds, with no daily
 * limit; the goshawk's quarry is outside these rules too.
 */
export interface BagRule {
  /** Stable id for saves and tests. */
  id: string;
  /** How a hunter names the bag: "roosters", "prairie grouse". */
  label: string;
  species: readonly string[];
  limit: number;
}

const rule = (id: string, label: string, species: readonly string[], limit: number): BagRule => ({ id, label, species, limit });

/**
 * By region. The four offered grounds follow South Dakota (Prairie Pothole),
 * Kansas (Southern Plains) and Nevada (Great Basin) as of the 2025-26 and
 * 2026-27 regulations; the others are representative of their states.
 */
const REGION_RULES: Readonly<Record<string, readonly BagRule[]>> = {
  'prairie-pothole': [
    rule('roosters', 'roosters', ['ringneck'], 3),
    rule('prairie-grouse', 'prairie grouse', ['sharptail', 'prairie-chicken'], 3),
    rule('partridge', 'partridge', ['hun', 'chukar'], 5),
  ],
  'southern-plains': [
    rule('quail', 'quail', ['bobwhite', 'scaled-quail'], 8),
    rule('roosters', 'roosters', ['ringneck'], 4),
    rule('prairie-chickens', 'prairie chickens', ['prairie-chicken'], 2),
  ],
  'great-basin': [rule('partridge', 'chukar and Huns', ['chukar', 'hun'], 6)],
  'north-woods': [rule('ruffed-grouse', 'ruffed grouse', ['ruffed-grouse'], 5), rule('woodcock', 'woodcock', ['woodcock'], 3)],
  'sonoran-desert': [rule('quail', 'quail', ['gambels-quail', 'scaled-quail', 'mearns-quail'], 15)],
  'high-rockies': [rule('blue-grouse', 'blue grouse', ['blue-grouse'], 3), rule('mountain-quail', 'mountain quail', ['mountain-quail'], 4)],
  'pacific-valleys': [rule('quail', 'quail', ['california-quail'], 10)],
};

const IN_BAG: ReadonlySet<Bird['state']> = new Set(['downed', 'carried', 'retrieved']);

export function bagRules(areaId: string): readonly BagRule[] {
  return REGION_RULES[regionOfArea(areaId).id] ?? [];
}

export function bagRuleFor(areaId: string, speciesId: string): BagRule | null {
  return bagRules(areaId).find(candidate => candidate.species.includes(speciesId)) ?? null;
}

/** Limits hold on a wild-bird shotgun hunt, not a preserve day or a hawk's. */
export function limitsApply(hunt: Pick<HuntState, 'preserve' | 'huntingMethod'>): boolean {
  return !hunt.preserve && hunt.huntingMethod !== 'goshawk';
}

/** A bird downed toward a limit: every legal bird down, carried or in hand. */
export function countsTowardBag(bird: Pick<Bird, 'state' | 'speciesId' | 'sex'>): boolean {
  return IN_BAG.has(bird.state) && !(bird.speciesId === 'ringneck' && bird.sex === 'hen');
}

export function bagCount(hunt: Pick<HuntState, 'birds'>, bagRule: BagRule): number {
  let count = 0;
  for (const bird of hunt.birds) if (bagRule.species.includes(bird.speciesId) && countsTowardBag(bird)) count++;
  return count;
}

export interface BagLine { rule: BagRule; count: number }

/** The day's bag against each limit the hunt's birds fall under. */
export function bagLines(hunt: Pick<HuntState, 'areaId' | 'birds'>): BagLine[] {
  const stocked = new Set(hunt.birds.map(bird => bird.speciesId));
  return bagRules(hunt.areaId)
    .filter(candidate => candidate.species.some(id => stocked.has(id)))
    .map(candidate => ({ rule: candidate, count: bagCount(hunt, candidate) }));
}

/** This species' limit is in the bag: hold fire on the next one. */
export function limitFilled(hunt: Pick<HuntState, 'areaId' | 'birds' | 'preserve' | 'huntingMethod'>, speciesId: string): boolean {
  if (!limitsApply(hunt)) return false;
  const bagRule = bagRuleFor(hunt.areaId, speciesId);
  return !!bagRule && bagCount(hunt, bagRule) >= bagRule.limit;
}

/** Every limit the ground's birds fall under is filled: the hunter has limited out. */
export function limitedOut(hunt: Pick<HuntState, 'areaId' | 'birds' | 'preserve' | 'huntingMethod'>): boolean {
  if (!limitsApply(hunt)) return false;
  const lines = bagLines(hunt);
  return lines.length > 0 && lines.every(line => line.count >= line.rule.limit);
}

/** The limits filled today, by label, for the journal. */
export function limitsFilled(hunt: Pick<HuntState, 'areaId' | 'birds' | 'preserve' | 'huntingMethod'>): string[] {
  if (!limitsApply(hunt)) return [];
  return bagLines(hunt).filter(line => line.count >= line.rule.limit).map(line => line.rule.label);
}

/** "3 roosters · 5 partridge" for a ground's preparation notes. */
export function limitsLabel(areaId: string, speciesIds: readonly string[]): string {
  return bagRules(areaId)
    .filter(candidate => candidate.species.some(id => speciesIds.includes(id)))
    .map(candidate => `${candidate.limit} ${candidate.label}`)
    .join(' · ');
}
