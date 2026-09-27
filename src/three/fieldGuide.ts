import type { DogScentStage, DogState } from '../game/dog';
import type { StorageLike } from '../game/career';
import { fieldSearchGuidance, pheasantPointGuidance, pointApproachCue, trackingApproachGuidance } from './dogLocator';

export const FIELD_GUIDE_KEY = 'uplandin.3d.field-guide.v1';
export type GuideInput = 'desktop' | 'drag-look' | 'touch';
export interface FieldGuideProgress { disabled: boolean; learned: string[]; shown: string[] }
export interface FieldGuideSnapshot {
  active: boolean; input: GuideInput; areaId: string;
  x: number; z: number; yaw: number; pitch: number;
  rise: boolean; mounted: boolean; gunId: string; shells: number; reloading: boolean; retrieved: number;
  dog: { state: DogState; scentStage: DogScentStage; rangeM: number; heading: number; carrying: boolean;
    allAtHeel: boolean; searchAreaChecked: boolean; waitingForHandler: boolean };
}
const fresh = (): FieldGuideProgress => ({ disabled: false, learned: [], shown: [] });
const cleanKeys = (value: unknown): string[] => Array.isArray(value)
  ? [...new Set(value.filter((key): key is string => typeof key === 'string'
    && /^(move|shoot|reload|heel|retrieve|search|point|track)(\/[a-z-]+)?$/.test(key)))].slice(0, 64) : [];
export function readFieldGuide(storage: StorageLike | null): FieldGuideProgress {
  try {
    const saved = JSON.parse(storage?.getItem(FIELD_GUIDE_KEY) ?? 'null');
    return saved && typeof saved === 'object'
      ? { disabled: saved.disabled === true, learned: cleanKeys(saved.learned), shown: cleanKeys(saved.shown) } : fresh();
  } catch { return fresh(); }
}

/** Teaching uses visible dog work and actual player actions, never bird positions
 * or predicted hit outcomes. It cannot change simulation or difficulty. */
export class FieldGuide {
  private progress: FieldGuideProgress;
  private previous: FieldGuideSnapshot | null = null;
  private moveDistance = 0;
  private lookDistance = 0;
  private pointRange: number | null = null;
  private currentKey = '';
  private shownFor = 0;
  private dogHasWorked = false;
  constructor(progress = fresh()) { this.progress = { ...progress, learned: [...progress.learned], shown: [...progress.shown] }; }
  snapshot(): FieldGuideProgress { return { ...this.progress, learned: [...this.progress.learned], shown: [...this.progress.shown] }; }
  setEnabled(enabled: boolean): void { this.progress.disabled = !enabled; }
  suspend(): void { this.previous = null; }
  reset(): void { this.progress = fresh(); this.previous = null; this.moveDistance = this.lookDistance = 0; this.pointRange = null; this.currentKey = ''; this.shownFor = 0; this.dogHasWorked = false; }
  private learn(key: string): void { if (!this.progress.learned.includes(key)) this.progress.learned.push(key); }
  private needs(key: string): boolean { return !this.progress.learned.includes(key) && !this.progress.shown.includes(key); }
  update(s: FieldGuideSnapshot, dt: number): string | null {
    const p = this.previous;
    this.previous = s;
    if (!s.active) return null;
    const dogHadWorked = this.dogHasWorked;
    if (s.dog.state !== 'heel' && s.dog.state !== 'recalled') this.dogHasWorked = true;
    const sameInput = p?.active && p.input === s.input;
    if (sameInput) {
      this.moveDistance += Math.min(1, Math.hypot(s.x - p.x, s.z - p.z));
      this.lookDistance += Math.abs(Math.atan2(Math.sin(s.yaw - p.yaw), Math.cos(s.yaw - p.yaw))) + Math.abs(s.pitch - p.pitch);
      if (this.moveDistance >= 2 && this.lookDistance >= .12) this.learn(`move/${s.input}`);
    } else this.moveDistance = this.lookDistance = 0;
    if (p?.active && p.gunId === s.gunId && sameInput) {
      if (s.shells < p.shells) this.learn(`shoot/${s.input}`);
      if (s.shells > p.shells && p.reloading) this.learn(`reload/${s.input}`);
    }
    if (p?.active && p.dog.allAtHeel && !p.dog.searchAreaChecked && dogHadWorked && s.dog.state === 'quartering') this.learn('heel');
    if (p?.active && s.retrieved > p.retrieved) this.learn('retrieve');
    if (s.dog.state === 'pointing') {
      if (p?.dog.state !== 'pointing' || this.pointRange === null) this.pointRange = s.dog.rangeM;
      if (this.pointRange - s.dog.rangeM >= 3) this.learn(`point/${s.areaId}`);
    } else this.pointRange = null;
    // Keep the flight and sight picture clear. Gun readiness already lives on
    // the existing Shotgun button; there is no second shooting overlay.
    if (this.progress.disabled || s.rise || s.mounted) return null;
    const candidates: { key: string; text: string }[] = [];
    const add = (key: string, text: string) => candidates.push({ key, text });
    if (s.dog.searchAreaChecked && (s.dog.state === 'heel' || s.dog.state === 'recalled'))
      add(`search/${s.areaId}`, 'Nearby ground checked. Walk toward fresh cover with your dog.');
    else if (s.dog.allAtHeel && this.dogHasWorked) add('heel', s.input === 'touch' ? 'Whistle again to send your dog hunting.' : 'Press Q again to send your dog hunting.');
    else if (s.dog.state === 'retrieving') add('retrieve', s.dog.carrying
      ? 'Let your dog bring the bird to hand. No pickup button is needed.' : 'Your dog is hunting the fallen bird. Give it time to recover it.');
    else if (s.dog.state === 'pointing') {
      const approach = pointApproachCue(s.dog.rangeM, false, s.areaId).split(' · ')[1].toLowerCase();
      add(`point/${s.areaId}`, s.areaId === 'pheasant-coverts' ? pheasantPointGuidance(s.dog.rangeM, s.dog.heading)
        : `Walk toward your dog. ${approach.charAt(0).toUpperCase() + approach.slice(1)}.`);
      add(`shoot/${s.input}`, s.input === 'touch' ? 'Hold Shotgun, swing ahead, release to fire. Release over Lower to cancel.'
        : s.input === 'drag-look' ? 'F raises the gun. Drag to swing; Space fires.' : 'Hold right mouse to aim; left clicks fire. Or use F, then Space.');
    } else if (s.dog.state === 'tracking') {
      const cue = trackingApproachGuidance(s.dog.rangeM, s.areaId, s.dog.scentStage, s.dog.waitingForHandler);
      const headline = cue?.headline.toLowerCase();
      add(`track/${s.areaId}`, s.dog.waitingForHandler ? 'Your dog is waiting on scent. Move closer so it can continue.'
        : headline ? `${headline.charAt(0).toUpperCase() + headline.slice(1)}.`
          : 'Your dog is working scent. Follow its search and give it room.');
    } else {
      add(`move/${s.input}`, s.input === 'touch' ? 'Drag left to walk; drag right to look. Let your dog search.'
        : s.input === 'drag-look' ? 'WASD walks. Drag to look. Let your dog search.' : 'WASD walks; move the mouse to look. Let your dog search.');
      add(`search/${s.areaId}`, fieldSearchGuidance(s.areaId));
    }
    if (s.shells === 0 && !s.reloading) candidates.unshift({ key: `reload/${s.input}`, text: s.input === 'touch' ? 'Tap Reload before the next rise.' : 'Press R to reload before the next rise.' });
    const cue = candidates.find(candidate => this.needs(candidate.key));
    if (!cue) { this.currentKey = ''; this.shownFor = 0; return null; }
    if (this.currentKey !== cue.key) { this.currentKey = cue.key; this.shownFor = 0; }
    this.shownFor += Math.max(0, Math.min(dt, .25));
    // A tip is seen after ten seconds, not "mastered". Actual actions above
    // establish learned controls; neither requires a successful bag.
    if (this.shownFor >= 10) { this.progress.shown.push(cue.key); return null; }
    return cue.text;
  }
}
