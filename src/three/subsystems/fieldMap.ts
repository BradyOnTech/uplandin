import { huntingDoctrine } from '../../game/huntDoctrine';
import { fieldCompassHeading } from '../dogLocator';
import { LandscapeModel, PROPERTY_PX_TO_M, type GroundSample } from '../../game/landscape';
import { pheasantPonds } from './pheasantLandscape';
import { pheasantHomesteadYard, pheasantManagedParcels, pheasantWestFence } from '../../game/pheasantHabitat';
import type { Ctx, Subsystem } from '../engine';
import type { Hunt3DSystem } from './hunt3d';

interface RoutePaint {
  color: string;
  width: number;
  dash: readonly number[];
}

/**
 * Routes are physical hunting decisions, so the survey should distinguish
 * their character instead of drawing every property as the same access line.
 * This is presentation only: the trail geometry and simulation remain the
 * source of truth, and no style here reveals a concealed bird.
 */
function routePaint(style: string, trailId: string, scale: number, areaId: string): RoutePaint {
  if (areaId === 'hun-benches' && trailId === 'circleback-return') {
    return { color: '#e4c889cc', width: Math.max(2.2, scale * 2.7), dash: [7, 4] };
  }
  if (style === 'pheasant') {
    const water = trailId.includes('slough') || trailId.includes('pothole');
    return { color: water ? '#91b6a6cc' : '#d4cda188', width: Math.max(1.7, scale * (water ? 2.6 : 2.1)), dash: water ? [2, 3] : [] };
  }
  if (style === 'chukar') {
    return { color: '#ddc593cc', width: Math.max(1.9, scale * 2.6), dash: [5, 3] };
  }
  if (style === 'bench-covey') {
    return { color: '#d8c494bb', width: Math.max(1.8, scale * 2.3), dash: trailId.includes('flank') ? [8, 4] : [] };
  }
  if (style === 'desert-wash') {
    return { color: '#d6ad72cc', width: Math.max(2.1, scale * 2.9), dash: [10, 3] };
  }
  if (style === 'woods' || style === 'bottoms') {
    const wet = style === 'bottoms' || trailId.includes('pond');
    return { color: wet ? '#9bbda399' : '#b6cba699', width: Math.max(1.8, scale * 2.35), dash: wet ? [3, 4] : [6, 3] };
  }
  if (style === 'canyon') {
    return { color: '#d9ad79bb', width: Math.max(1.8, scale * 2.35), dash: trailId.includes('return') ? [8, 4] : [] };
  }
  if (style === 'alpine-edge') {
    return { color: '#b8d0c0bb', width: Math.max(1.8, scale * 2.25), dash: trailId.includes('fingers') ? [3, 4] : [] };
  }
  if (style === 'oak-savanna') {
    return { color: '#d1c084bb', width: Math.max(1.8, scale * 2.25), dash: trailId.includes('trunk') ? [4, 3] : [] };
  }
  if (areaId === 'sharptail-prairie') {
    return { color: '#d4cda188', width: Math.max(1.4, scale * 1.8), dash: [11, 5] };
  }
  return { color: '#d4cda188', width: Math.max(1.5, scale * 2.1), dash: [] };
}

/** A fair survey map: it shows authored routes and cover, never hidden bird locations. */
export class FieldMapSystem implements Subsystem {
  readonly id = 'field-map';
  private hunt!: Hunt3DSystem;
  private panel = document.getElementById('field-map') as HTMLElement | null;
  private canvas = document.getElementById('field-map-canvas') as HTMLCanvasElement | null;
  private toggleButton = document.getElementById('field-map-toggle') as HTMLButtonElement | null;
  private closeButton = document.getElementById('field-map-close') as HTMLButtonElement | null;
  private caption = document.getElementById('field-map-caption') as HTMLElement | null;
  private landscape?: LandscapeModel;
  private surface: GroundSample = {
    height: 0, slope: 0, gradeX: 0, gradeZ: 0, rockiness: 0, vegetation: 0, moisture: 0,
  };
  private context?: CanvasRenderingContext2D;
  private open = false;
  private nextDraw = 0;
  private abort = new AbortController();
  private resize?: ResizeObserver;

  init(ctx: Ctx): void {
    this.hunt = ctx.get<Hunt3DSystem>('hunt3d');
    this.landscape = new LandscapeModel(this.hunt.areaConfig());
    if (!this.panel || !this.canvas) return;
    this.context = this.canvas.getContext('2d') ?? undefined;
    // Survey pauses simulation time; viewport changes still need a fresh
    // canvas rather than stretching the old map and its text.
    this.resize = new ResizeObserver(() => { if (this.open) this.draw(ctx); });
    this.resize.observe(this.canvas);
    const signal = this.abort.signal;
    this.toggleButton?.addEventListener('click', () => this.setOpen(!this.open, ctx), { signal });
    this.closeButton?.addEventListener('click', () => this.setOpen(false, ctx), { signal });
    document.addEventListener('keydown', (event) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return;
      if (event.code === 'KeyM' && !event.repeat && !document.querySelector('#field-overlay:not([hidden])')) {
        event.preventDefault(); this.setOpen(!this.open, ctx);
      }
      if (event.code === 'Escape' && this.open) { event.preventDefault(); this.setOpen(false, ctx); }
    }, { signal });
    this.draw(ctx);
  }

  update(ctx: Ctx): void {
    if (this.open && ctx.time >= this.nextDraw) {
      this.nextDraw = ctx.time + .18;
      this.draw(ctx);
    }
  }

  private setOpen(open: boolean, ctx: Ctx): void {
    if (!this.panel || this.open === open) return;
    this.open = open;
    this.panel.hidden = !open;
    this.toggleButton?.setAttribute('aria-expanded', String(open));
    if (open) {
      this.draw(ctx);
      this.closeButton?.focus();
    } else this.toggleButton?.focus();
    ctx.events.dispatchEvent(new CustomEvent('field-map-state', { detail: { open } }));
  }

  private draw(ctx: Ctx): void {
    const canvas = this.canvas, g = this.context;
    if (!canvas || !g) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = rect.width, h = rect.height;
    const area = this.hunt.areaConfig(), doctrine = huntingDoctrine(area.id);
    const pad = 24;
    const top = 52, bottom = 65;
    const scale = Math.min((w - pad * 2) / area.world.w, (h - top - bottom) / area.world.h);
    const ox = (w - area.world.w * scale) * .5, oy = top + (h - top - bottom - area.world.h * scale) * .5;
    const point = (x: number, y: number): [number, number] => [ox + (x - area.world.x) * scale, oy + (y - area.world.y) * scale];
    const clear = doctrine.style === 'woods' || doctrine.style === 'bottoms' ? '#182a24'
      : doctrine.style === 'desert-wash' || doctrine.style === 'canyon' ? '#31291f'
        : doctrine.style === 'alpine-edge' ? '#263638'
          : doctrine.style === 'oak-savanna' ? '#303421'
            : doctrine.style === 'chukar' || doctrine.style === 'bench-covey' ? '#2d3029' : '#27352b';
    g.clearRect(0, 0, w, h); g.fillStyle = clear; g.fillRect(0, 0, w, h);
    g.fillStyle = '#d9d1ae'; g.font = '600 10px -apple-system, sans-serif';
    g.fillText(`${area.name.toUpperCase()} · SURVEY`, pad, 16);
    const state = this.hunt.huntState();
    const windTo = fieldCompassHeading(-state.wind - Math.PI / 2).cardinal;
    g.font = '10px -apple-system, sans-serif';
    g.fillText(`WIND TO ${windTo} · ${state.windStrength.toUpperCase()}`, pad, 35);
    g.textAlign = 'right'; g.fillText('N ↑', w - pad, 35); g.textAlign = 'left';
    g.font = '10px -apple-system, sans-serif'; g.fillStyle = '#c8cdbb';
    const guidanceLines: string[] = [];
    let guidanceLine = '';
    for (const word of doctrine.guidance.split(' ')) {
      const candidate = guidanceLine ? `${guidanceLine} ${word}` : word;
      if (guidanceLine && g.measureText(candidate).width > w - pad * 2) {
        guidanceLines.push(guidanceLine); guidanceLine = word;
      } else guidanceLine = candidate;
    }
    if (guidanceLine) guidanceLines.push(guidanceLine);
    const guidanceStart = h - 11 - Math.max(0, guidanceLines.length - 1) * 12;
    guidanceLines.forEach((line, i) => g.fillText(line, pad, guidanceStart + i * 12));

    // Property frame and a low-resolution relief wash. It samples the same
    // renderer-neutral height field as the 3D terrain, then lets authored
    // cover and trails sit on top as navigation marks.
    g.strokeStyle = '#e1d6ad88'; g.lineWidth = 1.5; g.strokeRect(ox, oy, area.world.w * scale, area.world.h * scale);
    if (this.landscape) {
      const cols = 30, rows = 18;
      const cellW = area.world.w / cols, cellH = area.world.h / rows;
      let minHeight = Infinity, maxHeight = -Infinity;
      const heights = new Float32Array((cols + 1) * (rows + 1));
      for (let row = 0; row <= rows; row++) for (let col = 0; col <= cols; col++) {
        const px = area.world.x + col * cellW, py = area.world.y + row * cellH;
        const height = this.landscape.heightAtProperty(px, py);
        heights[row * (cols + 1) + col] = height;
        minHeight = Math.min(minHeight, height); maxHeight = Math.max(maxHeight, height);
      }
      const span = Math.max(1, maxHeight - minHeight);
      for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
        const px = area.world.x + (col + .5) * cellW, py = area.world.y + (row + .5) * cellH;
        this.landscape.surfaceAtProperty(px, py, this.surface);
        const hT = (heights[row * (cols + 1) + col] - minHeight) / span;
        const red = Math.round(22 + hT * 28 - this.surface.rockiness * 8);
        const green = Math.round(35 + this.surface.vegetation * 34 + this.surface.moisture * 18);
        const blue = Math.round(28 + this.surface.moisture * 24);
        g.fillStyle = `rgba(${red + 16},${green + 18},${blue + 10},.22)`;
        g.fillRect(ox + col * cellW * scale, oy + row * cellH * scale, cellW * scale + .6, cellH * scale + .6);
      }
    }
    // Cut ground is useful approach information, independent of concealed birds.
    if (area.id === 'pheasant-coverts') {
      g.fillStyle = '#c5ad7544';
      for (const field of pheasantManagedParcels(area.landmarks)) {
        const [x, y] = point(field.x, field.y);
        g.fillRect(x, y, field.w * scale, field.h * scale);
      }
      const yard = pheasantHomesteadYard(area.landmarks);
      if (yard) {
        const [x, y] = point(yard.x, yard.y);
        g.fillStyle = '#c6bc9b77'; g.fillRect(x, y, yard.w * scale, yard.h * scale);
      }
    }
    // Cover footprints remain the clearest layer over the relief wash.
    const coverFill = doctrine.style === 'pheasant' ? '#a7a06a66'
      : doctrine.style === 'woods' || doctrine.style === 'bottoms' ? '#52705680'
        : doctrine.style === 'desert-wash' || doctrine.style === 'canyon' ? '#9b784a66' : '#98875b66';
    g.fillStyle = coverFill; g.strokeStyle = '#c6b88488'; g.lineWidth = 1;
    for (const patch of area.patches) {
      const [x, y] = point(patch.x, patch.y);
      g.fillRect(x, y, patch.w * scale, patch.h * scale);
      g.strokeRect(x, y, patch.w * scale, patch.h * scale);
    }

    // Show the physical water footprint, so a shore route is a readable
    // choice rather than a mysterious detour around a five-pixel pin.
    const ponds = area.id === 'pheasant-coverts' && this.landscape ? pheasantPonds(this.landscape) : [];
    for (const pond of ponds) {
      const [x, y] = point(pond.x, pond.y);
      const rx = pond.rx / PROPERTY_PX_TO_M * scale, ry = pond.ry / PROPERTY_PX_TO_M * scale;
      g.fillStyle = '#84916766';
      g.beginPath(); g.ellipse(x, y, rx * 1.2, ry * 1.2, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#58878dbb'; g.strokeStyle = '#a3c2bc99'; g.lineWidth = 1;
      g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    }

    // Authored walking network. The line treatment follows the physical
    // hunting line: a water edge, switchback, timber finger, shade lane, or
    // remembered return should be legible before the player reaches it.
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const trail of area.trails) {
      if (trail.points.length < 2) continue;
      const paint = routePaint(doctrine.style, trail.id, scale, area.id);
      g.strokeStyle = paint.color;
      g.lineWidth = paint.width;
      g.setLineDash([...paint.dash]);
      g.beginPath();
      trail.points.forEach((p, i) => { const [x, y] = point(p.x, p.y); if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); });
      g.stroke();
    }
    g.setLineDash([]);

    if (area.id === 'pheasant-coverts') {
      const fence = pheasantWestFence(area.landmarks);
      g.strokeStyle = '#b6c0ac'; g.lineWidth = 1.5;
      g.beginPath();
      fence.forEach((p, i) => { const [x, y] = point(p.x, p.y); if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); });
      g.stroke();
      for (const p of fence) {
        const [x, y] = point(p.x, p.y);
        g.beginPath(); g.moveTo(x, y - 3); g.lineTo(x, y + 3); g.stroke();
      }
    }

    // Landmarks are a navigation language, not decorative GPS pins.
    g.font = '9px -apple-system, sans-serif';
    for (const landmark of area.landmarks) {
      const [x, y] = point(landmark.position.x, landmark.position.y);
      g.fillStyle = landmark.kind === 'pond' ? '#79a8aa' : landmark.kind === 'barn' ? '#c28a63' : '#e1d6ad';
      const pond = ponds.find(p => p.landmarkId === landmark.id);
      if (!pond) { g.beginPath(); g.arc(x, y, landmark.kind === 'pond' ? 5 : 3, 0, Math.PI * 2); g.fill(); }
      if (scale > .22) {
        g.fillStyle = '#e6e0c8cc';
        g.fillText(landmark.name, x + (pond ? pond.rx / PROPERTY_PX_TO_M * scale + 5 : 7), y + 3);
      }
    }
    const drop = this.hunt.dropPoint();
    const [truckX, truckY] = point(drop.position.x, drop.position.y);
    g.fillStyle = '#d6b979'; g.fillRect(truckX - 4, truckY - 4, 8, 8);
    g.fillStyle = '#eadfbf'; g.fillText('TRUCK', truckX + 8, truckY + 3);

    // Live hunter and dog positions are the only moving markers.
    const [hunterX, hunterY] = point(state.hunterPos.x, state.hunterPos.y);
    g.fillStyle = '#f6e7b2'; g.beginPath(); g.arc(hunterX, hunterY, 4.5, 0, Math.PI * 2); g.fill();
    const yaw = ctx.camera.rotation.y;
    const facingX = -Math.sin(yaw), facingY = -Math.cos(yaw);
    g.strokeStyle = '#f6e7b2'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(hunterX, hunterY);
    g.lineTo(hunterX + facingX * 17, hunterY + facingY * 17); g.stroke();
    state.dogsPos.forEach((dog, i) => {
      const [x, y] = point(dog.x, dog.y);
      g.fillStyle = i === 0 ? '#9bc18d' : '#c6d59b'; g.beginPath(); g.arc(x, y, 3.5, 0, Math.PI * 2); g.fill();
      if (i === 0) { g.fillStyle = '#dbe1c9'; g.fillText('DOG', x + 7, y + 3); }
    });
    g.fillStyle = '#d5d9c9b8'; g.font = '9px -apple-system, sans-serif';
    g.fillText('HUNTER', hunterX + 8, hunterY - 8);
    // Small legend keeps the map useful without turning it into a bird-finder.
    const legendY = guidanceStart - 16;
    g.fillStyle = '#d4cda188'; g.fillRect(pad, legendY - 4, 18, 2); g.fillStyle = '#d6d9c9b8'; g.fillText('ROUTE', pad + 24, legendY);
    g.fillStyle = '#c6b88488'; g.fillRect(pad + 83, legendY - 5, 10, 10); g.fillStyle = '#d6d9c9b8'; g.fillText('COVER', pad + 100, legendY);
    g.fillStyle = '#f6e7b2'; g.beginPath(); g.arc(pad + 166, legendY - 1, 3.5, 0, Math.PI * 2); g.fill(); g.fillStyle = '#d6d9c9b8'; g.fillText('YOU', pad + 175, legendY);
    g.fillStyle = '#9bc18d'; g.beginPath(); g.arc(pad + 213, legendY - 1, 3, 0, Math.PI * 2); g.fill(); g.fillStyle = '#d6d9c9b8'; g.fillText('DOG', pad + 222, legendY);
    if (this.caption) this.caption.textContent = `${doctrine.description} Wind blows toward ${windTo}; the line from your marker shows where you face. Birds stay concealed until your dog makes them.`;
  }

  dispose(_ctx: Ctx): void { this.resize?.disconnect(); this.abort.abort(); }
}
