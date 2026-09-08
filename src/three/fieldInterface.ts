import { bindTouchShotControl } from './touchShotControl';
import { HUNT_CHALLENGES, HUNT_CHALLENGE_KEY, parseHuntChallenge } from '../game/huntChallenge';
import { resolveThreeHuntChallenge } from '../game/gameplayMode';
import { setAudioEnabled, unlockAudio } from '../audio';
import type { LandscapeModel } from '../game/landscape';
import type { Engine, Quality } from './engine';
import type { TimeOfDay } from './palette';
import { huntingDoctrine } from '../game/huntDoctrine';
import { getSpecies } from '../game/species';

/** Lifecycle UI owns pause and preferences, never hunt outcomes. */
export class FieldInterface {
  private abort = new AbortController();
  private entered = false;
  private readyState = false;
  private complete = false;
  private lostContext = false;
  private overlay = document.getElementById('field-overlay')!;
  private enter = document.getElementById('enter-field') as HTMLButtonElement;
  private status = document.getElementById('loading-status')!;
  private progress = document.getElementById('loading-progress') as HTMLProgressElement;
  private touch = matchMedia('(pointer: coarse)').matches;
  private capture = new URLSearchParams(location.search).has('capture');
  constructor(private engine: Engine, landscape: LandscapeModel) {
    const signal = this.abort.signal;
    document.body.classList.toggle('capture', this.capture);
    document.getElementById('field-title')!.textContent = landscape.area.name;
    const doctrine = huntingDoctrine(landscape.area.id);
    this.overlay.querySelector('.eyebrow')!.textContent=`UPLANDIN · ${doctrine.region}`;
    document.getElementById('field-description')!.textContent=doctrine.description;
    const species = [...new Set(landscape.area.speciesMix.map((share) => getSpecies(share.speciesId).name))];
    const speciesLine = document.getElementById('field-species');
    if (speciesLine) speciesLine.textContent = species.join(' · ');
    const method = document.getElementById('field-method');
    if (method) method.textContent = doctrine.method;
    this.overlay.querySelector('.field-tip')!.textContent=doctrine.tip;
    const mapToggle=document.getElementById('field-map-toggle') as HTMLButtonElement|null;
    if (mapToggle) mapToggle.hidden=this.capture || !this.entered;
    const property=document.getElementById('property-setting') as HTMLSelectElement;
    const propertyOption=document.getElementById('property-option')!;
    propertyOption.hidden=new URLSearchParams(location.search).has('play');
    property.value=landscape.area.id;
    property.addEventListener('change',()=>{
      if(this.entered)return;
      const url=new URL(location.href);url.searchParams.set('area',property.value);
      url.searchParams.delete('drop');url.searchParams.delete('seed');
      location.assign(url);
    },{signal});
    const light=document.getElementById('light-setting') as HTMLSelectElement;
    light.disabled=true;
    light.addEventListener('change',()=>{
      if(!this.readyState)return;
      this.engine.setTimeOfDay(light.value as TimeOfDay);this.engine.renderOnce();
      const url=new URL(location.href);url.searchParams.set('tod',light.value);history.replaceState(null,'',url);
    },{signal});
    this.engine.pause(!this.capture);
    this.enter.addEventListener('click', () => this.resume(), { signal });
    document.getElementById('retry-field')!.addEventListener('click', () => location.reload(), { signal });
    document.getElementById('pause-hunt')!.addEventListener('click', () => this.pause(), { signal });
    document.addEventListener('keydown', (event) => {
      if (event.code === 'Escape' && document.body.classList.contains('field-map-open')) return;
      if (event.code === 'Escape' && this.readyState && !this.capture && !this.complete) {
        event.preventDefault();
        if (this.engine.ctx.paused) this.resume(); else this.pause();
      }
      if (event.code === 'Tab' && !this.overlay.hidden) {
        const focusable = Array.from(this.overlay.querySelectorAll<HTMLElement>('button:not([hidden]),select,input,a'));
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }, { signal });
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.entered) this.pause(); }, { signal });
    window.addEventListener('blur', () => { if (this.entered && !this.capture) this.pause(); }, { signal });
    const canvas = this.engine.ctx.renderer.domElement;
    canvas.tabIndex = 0;
    this.engine.ctx.events.addEventListener('field-map-state', ((event: CustomEvent<{ open: boolean }>) => {
      if (!this.readyState || this.complete) return;
      if (event.detail?.open) {
        this.engine.pause(true);
        if (document.pointerLockElement) document.exitPointerLock();
        document.body.classList.add('field-map-open');
      } else {
        document.body.classList.remove('field-map-open');
        this.engine.pause(false);
        canvas.focus();
        if (!this.touch) canvas.requestPointerLock()?.catch(() => undefined);
      }
    }) as EventListener, { signal });
    canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault(); this.lostContext = true; this.pause();
      this.status.hidden = false; this.status.textContent = 'Graphics were interrupted. Waiting for the browser to restore the field…';
      this.enter.hidden = true;
      document.getElementById('retry-field')!.hidden = false;
    }, { signal });
    canvas.addEventListener('webglcontextrestored', () => {
      this.lostContext = false; this.engine.renderOnce();
      this.status.textContent = 'The field is ready again.'; this.enter.hidden = false;
      document.getElementById('retry-field')!.hidden = true;
    }, { signal });
    this.engine.ctx.events.addEventListener('hunt-complete', () => {
      this.complete = true; this.engine.pause(true);
      this.overlay.hidden = true;
      document.getElementById('touch-controls')!.hidden = true;
      document.getElementById('pause-hunt')!.hidden = true;
      if (mapToggle) mapToggle.hidden = true;
      document.getElementById('field-map')?.setAttribute('hidden', '');
      document.getElementById('end-hunt')!.hidden = true;
      document.getElementById('hunt-again')?.focus();
    }, { signal });
    const quality = document.getElementById('quality-setting') as HTMLSelectElement;
    quality.value = this.engine.ctx.quality;
    quality.addEventListener('change', () => {
      try { localStorage.setItem('uplandin.3d.quality', quality.value); } catch { /* private browsing */ }
      if (!this.entered) {
        const url = new URL(location.href); url.searchParams.set('quality', quality.value); location.replace(url);
      } else {
        const url = new URL(location.href); url.searchParams.set('quality', quality.value); history.replaceState(null, '', url);
        this.status.hidden = false; this.status.textContent = 'Display change saved for the next hunt.';
      }
    }, { signal });
    const sound = document.getElementById('sound-setting') as HTMLInputElement;
    const challenge = document.getElementById('challenge-setting') as HTMLSelectElement;
    const challengeHelp = document.getElementById('challenge-help')!;
    document.getElementById('challenge-options')!.hidden = false;
    challenge.value = resolveThreeHuntChallenge(location.search);
    challengeHelp.textContent = HUNT_CHALLENGES[parseHuntChallenge(challenge.value)].description;
    challenge.addEventListener('change', () => {
      const value = parseHuntChallenge(challenge.value);
      try { localStorage.setItem(HUNT_CHALLENGE_KEY, value); } catch { /* preference optional */ }
      const url = new URL(location.href); url.searchParams.set('challenge', value);
      if (!this.entered) location.replace(url);
      else {
        history.replaceState(null, '', url);
        challengeHelp.textContent = `${HUNT_CHALLENGES[value].description} Applies to your next hunt.`;
      }
    }, { signal });
    try { sound.checked = localStorage.getItem('uplandin.3d.sound') !== 'off'; } catch { /* preference optional */ }
    setAudioEnabled(sound.checked);
    sound.addEventListener('change', () => {
      setAudioEnabled(sound.checked);
      try { localStorage.setItem('uplandin.3d.sound', sound.checked ? 'on' : 'off'); } catch { /* preference optional */ }
    }, { signal });
    for (const button of document.querySelectorAll<HTMLButtonElement>('#touch-controls button')) {
      if (button.dataset.action === 'fire') {
        bindTouchShotControl(button, { signal, enabled: () => !this.engine.ctx.paused,
          look: (dx,dy) => this.engine.ctx.events.dispatchEvent(new CustomEvent('hunt-touch-look', { detail: {dx,dy} })),
          fire: () => this.engine.ctx.events.dispatchEvent(new CustomEvent('hunt-action', { detail: 'fire' })),
          events: this.engine.ctx.events });
        continue;
      }
      button.addEventListener('click', () => {
        if (this.engine.ctx.paused) return;
        let action = button.dataset.action;
        if (action === 'aim') {
          const next = button.getAttribute('aria-pressed') !== 'true';
          button.setAttribute('aria-pressed', String(next)); action = next ? 'mount' : 'lower';
        }
        this.engine.ctx.events.dispatchEvent(new CustomEvent('hunt-action', { detail: action }));
      }, { signal });
    }
  }
  loading = (id: string, current: number, total: number): void => {
    const names: Record<string,string> = {
      terrain: 'Shaping the land',
      'property-trails': 'Marking the routes',
      'property-habitat': 'Dressing the habitat',
      'quail-environment': 'Growing the cover',
      'woodcock-wet-bottoms': 'Laying the wet bottom',
      'desert-wash': 'Cutting the desert wash',
      'canyon-oak': 'Opening the oak draw',
      'alpine-parks': 'Settling the high park',
      'hun-benches': 'Setting the bench country',
      'valley-oaks': 'Planting the oak shade',
      dog: 'Getting your dog ready',
      birds: 'Settling the coveys',
      landmarks: 'Opening the gate',
      sky: 'Waiting for daylight',
    };
    this.status.textContent = names[id] ?? 'Preparing the field…';
    this.progress.value = current / total;
  };
  ready(): void {
    this.readyState = true;
    const light=document.getElementById('light-setting') as HTMLSelectElement;
    light.disabled=false;light.value=this.engine.ctx.timeOfDay;
    this.overlay.hidden = this.capture;
    this.status.hidden = true; this.progress.hidden = true;
    document.getElementById('field-instructions')!.hidden = false;
    this.enter.hidden = false;
    const mapToggle=document.getElementById('field-map-toggle') as HTMLButtonElement|null;
    if (mapToggle) mapToggle.hidden=this.capture || !this.entered;
    if (!this.capture) this.enter.focus();
  }
  failed(error: unknown): void {
    this.overlay.hidden = false; this.progress.hidden = true;
    this.status.hidden = false;
    this.status.textContent = 'The field could not finish loading. Check your connection and reload to try again.';
    this.enter.hidden = true;
    document.getElementById('retry-field')!.hidden = false;
    console.error('Field loading failed', error);
  }
  pause(): void {
    if (this.capture || this.complete || !this.readyState) return;
    if (document.body.classList.contains('field-map-open')) {
      // A visibility change or window blur should land on the pause card,
      // never leave a survey dialog layered over it.
      document.getElementById('field-map-close')?.click();
    }
    this.engine.pause(true);
    if (document.pointerLockElement) document.exitPointerLock();
    document.body.classList.add('field-paused');
    this.overlay.hidden = false;
    this.enter.innerHTML = 'Return to the field <span aria-hidden="true">↗</span>';
    this.enter.focus();
  }
  private resume(): void {
    if (!this.readyState || this.complete || this.lostContext) return;
    this.entered = true; unlockAudio();
    const property=document.getElementById('property-setting') as HTMLSelectElement|null;
    if(property)property.disabled=true;
    this.overlay.hidden = true;
    document.body.classList.remove('field-paused');
    document.body.classList.remove('field-map-open');
    document.getElementById('touch-controls')!.hidden = !this.touch;
    const mapToggle=document.getElementById('field-map-toggle') as HTMLButtonElement|null;
    if (mapToggle) mapToggle.hidden=this.capture;
    this.engine.pause(false);
    const canvas = this.engine.ctx.renderer.domElement;
    canvas.focus();
    if (!this.touch) canvas.requestPointerLock()?.catch(() => undefined);
  }
  dispose(): void { this.abort.abort(); }
}

export function preferredQuality(params: URLSearchParams): Quality {
  const explicit = params.get('quality');
  if (explicit === 'high' || explicit === 'lite') return explicit;
  try { const saved = localStorage.getItem('uplandin.3d.quality'); if (saved === 'high' || saved === 'lite') return saved; } catch { /* optional */ }
  return matchMedia('(pointer: coarse)').matches ? 'lite' : 'high';
}
