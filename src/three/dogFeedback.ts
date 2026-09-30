import type { CommandResponse, DogLogKind, DogState, HandlerCommandKind } from '../game/dog';

/**
 * Words for the handler: what the dog did with a command, and the moments of
 * dog work worth a glance. Pure text; the HUD decides how long to show it.
 */
const BUSY: Partial<Record<DogState, string>> = {
  pointing: 'is on point', honoring: 'is backing', retrieving: 'is on a retrieve', breaking: 'is chasing',
  tracking: 'is working scent', heel: 'is at heel', recalled: 'is coming in', whoa: 'is stopped', seeking: 'is hunting dead',
};

const COMMAND_WORD: Record<HandlerCommandKind, string> = { whoa: 'Whoa', release: 'Hunt on', cast: 'This way', dead: 'Dead bird' };

function answer(kind: HandlerCommandKind, response: CommandResponse, name: string, state: DogState): string {
  switch (response) {
    case 'stopped': return `${name} stops`;
    case 'steadied': return `${name} steady on point`;
    case 'released': return `${name} hunting`;
    case 'relocating': return `${name} moves in to relocate`;
    case 'cast': return `${name} casts out`;
    case 'hunting-dead': return `${name} hunting the fall`;
    case 'out-of-earshot': return `${name} can't hear you · get closer`;
    case 'busy': return kind === 'release' && (state === 'quartering' || state === 'tracking') ? `${name} is already hunting` : `${name} ${BUSY[state] ?? 'is busy'}`;
  }
}

/** One line for a command given to one dog or a brace. */
export function dogCommandFeedback(kind: HandlerCommandKind, responses: readonly CommandResponse[], states: readonly DogState[], names: readonly string[]): string {
  const parts = responses.map((response, i) => answer(kind, response, names[i] ?? 'Dog', states[i] ?? 'quartering'));
  // A brace answering alike reads as one sentence.
  const same = responses.every(response => response === responses[0]) && responses.length > 1 && responses[0] !== 'busy';
  const body = same ? answer(kind, responses[0], names.join(' and '), states[0] ?? 'quartering').replace(/ stops$/, ' stop')
    .replace(/ casts out$/, ' cast out').replace(/ moves in/, ' move in') : parts.join(' · ');
  return `${COMMAND_WORD[kind]} · ${body}`;
}

/** The dog-work moments worth telling the handler about, or null. */
export function dogNoteFeedback(kind: DogLogKind, name: string): string | null {
  switch (kind) {
    case 'relocated': return `${name} relocated · on point again`;
    case 'unproductive': return `The bird slipped away from ${name}`;
    case 'bump': return `${name} bumped a bird`;
    case 'dead-found': return `${name} found the bird`;
    case 'dead-lost': return `${name} couldn't find the bird · send it with Dead bird`;
    default: return null;
  }
}
