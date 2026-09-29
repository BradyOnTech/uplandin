import { LANDMARKS, PATCHES, WORLD_WIDTH, WORLD_HEIGHT } from './model';

/** The 2D adventure has its own presentation and never mutates the shared hunt. */
export { WORLD_WIDTH, WORLD_HEIGHT } from './model';
export type Vec = { x: number; y: number };
export type WorldView = {
  player: Vec;
  dog: Vec;
  dogState: string;
  time: number;
  patches: Array<{ id: string; name: string; x: number; y: number; radius: number; found: boolean; completed: boolean; clueReady?: boolean; searchProgress?: number; currentClue?: { x: number; y: number; kind: string } | null }>;
  discovered: string[];
  target: Vec | null;
  roamingBirds?: Array<{ x: number; y: number; species: string; ttl: number }>;
};

type Tree = Vec & { variant: number; size: number };
type Reed = Vec & { height: number; seed: number };
type Place = Vec & { id: string; name: string; detail: string };
const PLACES: Place[] = LANDMARKS.map((place) => ({ ...place, name: place.name.toUpperCase(), detail: place.description }));
const COVERS = PATCHES.map((patch) => ({ x: patch.x, y: patch.y, r: patch.radius }));
const TRAILS: Vec[][] = [
  [{ x: 220, y: 905 }, { x: 245, y: 825 }, { x: 254, y: 796 }, { x: 285, y: 744 }, { x: 309, y: 705 }, { x: 369, y: 671 }, { x: 420, y: 636 }, { x: 492, y: 572 }, { x: 550, y: 499 }, { x: 579, y: 448 }, { x: 598, y: 401 }, { x: 665, y: 342 }, { x: 733, y: 295 }, { x: 760, y: 247 }, { x: 728, y: 202 }],
  [{ x: 532, y: 519 }, { x: 594, y: 532 }, { x: 677, y: 507 }, { x: 742, y: 518 }, { x: 812, y: 538 }, { x: 884, y: 583 }, { x: 994, y: 621 }, { x: 1047, y: 664 }, { x: 1100, y: 738 }, { x: 1172, y: 756 }, { x: 1234, y: 759 }],
  [{ x: 713, y: 295 }, { x: 785, y: 302 }, { x: 854, y: 277 }, { x: 902, y: 248 }, { x: 958, y: 231 }, { x: 1007, y: 246 }, { x: 1060, y: 228 }],
  // Short side loops make the country read as a place to poke around rather
  // than one long prescribed route.
  [{ x: 309, y: 705 }, { x: 345, y: 635 }, { x: 386, y: 579 }, { x: 443, y: 557 }, { x: 492, y: 572 }],
  [{ x: 677, y: 507 }, { x: 702, y: 581 }, { x: 767, y: 635 }, { x: 844, y: 650 }, { x: 884, y: 583 }],
  [{ x: 598, y: 401 }, { x: 555, y: 342 }, { x: 548, y: 276 }, { x: 603, y: 229 }, { x: 665, y: 228 }, { x: 713, y: 295 }],
];
const REGION_MARKS = [
  { name: 'MEADOW RUN', x: 388, y: 744, color: '#405a45' },
  { name: 'WILLOW MARSH', x: 1054, y: 432, color: '#315965' },
  { name: 'THE OLD ORCHARD', x: 697, y: 147, color: '#4b4833' },
  { name: 'RIMROCK OVERLOOK', x: 1023, y: 125, color: '#4d5144' },
];
const TAU = Math.PI * 2;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const distance = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
function random(seed: number): () => number {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function path(ctx: CanvasRenderingContext2D, points: Vec[]): void {
  ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length - 1; i++) {
    ctx.quadraticCurveTo(points[i].x, points[i].y, (points[i].x + points[i + 1].x) / 2, (points[i].y + points[i + 1].y) / 2);
  }
  const last = points[points.length - 1]; ctx.lineTo(last.x, last.y);
}
function segmentDistance(p: Vec, a: Vec, b: Vec): number {
  const x = b.x - a.x, y = b.y - a.y;
  const t = clamp(((p.x - a.x) * x + (p.y - a.y) * y) / (x * x + y * y), 0, 1);
  return Math.hypot(p.x - a.x - t * x, p.y - a.y - t * y);
}
function nearTrail(p: Vec, margin: number): boolean {
  return TRAILS.some((trail) => trail.slice(1).some((point, i) => segmentDistance(p, trail[i], point) < margin));
}
function waterAt(x: number, y: number): boolean {
  if (((x - 1154) / 88) ** 2 + ((y - 498) / 164) ** 2 < 1) return true;
  if (y > 605 && y < 891) return Math.abs(x - (1121 + Math.sin(y * .022) * 19)) < 24;
  return false;
}
function onBridge(x: number, y: number): boolean { return x > 1050 && x < 1200 && y > 725 && y < 753; }
function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, color: string): void {
  ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fill();
}

export class WorldRenderer {
  readonly camera = { x: 0, y: 0 };
  private readonly ctx: CanvasRenderingContext2D;
  private readonly background: HTMLCanvasElement;
  private readonly trees: Tree[] = [];
  private readonly reeds: Reed[] = [];
  private readonly treeSprites: HTMLCanvasElement[] = [];
  private hunter: HTMLImageElement | null = null;
  private setter: HTMLImageElement | null = null;
  private setterDirs: HTMLImageElement | null = null;
  private elapsed = 0;
  private previousPlayer: Vec | null = null;
  private previousDog: Vec | null = null;
  private hunterFacing = 0;
  private hunterLeft = false;
  private dogHeading = 0;
  private playerStride = 0;
  private dogStride = 0;
  private dogReachedFall = false;
  private dogCarrying = false;
  private cameraReady = false;
  private width = 640;
  private height = 400;
  private lowerSceneryMargin = 0;
  private footmarks: Array<Vec & { age: number; angle: number }> = [];
  private footprintTravel = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('This browser does not support the field canvas.');
    this.ctx = context;
    this.background = document.createElement('canvas');
    this.background.width = WORLD_WIDTH; this.background.height = WORLD_HEIGHT + 128;
    this.buildTrees();
    this.bakeWorld();
    this.resize();
  }

  async load(): Promise<void> {
    const loadImage = (name: string) => new Promise<HTMLImageElement | null>((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img); img.onerror = () => resolve(null);
      img.src = `${import.meta.env.BASE_URL}art/${name}`;
    });
    [this.hunter, this.setter, this.setterDirs] = await Promise.all([
      loadImage('hunter-dirs-v2.png'), loadImage('english-setter-sheet-alpha.png'), loadImage('english-setter-dirs.png'),
    ]);
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const divisor = rect.width < 640 ? 1.35 : rect.width < 1000 ? 1.7 : 2;
    // Portrait controls sit over the lower field. A little decorative scenery
    // beyond its collision boundary keeps the camp actors in the clear.
    this.lowerSceneryMargin = rect.width < 640 && rect.height > rect.width ? 104 : 0;
    const width = Math.max(180, Math.round(rect.width / divisor));
    const height = Math.max(180, Math.round(rect.height / divisor));
    if (width !== this.width || height !== this.height || this.canvas.width !== width) {
      this.width = width; this.height = height;
      this.canvas.width = width; this.canvas.height = height;
      this.ctx.imageSmoothingEnabled = false;
      this.cameraReady = false;
    }
  }

  screenToWorld(clientX: number, clientY: number): Vec {
    const rect = this.canvas.getBoundingClientRect();
    return { x: this.camera.x + (clientX - rect.left) * this.width / rect.width, y: this.camera.y + (clientY - rect.top) * this.height / rect.height };
  }

  isWalkable(x: number, y: number): boolean {
    if (x < 35 || y < 42 || x > WORLD_WIDTH - 35 || y > WORLD_HEIGHT - 35) return false;
    if (waterAt(x, y) && !onBridge(x, y)) return false;
    return !this.trees.some((tree) => Math.abs(x - tree.x) < tree.size * 7 && Math.abs(y - tree.y) < tree.size * 5);
  }

  /** Returns waypoints excluding the origin; a blocked destination is moved to nearby dry ground. */
  routeTo(from: Vec, requested: Vec): Vec[] {
    let to = { x: clamp(requested.x, 38, WORLD_WIDTH - 38), y: clamp(requested.y, 45, WORLD_HEIGHT - 38) };
    if (!this.isWalkable(to.x, to.y)) {
      let found = false;
      for (let radius = 10; radius <= 140 && !found; radius += 10) {
        for (let a = 0; a < TAU; a += Math.PI / 8) {
          const candidate = { x: to.x + Math.cos(a) * radius, y: to.y + Math.sin(a) * radius };
          if (this.isWalkable(candidate.x, candidate.y)) { to = candidate; found = true; break; }
        }
      }
      if (!found) return [];
    }
    const clear = (a: Vec, b: Vec) => {
      const steps = Math.ceil(distance(a, b) / 6);
      for (let i = 1; i <= steps; i++) if (!this.isWalkable(a.x + (b.x - a.x) * i / steps, a.y + (b.y - a.y) * i / steps)) return false;
      return true;
    };
    if (clear(from, to)) return [to];
    const cell = 16, columns = WORLD_WIDTH / cell;
    const key = (p: Vec) => Math.floor(p.y / cell) * columns + Math.floor(p.x / cell);
    const point = (k: number): Vec => ({ x: (k % columns) * cell + cell / 2, y: Math.floor(k / columns) * cell + cell / 2 });
    const start = key(from), end = key(to), open = [start];
    const scores = new Map<number, number>([[start, 0]]), parent = new Map<number, number>();
    const closed = new Set<number>();
    let terminal = start;
    for (let iteration = 0; open.length && iteration < 7000; iteration++) {
      let best = 0, estimate = Infinity;
      for (let i = 0; i < open.length; i++) {
        const value = scores.get(open[i])! + distance(point(open[i]), to);
        if (value < estimate) { estimate = value; best = i; }
      }
      const current = open.splice(best, 1)[0], here = point(current);
      if (current === end || (distance(here, to) < 25 && clear(here, to))) { terminal = current; break; }
      closed.add(current);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const next = current + dx + dy * columns, there = point(next);
        if (closed.has(next) || !this.isWalkable(there.x, there.y) || !clear(here, there)) continue;
        const cost = scores.get(current)! + distance(here, there);
        if (cost >= (scores.get(next) ?? Infinity)) continue;
        scores.set(next, cost); parent.set(next, current);
        if (!open.includes(next)) open.push(next);
      }
    }
    if (terminal === start) return [];
    const route = [to]; let cursor = terminal;
    while (cursor !== start) { route.unshift(point(cursor)); cursor = parent.get(cursor)!; }
    const compact: Vec[] = []; let anchor = from;
    for (let i = 0; i < route.length;) {
      let far = i;
      while (far + 1 < route.length && clear(anchor, route[far + 1])) far++;
      compact.push(route[far]); anchor = route[far]; i = far + 1;
    }
    return compact;
  }

  render(state: WorldView, dt: number): void {
    this.resize();
    const seconds = clamp(dt > 1 ? dt / 1000 : dt, 0, .1);
    this.elapsed += seconds;
    const targetX = clamp(state.player.x - this.width * .5, 0, Math.max(0, WORLD_WIDTH - this.width));
    const maxCameraY = Math.max(0, WORLD_HEIGHT + this.lowerSceneryMargin - this.height);
    const targetY = clamp(state.player.y - this.height * .49, 0, maxCameraY);
    const follow = this.cameraReady ? 1 - Math.exp(-seconds * 7) : 1;
    this.camera.x += (targetX - this.camera.x) * follow; this.camera.y += (targetY - this.camera.y) * follow;
    this.camera.x = clamp(Math.round(this.camera.x * 2) / 2, 0, Math.max(0, WORLD_WIDTH - this.width));
    this.camera.y = clamp(Math.round(this.camera.y * 2) / 2, 0, maxCameraY);
    this.cameraReady = true;
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.fillStyle = '#99965f'; ctx.fillRect(0, 0, this.width, this.height);
    ctx.save(); ctx.translate(-Math.round(this.camera.x), -Math.round(this.camera.y));
    ctx.drawImage(this.background, 0, 0);
    this.drawRegionMarks();
    this.drawWaterLife();
    this.drawFootprints(state.player, seconds);
    if (state.target && distance(state.target, state.player) > 14) this.drawTarget(state.target);
    this.drawPatchHints(state);
    this.drawRoamingBirds(state);
    this.drawDiscoveryMarkers(state);

    const actors: { y: number; draw: () => void }[] = [];
    for (const tree of this.trees) {
      if (this.visible(tree.x, tree.y, 110)) actors.push({ y: tree.y, draw: () => {
        const overlaps = Math.abs(state.player.x - tree.x) < 28 * tree.size && state.player.y < tree.y && state.player.y > tree.y - 76 * tree.size;
        ctx.globalAlpha = overlaps ? .58 : 1;
        ctx.drawImage(this.treeSprites[tree.variant], Math.round(tree.x - 46 * tree.size), Math.round(tree.y - 96 * tree.size), Math.round(92 * tree.size), Math.round(102 * tree.size));
        ctx.globalAlpha = 1;
      } });
    }
    for (const reed of this.reeds) if (this.visible(reed.x, reed.y, 36)) actors.push({ y: reed.y, draw: () => this.drawReed(ctx, reed, this.elapsed) });
    actors.push({ y: state.player.y, draw: () => this.drawHunter(state.player) });
    actors.push({ y: state.dog.y, draw: () => this.drawDog(state.dog, state.dogState) });
    actors.push({ y: 842, draw: () => this.drawCamp() });
    for (const place of PLACES) if (this.visible(place.x + 29, place.y + 28, 50)) actors.push({ y: place.y + 30, draw: () => this.drawSign(place) });
    actors.sort((a, b) => a.y - b.y).forEach((actor) => actor.draw());
    this.drawAtmosphere(state);
    for (const place of PLACES) {
      if (distance(state.player, place) < 68 && !/point|steady|hold/i.test(state.dogState)) this.drawPlaceLabel(place, state);
    }
    ctx.restore();
    this.drawLight();
    this.previousPlayer = { ...state.player }; this.previousDog = { ...state.dog };
  }

  private visible(x: number, y: number, margin: number): boolean {
    return x > this.camera.x - margin && y > this.camera.y - margin && x < this.camera.x + this.width + margin && y < this.camera.y + this.height + margin;
  }

  private buildTrees(): void {
    for (let variant = 0; variant < 8; variant++) this.treeSprites.push(this.makeTree(variant));
    const rng = random(20260906);
    const add = (x: number, y: number, size: number, variant = Math.floor(rng() * 8)) => {
      if (PLACES.some((p) => distance(p, { x, y }) < 72) || COVERS.some((p) => distance(p, { x, y }) < p.r + 22) || nearTrail({ x, y }, 39) || waterAt(x, y)) return;
      this.trees.push({ x, y, size, variant });
    };
    for (let y = 40; y < WORLD_HEIGHT; y += 64) for (let x = 25; x < WORLD_WIDTH; x += 58) {
      const edge = x < 100 || y < 90 || x > 1220 || y > 890;
      const woods = x < 340 && y < 665;
      const orchard = y < 440 && x > 470 && x < 960;
      if (rng() < (edge ? .91 : woods ? .75 : orchard ? .48 : .1)) add(x + rng() * 29, y + rng() * 23, .75 + rng() * .45, orchard ? 3 + Math.floor(rng() * 3) : Math.floor(rng() * 8));
    }
    // A few intentional silhouettes frame each clearing.
    [[335, 784], [165, 654], [504, 692], [850, 401], [930, 130], [1070, 298], [785, 181], [543, 238], [476, 423], [872, 655], [933, 780]].forEach(([x, y], i) => add(x, y, 1.1, i % 8));
    // The south woodland continues under the portrait HUD; these trees are
    // scenery outside the walkable world, not an additional route or area.
    for (let x = 20; x < WORLD_WIDTH; x += 57) this.trees.push({ x: x + rng() * 20, y: 1022 + rng() * 18, size: .95 + rng() * .18, variant: Math.floor(rng() * 8) });
    for (const patch of COVERS) {
      for (let i = 0; i < 45; i++) {
        const angle = rng() * TAU, r = Math.sqrt(rng()) * patch.r;
        const x = patch.x + Math.cos(angle) * r, y = patch.y + Math.sin(angle) * r * .74;
        this.reeds.push({ x, y, height: 10 + rng() * 13, seed: Math.floor(rng() * 10000) });
      }
    }
    for (let i = 0; i < 80; i++) {
      const a = rng() * TAU, x = 1154 + Math.cos(a) * (92 + rng() * 14), y = 498 + Math.sin(a) * (169 + rng() * 8);
      this.reeds.push({ x, y, height: 17 + rng() * 13, seed: Math.floor(rng() * 10000) });
    }
  }

  private makeTree(variant: number): HTMLCanvasElement {
    const image = document.createElement('canvas'); image.width = 92; image.height = 102;
    const c = image.getContext('2d')!, rng = random(300 + variant * 81);
    const palettes = [
      ['#494b30', '#6e7140', '#8a8b49', '#a6a45e', '#c0b773'],
      ['#594c2f', '#856536', '#a98040', '#bf9b4b', '#d5b963'],
      ['#604531', '#875435', '#ac7041', '#c18b54', '#d3ac6c'],
      ['#54462c', '#7f622e', '#a97c32', '#c89b44', '#dfbb65'],
      ['#55482d', '#786330', '#a58b3e', '#bfaa55', '#daca76'],
      ['#63482f', '#8d5733', '#b77940', '#d29654', '#e1b576'],
      ['#434b32', '#626e3e', '#81904f', '#a0aa63', '#b7bc7b'],
      ['#574830', '#7d5a32', '#a7773c', '#b99851', '#d2b96e'],
    ];
    const colors = palettes[variant];
    c.fillStyle = '#554737'; c.fillRect(41, 54, 11, 42); c.fillRect(35, 93, 22, 4);
    c.fillStyle = '#776045'; c.fillRect(42, 60, 4, 33); c.fillStyle = '#9b7a51'; c.fillRect(42, 69, 2, 20);
    c.strokeStyle = '#574b36'; c.lineWidth = 5; c.beginPath(); c.moveTo(45, 81); c.lineTo(29, 60); c.moveTo(47, 75); c.lineTo(64, 56); c.stroke();
    const blobs: { x: number; y: number; r: number }[] = [];
    for (let j = 0; j < 18; j++) { const a = j / 18 * TAU; blobs.push({ x: 46 + Math.cos(a) * 24, y: 40 + Math.sin(a) * 23, r: 14 + rng() * 7 }); }
    blobs.push({ x: 46, y: 31, r: 26 });
    for (const b of blobs) ellipse(c, b.x, b.y, b.r, b.r * .85, colors[0]);
    for (const b of blobs) ellipse(c, b.x - 1, b.y - 3, b.r - 2, b.r * .8 - 1, colors[1]);
    for (let i = 0; i < 950; i++) {
      const x = Math.floor(rng() * 80) + 6, y = Math.floor(rng() * 76) + 2;
      if (!blobs.some((b) => ((x - b.x) / (b.r - 3)) ** 2 + ((y - b.y + 3) / (b.r * .8 - 2)) ** 2 < 1)) continue;
      const sun = 1 - (x / 92 * .35 + y / 88 * .65);
      const shade = clamp(Math.floor(rng() * 2 + sun * 3), 1, 4);
      c.fillStyle = colors[shade]; const size = rng() < .18 ? 5 : rng() < .5 ? 3 : 2;
      c.fillRect(x, y, size, Math.max(2, size - 1));
    }
    if (variant === 3 || variant === 5) {
      for (let i = 0; i < 7; i++) { c.fillStyle = '#ae512f'; c.fillRect(24 + rng() * 42, 27 + rng() * 31, 3, 3); }
    }
    return image;
  }

  private bakeWorld(): void {
    const c = this.background.getContext('2d')!, rng = random(90622);
    c.fillStyle = '#a3a16a'; c.fillRect(0, 0, WORLD_WIDTH, this.background.height);
    this.bakeRegionWashes(c);
    // Broad irregular grass masses, never repeated picture tiles or round stamps.
    for (let i = 0; i < 110; i++) {
      const x = rng() * WORLD_WIDTH, y = rng() * WORLD_HEIGHT;
      const rx = 45 + rng() * 150, ry = 30 + rng() * 90;
      c.fillStyle = ['#9fa069', '#a6a66d', '#a7a36c', '#a9a771', '#a1a26c'][i % 5];
      c.beginPath();
      for (let step = 0; step <= 24; step++) {
        const a = step / 24 * TAU, variation = .82 + Math.sin(a * 3 + i) * .09 + Math.cos(a * 5 + i * .8) * .09;
        const px = x + Math.cos(a) * rx * variation, py = y + Math.sin(a) * ry * variation;
        if (!step) c.moveTo(px, py); else c.lineTo(px, py);
      }
      c.closePath(); c.fill();
    }
    for (const tree of this.trees) ellipse(c, tree.x + 17, tree.y + 4, tree.size * 39, tree.size * 17, '#858653');
    for (const cover of COVERS) {
      for (let i = 0; i < 19; i++) {
        const angle = i / 19 * TAU;
        ellipse(c, cover.x + Math.cos(angle) * cover.r * .7, cover.y + Math.sin(angle) * cover.r * .47, 22 + rng() * 15, 13 + rng() * 12, '#8e9259');
      }
      ellipse(c, cover.x, cover.y, cover.r * .91, cover.r * .66, '#92945a');
    }
    for (let i = 0; i < 14200; i++) {
      const x = Math.floor(rng() * WORLD_WIDTH), y = Math.floor(rng() * WORLD_HEIGHT);
      if (nearTrail({ x, y }, 23) || waterAt(x, y) || distance({ x, y }, PLACES[0]) < 76) continue;
      const color = ['#bfc08a', '#c3bf82', '#858e55', '#92995e', '#b4b178'][i % 5];
      c.fillStyle = color;
      if (i % 4 === 0) { c.fillRect(x, y, 1, 3); c.fillRect(x - 2, y + 1, 1, 2); c.fillRect(x + 2, y + 1, 1, 2); }
      else c.fillRect(x, y, i % 2 + 1, 1);
    }
    c.lineCap = 'round'; c.lineJoin = 'round';
    for (const trail of TRAILS) {
      path(c, trail); c.strokeStyle = '#93915e'; c.lineWidth = 37; c.stroke();
      path(c, trail); c.strokeStyle = '#c7b77f'; c.lineWidth = 30; c.stroke();
      path(c, trail); c.strokeStyle = '#d1c18a'; c.lineWidth = 22; c.stroke();
      path(c, trail); c.strokeStyle = '#d7c790'; c.lineWidth = 7; c.stroke();
    }
    // Tiny scattered pebbles give paths ground contact without busy texture.
    for (let i = 0; i < 950; i++) {
      const x = rng() * WORLD_WIDTH, y = rng() * WORLD_HEIGHT;
      if (nearTrail({ x, y }, 13)) { c.fillStyle = i % 3 ? '#baac76' : '#e5d59c'; c.fillRect(x, y, 2, 1); }
    }
    ellipse(c, 250, 822, 94, 57, '#c0b380'); ellipse(c, 250, 819, 86, 48, '#c8b988');
    this.bakeWater(c);
    this.bakeBridge(c);
    this.bakeDetails(c, rng);
  }

  private bakeRegionWashes(c: CanvasRenderingContext2D): void {
    // Large, imperfect color fields give the player landmarks at a glance. The
    // washes sit below props and paths so the world keeps its pixel-grounded
    // texture while each area gets a distinct personality.
    const meadow = [{ x: 75, y: 586 }, { x: 182, y: 463 }, { x: 383, y: 430 }, { x: 565, y: 511 }, { x: 497, y: 721 }, { x: 282, y: 812 }, { x: 98, y: 748 }];
    const marsh = [{ x: 1008, y: 294 }, { x: 1199, y: 306 }, { x: 1278, y: 504 }, { x: 1250, y: 731 }, { x: 1110, y: 688 }, { x: 1031, y: 558 }, { x: 983, y: 416 }];
    const orchard = [{ x: 420, y: 42 }, { x: 855, y: 42 }, { x: 932, y: 185 }, { x: 824, y: 377 }, { x: 574, y: 409 }, { x: 449, y: 285 }];
    const rock = [{ x: 838, y: 38 }, { x: 1201, y: 40 }, { x: 1265, y: 148 }, { x: 1151, y: 265 }, { x: 945, y: 246 }, { x: 852, y: 174 }];
    const wash = (points: Vec[], color: string, alpha: number) => {
      c.save(); c.globalAlpha = alpha; c.fillStyle = color; c.beginPath(); c.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) c.lineTo(points[i].x, points[i].y);
      c.closePath(); c.fill(); c.restore();
    };
    wash(meadow, '#bbc277', .28); wash(marsh, '#729a8b', .27); wash(orchard, '#c08b50', .2); wash(rock, '#9b9677', .16);
    // Hand-drawn contour strokes break up the otherwise flat color fields.
    c.save(); c.globalAlpha = .19; c.lineWidth = 2; c.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      c.strokeStyle = i % 2 ? '#5a6547' : '#d6ca86';
      c.beginPath(); c.moveTo(112 + i * 35, 550 + Math.sin(i) * 24); c.quadraticCurveTo(289 + i * 26, 499 + Math.cos(i * .7) * 36, 488 + i * 23, 558 + Math.sin(i * .8) * 32); c.stroke();
    }
    for (let i = 0; i < 8; i++) {
      c.strokeStyle = i % 2 ? '#355f61' : '#c6d2a3';
      c.beginPath(); c.moveTo(1040 + i * 22, 359 + i * 36); c.quadraticCurveTo(1140 + i * 14, 331 + i * 41, 1244, 369 + i * 34); c.stroke();
    }
    c.restore();
  }

  private bakeWater(c: CanvasRenderingContext2D): void {
    const stream: Vec[] = [];
    for (let y = 590; y <= 911; y += 20) stream.push({ x: 1121 + Math.sin(y * .022) * 19, y });
    for (const [width, color] of [[69, '#b6b381'], [57, '#75886b'], [48, '#587e76'], [33, '#668f83']] as const) { path(c, stream); c.lineWidth = width; c.strokeStyle = color; c.stroke(); }
    ellipse(c, 1154, 498, 102, 177, '#b4ae7c');
    ellipse(c, 1154, 498, 95, 170, '#7c8f6c');
    ellipse(c, 1154, 498, 88, 164, '#577e76');
    ellipse(c, 1157, 489, 80, 151, '#668e81');
    ellipse(c, 1167, 461, 64, 116, '#739b89');
    const rng = random(210);
    for (let i = 0; i < 160; i++) {
      const x = 1058 + rng() * 183, y = 333 + rng() * 333;
      if (!waterAt(x, y)) continue;
      c.fillStyle = i % 4 === 0 ? '#adc0a1' : '#7aa18e'; c.fillRect(x, y, 3 + rng() * 15, 1);
    }
    for (const [x, y] of [[1190, 416], [1213, 509], [1188, 573], [1110, 460], [1101, 537]]) {
      ellipse(c, x, y, 7, 3, '#477963'); ellipse(c, x - 1, y - 1, 5, 2, '#8da464');
      c.fillStyle = '#657e50'; c.fillRect(x, y - 2, 1, 3);
    }
  }

  private bakeBridge(c: CanvasRenderingContext2D): void {
    c.fillStyle = '#555442'; c.fillRect(1050, 729, 150, 32);
    c.fillStyle = '#6c5538'; c.fillRect(1050, 724, 150, 30);
    for (let x = 1050; x < 1200; x += 9) {
      c.fillStyle = Math.floor(x / 9) % 3 ? '#b2915d' : '#c2a06b'; c.fillRect(x, 724, 8, 29);
      c.fillStyle = '#d0af77'; c.fillRect(x, 724, 8, 2); c.fillStyle = '#786141'; c.fillRect(x + 2, 747, 3, 1);
    }
    c.fillStyle = '#5e5039'; c.fillRect(1050, 717, 150, 4); c.fillRect(1050, 751, 150, 4);
    for (const x of [1051, 1100, 1150, 1195]) { c.fillStyle = '#594b37'; c.fillRect(x, 710, 5, 16); c.fillRect(x, 746, 5, 13); c.fillStyle = '#c3a274'; c.fillRect(x, 709, 5, 3); }
  }

  private bakeDetails(c: CanvasRenderingContext2D, rng: () => number): void {
    // The old orchard fence has openings where the walking trail passes.
    for (const [a, b] of [[{ x: 539, y: 354 }, { x: 643, y: 354 }], [{ x: 776, y: 352 }, { x: 910, y: 352 }], [{ x: 105, y: 874 }, { x: 183, y: 874 }]] as [Vec, Vec][]) {
      c.fillStyle = '#7d704c'; c.fillRect(a.x, a.y - 14, b.x - a.x, 3); c.fillRect(a.x, a.y - 6, b.x - a.x, 3);
      for (let x = a.x; x <= b.x; x += 26) { c.fillStyle = '#675c42'; c.fillRect(x, a.y - 22, 4, 26); c.fillStyle = '#b8a577'; c.fillRect(x, a.y - 23, 4, 2); }
    }
    // Rocks and the low stone wall make the northern viewpoint distinct.
    for (let i = 0; i < 19; i++) {
      const x = 958 + i * 10, y = 174 + Math.sin(i * .18) * 10;
      ellipse(c, x + 2, y + 5, 9, 5, '#84875c'); ellipse(c, x, y, 8, 6, '#888c76');
      c.fillStyle = '#b1b19a'; c.fillRect(x - 5, y - 4, 8, 3); c.fillStyle = '#666f5c'; c.fillRect(x + 2, y + 2, 5, 3);
    }
    for (let i = 0; i < 160; i++) {
      const x = rng() * WORLD_WIDTH, y = rng() * WORLD_HEIGHT;
      if (nearTrail({ x, y }, 35) || waterAt(x, y) || PLACES.some((p) => distance(p, { x, y }) < 50)) continue;
      if (i % 3 === 0) { ellipse(c, x + 1, y + 2, 6, 3, '#868b5c'); ellipse(c, x, y, 5, 3, '#a4a48b'); c.fillStyle = '#c3bfa1'; c.fillRect(x - 2, y - 2, 3, 1); }
      else { c.fillStyle = '#707b4b'; c.fillRect(x, y, 1, 5); c.fillStyle = i % 2 ? '#e0c87c' : '#c88850'; c.fillRect(x - 1, y - 1, 3, 2); }
    }
    // Fallen leaves collect beneath the trees rather than covering every path.
    for (const tree of this.trees) for (let i = 0; i < 13; i++) {
      const x = tree.x + (rng() - .5) * 70, y = tree.y + (rng() - .5) * 32;
      c.fillStyle = ['#b99452', '#c3a662', '#897741'][i % 3]; c.fillRect(x, y, 2, 1);
    }
  }

  private drawReed(c: CanvasRenderingContext2D, reed: Reed, t: number): void {
    const rng = random(reed.seed), sway = Math.sin(t * 1.8 + reed.seed) * 1.2;
    for (let i = 0; i < 6; i++) {
      const x = reed.x + (rng() - .5) * 15, h = reed.height * (.45 + rng() * .55);
      c.strokeStyle = ['#656f3d', '#89904d', '#b1a15d', '#b5ad68'][i % 4]; c.lineWidth = 1;
      c.beginPath(); c.moveTo(Math.round(x), reed.y); c.lineTo(Math.round(x + sway + (rng() - .5) * 4), Math.round(reed.y - h)); c.stroke();
      if (i % 3 === 0) { c.fillStyle = '#75633b'; c.fillRect(Math.round(x + sway), Math.round(reed.y - h - 3), 2, 5); c.fillStyle = '#a08a50'; c.fillRect(Math.round(x + sway), Math.round(reed.y - h - 3), 1, 3); }
    }
  }

  private drawCamp(): void {
    if (!this.visible(250, 820, 150)) return;
    const c = this.ctx;
    // Canvas tent, log seats, bedroll, and a slowly breathing campfire.
    ellipse(c, 210, 842, 45, 12, '#99905f');
    c.fillStyle = '#6f5739'; c.beginPath(); c.moveTo(162, 840); c.lineTo(202, 790); c.lineTo(250, 839); c.closePath(); c.fill();
    c.fillStyle = '#c4a662'; c.beginPath(); c.moveTo(165, 837); c.lineTo(202, 794); c.lineTo(232, 836); c.closePath(); c.fill();
    c.fillStyle = '#a78a4f'; c.beginPath(); c.moveTo(202, 794); c.lineTo(220, 795); c.lineTo(251, 839); c.lineTo(232, 836); c.closePath(); c.fill();
    c.fillStyle = '#594d36'; c.beginPath(); c.moveTo(184, 837); c.lineTo(202, 807); c.lineTo(218, 837); c.closePath(); c.fill();
    c.strokeStyle = '#d8c38a'; c.lineWidth = 1; c.beginPath(); c.moveTo(163, 840); c.lineTo(148, 850); c.moveTo(251, 838); c.lineTo(262, 848); c.stroke();
    c.fillStyle = '#76845b'; c.fillRect(221, 852, 27, 11); c.fillStyle = '#505f44'; c.fillRect(221, 851, 6, 13); c.fillStyle = '#9caa73'; c.fillRect(229, 853, 17, 2);
    for (const [x, y] of [[294, 860], [346, 818]]) { c.fillStyle = '#765938'; c.fillRect(x - 13, y - 3, 26, 7); c.fillStyle = '#b59358'; c.fillRect(x - 13, y - 3, 26, 2); c.fillStyle = '#d2b578'; c.fillRect(x - 14, y - 3, 3, 7); }
    ellipse(c, 319, 835, 16, 9, '#a79b70');
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; ellipse(c, 319 + Math.cos(a) * 11, 835 + Math.sin(a) * 6, 4, 3, i % 2 ? '#818574' : '#afb099'); }
    c.fillStyle = '#6d5137'; c.fillRect(311, 832, 16, 3); c.fillStyle = '#c87738'; c.fillRect(315, 823 + Math.sin(this.elapsed * 8) * 2, 7, 12); c.fillStyle = '#e3b657'; c.fillRect(317, 825, 3, 8); c.fillStyle = '#f0d791'; c.fillRect(318, 829, 2, 4);
    for (let i = 0; i < 4; i++) { const progress = (this.elapsed * .22 + i / 4) % 1; c.globalAlpha = (1 - progress) * .26; ellipse(c, 319 + Math.sin(progress * 4 + i) * 7, 820 - progress * 41, 3 + progress * 6, 2 + progress * 4, '#e8dec0'); } c.globalAlpha = 1;
    // A weathered green pickup beside the trail.
    ellipse(c, 165, 783, 30, 9, '#8b895c');
    c.fillStyle = '#3e493d'; c.fillRect(138, 756, 56, 25); c.fillStyle = '#5f7355'; c.fillRect(141, 756, 50, 21); c.fillStyle = '#809270'; c.fillRect(141, 756, 50, 3);
    c.fillStyle = '#9bad97'; c.fillRect(155, 749, 20, 17); c.fillStyle = '#516759'; c.fillRect(158, 751, 14, 10); c.fillStyle = '#2e3c31'; c.fillRect(179, 761, 10, 13);
    c.fillStyle = '#3b3b30'; c.fillRect(145, 775, 9, 10); c.fillRect(179, 775, 9, 10); c.fillStyle = '#a9a98e'; c.fillRect(148, 778, 3, 4); c.fillRect(182, 778, 3, 4);
    c.fillStyle = '#dfcb8c'; c.fillRect(139, 765, 3, 4); c.fillStyle = '#c0bca0'; c.fillRect(135, 774, 6, 3);
  }

  private drawSign(place: Place): void {
    const c = this.ctx, x = Math.round(place.x + 29), y = Math.round(place.y + 28);
    ellipse(c, x + 4, y + 2, 12, 4, '#92905e');
    c.fillStyle = '#6c5639'; c.fillRect(x - 2, y - 22, 4, 25); c.fillStyle = '#ad8f58'; c.fillRect(x - 1, y - 19, 2, 20);
    c.fillStyle = '#5b5138'; c.fillRect(x - 17, y - 27, 34, 14); c.fillStyle = '#ac935c'; c.fillRect(x - 16, y - 26, 32, 11); c.fillStyle = '#c5ac71'; c.fillRect(x - 16, y - 26, 32, 2);
    c.fillStyle = '#60583c'; c.fillRect(x - 10, y - 21, 13, 2); c.fillRect(x + 4, y - 22, 5, 4); c.fillRect(x + 8, y - 21, 3, 2);
  }

  private drawPlaceLabel(place: Place, state: WorldView): void {
    const c = this.ctx, x = Math.round(place.x + 29);
    c.font = 'bold 8px ui-monospace, monospace'; const width = c.measureText(place.name).width + 18;
    // A sign never covers the companion or the player's moving silhouette.
    const candidates = [place.y - 21, place.y - 61, place.y + 66];
    const y = Math.round(candidates.find((candidate) => ![state.player, state.dog].some((actor) =>
      actor.x + 19 > x - width / 2 && actor.x - 19 < x + width / 2 && actor.y + 4 > candidate - 11 && actor.y - 31 < candidate + 6,
    )) ?? place.y - 81);
    c.fillStyle = '#303b2cec'; c.fillRect(x - width / 2, y - 11, width, 17);
    c.fillStyle = '#d1bd76'; c.fillRect(x - width / 2, y - 11, width, 1);
    c.fillStyle = '#eee1b9'; c.textAlign = 'center'; c.fillText(place.name, x, y); c.textAlign = 'left';
  }

  private drawHunter(position: Vec): void {
    const c = this.ctx, dx = this.previousPlayer ? position.x - this.previousPlayer.x : 0, dy = this.previousPlayer ? position.y - this.previousPlayer.y : 0;
    const moved = Math.hypot(dx, dy); this.playerStride += moved;
    if (moved > .05) {
      if (Math.abs(dy) > Math.abs(dx) * 1.15) this.hunterFacing = dy > 0 ? 0 : 1;
      else if (Math.abs(dx) > Math.abs(dy) * 1.15) this.hunterFacing = 2;
      if (Math.abs(dx) > .1) this.hunterLeft = dx < 0;
    }
    ellipse(c, position.x + 1, position.y + 1, 8.5, 3.5, '#5f664d69');
    const frame = moved > .05 ? [1, 0, 2, 0][Math.floor(this.playerStride / 6) % 4] : 0;
    if (this.hunter) {
      c.save(); c.translate(Math.round(position.x), Math.round(position.y));
      if (this.hunterFacing === 2 && this.hunterLeft) c.scale(-1, 1);
      c.drawImage(this.hunter, frame * 20, this.hunterFacing * 28, 20, 28, -12, -32, 25, 35); c.restore();
    } else {
      c.fillStyle = '#dd8a37'; c.fillRect(position.x - 5, position.y - 24, 10, 5); c.fillStyle = '#5a6443'; c.fillRect(position.x - 5, position.y - 16, 10, 11); c.fillStyle = '#514f35'; c.fillRect(position.x - 4, position.y - 5, 3, 6); c.fillRect(position.x + 2, position.y - 5, 3, 6);
    }
  }

  private drawDog(position: Vec, state: string): void {
    const c = this.ctx, dx = this.previousDog ? position.x - this.previousDog.x : 0, dy = this.previousDog ? position.y - this.previousDog.y : 0;
    const moved = Math.hypot(dx, dy); this.dogStride += moved;
    if (moved > .04) this.dogHeading = Math.atan2(dy, dx);
    if (state === 'retrieving') this.dogReachedFall = true;
    if (state === 'returning' && this.dogReachedFall) this.dogCarrying = true;
    if (state !== 'retrieving' && state !== 'returning') { this.dogReachedFall = false; this.dogCarrying = false; }
    const pointing = /point|steady|hold/i.test(state), heel = /heel|rest/i.test(state), retrieve = this.dogCarrying;
    ellipse(c, position.x + 2, position.y + 1, 13, 4, '#5b644663');
    const vertical = Math.abs(Math.sin(this.dogHeading)) > .9;
    if (this.setter) {
      c.save(); c.translate(Math.round(position.x), Math.round(position.y));
      if (this.setterDirs && vertical && !heel && !retrieve) {
        const row = Math.sin(this.dogHeading) < 0 ? 0 : 1, frame = pointing ? 2 : moved > .04 ? Math.floor(this.dogStride / 7) % 2 : 0;
        c.drawImage(this.setterDirs, frame * 32, row * 20, 32, 20, -20, -22, 40, 25);
      } else {
        if (Math.cos(this.dogHeading) < 0) c.scale(-1, 1);
        const frame = pointing ? 4 : heel ? 5 : retrieve ? 6 : moved > .04 ? Math.floor(this.dogStride / 8) % 4 : 5;
        c.drawImage(this.setter, frame * 32, 0, 32, 20, -20, -22, 40, 25);
      }
      c.restore();
    } else { ellipse(c, position.x, position.y - 5, 10, 4, '#f1eacb'); ellipse(c, position.x + 8, position.y - 8, 4, 3, '#b6a881'); }
    if (pointing) {
      const y = Math.round(position.y - 37 + Math.sin(this.elapsed * 3) * 1.5);
      c.fillStyle = '#3a422a'; c.fillRect(position.x - 6, y - 7, 13, 14); c.fillStyle = '#e8cb6c'; c.fillRect(position.x - 5, y - 6, 11, 12); c.fillRect(position.x - 1, y + 6, 3, 3);
      c.fillStyle = '#504c2c'; c.fillRect(position.x, y - 4, 2, 6); c.fillRect(position.x, y + 3, 2, 2);
    }
  }

  private drawFootprints(player: Vec, dt: number): void {
    if (this.previousPlayer) {
      const traveled = distance(player, this.previousPlayer); this.footprintTravel += traveled;
      if (this.footprintTravel > 10) {
        this.footprintTravel = 0; const angle = Math.atan2(player.y - this.previousPlayer.y, player.x - this.previousPlayer.x);
        this.footmarks.push({ x: player.x, y: player.y + 1, age: 0, angle });
      }
    }
    const c = this.ctx;
    this.footmarks = this.footmarks.filter((mark) => mark.age < 3.5);
    for (const mark of this.footmarks) {
      mark.age += dt; c.globalAlpha = (1 - mark.age / 3.5) * .23;
      c.save(); c.translate(mark.x, mark.y); c.rotate(mark.angle); c.fillStyle = '#615e3d'; c.fillRect(-3, -3, 3, 1); c.fillRect(1, 2, 3, 1); c.restore();
    } c.globalAlpha = 1;
  }

  private drawTarget(target: Vec): void {
    const c = this.ctx, r = 5 + Math.sin(this.elapsed * 4) * .7;
    c.strokeStyle = '#f1df9abb'; c.lineWidth = 1; c.beginPath(); c.ellipse(target.x, target.y, r + 3, r * .5, 0, 0, TAU); c.stroke();
    c.fillStyle = '#525e3b88'; c.fillRect(target.x - 1, target.y - 1, 2, 2);
  }

  private drawPatchHints(state: WorldView): void {
    const c = this.ctx;
    for (const patch of state.patches) {
      if (patch.completed || !this.visible(patch.x, patch.y, 100)) continue;
      if (!patch.found && distance(state.player, patch) > 145) continue;
      for (let i = 0; i < 5; i++) {
        const cycle = (this.elapsed * .25 + i * .21) % 1;
        c.globalAlpha = Math.sin(cycle * Math.PI) * (patch.found ? .7 : .3);
        c.fillStyle = '#ede0a0'; c.fillRect(patch.x + Math.sin(i * 7 + cycle * 4) * 32, patch.y - 10 - cycle * 32 + Math.cos(i * 4) * 20, 2, 2);
      }
      const progress = patch.searchProgress ?? 0;
      if (progress > 0 && !patch.found) {
        c.strokeStyle = '#e3c16d'; c.lineWidth = 2; c.globalAlpha = .75;
        c.beginPath(); c.arc(patch.x, patch.y, patch.radius + 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress); c.stroke(); c.globalAlpha = 1;
      }
      if (patch.clueReady && patch.currentClue) this.drawClueMarker(patch.currentClue, this.elapsed);
    } c.globalAlpha = 1;
  }

  private drawClueMarker(clue: { x: number; y: number; kind: string }, t: number): void {
    const c = this.ctx, pulse = 1 + Math.sin(t * 4) * .12, x = Math.round(clue.x), y = Math.round(clue.y - 28);
    c.save(); c.translate(x, y); c.scale(pulse, pulse);
    c.globalAlpha = .9; c.fillStyle = '#193d45'; c.fillRect(-10, -10, 20, 16); c.fillStyle = '#f0cc70';
    c.beginPath(); c.moveTo(0, -7); c.lineTo(8, 0); c.lineTo(0, 7); c.lineTo(-8, 0); c.closePath(); c.fill();
    c.fillStyle = '#193d45'; c.font = '900 9px "SFMono-Regular", monospace'; c.textAlign = 'center'; c.fillText(clue.kind === 'rustle' ? '!' : '?', 0, 3); c.restore();
  }

  private drawRoamingBirds(state: WorldView): void {
    const c = this.ctx;
    for (const bird of state.roamingBirds ?? []) {
      if (!this.visible(bird.x, bird.y, 24)) continue;
      const flap = Math.sin(this.elapsed * 11 + bird.x) * 3, fade = clamp(bird.ttl / 35, .35, 1);
      c.save(); c.globalAlpha = fade; c.strokeStyle = bird.species === 'pheasant' ? '#8d4f37' : '#4a5140'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(bird.x - 11, bird.y + flap); c.quadraticCurveTo(bird.x - 5, bird.y - 8 - flap, bird.x, bird.y); c.quadraticCurveTo(bird.x + 6, bird.y - 8 + flap, bird.x + 12, bird.y + flap); c.stroke();
      c.fillStyle = '#e6ce84'; c.fillRect(bird.x - 2, bird.y - 1, 5, 3); c.restore();
    }
  }

  private drawRegionMarks(): void {
    const c = this.ctx;
    c.save(); c.font = '800 8px "SFMono-Regular", monospace'; c.textAlign = 'center';
    for (const mark of REGION_MARKS) {
      if (!this.visible(mark.x, mark.y, 80)) continue;
      const width = c.measureText(mark.name).width + 14;
      c.globalAlpha = .55;
      c.fillStyle = '#e4d394'; c.fillRect(mark.x - width / 2, mark.y - 9, width, 15);
      c.globalAlpha = .82; c.fillStyle = mark.color; c.fillText(mark.name, mark.x, mark.y + 2);
      c.globalAlpha = .65; c.strokeStyle = mark.color; c.lineWidth = 1;
      c.beginPath(); c.moveTo(mark.x - width / 2, mark.y + 10); c.lineTo(mark.x + width / 2, mark.y + 10); c.stroke();
    }
    c.restore();
  }

  private drawDiscoveryMarkers(state: WorldView): void {
    const c = this.ctx;
    for (const place of PLACES) {
      if (place.id === 'camp' || !this.visible(place.x + 29, place.y + 28, 60)) continue;
      const nearby = distance(state.player, place) < 330;
      const known = state.discovered.includes(place.id);
      if (!nearby && !known) continue;
      const x = Math.round(place.x + 29), y = Math.round(place.y - 46 + Math.sin(this.elapsed * 2.4 + place.x) * 2);
      c.save(); c.globalAlpha = known ? .78 : clamp(1 - distance(state.player, place) / 390, .28, .85);
      c.strokeStyle = known ? '#e3c16d' : '#d47449'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(x, y + 10); c.lineTo(x, y + 18); c.stroke();
      c.fillStyle = known ? '#173e49' : '#a34f36'; c.beginPath(); c.moveTo(x, y - 11); c.lineTo(x + 10, y - 4); c.lineTo(x, y + 3); c.lineTo(x - 10, y - 4); c.closePath(); c.fill();
      c.fillStyle = '#f4dda0'; c.font = '900 9px "SFMono-Regular", monospace'; c.textAlign = 'center'; c.fillText(known ? '✓' : '?', x, y - 1);
      c.restore();
    }
    // Covers get a small numbered badge when the dog has brought them into
    // range, making the next decision legible without laying down a route.
    for (const [index, patch] of state.patches.entries()) {
      if (patch.completed || !this.visible(patch.x, patch.y, 45) || (!patch.found && distance(state.player, patch) > 240)) continue;
      const x = Math.round(patch.x + patch.radius * .68), y = Math.round(patch.y - patch.radius * .44);
      c.save(); c.globalAlpha = patch.found ? .9 : .45; c.fillStyle = '#183b43'; c.fillRect(x - 9, y - 9, 18, 15); c.fillStyle = '#f1d27c'; c.font = '900 8px "SFMono-Regular", monospace'; c.textAlign = 'center'; c.fillText(`C${index + 1}`, x, y + 1); c.restore();
    }
  }

  private drawWaterLife(): void {
    const c = this.ctx;
    for (let i = 0; i < 12; i++) {
      const x = 1110 + ((i * 23) % 99), y = 374 + ((i * 61) % 239);
      if (!waterAt(x, y) || !this.visible(x, y, 40)) continue;
      const cycle = (this.elapsed * .15 + i * .22) % 1;
      c.globalAlpha = Math.sin(cycle * Math.PI) * .43; c.strokeStyle = '#c7d8b4'; c.lineWidth = 1;
      c.beginPath(); c.ellipse(x, y, 2 + cycle * 14, 1 + cycle * 4, 0, 0, TAU); c.stroke();
    } c.globalAlpha = 1;
    // Two distant waterfowl travel slowly across the pond.
    for (let i = 0; i < 2; i++) {
      const x = 1147 + Math.sin(this.elapsed * .055 + i) * 31, y = 477 + i * 27 + Math.cos(this.elapsed * .04) * 9;
      c.strokeStyle = '#a5b99a80'; c.beginPath(); c.moveTo(x - 7, y + 1); c.lineTo(x - 14, y + 3); c.moveTo(x - 7, y - 1); c.lineTo(x - 15, y - 2); c.stroke();
      ellipse(c, x, y, 4, 2, '#d1cab0'); c.fillStyle = '#4d685a'; c.fillRect(x + 2, y - 3, 3, 3); c.fillStyle = '#c6a667'; c.fillRect(x + 5, y - 2, 2, 1);
    }
  }

  private drawAtmosphere(state: WorldView): void {
    const c = this.ctx;
    for (let i = 0; i < 22; i++) {
      const x = (i * 173 + this.elapsed * (2 + i % 3)) % WORLD_WIDTH;
      const y = (i * 137 + Math.sin(this.elapsed * .3 + i) * 14) % WORLD_HEIGHT;
      if (!this.visible(x, y, 10)) continue;
      c.globalAlpha = .18 + Math.sin(this.elapsed * 1.4 + i) ** 2 * .25; c.fillStyle = '#fff0b9'; c.fillRect(x, y, i % 3 ? 1 : 2, 1);
    }
    // Occasional tumbling leaves, spaced far enough apart to keep the dog readable.
    for (let i = 0; i < 10; i++) {
      const cycle = (this.elapsed * .026 + i * .113) % 1;
      const x = (i * 151 + cycle * 85) % WORLD_WIDTH, y = (i * 103 + cycle * 150) % WORLD_HEIGHT;
      if (!this.visible(x, y, 10)) continue;
      c.globalAlpha = Math.sin(cycle * Math.PI) * .7; c.fillStyle = i % 2 ? '#d3b05f' : '#c3924d';
      c.fillRect(x + Math.sin(cycle * 24) * 8, y, Math.cos(cycle * 32) > 0 ? 3 : 1, 2);
    }
    c.globalAlpha = 1;
    // On a relaxed dog walk, a pair of butterflies leads the eye toward cover.
    if (!/point/i.test(state.dogState)) {
      for (const i of [0, 1]) {
        const x = 473 + Math.sin(this.elapsed * .7 + i * 2) * 27, y = 603 + Math.cos(this.elapsed * .9 + i) * 11;
        if (!this.visible(x, y, 10)) continue;
        c.fillStyle = '#eedcac'; c.fillRect(x - 2, y - Math.sin(this.elapsed * 14) * 1.4, 2, 2); c.fillRect(x + 1, y, 2, 2); c.fillStyle = '#87734a'; c.fillRect(x, y, 1, 2);
      }
    }
  }

  private drawLight(): void {
    const c = this.ctx;
    c.globalAlpha = .045; c.fillStyle = '#ffe4a1'; c.fillRect(0, 0, this.width, this.height); c.globalAlpha = 1;
    const vignette = c.createRadialGradient(this.width * .45, this.height * .42, this.width * .18, this.width * .5, this.height * .5, Math.max(this.width, this.height) * .8);
    vignette.addColorStop(0, '#33452a00'); vignette.addColorStop(1, '#263e2726'); c.fillStyle = vignette; c.fillRect(0, 0, this.width, this.height);
  }
}
