export type EncounterResult = { hits: number; shots: number };

type Species = 'bobwhite' | 'pheasant' | 'grouse';
type Sound = 'shot' | 'hit' | 'flush';
type Pattern = 'rise' | 'crosswind' | 'corkscrew';
type ShotFeedback = 'hit' | 'near' | 'miss' | 'decoy';
type Point = { x: number; y: number; depth: number };
type ApproachBrief = { strategy: 'careful' | 'steady' | 'rush'; timing: 'quick' | 'settled' | 'late'; quality: number; bonus: number };
type WaveConfig = {
  name: string;
  pattern: Pattern;
  direction: number;
  duration: number;
  startX: number;
  startY: number;
  wind: number;
  depth: number;
  phase: number;
  decoy?: boolean;
};
type Bird = {
  x: number;
  y: number;
  age: number;
  duration: number;
  direction: number;
  hit: boolean;
  escaped: boolean;
  hitAge: number;
  startX: number;
  startY: number;
  pattern: Pattern;
  wind: number;
  phase: number;
  depth: number;
  baseDepth: number;
  decoy: boolean;
  offsetY: number;
};
type Feather = { x: number; y: number; vx: number; vy: number; life: number; age: number; angle: number; color: string };
type ShotRing = { x: number; y: number; age: number; feedback: ShotFeedback; label: string };

const NAMES: Record<Species, string> = {
  bobwhite: 'Bobwhite quail', pheasant: 'Ring-necked pheasant', grouse: 'Ruffed grouse',
};

/* Every rise teaches a different skill. Values are normalized to the canvas. */
const WAVES: readonly WaveConfig[] = [
  { name: 'Rising cross', pattern: 'rise', direction: 1, duration: 3.05, startX: .06, startY: .79, wind: .026, depth: .65, phase: .2 },
  { name: 'Crosswind', pattern: 'crosswind', direction: -1, duration: 2.72, startX: .94, startY: .35, wind: .046, depth: .76, phase: 1.8, decoy: true },
  { name: 'Last arc', pattern: 'corkscrew', direction: 1, duration: 2.42, startX: .04, startY: .53, wind: .062, depth: .56, phase: 3.1 },
];

const STYLES = `
.encounter-root{position:fixed;inset:0;z-index:80;display:grid;place-items:center;padding:16px;background:#061521eb;backdrop-filter:blur(6px);font-family:inherit;color:#173447;-webkit-font-smoothing:antialiased;touch-action:none;box-sizing:border-box}
.encounter-root *{box-sizing:border-box}
.encounter-card{position:relative;width:min(900px,100%);max-height:calc(100dvh - 32px);display:flex;flex-direction:column;overflow:hidden;background:#d9c58e;border:3px solid #071521;outline:2px solid #d09b49;border-radius:3px;box-shadow:10px 10px 0 #020b11d9,inset 0 0 0 1px #fff0ad80}
.encounter-card:before{content:'';position:absolute;inset:8px;z-index:4;pointer-events:none;border:1px solid #d09b4945}
.encounter-header{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px 24px 16px;color:#f2dfaa;background:#0b2435;border-bottom:2px solid #d09b49}
.encounter-eyebrow{margin:0 0 6px;color:#e5b75f;font:800 9px/1.2 ui-monospace,SFMono-Regular,monospace;letter-spacing:.18em;text-transform:uppercase}
.encounter-title{margin:0;color:#fff0bb;font-family:"Arial Black",Impact,sans-serif;font-size:clamp(22px,4vw,30px);font-weight:900;letter-spacing:.02em;line-height:1;text-transform:uppercase;text-wrap:balance}
.encounter-pause{display:grid;place-items:center;width:44px;height:44px;flex:none;color:#f4dda0;background:#112e40;border:2px solid #c8974a;border-radius:3px;box-shadow:3px 3px 0 #06131d;cursor:pointer;font-size:17px;transition:transform .14s,background-color .16s}
.encounter-pause:hover{background:#1b4759}.encounter-pause:active,.encounter-return:active,.encounter-resume:active{transform:scale(.96)}
.encounter-pause[hidden],.encounter-status[hidden]{display:none}
.encounter-view{position:relative;height:clamp(280px,52dvh,470px);flex:0 1 auto;min-height:220px;margin:10px 10px 0;overflow:hidden;background:#718365;border:2px solid #173c4a;outline:1px solid #d09b49;border-radius:2px}
.encounter-canvas{width:100%;height:100%;display:block;image-rendering:pixelated;cursor:crosshair;touch-action:none;outline:none}
.encounter-canvas:focus-visible{outline:3px solid #f0c66e;outline-offset:-5px}
.encounter-topline{position:absolute;top:14px;right:14px;left:14px;display:flex;align-items:center;justify-content:space-between;gap:12px;pointer-events:none}
.encounter-round{padding:8px 11px;color:#fff0bd;background:#0b2537eb;border:2px solid #d09b49;box-shadow:3px 3px 0 #0715217d;font:800 10px/1 ui-monospace,SFMono-Regular,monospace;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap}
.encounter-shells{display:flex;align-items:center;gap:6px;min-height:32px;padding:7px 10px;background:#0b2537eb;border:2px solid #d09b49;box-shadow:3px 3px 0 #0715217d}
.encounter-shell{position:relative;width:10px;height:20px;background:#bb5938;border:1px solid #f0c66e;border-radius:2px 2px 1px 1px;box-shadow:inset 3px 0 #ffffff21;transition:opacity .18s,transform .18s;transform-origin:center bottom}
.encounter-shell:after{content:'';position:absolute;right:-1px;bottom:-1px;left:-1px;height:5px;background:#e2b85e;border-radius:1px}
.encounter-shell.spent{opacity:.2;transform:rotate(14deg) translateY(2px)}
.encounter-status{position:absolute;right:18px;bottom:20px;left:18px;display:flex;justify-content:center;pointer-events:none;text-align:center}
.encounter-status span{max-width:100%;padding:10px 16px;color:#fff1be;background:#0a2335ed;border:2px solid #d09b49;box-shadow:4px 4px 0 #07152190;font-size:13px;font-weight:800;line-height:1.35;text-wrap:balance}
.encounter-footer{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:16px 24px 19px;color:#365a62}
.encounter-instructions{margin:0;color:#536d69;font-size:11px;line-height:1.55}.encounter-instructions strong{color:#173b4e;font-weight:900;text-transform:uppercase}.encounter-instructions em{color:#a14e37;font-style:normal;font-weight:900}
.encounter-score{display:flex;flex:none;gap:7px}.encounter-mark{display:grid;place-items:center;width:28px;height:28px;color:#60786f;background:#efdca65e;border:2px solid #708578;font:900 12px/1 ui-monospace,SFMono-Regular,monospace;transition:background-color .2s,color .2s,border-color .2s}.encounter-mark.hit{color:#fff0b8;background:#a95138;border-color:#e3ac5d}.encounter-mark.miss{color:#8d684c;background:#c7b07c;border-color:#8e7450}
.encounter-finish,.encounter-paused{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;padding:26px;color:#f7e4ac;background:linear-gradient(#061b2be8,#0b2b3bf2);backdrop-filter:blur(4px);text-align:center}
.encounter-finish[hidden],.encounter-paused[hidden]{display:none}.encounter-finish-badge{display:grid;place-items:center;width:62px;height:62px;margin-bottom:15px;color:#f1c76a;background:#a9533826;border:2px solid #d09b49;border-radius:2px;box-shadow:4px 4px 0 #06131d;font-size:30px;transform:rotate(-3deg)}
.encounter-finish h3,.encounter-paused h3{margin:0 0 10px;color:#fff0bb;font:900 clamp(25px,5vw,36px)/1 "Arial Black",Impact,sans-serif;letter-spacing:.015em;text-transform:uppercase;text-wrap:balance}
.encounter-finish p,.encounter-paused p{max-width:330px;margin:0 0 21px;color:#b5c8aa;font-size:13px;line-height:1.6;text-wrap:pretty}
.encounter-return,.encounter-resume{min-height:47px;padding:13px 23px;color:#1a2730;background:#d27348;border:2px solid #f0c66e;border-radius:3px;box-shadow:4px 4px 0 #06131d;font-family:inherit;font-size:12px;font-weight:900;letter-spacing:.05em;text-transform:uppercase;cursor:pointer;transition:transform .14s,background-color .16s}.encounter-return:hover,.encounter-resume:hover{background:#e18b57}
.encounter-pause:focus-visible,.encounter-return:focus-visible,.encounter-resume:focus-visible{outline:3px solid #f0c66e;outline-offset:3px}
@media(max-width:500px){.encounter-root{padding:12px}.encounter-card{max-height:calc(100dvh - 24px)}.encounter-header{padding:17px 18px 15px}.encounter-view{margin:9px 9px 0;height:53dvh;min-height:245px}.encounter-footer{padding:14px 18px 17px;gap:10px}.encounter-instructions{font-size:10px}.encounter-topline{top:11px;right:11px;left:11px}.encounter-round{padding:7px 9px;font-size:9px}.encounter-shells{padding:6px 8px}.encounter-status{right:12px;bottom:16px;left:12px}.encounter-status span{padding:9px 12px;font-size:12px}.encounter-mark{width:25px;height:25px}}
@media(max-height:540px){.encounter-root{padding:10px}.encounter-card{max-height:calc(100dvh - 20px)}.encounter-header{padding:10px 17px}.encounter-title{font-size:22px}.encounter-eyebrow{margin-bottom:4px;font-size:8px}.encounter-view{height:55dvh;min-height:155px;margin-top:7px}.encounter-footer{padding:8px 17px 10px}.encounter-finish{padding:12px}.encounter-finish-badge{display:none}.encounter-finish h3{font-size:24px}.encounter-finish p{margin-bottom:12px;font-size:11px}.encounter-status{bottom:10px}}
@media(prefers-reduced-motion:reduce){.encounter-root *{transition:none!important}}
`;

/** A self-contained, three-rise field encounter. It never changes exploration state. */
export class Encounter {
  private root: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private status: HTMLSpanElement;
  private round: HTMLDivElement;
  private shells: HTMLDivElement;
  private marks: HTMLSpanElement[];
  private finishPanel: HTMLDivElement;
  private pausePanel: HTMLDivElement;
  private pauseButton: HTMLButtonElement;
  private previousFocus: Element | null;
  private abort = new AbortController();
  private resizeObserver: ResizeObserver;
  private backdrop: HTMLImageElement | null = null;
  private sprites: HTMLImageElement | null = null;
  private raf = 0;
  private width = 1;
  private height = 1;
  private started = false;
  private disposed = false;
  private returned = false;
  private paused = false;
  private done = false;
  private lastTime = 0;
  private elapsed = 0;
  private wave = -1;
  private waveConfig: WaveConfig | null = null;
  private waveShells = 2;
  private shots = 0;
  private hits = 0;
  private shotsInWave = 0;
  private perfectWaves = 0;
  private nearMisses = 0;
  private bird: Bird | null = null;
  private decoy: Bird | null = null;
  private transition = .82;
  private spawnTimer = 0;
  private feathers: Feather[] = [];
  private aim = { x: .5, y: .56, goalX: .5, goalY: .56, active: false };
  private keys = new Set<string>();
  private lastShot = -100;
  private recoil = 0;
  private shotRing: ShotRing | null = null;
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor(
    container: HTMLElement,
    private species: Species,
    private onFinish: (result: EncounterResult) => void,
    private onSound?: (name: Sound) => void,
    private approach?: ApproachBrief,
  ) {
    this.previousFocus = document.activeElement;
    this.root = document.createElement('div');
    this.root.className = 'encounter-root';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-label', `${NAMES[species]} field encounter`);
    this.root.innerHTML = `<style>${STYLES}</style>
      <section class="encounter-card">
        <header class="encounter-header"><div><p class="encounter-eyebrow">On the wing</p><h2 class="encounter-title">${NAMES[species]}</h2></div><button class="encounter-pause" type="button" aria-label="Pause encounter" title="Pause encounter">Ⅱ</button></header>
        <div class="encounter-view">
          <canvas class="encounter-canvas" tabindex="0" aria-label="Hunting field. Lead the flying bird and tap to shoot. Use arrow keys to aim and Space to shoot."></canvas>
          <div class="encounter-topline"><div class="encounter-round">Cover quiet</div><div class="encounter-shells" role="img" aria-label="2 shells remaining this rise"><i class="encounter-shell"></i><i class="encounter-shell"></i></div></div>
          <div class="encounter-status" role="status" aria-live="polite"><span>Read the wind. Watch for the flush…</span></div>
          <div class="encounter-finish" hidden></div>
          <div class="encounter-paused" hidden><p class="encounter-eyebrow">A moment in the field</p><h3>Take your time.</h3><p>Your dog is waiting right here.</p><button type="button" class="encounter-resume">Keep going</button></div>
        </div>
        <footer class="encounter-footer"><p class="encounter-instructions"><strong>Lead the bird, then fire.</strong> Two shells per rise.<br><em>Warm wings are real · pale wings are decoys.</em><br>Mouse/touch aim · arrows move · Space fires</p><div class="encounter-score" aria-label="Three rises"><span class="encounter-mark">1</span><span class="encounter-mark">2</span><span class="encounter-mark">3</span></div></footer>
      </section>`;
    container.append(this.root);
    this.canvas = this.root.querySelector('.encounter-canvas')!;
    const context = this.canvas.getContext('2d');
    if (!context) throw new Error('Your browser could not create the hunting field.');
    this.ctx = context;
    this.status = this.root.querySelector('.encounter-status span')!;
    this.round = this.root.querySelector('.encounter-round')!;
    this.shells = this.root.querySelector('.encounter-shells')!;
    this.marks = [...this.root.querySelectorAll<HTMLSpanElement>('.encounter-mark')];
    this.finishPanel = this.root.querySelector('.encounter-finish')!;
    this.pausePanel = this.root.querySelector('.encounter-paused')!;
    this.pauseButton = this.root.querySelector('.encounter-pause')!;
    const options = { signal: this.abort.signal };
    this.canvas.addEventListener('pointermove', this.pointerMove, options);
    this.canvas.addEventListener('pointerdown', this.pointerDown, options);
    this.canvas.addEventListener('contextmenu', event => event.preventDefault(), options);
    this.pauseButton.addEventListener('click', () => this.pause(!this.paused), options);
    this.root.querySelector('.encounter-resume')!.addEventListener('click', () => this.pause(false), options);
    document.addEventListener('keydown', this.keyDown, { ...options, capture: true });
    document.addEventListener('keyup', this.keyUp, { ...options, capture: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.pause(true);
    }, options);
    window.addEventListener('blur', () => { this.keys.clear(); this.pause(true); }, options);
    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(this.canvas);
    this.resize();
  }

  async start(): Promise<void> {
    if (this.started || this.disposed) return;
    this.started = true;
    const base = import.meta.env.BASE_URL + 'art/';
    const [backdrop, sprites] = await Promise.all([
      this.loadImage(base + 'flush-backdrop-southern-plains.png'),
      this.loadImage(base + (this.species === 'pheasant' ? 'ringneck-rooster-flush.png' : 'bobwhite-flush-sheet-alpha.png')),
    ]);
    if (this.disposed) return;
    this.backdrop = backdrop;
    this.sprites = sprites;
    this.canvas.focus({ preventScroll: true });
    this.lastTime = performance.now();
    if (!this.done) this.raf = requestAnimationFrame(this.tick);
  }

  pause(paused: boolean): void {
    if (this.disposed || this.done || this.paused === paused) return;
    this.paused = paused;
    this.keys.clear();
    this.pausePanel.hidden = !paused;
    this.pauseButton.textContent = paused ? '▶' : 'Ⅱ';
    this.pauseButton.setAttribute('aria-label', paused ? 'Resume encounter' : 'Pause encounter');
    if (paused) this.pausePanel.querySelector<HTMLButtonElement>('button')!.focus({ preventScroll: true });
    else this.canvas.focus({ preventScroll: true });
  }

  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.abort.abort();
    this.resizeObserver.disconnect();
    this.keys.clear();
    this.root.remove();
    if (this.previousFocus instanceof HTMLElement && this.previousFocus.isConnected) this.previousFocus.focus({ preventScroll: true });
  }

  private loadImage(src: string): Promise<HTMLImageElement | null> {
    return new Promise(resolve => {
      const img = new Image();
      const timeout = window.setTimeout(() => settle(null), 4000);
      let settled = false;
      const settle = (value: HTMLImageElement | null) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        img.onload = null;
        img.onerror = null;
        resolve(value);
      };
      img.onload = () => settle(img);
      img.onerror = () => settle(null);
      img.src = src;
      this.abort.signal.addEventListener('abort', () => settle(null), { once: true });
    });
  }

  private resize = (): void => {
    const bounds = this.canvas.getBoundingClientRect();
    const oldWidth = this.width, oldHeight = this.height;
    this.width = Math.max(1, bounds.width);
    this.height = Math.max(1, bounds.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
    const xRatio = this.width / oldWidth, yRatio = this.height / oldHeight;
    for (const bird of [this.bird, this.decoy]) {
      if (!bird) continue;
      bird.x *= xRatio;
      bird.y *= yRatio;
      bird.startX *= xRatio;
      bird.startY *= yRatio;
    }
    this.draw();
  };

  private pointerMove = (event: PointerEvent): void => {
    const bounds = this.canvas.getBoundingClientRect();
    this.aim.goalX = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    this.aim.goalY = Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height));
    this.aim.active = true;
  };

  private pointerDown = (event: PointerEvent): void => {
    if (!event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    this.pointerMove(event);
    this.canvas.focus({ preventScroll: true });
    // Touch uses the finger's exact point. The reticle still eases toward it,
    // making drag aiming readable without making a tap fail due to reticle lag.
    this.shoot({ x: this.aim.goalX, y: this.aim.goalY });
  };

  private keyDown = (event: KeyboardEvent): void => {
    if (this.disposed || !this.root.isConnected) return;
    // Exploration may place its own pause/help dialog above this encounter.
    if (!this.root.contains(document.activeElement)) return;
    if (event.key === 'Tab') {
      const focusable = [...this.root.querySelectorAll<HTMLElement>('button,canvas[tabindex]')].filter(el => !el.closest('[hidden]') && !el.hasAttribute('disabled'));
      if (!focusable.length) return;
      const current = focusable.indexOf(document.activeElement as HTMLElement);
      const next = event.shiftKey ? (current <= 0 ? focusable.length - 1 : current - 1) : (current + 1) % focusable.length;
      event.preventDefault();
      event.stopPropagation();
      focusable[next].focus();
      return;
    }
    const key = event.key.toLowerCase();
    if (!['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd', ' '].includes(key)) return;
    event.stopImmediatePropagation();
    if (document.activeElement instanceof HTMLButtonElement && key === ' ') return;
    event.preventDefault();
    if (this.done || this.paused) return;
    if (key === ' ') { if (!event.repeat) this.shoot(); }
    else { this.keys.add(key); this.aim.active = true; }
  };

  private keyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.key.toLowerCase());
  };

  private shoot(point?: { x: number; y: number }): void {
    const bird = this.bird;
    if (!this.started || this.disposed || this.paused || this.done || !bird || bird.hit || bird.escaped || this.transition > 0 || this.spawnTimer > 0 || this.waveShells < 1 || this.elapsed - this.lastShot < .18) return;
    this.lastShot = this.elapsed;
    this.waveShells--;
    this.shotsInWave++;
    this.shots++;
    this.onSound?.('shot');
    this.recoil = this.reducedMotion ? 0 : 1;
    const x = (point?.x ?? this.aim.x) * this.width;
    const y = (point?.y ?? this.aim.y) * this.height;
    // A shell takes a fraction of a second to reach the crossing. The player
    // must put the reticle just ahead of the bird instead of clicking its
    // current center.
    const impactDelay = .105 + Math.max(0, .9 - bird.depth) * .045;
    const predicted = this.birdPoint(bird, bird.age + impactDelay);
    const realDistance = this.targetDistance(x, y, predicted, bird);
    const realHit = realDistance < 1;
    const decoyPoint = this.decoy && !this.decoy.escaped ? this.birdPoint(this.decoy, this.decoy.age + impactDelay) : null;
    const decoyHit = Boolean(this.decoy && decoyPoint && this.targetDistance(x, y, decoyPoint, this.decoy) < 1.1);
    const near = realDistance < 2.25;
    let feedback: ShotFeedback = 'miss';
    let label = 'MISS';
    if (realHit) {
      feedback = 'hit';
      label = 'LEAD CLEAN';
    } else if (decoyHit) {
      feedback = 'decoy';
      label = 'FALSE WING';
    } else if (near) {
      feedback = 'near';
      label = 'FEATHER CLOSE';
    }
    this.shotRing = { x, y, age: 0, feedback, label };
    this.updateShells();

    if (realHit) {
      bird.hit = true;
      bird.hitAge = 0;
      bird.x = predicted.x;
      bird.y = predicted.y;
      bird.depth = predicted.depth;
      this.hits++;
      if (this.shotsInWave === 1) this.perfectWaves++;
      this.onSound?.('hit');
      this.setStatus(this.hits === 3 ? 'Three rises, three clean leads.' : this.shotsInWave === 1 ? 'Clean lead. Your dog is on it.' : 'That lead found the wing. Good dog.');
      this.markWave(true);
      this.spawnFeathers(bird);
      if (this.decoy) this.decoy.escaped = true;
    } else {
      this.nearMisses += near ? 1 : 0;
      if (feedback === 'decoy') this.setStatus(this.waveShells ? 'False wing. Hold for the warm bird.' : 'False wing. The real bird is away.');
      else if (feedback === 'near') this.setStatus(this.waveShells ? 'Feather close. Lead a little farther.' : 'Feather close, but it crossed the line.');
      else this.setStatus(this.waveShells ? 'Behind it. Read the crossing and lead ahead.' : 'That one is away into the cover.');
      if (this.waveShells === 0) this.escapeBird();
    }
  }

  private targetDistance(x: number, y: number, point: Point, bird: Bird): number {
    const size = this.birdSize(bird, point.depth);
    const radiusX = size * (bird.decoy ? .42 : .4);
    const radiusY = size * (bird.decoy ? .34 : .31);
    return Math.hypot((x - point.x) / radiusX, (y - point.y) / radiusY);
  }

  private spawnFeathers(bird: Bird): void {
    for (let i = 0; i < 20; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 30 + Math.random() * 115;
      this.feathers.push({ x: bird.x, y: bird.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 50, age: 0, life: .5 + Math.random() * .8, angle, color: ['#f4e6b4', '#9b7648', '#dbc184', '#fff3d6'][i % 4] });
    }
  }

  private updateShells(): void {
    this.shells.setAttribute('aria-label', `${this.waveShells} shells remaining this rise`);
    [...this.shells.children].forEach((shell, index) => shell.classList.toggle('spent', index >= this.waveShells));
  }

  private setStatus(message: string): void {
    this.status.textContent = message;
  }

  private markWave(hit: boolean): void {
    if (this.wave < 0 || !this.marks[this.wave]) return;
    const mark = this.marks[this.wave];
    mark.className = `encounter-mark ${hit ? 'hit' : 'miss'}`;
    mark.textContent = hit ? '✓' : '–';
    mark.setAttribute('aria-label', `Rise ${this.wave + 1}: ${hit ? 'retrieved' : 'escaped'}`);
  }

  private nextWave(): void {
    this.wave++;
    if (this.wave >= WAVES.length) { this.complete(); return; }
    this.waveConfig = WAVES[this.wave];
    this.waveShells = 2;
    this.shotsInWave = 0;
    this.bird = null;
    this.decoy = null;
    this.spawnTimer = .42 + this.wave * .08;
    this.updateShells();
    this.round.textContent = `Rise ${this.wave + 1} / 3 · ${this.waveConfig.name}`;
    this.setStatus(this.wave === 0 ? 'The cover is moving… set your lead.' : this.wave === 1 ? 'Crosswind rise. Warm wings are real; pale wings are decoys.' : 'Last rise. Small, fast, and moving with the wind.');
    if (!this.aim.active) {
      this.aim.x = .5;
      this.aim.y = .58;
      this.aim.goalX = .5;
      this.aim.goalY = .58;
    }
  }

  private activateWave(): void {
    const config = this.waveConfig;
    if (!config || this.bird || this.done) return;
    this.bird = this.createBird(config, false);
    this.decoy = config.decoy ? this.createBird(config, true) : null;
    this.spawnTimer = 0;
    this.setStatus(this.wave === 0 ? 'Bird up. Put the shot just ahead of the wing.' : this.wave === 1 ? 'Two shapes in the wind. Follow the warm wing.' : 'Make the lead count. The window is short.');
    this.onSound?.('flush');
  }

  private createBird(config: WaveConfig, decoy: boolean): Bird {
    const direction = config.direction;
    const startX = this.width * (config.startX + (decoy ? -direction * .015 : 0));
    const startY = this.height * config.startY;
    const depth = config.depth * (decoy ? 1.05 : 1);
    const strategyPace = this.approach?.strategy === 'careful' ? .92 : this.approach?.strategy === 'rush' ? 1.12 : 1;
    const strategyDrift = this.approach?.strategy === 'careful' ? .82 : this.approach?.strategy === 'rush' ? 1.16 : 1;
    // A settled hold buys a readable extra beat; arriving late makes the same
    // covey feel less forgiving. The approach choice still sets the larger
    // character of the rise, while timing makes the hold command matter.
    const timingPace = this.approach?.timing === 'settled' ? .94 : this.approach?.timing === 'late' ? 1.08 : 1;
    const timingDrift = this.approach?.timing === 'settled' ? .92 : this.approach?.timing === 'late' ? 1.08 : 1;
    const pace = strategyPace * timingPace;
    const drift = strategyDrift * timingDrift;
    return {
      x: startX,
      y: startY,
      age: 0,
      duration: config.duration / pace * (decoy ? 1.04 : 1),
      direction,
      hit: false,
      escaped: false,
      hitAge: 0,
      startX,
      startY,
      pattern: config.pattern,
      wind: config.wind * drift * (decoy ? .8 : 1),
      phase: config.phase + (decoy ? 1.35 : 0),
      depth,
      baseDepth: depth,
      decoy,
      offsetY: decoy ? this.height * .15 : 0,
    };
  }

  private birdPoint(bird: Bird, age: number): Point {
    const t = Math.max(0, Math.min(1.25, age / bird.duration));
    const p = Math.max(0, Math.min(1, t));
    const w = this.width, h = this.height;
    const ease = p * p * (3 - 2 * p);
    let x = bird.startX;
    let y = bird.startY;
    let depth = bird.depth;
    if (bird.pattern === 'rise') {
      x += bird.direction * w * (.08 + .84 * ease);
      y -= h * (.04 + .5 * Math.sin(p * Math.PI * .92) + .07 * p);
      depth = bird.baseDepth + .31 * Math.sin(p * Math.PI);
    } else if (bird.pattern === 'crosswind') {
      x += bird.direction * w * (.1 + .82 * p);
      y += h * (-.04 - .18 * p + Math.sin(p * Math.PI * 2.25 + bird.phase) * .19);
      depth = bird.baseDepth + .18 * Math.sin(p * Math.PI);
    } else {
      x += bird.direction * w * (.1 + .8 * p) + Math.sin(p * Math.PI * 2.15 + bird.phase) * w * .055;
      y += h * (-.08 - .2 * p + Math.sin(p * Math.PI * 2.55 + bird.phase) * .22);
      depth = bird.baseDepth + .39 * Math.sin(p * Math.PI);
    }
    const wind = Math.sin(age * 2.8 + bird.phase) * w * bird.wind + Math.sin(age * 5.1 + bird.phase) * w * bird.wind * .28;
    x += wind;
    y += Math.cos(age * 2.1 + bird.phase) * h * bird.wind * .22 + bird.offsetY;
    return { x, y, depth: Math.max(.48, Math.min(1.04, depth)) };
  }

  private escapeBird(): void {
    const bird = this.bird;
    if (!bird || bird.hit || bird.escaped) return;
    bird.escaped = true;
    this.markWave(false);
    this.setStatus('The cover swallowed it. Save the next shell for a better lead.');
    this.transition = .76;
  }

  private complete(): void {
    this.done = true;
    this.bird = null;
    this.decoy = null;
    this.round.textContent = 'Field notes';
    this.pauseButton.hidden = true;
    this.root.querySelector<HTMLElement>('.encounter-status')!.hidden = true;
    this.finishPanel.hidden = false;
    const title = this.hits === 3 ? 'A beautiful covey rise.' : this.hits === 2 ? 'You found the rhythm.' : this.hits === 1 ? 'A good start.' : 'There’s always the next rise.';
    const precision = this.perfectWaves === 3 ? 'Three first-shell leads. Beautiful shooting.' : this.perfectWaves > 0 ? `${this.perfectWaves} rise${this.perfectWaves === 1 ? '' : 's'} finished on the first shell.` : 'The wind won a few exchanges today.';
    const message = this.hits === 0 ? `The birds had the wind today. ${precision} Scout a new cover and give it another try.` : `${this.hits} ${this.hits === 1 ? 'bird' : 'birds'} retrieved · ${this.shots} ${this.shots === 1 ? 'shot' : 'shots'} fired. ${precision}`;
    this.finishPanel.innerHTML = `<div class="encounter-finish-badge" aria-hidden="true">${this.hits === 3 ? '✦' : this.hits > 0 ? '✓' : '↗'}</div><h3>${title}</h3><p>${message}</p><button class="encounter-return" type="button">Back to trail <span aria-hidden="true">↗</span></button>`;
    const button = this.finishPanel.querySelector<HTMLButtonElement>('button')!;
    button.addEventListener('click', event => {
      event.stopPropagation();
      if (this.returned || this.disposed) return;
      this.returned = true;
      this.onFinish({ hits: this.hits, shots: this.shots });
    }, { signal: this.abort.signal });
    button.focus({ preventScroll: true });
  }

  private tick = (time: number): void => {
    if (this.disposed) return;
    const dt = Math.min((time - this.lastTime) / 1000, .05);
    this.lastTime = time;
    if (!this.paused && !this.done) {
      this.elapsed += dt;
      const xDir = Number(this.keys.has('arrowright') || this.keys.has('d')) - Number(this.keys.has('arrowleft') || this.keys.has('a'));
      const yDir = Number(this.keys.has('arrowdown') || this.keys.has('s')) - Number(this.keys.has('arrowup') || this.keys.has('w'));
      if (xDir || yDir) {
        this.aim.goalX = Math.max(.025, Math.min(.975, this.aim.goalX + xDir * dt * .92));
        this.aim.goalY = Math.max(.075, Math.min(.925, this.aim.goalY + yDir * dt * .92));
      }
      // The reticle has a little weight; tracking the flight is intentional.
      const aimEase = 1 - Math.exp(-dt * 13);
      this.aim.x += (this.aim.goalX - this.aim.x) * aimEase;
      this.aim.y += (this.aim.goalY - this.aim.y) * aimEase;
      if (this.transition > 0) {
        this.transition -= dt;
        if (this.transition <= 0) this.nextWave();
      }
      if (this.transition <= 0 && this.spawnTimer > 0) {
        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0) this.activateWave();
      }
      const bird = this.bird;
      if (bird) {
        if (bird.hit) {
          bird.hitAge += dt;
          bird.y += dt * (55 + bird.hitAge * 70);
          bird.x += bird.direction * dt * 35;
          if (bird.hitAge > .72 && this.transition <= 0) {
            this.bird = null;
            this.decoy = null;
            this.transition = .52;
          }
        } else if (bird.escaped) {
          bird.age += dt;
          bird.x += bird.direction * dt * (80 + bird.age * 25);
          if (this.transition <= 0) this.transition = .76;
        } else {
          bird.age += dt;
          const point = this.birdPoint(bird, bird.age);
          bird.x = point.x;
          bird.y = point.y;
          bird.depth = point.depth;
          if (bird.age >= bird.duration) this.escapeBird();
        }
      }
      if (this.decoy && !this.decoy.escaped) {
        this.decoy.age += dt;
        const point = this.birdPoint(this.decoy, this.decoy.age);
        this.decoy.x = point.x;
        this.decoy.y = point.y;
        this.decoy.depth = point.depth;
        if (this.decoy.age >= this.decoy.duration) this.decoy.escaped = true;
      }
      this.recoil = Math.max(0, this.recoil - dt * 7);
      if (this.shotRing) { this.shotRing.age += dt; if (this.shotRing.age > .58) this.shotRing = null; }
      for (const f of this.feathers) { f.age += dt; f.x += f.vx * dt; f.y += f.vy * dt; f.vy += dt * 140; f.angle += dt * 3; }
      this.feathers = this.feathers.filter(f => f.age < f.life);
    }
    this.draw();
    if (!this.done) this.raf = requestAnimationFrame(this.tick);
  };

  private birdSize(bird: Bird, depth = bird.depth): number {
    const base = Math.max(66, Math.min(104, this.width * .165));
    const speciesScale = this.species === 'pheasant' ? 1.08 : this.species === 'grouse' ? .96 : 1;
    const approachScale = this.approach?.strategy === 'careful' ? 1.08 : this.approach?.strategy === 'rush' ? .9 : 1;
    return base * speciesScale * approachScale * depth;
  }

  private draw(): void {
    const c = this.ctx, w = this.width, h = this.height;
    c.clearRect(0, 0, w, h);
    c.save();
    if (this.recoil) c.translate(Math.sin(this.elapsed * 74) * 2 * this.recoil, 3 * this.recoil);
    if (this.backdrop) {
      const scale = Math.max(w / this.backdrop.width, h / this.backdrop.height);
      const dw = this.backdrop.width * scale, dh = this.backdrop.height * scale;
      c.drawImage(this.backdrop, (w - dw) / 2, (h - dh) / 2, dw, dh);
      c.fillStyle = this.species === 'grouse' ? '#173d2326' : '#e9c86515';
      c.fillRect(0, 0, w, h);
    } else {
      const sky = c.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#9dbaa6'); sky.addColorStop(.62, '#ddd3a4'); sky.addColorStop(1, '#8b9b52');
      c.fillStyle = sky; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 80; i++) { c.fillStyle = i % 2 ? '#8b9560' : '#6e8050'; c.fillRect((i * 47) % w, h * .75 + (i % 9) * 5, 3, h); }
    }
    const sunlight = c.createRadialGradient(w * .7, h * .1, 5, w * .7, h * .1, w * .65);
    sunlight.addColorStop(0, '#fff3ba35'); sunlight.addColorStop(1, '#fff3ba00');
    c.fillStyle = sunlight; c.fillRect(0, 0, w, h);
    // Quiet motes keep the field alive without hiding the smaller targets.
    for (let i = 0; i < 12; i++) {
      const x = ((i * 97 + this.elapsed * (3 + i % 3)) % (w + 20)) - 10;
      const y = h * (.23 + (i % 7) * .095) + Math.sin(this.elapsed * .6 + i) * 8;
      c.fillStyle = '#fbefc54d'; c.fillRect(x, y, 2, 2);
    }
    if (!this.bird && this.waveConfig && this.transition <= 0 && this.spawnTimer > 0) this.drawFlushCue();
    if (this.decoy && !this.decoy.escaped) this.drawBird(this.decoy);
    if (this.bird) this.drawBird(this.bird);
    for (const f of this.feathers) {
      c.save(); c.globalAlpha = 1 - f.age / f.life; c.translate(f.x, f.y); c.rotate(f.angle);
      c.fillStyle = f.color; c.fillRect(-2, -5, 4, 10); c.fillStyle = '#f8ecbc'; c.fillRect(0, -4, 1, 8); c.restore();
    }
    if (this.shotRing) {
      const r = this.shotRing, progress = Math.min(1, r.age / .58);
      const colors: Record<ShotFeedback, string> = { hit: '#fff0a7', near: '#f5c878', miss: '#fff7df', decoy: '#b5c7b2' };
      c.save(); c.globalAlpha = 1 - progress; c.strokeStyle = colors[r.feedback]; c.lineWidth = r.feedback === 'hit' ? 2.5 : 2;
      c.beginPath(); c.arc(r.x, r.y, 10 + progress * 30, 0, Math.PI * 2); c.stroke();
      c.font = '700 12px ui-monospace,monospace'; c.textAlign = 'center'; c.fillStyle = colors[r.feedback]; c.shadowColor = '#274431'; c.shadowBlur = 4; c.fillText(r.label, r.x, r.y - 40 - progress * 20);
      c.restore();
    }
    if (!this.done && !this.paused && (this.aim.active || this.bird)) this.drawReticle();
    const shade = c.createLinearGradient(0, h * .7, 0, h);
    shade.addColorStop(0, '#142c1c00'); shade.addColorStop(1, '#142c1c40'); c.fillStyle = shade; c.fillRect(0, 0, w, h);
    c.restore();
  }

  private drawFlushCue(): void {
    const c = this.ctx, config = this.waveConfig!;
    const x = this.width * config.startX, y = this.height * config.startY;
    const progress = Math.max(0, Math.min(1, this.spawnTimer / .66));
    const pulse = 1 + Math.sin(this.elapsed * 10) * .1;
    c.save();
    c.globalAlpha = .28 + (1 - progress) * .25;
    c.strokeStyle = '#f4d68a'; c.lineWidth = 2;
    c.beginPath(); c.ellipse(x, y, 24 * pulse, 9 * pulse, 0, 0, Math.PI * 2); c.stroke();
    c.globalAlpha = .7;
    c.beginPath(); c.arc(x, y, 32 + (1 - progress) * 18, Math.PI * 1.1, Math.PI * 1.9); c.stroke();
    c.font = '700 10px ui-monospace,monospace'; c.textAlign = 'center'; c.fillStyle = '#fff3c7'; c.shadowColor = '#244134'; c.shadowBlur = 4;
    c.fillText('WINGS IN', x, y - 20); c.fillText(`${Math.max(.1, this.spawnTimer).toFixed(1)}s`, x, y - 8);
    c.restore();
  }

  private drawBird(b: Bird): void {
    const c = this.ctx, size = this.birdSize(b);
    c.save();
    c.globalAlpha = b.hit ? Math.max(0, 1 - b.hitAge * 1.2) : b.decoy ? .55 : 1;
    c.fillStyle = '#2f3e282b'; c.beginPath(); c.ellipse(b.x, Math.min(this.height * .88, b.y + size * .42), size * .33, size * .07, 0, 0, Math.PI * 2); c.fill();
    c.translate(b.x, b.y);
    c.scale(b.direction, 1);
    c.rotate(b.hit ? b.hitAge * 1.8 : Math.sin(b.age * 3) * .065);
    if (this.sprites && this.species !== 'grouse') {
      const frameWidth = this.sprites.width / 3;
      const frame = [0, 1, 2, 1][Math.floor(b.age * 11) % 4];
      const imageHeight = size * this.sprites.height / frameWidth;
      c.drawImage(this.sprites, frame * frameWidth, 0, frameWidth, this.sprites.height, -size / 2, -imageHeight / 2, size, imageHeight);
      if (b.decoy) {
        c.globalCompositeOperation = 'source-atop'; c.fillStyle = '#b8c5b480'; c.fillRect(-size / 2, -imageHeight / 2, size, imageHeight); c.globalCompositeOperation = 'source-over';
      }
    } else {
      // A distinct grouse silhouette: broad barred wings, short fan tail, dark ruff.
      const wing = Math.sin(b.age * 31) * size * .26;
      c.fillStyle = b.decoy ? '#879181' : '#6d6552';
      c.beginPath(); c.moveTo(-size * .14, 0); c.lineTo(-size * .44, -size * .2); c.lineTo(-size * .48, size * .1); c.lineTo(-size * .12, size * .11); c.closePath(); c.fill();
      c.strokeStyle = b.decoy ? '#667266' : '#393c32'; c.lineWidth = 4; c.beginPath(); c.moveTo(-size * .38, -size * .13); c.lineTo(-size * .41, size * .07); c.stroke();
      c.fillStyle = b.decoy ? '#b3bbaa' : '#b4a17b'; c.beginPath(); c.ellipse(0, 0, size * .26, size * .14, -.18, 0, Math.PI * 2); c.fill();
      c.fillStyle = b.decoy ? '#929e91' : '#82745a'; c.beginPath(); c.moveTo(-size * .14, -3); c.lineTo(-size * .24, wing - size * .24); c.lineTo(size * .1, wing - size * .17); c.lineTo(size * .09, size * .05); c.closePath(); c.fill();
      c.strokeStyle = b.decoy ? '#c6d0bd' : '#d0bc90'; c.lineWidth = 3;
      for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(-size * .16 + i * 9, -3); c.lineTo(-size * .18 + i * 9, wing - size * .18); c.stroke(); }
      c.fillStyle = b.decoy ? '#69766a' : '#433e32'; c.fillRect(size * .14, -size * .14, size * .1, size * .2);
      c.fillStyle = b.decoy ? '#bdc8b7' : '#ab9a77'; c.beginPath(); c.arc(size * .26, -size * .12, size * .095, 0, Math.PI * 2); c.fill();
      c.fillStyle = b.decoy ? '#6f7b70' : '#302f27'; c.fillRect(size * .29, -size * .16, 3, 3); c.fillRect(size * .34, -size * .12, size * .08, 3);
    }
    if (b.decoy && !b.hit) {
      c.save(); c.globalAlpha = .72; c.setLineDash([4, 5]); c.strokeStyle = '#e0ead6'; c.lineWidth = 1.5; c.beginPath(); c.arc(0, 0, size * .54, 0, Math.PI * 2); c.stroke(); c.restore();
    } else if (!b.hit) {
      // The warm glint is the fair visual clue that distinguishes the real
      // bird from the pale decoy during the crosswind rise.
      c.globalAlpha = .72; c.fillStyle = '#f6d783'; c.beginPath(); c.arc(size * .18, -size * .18, 2.2, 0, Math.PI * 2); c.fill();
    }
    c.restore();
  }

  private drawReticle(): void {
    const c = this.ctx, x = this.aim.x * this.width, y = this.aim.y * this.height, gx = this.aim.goalX * this.width, gy = this.aim.goalY * this.height;
    c.save();
    if (Math.hypot(gx - x, gy - y) > 7) {
      c.strokeStyle = '#fff7d055'; c.lineWidth = 1; c.setLineDash([3, 4]); c.beginPath(); c.moveTo(x, y); c.lineTo(gx, gy); c.stroke(); c.setLineDash([]); c.fillStyle = '#fff7d080'; c.beginPath(); c.arc(gx, gy, 3, 0, Math.PI * 2); c.fill();
    }
    c.translate(x, y); c.strokeStyle = '#fdf6df'; c.lineWidth = 1.7; c.shadowColor = '#17382acc'; c.shadowBlur = 3;
    c.beginPath(); c.arc(0, 0, 13 + Math.sin(this.elapsed * 7) * 1.2, 0, Math.PI * 2); c.stroke();
    c.beginPath();
    for (const direction of [-1, 1]) { c.moveTo(direction * 17, 0); c.lineTo(direction * 23, 0); c.moveTo(0, direction * 17); c.lineTo(0, direction * 23); }
    c.stroke(); c.fillStyle = '#fff8df'; c.fillRect(-1, -1, 2, 2); c.restore();
  }
}
