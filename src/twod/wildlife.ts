export type WildlifeSpecies = 'robin' | 'quail' | 'grouse' | 'kingfisher' | 'goldfinch';
export type WildlifeStance = 'shy' | 'curious' | 'restless' | 'relaxed';
export type WildlifeAction = 'watch' | 'wait' | 'dog' | 'sketch' | 'leave';
export type WildlifeState = {
  species: WildlifeSpecies;
  stance: WildlifeStance;
  trust: number;
  turns: number;
  dogHelpUsed: boolean;
  outcome: 'playing' | 'sketched' | 'left';
  feedback: string;
};

type BirdProfile = {
  name: string;
  habitat: string;
  stances: readonly WildlifeStance[];
  clues: Record<Exclude<WildlifeStance, 'relaxed'>, string>;
  note: string;
  body: string;
  wing: string;
  breast: string;
  head: string;
};

const BIRDS: Record<WildlifeSpecies, BirdProfile> = {
  robin: {
    name: 'Robin', habitat: 'A little company in the meadow',
    stances: ['shy', 'curious', 'restless'],
    clues: {
      shy: 'The robin peeks out from the grass, then hides. A quiet wait might help.',
      curious: 'It hops closer and tilts its head. This is a good moment to watch.',
      restless: 'A leaf crackles. The robin freezes with one foot raised. Give it a moment.',
    },
    note: 'A bright red breast, a tilted head, and a song much bigger than its singer.',
    body: '#79766b', wing: '#585c50', breast: '#d77c50', head: '#77796a',
  },
  quail: {
    name: 'Bobwhite', habitat: 'A rustle beside the old trail',
    stances: ['restless', 'shy', 'curious'],
    clues: {
      shy: 'The bobwhite nestles into the clover. Let it come out in its own time.',
      curious: 'It steps into the open to inspect you. Watch those tiny, careful steps.',
      restless: 'It turns its head from side to side. Stay still while it settles.',
    },
    note: 'A bright white throat, dappled feathers, and a talent for vanishing into the clover.',
    body: '#af976b', wing: '#7e745d', breast: '#d8c390', head: '#736b57',
  },
  grouse: {
    name: 'Grouse', habitat: 'A secret in the woodland shade',
    stances: ['shy', 'restless', 'curious'],
    clues: {
      shy: 'Only a pair of bright eyes shows beneath the fern. Wait without moving.',
      curious: 'The grouse lifts its fan of feathers. Watch gently; it is showing off.',
      restless: 'Its feather collar lifts at a distant sound. Give the woods time to quiet.',
    },
    note: 'Leaf-colored feathers hide a magnificent fan. The quiet woods are full of surprises.',
    body: '#997b53', wing: '#6b604b', breast: '#c5a475', head: '#88704f',
  },
  kingfisher: {
    name: 'Kingfisher', habitat: 'A flash of blue by the water',
    stances: ['restless', 'curious', 'shy'],
    clues: {
      shy: 'The kingfisher edges along its perch. Be still and let it feel at home.',
      curious: 'It leans over the water, perfectly still. Watch for a flash beneath the surface.',
      restless: 'It darts its gaze between you and the stream. Wait for the ripples to settle.',
    },
    note: 'River-blue wings and a patient eye. One sudden dive, then only ripples remain.',
    body: '#38958e', wing: '#287c82', breast: '#dcaa69', head: '#368d92',
  },
  goldfinch: {
    name: 'Goldfinch', habitat: 'Sunshine among the wildflowers',
    stances: ['curious', 'shy', 'restless'],
    clues: {
      shy: 'It slips behind a thistle and peeks around. Wait for its courage to return.',
      curious: 'The goldfinch turns a seed in its beak. Watch how neatly it opens it.',
      restless: 'A gust rocks the thistle. It flutters to keep its balance. Give it a little time.',
    },
    note: 'A pocketful of sunshine with ink-black wings. Every thistle is a tiny feast.',
    body: '#e1bd53', wing: '#4c584e', breast: '#f0d77c', head: '#dfbc4c',
  },
};

function normalizedSpecies(species: string): WildlifeSpecies {
  return Object.prototype.hasOwnProperty.call(BIRDS, species) ? species as WildlifeSpecies : 'robin';
}

export function createWildlifeState(species: string): WildlifeState {
  const selected = normalizedSpecies(species);
  return {
    species: selected, stance: BIRDS[selected].stances[0], trust: 0, turns: 0,
    dogHelpUsed: false, outcome: 'playing', feedback: 'You and {dog} settle quietly nearby.',
  };
}

export function wildlifeClue(state: WildlifeState): string {
  if (state.stance === 'relaxed') return 'It feels at home with you now. Take out your sketchbook.';
  return BIRDS[state.species].clues[state.stance];
}

/** A patient observer can always recover from a startled bird. There is no timer. */
export function advanceWildlife(state: WildlifeState, action: WildlifeAction): WildlifeState {
  if (state.outcome !== 'playing') return state;
  if (action === 'leave') return { ...state, outcome: 'left' };
  if (action === 'sketch') {
    return state.trust >= 3
      ? { ...state, outcome: 'sketched', feedback: BIRDS[state.species].note }
      : { ...state, feedback: 'A little more patience. Let the bird feel at home first.' };
  }
  if (state.trust >= 3) return state;
  if (action === 'dog' && state.dogHelpUsed) {
    return { ...state, feedback: '{dog} stays quietly at your side. Follow the bird’s lead.' };
  }

  const correct = action === 'dog' || (state.stance === 'curious' ? action === 'watch' : action === 'wait');
  const trust = correct ? Math.min(3, state.trust + 1) : Math.max(0, state.trust - 1);
  const stance = trust === 3 ? 'relaxed' : correct ? BIRDS[state.species].stances[trust] : 'shy';
  const feedback = action === 'dog'
    ? stance === 'relaxed'
      ? '{dog} lies down gently. The bird feels right at home beside you both.'
      : stance === 'curious'
        ? '{dog} settles beside you. The bird comes closer — try watching it now.'
        : '{dog} lies down gently. Follow that lead and wait a little longer.'
    : correct
      ? action === 'watch' ? 'You notice a lovely detail. The bird seems just as curious about you.' : 'You give it time. Its feathers soften, and it moves a little closer.'
      : action === 'watch'
        ? 'It hops back at the movement. No hurry. A quiet wait will help.'
        : 'The moment passes, and it wanders back into the grass. Let it settle again.';
  return { ...state, trust, stance, turns: state.turns + 1, dogHelpUsed: state.dogHelpUsed || action === 'dog', feedback };
}

const STYLE = `
.wildlife-root{position:fixed;inset:0;z-index:100;display:grid;place-items:center;padding:20px;background:#193a35b8;backdrop-filter:blur(5px);color:#28473d;font-family:inherit;-webkit-font-smoothing:antialiased;overscroll-behavior:contain}
.wildlife-root *{box-sizing:border-box}
.wildlife-card{width:min(720px,100%);max-height:calc(100dvh - 40px);overflow:auto;background:#fff9e9;border-radius:18px;box-shadow:0 24px 80px #102d3540,0 2px 8px #102d3526;isolation:isolate}
.wildlife-scene{position:relative;overflow:hidden;background:#b8d8b0;border-radius:18px 18px 0 0}
.wildlife-canvas{display:block;width:100%;aspect-ratio:320/182;image-rendering:pixelated}
.wildlife-header{position:absolute;inset:0 0 auto;display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:24px 28px;background:linear-gradient(#d7e9c9e8,transparent)}
.wildlife-kicker{margin:0 0 5px;color:#426752;font-size:10px;font-weight:700;line-height:1.3;letter-spacing:.13em;text-transform:uppercase}
.wildlife-name{margin:0;color:#25473e;font-family:inherit;font-size:clamp(25px,4vw,34px);font-weight:750;letter-spacing:-.04em;line-height:1.1;text-wrap:balance}
.wildlife-trust{display:flex;gap:7px;flex:none;margin-top:12px;padding:5px 0;align-items:center}
.wildlife-pip{display:block;width:9px;height:9px;background:#e8efda;border:1.5px solid #789779;border-radius:50%;transition:background-color .2s,border-color .2s,transform .2s}
.wildlife-pip.filled{background:#d48765;border-color:#b46950;transform:scale(1.1)}
.wildlife-dialogue{position:relative;padding:25px 28px 17px;background:#fff9e9;box-shadow:0 -2px 0 #31574526}
.wildlife-feedback{min-height:42px;margin:0 0 9px;color:#677662;font-size:13px;line-height:1.55;text-wrap:pretty}
.wildlife-clue{min-height:54px;margin:0;color:#28473d;font-size:17px;font-weight:550;line-height:1.5;text-wrap:pretty}
.wildlife-actions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin-top:23px}
.wildlife-action{display:flex;min-width:0;min-height:49px;align-items:center;justify-content:center;gap:7px;padding:10px 12px;color:#325344;background:#e8edd6;border:1px solid #b9c9a6;border-radius:9px;font-family:inherit;font-size:14px;font-weight:650;line-height:1.3;text-align:center;cursor:pointer;box-shadow:0 2px 0 #90a17a30;transition:transform .15s,background-color .15s,box-shadow .15s}
.wildlife-action:hover{background:#dde6c7;box-shadow:0 3px 0 #90a17a40}.wildlife-action:active,.wildlife-leave:active{transform:scale(.96)}
.wildlife-action:focus-visible,.wildlife-leave:focus-visible{outline:3px solid #4a8d80;outline-offset:3px}
.wildlife-action:disabled{opacity:.52;cursor:default;box-shadow:none;transform:none}
.wildlife-action svg{width:18px;height:18px;flex:none;stroke:currentColor;fill:none;stroke-width:1.65;stroke-linecap:round;stroke-linejoin:round}
.wildlife-primary{grid-column:1/-1;max-width:350px;justify-self:center;width:100%;background:#477563;color:#fffbea;border-color:#477563;box-shadow:0 3px 0 #2b5442}.wildlife-primary:hover{background:#3f6b5a}
.wildlife-leave{display:block;min-height:44px;margin:9px auto 0;padding:10px 18px;color:#65755f;background:transparent;border:0;border-radius:8px;font-family:inherit;font-size:12px;line-height:1.4;cursor:pointer;transition:color .15s,transform .15s}.wildlife-leave:hover{color:#244e3d}
.wildlife-tip{margin:14px 0 0;color:#68785f;text-align:center;font-size:11px;line-height:1.4}
.wildlife-note{display:flex;align-items:center;gap:7px;margin:0 0 12px;color:#527250;font-size:11px;font-weight:750;letter-spacing:.11em;text-transform:uppercase}
.wildlife-root [hidden]{display:none!important}
@media(max-width:520px){.wildlife-root{padding:12px}.wildlife-card{max-height:calc(100dvh - 24px);border-radius:14px}.wildlife-scene{border-radius:14px 14px 0 0}.wildlife-canvas{aspect-ratio:320/235;object-fit:cover}.wildlife-header{padding:21px}.wildlife-kicker{font-size:9px;max-width:190px}.wildlife-name{font-size:28px}.wildlife-dialogue{padding:21px 20px 12px}.wildlife-feedback{font-size:12px;min-height:38px}.wildlife-clue{font-size:16px;min-height:72px}.wildlife-actions{gap:7px;margin-top:20px}.wildlife-action{min-height:48px;padding:10px 7px;font-size:13px;gap:5px}.wildlife-action svg{width:16px;height:16px}.wildlife-tip{margin-top:13px}}
@media(max-height:570px) and (min-width:521px){.wildlife-card{display:grid;grid-template-columns:1fr 1fr;max-width:880px}.wildlife-scene{border-radius:18px 0 0 18px;min-height:330px}.wildlife-canvas{height:100%;object-fit:cover}.wildlife-header{padding:18px}.wildlife-name{font-size:25px}.wildlife-kicker{font-size:9px}.wildlife-dialogue{padding:20px}.wildlife-clue{font-size:15px}.wildlife-actions{margin-top:15px}.wildlife-action{font-size:12px}.wildlife-action svg{display:none}}
@media(prefers-reduced-motion:reduce){.wildlife-root *{transition:none!important}}
`;

const ICONS = {
  watch: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>',
  wait: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  dog: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7-4-3-1 9 5-1m10-5 4-3 1 9-5-1M7 7c3-2 7-2 10 0v8c0 7-10 7-10 0Z"/><path d="M10 11h.01M14 11h.01m-3 4 1 1 1-1"/></svg>',
};

let nextEncounterId = 0;

/** A self-contained woodland meeting. The caller owns exploration and save progress. */
export class WildlifeEncounter {
  private root: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private context: CanvasRenderingContext2D;
  private state: WildlifeState;
  private previousFocus = document.activeElement;
  private abort = new AbortController();
  private raf = 0;
  private started = false;
  private disposed = false;
  private returned = false;
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private lastFrame = 0;
  private elapsed = 0;

  constructor(
    container: HTMLElement,
    species: string,
    private dogName: string,
    private onFinish: (success: boolean) => void,
    private onSound?: (name: 'bird' | 'discovery' | 'point') => void,
  ) {
    this.state = createWildlifeState(species);
    const profile = BIRDS[this.state.species];
    const titleId = `wildlife-title-${++nextEncounterId}`;
    this.root = document.createElement('div');
    this.root.className = 'wildlife-root';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-labelledby', titleId);
    this.root.innerHTML = `<style>${STYLE}</style><section class="wildlife-card">
      <div class="wildlife-scene"><canvas class="wildlife-canvas" width="320" height="182" role="img" aria-label="A ${profile.name.toLowerCase()} and your companion dog in a sunlit woodland clearing"></canvas>
        <header class="wildlife-header"><div><p class="wildlife-kicker">${profile.habitat}</p><h2 class="wildlife-name" id="${titleId}">${profile.name}</h2></div><div class="wildlife-trust" role="img" aria-label="The bird is getting to know you"><i class="wildlife-pip"></i><i class="wildlife-pip"></i><i class="wildlife-pip"></i></div></header>
      </div>
      <div class="wildlife-dialogue"><div class="wildlife-live" role="status" aria-live="polite" aria-atomic="true"><p class="wildlife-note" hidden>✦ A new page in your field notes</p><p class="wildlife-feedback"></p><p class="wildlife-clue"></p></div><div class="wildlife-actions"></div><p class="wildlife-tip">Take your time. Watch what the bird does.</p><button type="button" class="wildlife-leave">Leave it in peace</button></div>
    </section>`;
    container.append(this.root);
    this.canvas = this.root.querySelector('.wildlife-canvas')!;
    const context = this.canvas.getContext('2d');
    if (!context) throw new Error('Your browser could not draw this woodland meeting.');
    this.context = context;
    this.root.querySelector('.wildlife-leave')!.addEventListener('click', () => this.finish(this.state.outcome === 'sketched'), { signal: this.abort.signal });
    this.root.addEventListener('keydown', this.onKeyDown, { signal: this.abort.signal });
    this.render();
    this.draw(0);
  }

  start(): void {
    if (this.started || this.disposed) return;
    this.started = true;
    this.onSound?.('bird');
    this.root.querySelector<HTMLButtonElement>('.wildlife-action')?.focus({ preventScroll: true });
    if (!this.reducedMotion) this.raf = requestAnimationFrame(this.tick);
  }

  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.abort.abort();
    cancelAnimationFrame(this.raf);
    this.root.remove();
    if (this.previousFocus instanceof HTMLElement && this.previousFocus.isConnected) this.previousFocus.focus({ preventScroll: true });
  }

  private finish(success: boolean): void {
    if (this.returned || this.disposed) return;
    this.returned = true;
    this.destroy();
    this.onFinish(success);
  }

  private act(action: WildlifeAction): void {
    if (this.disposed) return;
    const previous = this.state;
    this.state = advanceWildlife(this.state, action);
    if (this.state.outcome === 'left') { this.finish(false); return; }
    if (this.state.outcome === 'sketched') this.onSound?.('discovery');
    else if (this.state.trust > previous.trust) this.onSound?.(action === 'dog' ? 'point' : 'bird');
    this.render(action);
    this.draw(this.elapsed);
  }

  private render(lastAction?: WildlifeAction): void {
    const success = this.state.outcome === 'sketched';
    this.root.querySelector('.wildlife-feedback')!.textContent = this.state.feedback.replaceAll('{dog}', this.dogName);
    this.root.querySelector('.wildlife-clue')!.textContent = success ? `${BIRDS[this.state.species].name}, beautifully remembered.` : wildlifeClue(this.state);
    this.root.querySelector<HTMLElement>('.wildlife-note')!.hidden = !success;
    this.root.querySelector<HTMLElement>('.wildlife-tip')!.hidden = success || this.state.trust >= 3;
    this.root.querySelector('.wildlife-trust')!.setAttribute('aria-label', `${this.state.trust} of 3 moments of trust`);
    this.root.querySelectorAll('.wildlife-pip').forEach((pip, index) => pip.classList.toggle('filled', index < this.state.trust));
    const actions = this.root.querySelector<HTMLDivElement>('.wildlife-actions')!;
    actions.replaceChildren();
    const add = (label: string, action: WildlifeAction | 'continue', icon = '', primary = false, disabled = false) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `wildlife-action${primary ? ' wildlife-primary' : ''}`;
      button.dataset.action = action;
      button.disabled = disabled;
      if (icon) button.innerHTML = icon;
      const text = document.createElement('span');
      text.textContent = label;
      button.append(text);
      button.addEventListener('click', () => action === 'continue' ? this.finish(true) : this.act(action), { signal: this.abort.signal });
      actions.append(button);
    };
    if (success) add('Back to the trail', 'continue', '', true);
    else if (this.state.trust >= 3) add('Sketch this moment', 'sketch', '', true);
    else {
      add('Watch', 'watch', ICONS.watch);
      add('Wait', 'wait', ICONS.wait);
      add(`Ask ${this.dogName}`, 'dog', ICONS.dog, false, this.state.dogHelpUsed);
    }
    this.root.querySelector<HTMLElement>('.wildlife-leave')!.hidden = success;
    if (lastAction) {
      const matching = actions.querySelector<HTMLButtonElement>(`[data-action="${lastAction}"]:not(:disabled)`);
      (matching ?? actions.querySelector<HTMLButtonElement>('button:not(:disabled)'))?.focus({ preventScroll: true });
    }
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); this.finish(this.state.outcome === 'sketched'); return; }
    if (event.key !== 'Tab') return;
    const buttons = [...this.root.querySelectorAll<HTMLButtonElement>('button:not(:disabled):not([hidden])')];
    const first = buttons[0];
    const last = buttons.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };

  private tick = (time: number): void => {
    if (this.disposed) return;
    if (time - this.lastFrame >= 80) {
      this.elapsed = time / 1000;
      this.draw(this.elapsed);
      this.lastFrame = time;
    }
    this.raf = requestAnimationFrame(this.tick);
  };

  private draw(time: number): void {
    const ctx = this.context;
    ctx.imageSmoothingEnabled = false;
    const rect = (x: number, y: number, width: number, height: number, color: string) => {
      ctx.fillStyle = color;
      ctx.fillRect(Math.round(x), Math.round(y), width, height);
    };
    rect(0, 0, 320, 182, '#cee4bc');
    rect(0, 53, 320, 129, '#b5d4a5');
    for (let i = 0; i < 13; i++) {
      const x = i * 29 - 20;
      const top = 39 + (i * 17 % 29);
      rect(x, top, 32, 72, '#9fc597'); rect(x + 4, top - 7, 24, 7, '#9fc597');
      rect(x + 13, top + 14, 5, 58, '#92b68c');
    }
    rect(0, 102, 320, 80, '#9fbe82');
    rect(0, 109, 320, 73, '#a7c38a');
    rect(74, 113, 183, 40, '#b8ca92');
    rect(57, 123, 218, 20, '#b8ca92');
    rect(110, 153, 143, 29, '#c6ce98');
    rect(127, 145, 98, 8, '#c6ce98');
    rect(135, 158, 20, 2, '#acb885'); rect(192, 175, 23, 2, '#acb885');
    if (this.state.species === 'kingfisher') {
      rect(128, 105, 127, 8, '#90bbb2'); rect(145, 112, 157, 22, '#90bbb2');
      rect(188, 115, 82, 2, '#c5dad0'); rect(150, 108, 26, 2, '#c5dad0');
      rect(256, 123, 17, 2, '#c5dad0');
    }
    for (const [x, y, scale] of [[-3, 46, 1], [282, 58, .85], [30, 13, .7]] as const) {
      ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
      rect(19, 22, 10, 83, '#6c8560'); rect(22, 24, 4, 80, '#7d936a');
      rect(0, 5, 49, 44, '#659770'); rect(6, -4, 37, 12, '#659770');
      rect(-7, 16, 64, 23, '#659770'); rect(1, 10, 48, 22, '#7aab7b');
      rect(9, 0, 29, 14, '#7aab7b'); rect(7, 36, 38, 5, '#5c906a'); ctx.restore();
    }
    for (let i = 0; i < 37; i++) {
      const x = (i * 73 + 9) % 316;
      const y = 111 + (i * 23 % 65);
      if (x > 64 && x < 264 && y > 115 && y < 155) continue;
      rect(x, y, 2, 4, '#83a66f'); rect(x - 2, y - 1, 2, 2, '#83a66f');
      if (i % 4 === 0) { rect(x, y - 4, 3, 3, '#f3deb0'); rect(x + 1, y - 3, 1, 1, '#d9af6c'); }
    }
    // A companion seen from behind, looking toward the bird.
    ctx.save(); ctx.translate(82, 142);
    rect(-22, 16, 39, 5, '#8aa276');
    rect(-15, -8, 25, 24, '#f2ead5'); rect(-12, -12, 21, 7, '#eee6d0');
    rect(-10, -29, 22, 23, '#eee6d0'); rect(-8, -32, 16, 7, '#f5ecd5');
    rect(-15, -27, 8, 18, '#8b8273'); rect(8, -27, 8, 18, '#8b8273');
    rect(-10, -7, 20, 3, '#c67d66'); rect(-14, 10, 7, 9, '#e8e1c9'); rect(6, 10, 7, 9, '#e8e1c9');
    rect(-4, -22, 6, 15, '#f5ecd5');
    rect(-10, -2, 7, 5, '#9c9582'); rect(4, 4, 3, 3, '#827f6e');
    rect(-4, 10, 2, 2, '#a79f8b'); rect(3, -2, 2, 2, '#a79f8b');
    const wag = this.state.dogHelpUsed ? Math.sin(time * 4) > 0 ? 2 : -1 : 0;
    rect(-22, 3 + wag, 13, 5, '#f2ead5'); rect(-24, -1 + wag, 5, 7, '#f2ead5');
    ctx.restore();
    // Each species has its own feather colors and silhouette, drawn on a small pixel grid.
    const profile = BIRDS[this.state.species];
    const bob = this.state.stance === 'restless' ? Math.round(Math.sin(time * 4) * 1.5) : Math.round(Math.sin(time * 1.9) * .6);
    const close = this.state.trust * -4;
    ctx.save(); ctx.translate(222 + close, 116 + bob); ctx.scale(1.35, 1.35);
    rect(-21, 22 - bob, 43, 4, '#91a77a');
    if (this.state.species === 'grouse') {
      rect(14, -14, 16, 28, '#655c48'); rect(24, -9, 11, 18, '#816c4d');
      rect(16, -11, 13, 3, '#c2a575'); rect(23, -4, 10, 3, '#c2a575'); rect(20, 7, 10, 3, '#c2a575');
    } else {
      rect(16, 3, this.state.species === 'kingfisher' ? 10 : 15, 5, profile.wing);
      rect(23, 0, 7, 4, profile.wing);
    }
    rect(-16, -10, 33, 26, profile.body); rect(-11, -15, 24, 6, profile.body);
    rect(-12, 15, 25, 5, profile.body); rect(-17, -4, 15, 18, profile.breast);
    rect(-13, 11, 18, 6, profile.breast); rect(-17, -24, 21, 22, profile.head);
    rect(-13, -28, 15, 5, profile.head); rect(-20, -20, 5, 15, profile.head);
    rect(1, -6, 18, 15, profile.wing); rect(6, 9, 10, 3, profile.wing);
    rect(3, -3, 11, 3, this.state.species === 'goldfinch' ? '#ede7bb' : '#ffffff25');
    rect(-24, -14, 6, 4, '#78674b');
    if (this.state.species === 'kingfisher') { rect(-31, -16, 13, 3, '#4c6c62'); rect(-17, -30, 14, 3, '#428d8d'); rect(-15, -7, 10, 4, '#f1e3b4'); }
    if (this.state.species === 'robin') { rect(-17, -14, 15, 11, '#d77c50'); rect(-17, -5, 13, 9, '#e08f61'); }
    if (this.state.species === 'goldfinch') { rect(-15, -27, 16, 6, '#49554b'); rect(6, 6, 12, 2, '#e8e9c5'); }
    if (this.state.species === 'quail') {
      rect(-18, -25, 17, 3, '#f1e9cc'); rect(-18, -13, 13, 7, '#f1e9cc');
      for (let i = 0; i < 6; i++) rect(-6 + i % 3 * 5, 7 + Math.floor(i / 3) * 5, 2, 2, '#6f694f');
    }
    if (this.state.species === 'grouse') { rect(-8, -31, 4, 5, '#706147'); rect(-4, -32, 4, 6, '#706147'); rect(-4, -9, 10, 7, '#5a5747'); }
    const blink = time > .5 && Math.floor(time * 5) % 41 === 0 && !this.reducedMotion;
    rect(-14, -20, 4, blink ? 1 : 4, '#273f36');
    if (!blink) rect(-13, -20, 1, 1, '#f5f2cd');
    rect(-6, 20, 2, 5, '#8b7651'); rect(7, 20, 2, 5, '#8b7651');
    rect(-9, 24, 6, 2, '#8b7651'); rect(4, 24, 6, 2, '#8b7651');
    ctx.restore();
    if (this.state.outcome === 'sketched') {
      for (const [x, y] of [[186, 79], [256, 87], [247, 112]]) {
        rect(x - 2, y, 5, 1, '#fff4bd'); rect(x, y - 2, 1, 5, '#fff4bd');
      }
    }
  }
}
