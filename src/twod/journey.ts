/** The small, self-contained story behind Briar Glen's 2D adventure. */
export type Vec = { x: number; y: number };

export const JOURNEY_WIDTH = 1152;
export const JOURNEY_HEIGHT = 896;
export const SAVE_KEY = 'uplandin:2d:journey:v1';

export const NPCS = [
  { id: 'wren', name: 'Wren', x: 348, y: 688 },
  { id: 'milo', name: 'Milo', x: 560, y: 320 },
] as const;

export const SITES = [
  { id: 'robin', name: 'Robin', x: 432, y: 592, color: '#d77750', description: 'A bright little neighbor with a rust-red waistcoat. Listen for its cheerful song along the village trail.' },
  { id: 'quail', name: 'Bobwhite', x: 560, y: 480, color: '#b69860', description: 'A shy meadow bird that would rather wander through clover than hurry into the sky.' },
  { id: 'grouse', name: 'Grouse', x: 464, y: 256, color: '#917152', description: 'A quiet woodland neighbor with a fan-shaped tail. Fallen leaves hide its wonderfully speckled feathers.' },
  { id: 'kingfisher', name: 'Kingfisher', x: 880, y: 448, color: '#5faeba', description: 'A flash of river blue! This patient fisher watches the water from a favorite reed-side perch.' },
  { id: 'goldfinch', name: 'Goldfinch', x: 960, y: 224, color: '#e9c85b', description: 'A pocketful of sunshine with black-tipped wings. Its song carries from the very top of Sunlit Overlook.' },
] as const;

export const SATCHEL: Vec = { x: 496, y: 512 };
export const BRIDGE: Vec = { x: 736, y: 448 };

export interface JourneySave {
  version: 1;
  dogName: string;
  introduced: boolean;
  satchelFound: boolean;
  bridgeOpen: boolean;
  observed: string[];
  completed: boolean;
  player: Vec;
}

export type JourneyContext = {
  kind: 'talk' | 'search' | 'observe' | 'bridge' | 'pet' | 'none';
  id?: string;
  label: string;
};

export type JourneyInteraction =
  | { kind: 'dialogue'; speaker: string; lines: string[] }
  | { kind: 'encounter'; species: string }
  | null;

const START: Vec = { x: 272, y: 704 };
const EASTERN_BIRDS = new Set(['kingfisher', 'goldfinch']);
const distance = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function createJourneySave(): JourneySave {
  return {
    version: 1,
    dogName: 'Scout',
    introduced: false,
    satchelFound: false,
    bridgeOpen: false,
    observed: [],
    completed: false,
    player: { ...START },
  };
}

function sanitizeSave(value: unknown): JourneySave {
  const fresh = createJourneySave();
  if (!value || typeof value !== 'object') return fresh;
  const input = value as Record<string, unknown>;
  if (input.version !== 1) return fresh;

  const bridgeOpen = input.bridgeOpen === true;
  const satchelFound = input.satchelFound === true || bridgeOpen;
  const introduced = input.introduced === true || satchelFound;
  let observed = introduced && Array.isArray(input.observed)
    ? [...new Set(input.observed.filter((id): id is string =>
      typeof id === 'string' && SITES.some(site => site.id === id) && (bridgeOpen || !EASTERN_BIRDS.has(id))))]
    : [];
  // A stale or malformed save must not skip the overlook's discovery requirement.
  if (observed.filter(id => id !== 'goldfinch').length < 3) observed = observed.filter(id => id !== 'goldfinch');

  const position = input.player as Partial<Vec> | undefined;
  let player = position && typeof position.x === 'number' && Number.isFinite(position.x)
    && typeof position.y === 'number' && Number.isFinite(position.y)
    ? { x: clamp(position.x, 24, JOURNEY_WIDTH - 24), y: clamp(position.y, 24, JOURNEY_HEIGHT - 24) }
    : { ...START };
  // Recover safely if an older/corrupted save placed the player across a closed bridge.
  if (!bridgeOpen && player.x > BRIDGE.x + 32) player = { ...START };

  return {
    version: 1,
    dogName: typeof input.dogName === 'string' && input.dogName.trim()
      ? input.dogName.trim().slice(0, 18) : fresh.dogName,
    introduced,
    satchelFound,
    bridgeOpen,
    observed,
    completed: bridgeOpen && observed.includes('goldfinch'),
    player,
  };
}

export function parseJourneySave(raw: string | null | undefined): JourneySave {
  if (!raw) return createJourneySave();
  try { return sanitizeSave(JSON.parse(raw)); }
  catch { return createJourneySave(); }
}

export class Journey {
  save: JourneySave;
  player: Vec;
  dog: Vec;
  time = 0;
  dogState = 'following';
  private encounterId: string | null = null;
  private lastPlayer: Vec;
  private followDirection: Vec = { x: 1, y: 0 };
  private petCount = 0;

  constructor(save: JourneySave = createJourneySave()) {
    this.save = sanitizeSave(save);
    this.player = { ...this.save.player };
    this.lastPlayer = { ...this.player };
    this.dog = { x: this.player.x - 28, y: this.player.y + 18 };
  }

  update(dt: number, navigateDog?: (from: Vec, to: Vec, distance: number) => Vec): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const step = Math.min(dt, 0.1);
    this.time += step;
    this.player.x = clamp(this.player.x, 24, JOURNEY_WIDTH - 24);
    this.player.y = clamp(this.player.y, 24, JOURNEY_HEIGHT - 24);
    const dx = this.player.x - this.lastPlayer.x;
    const dy = this.player.y - this.lastPlayer.y;
    const travel = Math.hypot(dx, dy);
    if (travel > 0.2) this.followDirection = { x: dx / travel, y: dy / travel };
    this.lastPlayer = { ...this.player };

    let target: Vec = {
      x: this.player.x - this.followDirection.x * 32,
      y: this.player.y - this.followDirection.y * 32 + 10,
    };
    let speed = distance(this.dog, this.player) > 160 ? 210 : 132;
    this.dogState = this.encounterId ? 'watching' : 'following';
    if (!this.encounterId && this.save.introduced && !this.save.satchelFound && distance(this.player, SATCHEL) <= 130) {
      target = { x: SATCHEL.x - 15, y: SATCHEL.y + 10 };
      speed = 100;
      this.dogState = distance(this.dog, target) < 12 ? 'found' : 'sniffing';
    } else if (!this.encounterId && this.save.introduced) {
      const bird = SITES.find(site => !this.save.observed.includes(site.id) && this.siteAvailable(site.id) && distance(this.player, site) < 95);
      if (bird) {
        target = { x: bird.x - 22, y: bird.y + 26 };
        this.dogState = distance(this.dog, target) < 12 ? 'watching' : 'sniffing';
        speed = 96;
      }
    }
    if (!this.encounterId) {
      const gap = distance(this.dog, target);
      if (gap > 2) {
        const travel = Math.min(gap, step * speed);
        if (navigateDog) {
          // The renderer owns terrain; the story owns the dog's destination and pace.
          const next = navigateDog({ ...this.dog }, { ...target }, travel);
          if (Number.isFinite(next.x) && Number.isFinite(next.y)) this.dog = { x: next.x, y: next.y };
        } else {
          this.dog.x += (target.x - this.dog.x) * travel / gap;
          this.dog.y += (target.y - this.dog.y) * travel / gap;
        }
      }
    }
    this.save.player = { ...this.player };
  }

  context(): JourneyContext | null {
    if (this.encounterId) return null;
    const npc = NPCS.find(person => distance(this.player, person) <= 55);
    if (npc) return { kind: 'talk', id: npc.id, label: `Talk to ${npc.name}` };
    if (this.save.introduced && !this.save.satchelFound && distance(this.player, SATCHEL) <= 58) {
      return { kind: 'search', id: 'satchel', label: 'Search the flowers' };
    }
    if (!this.save.bridgeOpen && distance(this.player, BRIDGE) <= 80) {
      return { kind: 'bridge', id: 'bridge', label: 'Look at the bridge' };
    }
    if (this.save.introduced) {
      const site = SITES.find(bird => distance(this.player, bird) <= 54);
      if (site && (!EASTERN_BIRDS.has(site.id) || this.save.bridgeOpen)) {
        return { kind: 'observe', id: site.id, label: this.save.observed.includes(site.id) ? `Watch ${site.name} again` : 'Look closer' };
      }
    }
    if (distance(this.player, this.dog) <= 46) return { kind: 'pet', id: 'dog', label: `Pet ${this.save.dogName}` };
    return null;
  }

  interact(): JourneyInteraction {
    const action = this.context();
    if (!action) return null;
    if (action.kind === 'talk') return this.talk(action.id!);
    if (action.kind === 'search') {
      this.save.satchelFound = true;
      this.dogState = 'following';
      return this.dialogue(this.save.dogName, [
        `${this.save.dogName} noses through the flowers. A familiar green satchel!`,
        'Inside: a little hammer, wooden pegs, and Wren’s name stitched in the lining.',
        'Let’s take it back to Wren in the village.',
      ]);
    }
    if (action.kind === 'bridge') return this.dialogue('The old bridge', [
      'A few loose boards wobble over the stream. It needs a little care before you can cross.',
      this.save.satchelFound ? 'Wren’s repair kit is in the satchel. Bring it back to her in the village.' : 'Wren in the village might know how to mend it.',
    ]);
    if (action.kind === 'observe') {
      if (!this.siteAvailable(action.id!)) return this.dialogue('Sunlit Overlook', [
        'A tiny golden bird flits beyond the wildflowers. It’s a little shy.',
        'Get to know three other birds first. Their songs will help you listen for this one.',
      ]);
      this.encounterId = action.id!;
      this.dogState = 'watching';
      return { kind: 'encounter', species: action.id! };
    }
    if (action.kind === 'pet') {
      const lines = [
        `${this.save.dogName} leans into your hand, then looks up the trail. The best part of an adventure is having a friend along.`,
        `A happy tail, a muddy nose, and absolutely no regrets. Good dog, ${this.save.dogName}.`,
        `${this.save.dogName} gives your hand a gentle nudge. Ready whenever you are.`,
      ];
      return this.dialogue(this.save.dogName, [lines[this.petCount++ % lines.length]]);
    }
    return null;
  }

  finishEncounter(species: string, success: boolean): void {
    const site = SITES.find(bird => bird.id === species || bird.name.toLowerCase() === species.toLowerCase());
    if (!site || this.encounterId !== site.id) return;
    this.encounterId = null;
    this.dogState = 'following';
    if (!success || !this.siteAvailable(site.id)) return;
    if (!this.save.observed.includes(site.id)) this.save.observed.push(site.id);
    if (site.id === 'goldfinch') this.save.completed = true;
  }

  objective(): string {
    if (!this.save.introduced) return 'Say hello to Wren in the village.';
    if (!this.save.satchelFound) return `Follow ${this.save.dogName}’s nose into Clover Meadow.`;
    if (!this.save.bridgeOpen) return 'Bring the lost satchel back to Wren.';
    if (this.save.completed) return 'A whole glen of little stories. Where next?';
    if (this.save.observed.length < 3) return `Meet the birds of Briar Glen. ${this.save.observed.length} of 3 journal notes.`;
    return 'Follow the golden song to Sunlit Overlook.';
  }

  location(): string {
    if (this.player.x >= 800) return this.player.y < 330 ? 'Sunlit Overlook' : 'Reedwater';
    if (this.player.y < 360) return 'Fernwood Grove';
    if (this.player.y < 570) return 'Clover Meadow';
    return 'Briar Village';
  }

  snapshot(): JourneySave {
    this.save.player = { ...this.player };
    return { ...this.save, observed: [...this.save.observed], player: { ...this.player } };
  }

  private siteAvailable(id: string): boolean {
    if (!this.save.introduced) return false;
    if (EASTERN_BIRDS.has(id) && !this.save.bridgeOpen) return false;
    return id !== 'goldfinch' || this.save.observed.filter(bird => bird !== 'goldfinch').length >= 3;
  }

  private talk(id: string): JourneyInteraction {
    if (id === 'milo') return this.dialogue('Milo', [
      'Shh… hear that little drumroll? There’s a grouse tucked into the grove west of here.',
      this.save.bridgeOpen
        ? 'Across the stream, keep an eye out for a flash of blue. And if you know three birds, follow the golden song uphill.'
        : 'Wren was gathering flowers in the meadow when she lost her bag. Your friend has a better nose than either of us!',
    ]);
    if (!this.save.introduced) {
      this.save.introduced = true;
      return this.dialogue('Wren', [
        `You must be our new neighbor! And who’s this? Hello, ${this.save.dogName}.`,
        'Take this little field journal. Briar Glen has a story waiting behind every birdsong.',
        'I lost my green satchel in the meadow north of here. Think your friend could sniff it out?',
      ]);
    }
    if (this.save.satchelFound && !this.save.bridgeOpen) {
      this.save.bridgeOpen = true;
      return this.dialogue('Wren', [
        `My satchel! Well done, both of you. Especially that very clever nose, ${this.save.dogName}.`,
        'My bridge tools are all here. A few taps and… there! You can cross the stream now.',
        'Meet three birds for your journal, then visit Sunlit Overlook. A golden little singer lives up there.',
      ]);
    }
    if (this.save.completed) return this.dialogue('Wren', [
      'You found the goldfinch! I knew you two would make a wonderful team.',
      'Keep the journal. Briar Glen is your home now, and there are always more little things to notice.',
    ]);
    return this.dialogue('Wren', [this.save.bridgeOpen
      ? 'Take your time out there. The meadow, the grove, and the stream each have their own birdsong.'
      : `Try the flowers in Clover Meadow, just north of the village. ${this.save.dogName} will know when you’re close.`]);
  }

  private dialogue(speaker: string, lines: string[]): JourneyInteraction {
    return { kind: 'dialogue', speaker, lines };
  }
}
