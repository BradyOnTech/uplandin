import { playFieldSong, startFieldAmbience } from '../../audio';
import type { Ctx, Subsystem } from '../engine';
export class FieldAudioSystem implements Subsystem {
  readonly id = 'field-audio';
  private ambience: ReturnType<typeof startFieldAmbience> = null;
  private nextSong = 13;
  private abort = new AbortController();
  private capture = false;
  init(ctx: Ctx): void {
    this.capture = new URLSearchParams(location.search).has('capture');
    ctx.events.addEventListener('pause', ((e: CustomEvent) => this.ambience?.setPaused(e.detail)) as EventListener, { signal: this.abort.signal });
  }
  update(ctx: Ctx): void {
    if (this.capture || ctx.paused) return;
    this.ambience ??= startFieldAmbience();
    if (ctx.time > this.nextSong) { playFieldSong(); this.nextSong = ctx.time + 19 + (Math.sin(ctx.time * 0.3) + 1) * 6; }
  }
  dispose(): void { this.abort.abort(); this.ambience?.stop(); this.ambience = null; }
}
