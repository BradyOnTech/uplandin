/** An original little countryside, drawn as crisp RPG pixels. */
export type Vec = { x: number; y: number };
export type JourneyView = {
  player: Vec; dog: Vec; dogState: string; time: number; observed: string[];
  introduced: boolean; satchelFound: boolean; bridgeOpen: boolean; completed: boolean;
  target: Vec | null;
};
type Tree = Vec & { kind: 'oak' | 'pine' | 'apple'; scale: number };
type House = Vec & { width: number; height: number; roof: string; trim: string };
const WIDTH = 1152, HEIGHT = 896, TAU = Math.PI * 2;
const colors = {
  grass: '#91bd7c', grassLight: '#a6c98a', grassDark: '#7caf72', path: '#e8d6a0',
  pathEdge: '#c7be8b', water: '#63b8b7', waterDeep: '#4aa3aa', ink: '#314d47',
};
const SITES = [
  { id: 'robin', x: 432, y: 592, body: '#956e52', wing: '#6a554b', breast: '#dd8761' },
  { id: 'quail', x: 560, y: 480, body: '#b8a07a', wing: '#7e7966', breast: '#d4bc8a' },
  { id: 'grouse', x: 464, y: 256, body: '#947e5f', wing: '#685f4d', breast: '#c2a079' },
  { id: 'kingfisher', x: 880, y: 448, body: '#5ba4b3', wing: '#367785', breast: '#e6ad68' },
  { id: 'goldfinch', x: 960, y: 224, body: '#edd275', wing: '#586656', breast: '#f1da8b' },
];
const HOMES: House[] = [
  { x: 230, y: 616, width: 96, height: 62, roof: '#bd7564', trim: '#7d594d' },
  { x: 120, y: 735, width: 84, height: 58, roof: '#6e9290', trim: '#4c716b' },
  { x: 400, y: 748, width: 94, height: 64, roof: '#cf9870', trim: '#936a52' },
];
const PATHS: Vec[][] = [
  [{ x: 272, y: 846 }, { x: 272, y: 704 }, { x: 368, y: 704 }, { x: 368, y: 624 }, { x: 432, y: 624 }, { x: 432, y: 560 }, { x: 560, y: 560 }, { x: 560, y: 320 }, { x: 480, y: 320 }, { x: 480, y: 208 }],
  [{ x: 152, y: 736 }, { x: 152, y: 784 }, { x: 272, y: 784 }, { x: 448, y: 784 }, { x: 448, y: 752 }],
  [{ x: 272, y: 704 }, { x: 272, y: 616 }],
  [{ x: 560, y: 448 }, { x: 880, y: 448 }, { x: 992, y: 448 }, { x: 992, y: 256 }, { x: 944, y: 256 }],
];
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const distance = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
function rect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}
function pixelOval(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
  rect(ctx, x + 4, y, w - 8, h, color); rect(ctx, x, y + 4, w, h - 8, color);
}
function segmentDistance(p: Vec, a: Vec, b: Vec): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
}

export class JourneyWorld {
  readonly camera: Vec = { x: 0, y: 0 };
  private readonly context: CanvasRenderingContext2D;
  private readonly terrain: HTMLCanvasElement;
  private readonly trees: Tree[] = [];
  private readonly treePictures = new Map<string, HTMLCanvasElement>();
  private width = 640;
  private height = 480;
  private ready = false;
  private elapsed = 0;
  private lastPlayer: Vec | null = null;
  private lastDog: Vec | null = null;
  private playerFacing = 'down';
  private dogFacing = 1;
  private stride = 0;
  private dogStride = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('This browser cannot draw the adventure.');
    this.context = context;
    this.terrain = document.createElement('canvas');
    this.terrain.width = WIDTH; this.terrain.height = HEIGHT;
    this.placeTrees();
    this.bakeTerrain();
    this.resize();
  }

  async load(): Promise<void> { /* All the art belongs to this tiny world; no network assets. */ }

  resize(): void {
    const bounds = this.canvas.getBoundingClientRect();
    const logicalWidth = bounds.width < 620 ? 280 : Math.min(720, Math.round(bounds.width / 1.65));
    const width = Math.max(200, logicalWidth);
    const height = Math.max(180, Math.round(bounds.height * width / Math.max(1, bounds.width)));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.width = width; this.height = height;
      this.canvas.width = width; this.canvas.height = height;
      this.context.imageSmoothingEnabled = false; this.ready = false;
    }
  }

  screenToWorld(x: number, y: number): Vec {
    const bounds = this.canvas.getBoundingClientRect();
    return { x: this.camera.x + (x - bounds.left) * this.width / bounds.width, y: this.camera.y + (y - bounds.top) * this.height / bounds.height };
  }

  isWalkable(x: number, y: number, bridgeOpen = false): boolean {
    if (x < 24 || y < 30 || x > WIDTH - 24 || y > HEIGHT - 24) return false;
    if (x > 700 && x < 772 && (!bridgeOpen || y < 430 || y > 466)) return false;
    if (Math.hypot(x - 348, y - 688) < 14 || Math.hypot(x - 560, y - 320) < 14) return false;
    if (HOMES.some(home => x > home.x - 8 && x < home.x + home.width + 8 && y > home.y - home.height + 12 && y < home.y + 8)) return false;
    return !this.trees.some(tree => Math.abs(x - tree.x) < 10 * tree.scale && Math.abs(y - tree.y) < 8 * tree.scale);
  }

  /** Walk around cottages and trunks. The river always requires the little bridge. */
  routeTo(from: Vec, requested: Vec, bridgeOpen = false): Vec[] {
    let to = { x: clamp(requested.x, 26, WIDTH - 26), y: clamp(requested.y, 32, HEIGHT - 26) };
    if (!this.isWalkable(to.x, to.y, bridgeOpen)) {
      let found = false;
      for (let radius = 12; radius <= 100 && !found; radius += 8) {
        for (let angle = 0; angle < TAU; angle += Math.PI / 8) {
          const next = { x: to.x + Math.cos(angle) * radius, y: to.y + Math.sin(angle) * radius };
          if (this.isWalkable(next.x, next.y, bridgeOpen)) { to = next; found = true; break; }
        }
      }
      if (!found) return [];
    }
    const clear = (a: Vec, b: Vec): boolean => {
      const steps = Math.max(1, Math.ceil(distance(a, b) / 5));
      for (let step = 1; step <= steps; step++) {
        if (!this.isWalkable(a.x + (b.x - a.x) * step / steps, a.y + (b.y - a.y) * step / steps, bridgeOpen)) return false;
      }
      return true;
    };
    if (clear(from, to)) return [to];
    const cell = 16, columns = WIDTH / cell;
    const key = (p: Vec) => Math.floor(p.y / cell) * columns + Math.floor(p.x / cell);
    const point = (k: number): Vec => ({ x: (k % columns) * cell + cell / 2, y: Math.floor(k / columns) * cell + cell / 2 });
    const start = key(from), end = key(to), open = [start], closed = new Set<number>();
    const scores = new Map<number, number>([[start, 0]]), parents = new Map<number, number>();
    let terminal = -1;
    while (open.length) {
      let bestIndex = 0, bestScore = Infinity;
      for (let i = 0; i < open.length; i++) {
        const score = scores.get(open[i])! + distance(point(open[i]), to);
        if (score < bestScore) { bestScore = score; bestIndex = i; }
      }
      const current = open.splice(bestIndex, 1)[0];
      const here = current === start ? from : point(current);
      if (current === end || distance(here, to) < 24 && clear(here, to)) { terminal = current; break; }
      closed.add(current);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        const next = current + dx + dy * columns;
        const nextPoint = point(next);
        if (closed.has(next) || !this.isWalkable(nextPoint.x, nextPoint.y, bridgeOpen) || !clear(here, nextPoint)) continue;
        const score = scores.get(current)! + distance(here, nextPoint);
        if (score >= (scores.get(next) ?? Infinity)) continue;
        scores.set(next, score); parents.set(next, current);
        if (!open.includes(next)) open.push(next);
      }
    }
    if (terminal < 0) return [];
    const raw: Vec[] = [to];
    while (terminal !== start) {
      raw.unshift(point(terminal)); terminal = parents.get(terminal)!;
    }
    const route: Vec[] = []; let anchor = from;
    while (raw.length) {
      let farthest = raw.length - 1;
      while (farthest > 0 && !clear(anchor, raw[farthest])) farthest--;
      anchor = raw[farthest]; route.push(anchor); raw.splice(0, farthest + 1);
    }
    return route;
  }

  render(state: JourneyView, dt: number): void {
    this.resize(); this.elapsed += Math.min(Math.max(dt, 0), .08);
    // A little scenery beyond the southern boundary keeps the village actors
    // centered on tall phones instead of buried behind the thumb controls.
    const southMargin = this.width < 400 ? Math.min(180, this.height * .28) : 0;
    const desired = { x: clamp(state.player.x - this.width / 2, 0, Math.max(0, WIDTH - this.width)), y: clamp(state.player.y - this.height * .53, 0, Math.max(0, HEIGHT - this.height + southMargin)) };
    const blend = this.ready ? Math.min(1, dt * 9) : 1;
    this.camera.x = Math.round(this.camera.x + (desired.x - this.camera.x) * blend);
    this.camera.y = Math.round(this.camera.y + (desired.y - this.camera.y) * blend); this.ready = true;
    const ctx = this.context;
    rect(ctx, 0, 0, this.width, this.height, colors.grass);
    ctx.save(); ctx.translate(-this.camera.x, -this.camera.y);
    ctx.drawImage(this.terrain, 0, 0);
    this.drawWater(ctx);
    this.drawBridge(ctx, state.bridgeOpen);
    this.drawWind(ctx);
    if (state.target) this.drawTarget(ctx, state.target);
    const playerMovement = this.lastPlayer ? distance(state.player, this.lastPlayer) : 0;
    if (this.lastPlayer && playerMovement > .1) {
      const dx = state.player.x - this.lastPlayer.x, dy = state.player.y - this.lastPlayer.y;
      this.playerFacing = Math.abs(dx) > Math.abs(dy) ? dx > 0 ? 'right' : 'left' : dy > 0 ? 'down' : 'up';
      this.stride += playerMovement * .17;
    }
    const dogMovement = this.lastDog ? distance(state.dog, this.lastDog) : 0;
    if (this.lastDog && dogMovement > .1) {
      if (Math.abs(state.dog.x - this.lastDog.x) > .1) this.dogFacing = state.dog.x >= this.lastDog.x ? 1 : -1;
      this.dogStride += dogMovement * .26;
    }
    const layers: Array<{ y: number; draw: () => void }> = [];
    for (const tree of this.trees) {
      if (tree.x < this.camera.x - 70 || tree.x > this.camera.x + this.width + 70 || tree.y < this.camera.y - 20 || tree.y > this.camera.y + this.height + 100) continue;
      layers.push({ y: tree.y, draw: () => this.drawTree(ctx, tree) });
    }
    for (const home of HOMES) layers.push({ y: home.y, draw: () => this.drawHouse(ctx, home) });
    layers.push({ y: 688, draw: () => {
      this.drawPerson(ctx, 348, 688, 'down', 0, '#b87666', '#e5c39a', true);
      if ((!state.introduced || state.completed) && distance(state.player, { x: 348, y: 688 }) < 105) this.bubble(ctx, 348, 646, '!');
    } });
    layers.push({ y: 320, draw: () => {
      this.drawPerson(ctx, 560, 320, 'left', 0, '#66909c', '#d7aa82', true);
      if (state.introduced && !state.bridgeOpen && distance(state.player, { x: 560, y: 320 }) < 100) this.bubble(ctx, 560, 278, '!');
    } });
    if (!state.satchelFound) layers.push({ y: 512, draw: () => this.drawSatchel(ctx, state.player) });
    for (const site of SITES) layers.push({ y: site.y, draw: () => this.drawBird(ctx, site, state) });
    layers.push({ y: state.player.y, draw: () => this.drawPerson(ctx, state.player.x, state.player.y, this.playerFacing, playerMovement > .1 ? this.stride : 0, '#66888c', '#e0ac84', false) });
    layers.push({ y: state.dog.y, draw: () => this.drawDog(ctx, state.dog, state.dogState, dogMovement > .1) });
    layers.sort((a, b) => a.y - b.y).forEach(layer => layer.draw());
    ctx.restore();
    this.lastPlayer = { ...state.player }; this.lastDog = { ...state.dog };
  }

  private placeTrees(): void {
    const add = (x: number, y: number, kind: Tree['kind'] = 'oak', scale = 1) => {
      const p = { x, y };
      if (x > 670 && x < 796) return;
      if (SITES.some(site => distance(site, p) < 44) || distance(p, { x: 496, y: 512 }) < 38) return;
      if (PATHS.some(path => path.slice(1).some((end, index) => segmentDistance(p, path[index], end) < 35))) return;
      this.trees.push({ x, y, kind, scale });
    };
    // Gentle forest edges frame open spaces. Each clearing is deliberately roomy.
    for (let x = 36; x < WIDTH; x += 54) { add(x, 76, 'oak', 1.15); add(x + 18, 112, 'oak'); }
    for (let y = 164; y < 868; y += 60) { add(40, y, 'oak', 1.1); add(92, y - 24, 'oak'); }
    for (let y = 176; y < 884; y += 62) { add(1106, y, 'oak', 1.16); add(1056, y - 24, 'oak', 1); }
    for (const [x, y, scale] of [[176, 190, 1.1], [236, 180, 1], [302, 222, 1.1], [196, 292, 1.15], [260, 340, 1.05], [330, 302, 1.1], [172, 412, 1.15], [222, 488, 1], [290, 468, 1.15], [358, 424, 1], [344, 540, 1], [152, 580, 1.1], [184, 658, 1], [528, 714, 1.15], [584, 788, 1.1], [516, 852, 1], [376, 862, 1], [652, 694, 1.15], [626, 614, 1.1], [632, 534, 1], [662, 354, .9], [634, 252, 1], [606, 160, 1.1]]) add(x, y, 'oak', scale);
    for (const [x, y] of [[388, 232], [386, 326], [450, 384], [610, 392], [582, 236], [514, 172]]) add(x, y, 'apple');
    for (const [x, y, scale] of [[838, 170, 1.1], [848, 292, 1], [914, 342, 1.15], [816, 552, 1], [868, 598, 1.1], [978, 558, 1], [972, 678, 1.12], [846, 734, 1.2], [930, 824, 1.15]]) add(x, y, 'oak', scale);
  }

  private bakeTerrain(): void {
    const ctx = this.terrain.getContext('2d')!;
    rect(ctx, 0, 0, WIDTH, HEIGHT, colors.grass);
    // Broad tonal clearings, with just a few hand-placed tufts and flower beds.
    pixelOval(ctx, 160, 632, 350, 198, '#a3c58a');
    pixelOval(ctx, 368, 390, 264, 250, '#9bc483');
    pixelOval(ctx, 366, 180, 266, 192, '#88b779');
    pixelOval(ctx, 828, 166, 206, 142, '#b0c98b');
    rect(ctx, 672, 0, 24, HEIGHT, '#8bb983');
    rect(ctx, 692, 0, 100, HEIGHT, '#b8ca96');
    rect(ctx, 700, 0, 72, HEIGHT, colors.waterDeep);
    rect(ctx, 708, 0, 56, HEIGHT, colors.water);
    for (let y = 32; y < HEIGHT; y += 80) {
      rect(ctx, 696, y, 8, 28, '#85b48b'); rect(ctx, 768, y + 28, 8, 32, '#85b48b');
    }
    for (const path of PATHS) {
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(path[0].x, path[0].y);
      for (const point of path.slice(1)) ctx.lineTo(point.x, point.y);
      ctx.strokeStyle = colors.pathEdge; ctx.lineWidth = 37; ctx.stroke();
      ctx.strokeStyle = colors.path; ctx.lineWidth = 32; ctx.stroke();
      ctx.strokeStyle = '#eddeb0'; ctx.lineWidth = 24; ctx.stroke();
    }
    // Bridge path is overpainted by water; only its actual deck spans the river.
    rect(ctx, 700, 0, 72, HEIGHT, colors.waterDeep); rect(ctx, 708, 0, 56, HEIGHT, colors.water);
    for (const [x, y] of [[204, 760], [316, 796], [346, 736], [480, 666], [384, 596], [470, 584], [518, 484], [596, 442], [396, 290], [524, 236], [872, 250], [932, 484], [1002, 620], [886, 758], [620, 680], [312, 382], [180, 526]]) this.grass(ctx, x, y);
    for (const [x, y] of [[204, 702], [214, 712], [192, 714], [414, 682], [430, 688], [446, 682], [620, 316], [632, 328], [608, 332], [874, 378], [886, 390], [864, 394], [920, 194], [1000, 216]]) this.flower(ctx, x, y, x < 650 ? '#f0e2a4' : '#ece8c2');
    this.garden(ctx, 120, 664, 76, 44);
    this.garden(ctx, 440, 808, 60, 38);
    this.fence(ctx, 116, 648, 90);
    this.fence(ctx, 352, 824, 146);
    this.fence(ctx, 390, 208, 74);
    // Small resting places communicate discovery without labels.
    this.bench(ctx, 994, 220);
    this.bench(ctx, 322, 752);
    this.stones(ctx, 876, 462); this.stones(ctx, 1000, 176);
    rect(ctx, 808, 432, 34, 7, '#aa8964'); rect(ctx, 810, 429, 32, 4, '#c6a67a');
    for (const [x, y] of [[687, 388], [782, 396], [689, 520], [787, 540], [690, 224], [785, 672]]) {
      rect(ctx, x, y - 12, 2, 14, '#6a9670'); rect(ctx, x + 5, y - 17, 2, 19, '#73956a'); rect(ctx, x + 9, y - 9, 2, 11, '#6a9670');
      rect(ctx, x + 4, y - 19, 4, 5, '#a58659');
    }
  }

  private drawWater(ctx: CanvasRenderingContext2D): void {
    for (let row = 0; row < 16; row++) {
      const y = (row * 64 + this.elapsed * 3) % HEIGHT;
      const x = 716 + (row % 3) * 12;
      rect(ctx, x, y, 12 + row % 2 * 4, 2, '#86cdca');
      if (row % 3 === 0) rect(ctx, x - 3, y + 5, 9, 1, '#79c4c3');
    }
  }

  private drawBridge(ctx: CanvasRenderingContext2D, open: boolean): void {
    rect(ctx, 690, 432, 94, 43, '#458d90');
    rect(ctx, 688, 426, 96, 44, '#967553');
    for (let x = 690; x < 784; x += 8) { rect(ctx, x, 428, 6, 38, '#d0ae7d'); rect(ctx, x, 428, 6, 2, '#e4c896'); }
    rect(ctx, 686, 420, 100, 5, '#98734f'); rect(ctx, 686, 466, 100, 5, '#98734f');
    for (const x of [687, 717, 752, 782]) {
      rect(ctx, x, 415, 4, 13, '#96714e'); rect(ctx, x, 460, 4, 13, '#96714e');
      rect(ctx, x, 414, 4, 2, '#e2bd86');
    }
    if (!open) {
      rect(ctx, 696, 424, 5, 48, '#8e6c51');
      rect(ctx, 692, 435, 15, 5, '#d3ae7a'); rect(ctx, 692, 453, 15, 5, '#d3ae7a');
      rect(ctx, 700, 439, 4, 12, '#de9874');
    }
  }

  private drawTree(ctx: CanvasRenderingContext2D, tree: Tree): void {
    const key = `${tree.kind}-${tree.scale}`;
    let picture = this.treePictures.get(key);
    if (!picture) {
      picture = document.createElement('canvas'); picture.width = 88; picture.height = 100;
      const p = picture.getContext('2d')!;
      pixelOval(p, 16, 78, 56, 14, '#77a56b');
      rect(p, 38, 56, 12, 32, '#7b7652'); rect(p, 40, 57, 4, 31, '#a79564');
      pixelOval(p, 13, 28, 62, 43, '#3f8063');
      pixelOval(p, 19, 13, 50, 49, '#438b65');
      pixelOval(p, 25, 8, 38, 32, '#57976b');
      pixelOval(p, 17, 22, 30, 28, '#5f9f6f');
      pixelOval(p, 43, 25, 23, 21, '#52956a');
      rect(p, 28, 14, 16, 3, '#73ad79'); rect(p, 20, 31, 10, 3, '#76ad78');
      rect(p, 27, 63, 11, 3, '#38785e'); rect(p, 56, 51, 10, 4, '#3a7f60');
      if (tree.kind === 'apple') {
        for (const [x, y] of [[28, 29], [52, 22], [61, 43], [39, 50], [21, 48]]) {
          rect(p, x, y, 5, 6, '#d98a69'); rect(p, x, y, 2, 2, '#efb17f');
        }
      }
      this.treePictures.set(key, picture);
    }
    const scale = tree.scale * .85;
    ctx.drawImage(picture, Math.round(tree.x - 44 * scale), Math.round(tree.y - 88 * scale), Math.round(88 * scale), Math.round(100 * scale));
  }

  private drawHouse(ctx: CanvasRenderingContext2D, home: House): void {
    const { x, y, width: w, height: h } = home;
    pixelOval(ctx, x - 6, y - 9, w + 12, 17, '#82a875');
    rect(ctx, x, y - h, w, h, '#bca880'); rect(ctx, x + 4, y - h, w - 8, h - 3, '#ecddb0');
    rect(ctx, x + 4, y - 8, w - 8, 5, '#cabb91');
    rect(ctx, x + w / 2 - 10, y - 31, 20, 28, home.trim); rect(ctx, x + w / 2 - 7, y - 28, 14, 25, '#ac8563');
    rect(ctx, x + w / 2 + 3, y - 15, 2, 2, '#f0d391');
    for (const wx of [x + 12, x + w - 30]) {
      rect(ctx, wx, y - 34, 18, 19, home.trim); rect(ctx, wx + 3, y - 31, 12, 13, '#8cb4b0');
      rect(ctx, wx + 8, y - 31, 2, 13, '#f1dfb1'); rect(ctx, wx + 3, y - 25, 12, 2, '#f1dfb1');
      rect(ctx, wx - 2, y - 14, 22, 3, home.trim);
    }
    rect(ctx, x - 6, y - h - 10, w + 12, 33, home.trim);
    rect(ctx, x - 6, y - h - 11, w + 12, 28, home.roof);
    rect(ctx, x - 2, y - h - 23, w + 4, 18, home.roof);
    rect(ctx, x + 6, y - h - 28, w - 12, 10, home.roof);
    for (let row = 0; row < 4; row++) {
      const ry = y - h - 19 + row * 9;
      rect(ctx, x + 2, ry, w - 4, 2, home.trim);
      for (let rx = x + 6 + row % 2 * 8; rx < x + w - 6; rx += 16) rect(ctx, rx, ry - 7, 1, 7, home.trim);
    }
    rect(ctx, x + 8, y - h - 28, w - 16, 3, '#dfae88');
    rect(ctx, x + w - 22, y - h - 36, 11, 20, '#b4a38c'); rect(ctx, x + w - 24, y - h - 38, 15, 4, '#e7d6b5');
    rect(ctx, x + w / 2 - 12, y - 3, 24, 6, '#dcd0a3');
    this.flower(ctx, x + 3, y - 3, '#f0bc9a'); this.flower(ctx, x + w - 3, y - 3, '#f0bc9a');
  }

  private drawPerson(ctx: CanvasRenderingContext2D, x: number, y: number, facing: string, stride: number, shirt: string, skin: string, npc: boolean): void {
    ctx.save(); ctx.translate(Math.round(x), Math.round(y));
    const step = stride ? Math.sin(stride) * 2 : 0, bob = stride ? Math.abs(Math.sin(stride)) : 0;
    pixelOval(ctx, -9, -3, 18, 6, '#769868');
    ctx.translate(0, -Math.round(bob));
    rect(ctx, -6, -8 + step, 5, 7, '#415866'); rect(ctx, 2, -8 - step, 5, 7, '#415866');
    rect(ctx, -7, -2 + step, 6, 3, '#4d5149'); rect(ctx, 2, -2 - step, 6, 3, '#4d5149');
    rect(ctx, -8, -18, 16, 12, shirt); rect(ctx, -10, -17 - step, 3, 8, skin); rect(ctx, 8, -17 + step, 3, 8, skin);
    rect(ctx, -7, -27, 14, 12, '#755e4b'); rect(ctx, -6, -25, 12, 10, skin);
    if (facing !== 'up') {
      if (facing !== 'left') rect(ctx, 3, -22, 2, 3, '#35484a');
      if (facing !== 'right') rect(ctx, -4, -22, 2, 3, '#35484a');
      rect(ctx, -2, -17, 4, 1, '#bb8466');
    } else rect(ctx, -6, -26, 12, 8, '#745d4c');
    if (npc) {
      rect(ctx, -8, -30, 16, 7, '#a9916b'); rect(ctx, -11, -26, 22, 3, '#c7b186');
      rect(ctx, -6, -31, 12, 3, '#d3c196');
    } else {
      rect(ctx, -8, -30, 16, 7, '#c77460'); rect(ctx, -6, -32, 12, 4, '#df9675');
      rect(ctx, facing === 'left' ? -12 : -7, -25, 20, 3, '#a95e52');
      // Small daypack, never a rifle or a hunting silhouette.
      if (facing === 'up') { rect(ctx, -6, -17, 12, 10, '#cdad73'); rect(ctx, -4, -15, 8, 3, '#e3c28a'); }
      else { rect(ctx, -7, -17, 2, 10, '#dac291'); rect(ctx, 5, -17, 2, 10, '#dac291'); }
    }
    ctx.restore();
  }

  private drawDog(ctx: CanvasRenderingContext2D, p: Vec, state: string, moving: boolean): void {
    ctx.save(); ctx.translate(Math.round(p.x), Math.round(p.y)); ctx.scale(this.dogFacing, 1);
    pixelOval(ctx, -14, -3, 29, 7, '#779d6d');
    const sniff = state === 'sniffing' || state === 'found', step = moving ? Math.sin(this.dogStride) * 2 : 0;
    rect(ctx, -10, -8, 3, 8 + step, '#e8e1c9'); rect(ctx, 4, -8, 3, 8 - step, '#e8e1c9');
    rect(ctx, -7, -7, 3, 6 - step, '#bdbca8'); rect(ctx, 8, -7, 3, 6 + step, '#bdbca8');
    pixelOval(ctx, -13, -15, 26, 12, '#f2ead5');
    rect(ctx, -8, -15, 8, 5, '#9c9582'); rect(ctx, 0, -12, 3, 3, '#827f6e'); rect(ctx, -9, -7, 2, 2, '#a79f8b');
    rect(ctx, -17, -13, 6, 3, '#f2ead5'); rect(ctx, -19, -17 + Math.round(Math.sin(this.elapsed * 8)), 3, 6, '#f2ead5');
    const headY = sniff ? -11 : -17;
    rect(ctx, 8, headY, 11, 10, '#eee6d0'); rect(ctx, 10, headY + 1, 4, 10, '#8b8273');
    rect(ctx, 16, headY + 5, 7, 5, '#f5ecd5'); rect(ctx, 21, headY + 5, 3, 3, '#3d514b');
    rect(ctx, 16, headY + 2, 2, 2, '#3d514b'); rect(ctx, 8, headY + 8, 4, 3, '#c67d66');
    ctx.restore();
    if (state === 'found' || state === 'sniffing') this.bubble(ctx, p.x + 2, p.y - 32, state === 'found' ? '!' : '?');
  }

  private drawBird(ctx: CanvasRenderingContext2D, site: typeof SITES[number], state: JourneyView): void {
    const seen = state.observed.includes(site.id), nearby = distance(state.player, site) < 82;
    const hop = Math.sin(this.elapsed * 2 + site.x) > .92 ? -3 : 0;
    const x = site.x + Math.round(Math.sin(this.elapsed * .7 + site.y) * 4), y = site.y + hop;
    ctx.save(); ctx.translate(x, y);
    if (seen) ctx.globalAlpha = .75;
    pixelOval(ctx, -8, 0, 17, 5, '#7fa272');
    rect(ctx, -7, -10, 13, 9, site.body); rect(ctx, -6, -7, 7, 6, site.wing);
    rect(ctx, 3, -14, 7, 10, site.body); rect(ctx, 3, -7, 6, 6, site.breast);
    rect(ctx, 10, -10, 4, 2, '#bf9e69'); rect(ctx, 7, -12, 2, 2, colors.ink);
    rect(ctx, -11, -8, 5, 4, site.wing); rect(ctx, -3, -1, 2, 3, '#967b55'); rect(ctx, 3, -1, 2, 3, '#967b55');
    if (site.id === 'quail') {
      rect(ctx, 3, -14, 7, 2, '#f5ecd5');
      rect(ctx, 5, -7, 5, 3, '#f5ecd5');
    }
    if (site.id === 'grouse') { rect(ctx, -11, -11, 5, 9, site.wing); rect(ctx, -13, -10, 2, 6, site.body); }
    if (site.id === 'kingfisher') rect(ctx, 10, -10, 7, 2, colors.ink);
    ctx.restore();
    if (!seen && nearby && state.introduced) this.bubble(ctx, site.x, site.y - 31, '?');
  }

  private drawSatchel(ctx: CanvasRenderingContext2D, player: Vec): void {
    pixelOval(ctx, 486, 508, 20, 8, '#82a172');
    rect(ctx, 490, 500, 13, 12, '#a67554'); rect(ctx, 492, 502, 9, 5, '#d3a16b');
    rect(ctx, 492, 496, 9, 3, '#a67554'); rect(ctx, 491, 498, 2, 5, '#a67554'); rect(ctx, 500, 498, 2, 5, '#a67554');
    rect(ctx, 496, 505, 3, 4, '#eed49a');
    if (distance(player, { x: 496, y: 512 }) < 70) this.bubble(ctx, 497, 485, '?');
  }

  private bubble(ctx: CanvasRenderingContext2D, x: number, y: number, text: string): void {
    const bob = Math.round(Math.sin(this.elapsed * 2.5) * 1.5);
    pixelOval(ctx, x - 8, y - 10 + bob, 17, 18, '#466457');
    pixelOval(ctx, x - 7, y - 11 + bob, 15, 17, '#fff5d9');
    rect(ctx, x - 1, y + 5 + bob, 3, 4, '#fff5d9');
    ctx.fillStyle = '#537262'; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center'; ctx.fillText(text, Math.round(x + .5), Math.round(y + 2 + bob));
  }

  private drawTarget(ctx: CanvasRenderingContext2D, p: Vec): void {
    const radius = 7 + Math.sin(this.elapsed * 5);
    ctx.strokeStyle = '#fff6d8'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(Math.round(p.x), Math.round(p.y), radius, radius * .6, 0, 0, TAU); ctx.stroke();
    rect(ctx, p.x - 1, p.y - 1, 2, 2, '#fff6d8');
  }

  private drawWind(ctx: CanvasRenderingContext2D): void {
    // One or two drifting seed puffs; the landscape stays still and legible.
    for (let i = 0; i < 4; i++) {
      const x = (this.elapsed * 8 + i * 311) % WIDTH, y = 190 + i * 165 + Math.sin(this.elapsed * .6 + i) * 7;
      rect(ctx, x, y, 2, 2, '#e7e7ba');
    }
  }

  private grass(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    rect(ctx, x, y - 3, 2, 5, '#73a46b'); rect(ctx, x - 3, y - 1, 2, 3, '#7cad6f'); rect(ctx, x + 4, y - 2, 2, 4, '#7cad6f');
  }
  private flower(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
    rect(ctx, x, y - 4, 2, 6, '#6f9d69'); rect(ctx, x - 2, y - 7, 6, 5, color); rect(ctx, x, y - 6, 2, 2, '#d6af66');
  }
  private garden(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    rect(ctx, x, y, w, h, '#b4ac80');
    for (let row = 6; row < h; row += 12) {
      rect(ctx, x + 4, y + row, w - 8, 6, '#a19570');
      for (let col = 8; col < w - 4; col += 12) { rect(ctx, x + col, y + row - 3, 6, 6, '#6e9b68'); rect(ctx, x + col + 2, y + row - 5, 2, 3, '#8ab477'); }
    }
  }
  private fence(ctx: CanvasRenderingContext2D, x: number, y: number, width: number): void {
    rect(ctx, x, y - 8, width, 3, '#b5a078'); rect(ctx, x, y - 2, width, 3, '#b5a078');
    for (let i = 0; i < width; i += 16) { rect(ctx, x + i, y - 12, 4, 16, '#d6c393'); rect(ctx, x + i, y - 13, 4, 2, '#ece0b2'); }
  }
  private bench(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    rect(ctx, x - 15, y - 12, 30, 5, '#b89b6d'); rect(ctx, x - 15, y - 5, 30, 6, '#d3b280');
    rect(ctx, x - 12, y - 9, 3, 15, '#8f815c'); rect(ctx, x + 9, y - 9, 3, 15, '#8f815c');
  }
  private stones(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    pixelOval(ctx, x - 9, y - 3, 18, 10, '#a3ad94'); pixelOval(ctx, x - 7, y - 5, 13, 8, '#c5cbb0');
    pixelOval(ctx, x + 11, y + 2, 10, 6, '#aeb89e');
  }
}
