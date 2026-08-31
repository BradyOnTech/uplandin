import type { Ctx, Subsystem } from '../engine';
import type { BirdsSystem } from './birds';
import type { GunSystem } from './gun';
import type { Hunt3DSystem } from './hunt3d';

/** DOM presentation adapter for the shared hunt snapshot. */
export class HuntHudSystem implements Subsystem {
  readonly id = 'hunt-hud';

  private hunt!: Hunt3DSystem;
  private birds!: BirdsSystem;
  private gun!: GunSystem;
  private panel: HTMLElement | null = null;
  private tally: HTMLElement | null = null;
  private phase: HTMLElement | null = null;
  private summary: HTMLElement | null = null;
  private summaryCopy: HTMLElement | null = null;
  private frozen = false;
  private summaryShown = false;
  private lastTally = '';
  private lastPhase = '';

  init(ctx: Ctx): void {
    this.frozen = new URLSearchParams(location.search).has('capture');
    this.hunt = ctx.get<Hunt3DSystem>('hunt3d');
    this.birds = ctx.get<BirdsSystem>('birds');
    this.gun = ctx.get<GunSystem>('gun');
    this.panel = document.getElementById('hunt-hud');
    this.tally = document.getElementById('hunt-tally');
    this.phase = document.getElementById('hunt-phase');
    this.summary = document.getElementById('hunt-summary');
    this.summaryCopy = document.getElementById('hunt-summary-copy');
    if (this.panel) this.panel.hidden = this.frozen;
    if (this.summary) this.summary.hidden = true;
    document.getElementById('hunt-again')?.addEventListener('click', () => location.reload());
    document.getElementById('hunt-menu')?.addEventListener('click', () => location.assign('./index.html'));
    document.getElementById('field-menu')?.addEventListener('click', () => location.assign('./index.html'));
  }

  update(_ctx: Ctx, _dt: number): void {
    if (this.frozen) return;
    const hunt = this.hunt.huntState();
    let hidden = 0;
    let flushed = 0;
    let downOnGround = 0;
    let retrieved = 0;
    for (const bird of hunt.birds) {
      if (bird.state === 'hidden') hidden++;
      else if (bird.state === 'flushed') flushed++;
      else if (bird.state === 'downed') downOnGround++;
      else if (bird.state === 'retrieved') retrieved++;
    }

    const tally = `birds hidden ${hidden} · bag ${hunt.downed} · lost ${hunt.escaped}`;
    if (tally !== this.lastTally) {
      if (this.tally) this.tally.textContent = tally;
      this.lastTally = tally;
    }

    const dog = this.hunt.dog();
    const rise = this.birds.isRiseActive();
    const phase = rise
      ? `COVEY RISE · shells ${this.gun.shellsRemaining()}`
      : dog.state === 'retrieving'
        ? 'DOG RETRIEVING'
        : dog.state === 'pointing'
          ? 'ON POINT · WALK IN'
          : hunt.doubles > 0
            ? `${hunt.doubles} DOUBLE${hunt.doubles > 1 ? 'S' : ''} · HUNTING`
            : 'HUNTING';
    if (phase !== this.lastPhase) {
      if (this.phase) this.phase.textContent = phase;
      this.lastPhase = phase;
    }

    const complete = hidden === 0 && flushed === 0 && downOnGround === 0 && !rise;
    if (complete && !this.summaryShown) {
      this.summaryShown = true;
      const careerResult = this.hunt.settleCareer();
      if (document.pointerLockElement) void document.exitPointerLock();
      if (this.summaryCopy) {
        const dogWork = hunt.dogWork[0];
        const total = hunt.birds.length;
        const base =
          `${hunt.downed} of ${total} down · ${retrieved} retrieved · ${hunt.escaped} lost` +
          `${hunt.doubles > 0 ? ` · ${hunt.doubles} double${hunt.doubles > 1 ? 's' : ''}` : ''}` +
          ` · ${dogWork.pointFlushes} point${dogWork.pointFlushes === 1 ? '' : 's'} held`;
        const career = careerResult
          ? ` · ${careerResult.dogAwards[0]?.name ?? 'dog'} +${careerResult.dogAwards[0]?.gained ?? 0} XP` +
            ` · hunter +${careerResult.hunterGained} XP · ${careerResult.weeks} week${careerResult.weeks === 1 ? '' : 's'} passed`
          : '';
        this.summaryCopy.textContent = base + career;
      }
      if (this.summary) this.summary.hidden = false;
    }
  }
}
