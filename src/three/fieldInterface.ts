import { isFalconryPractice } from '../game/falconryPractice';
import { bindTouchActionControl } from './touchActionControl';
import { bindTouchShotControl } from './touchShotControl';
import { preferredInputMode, saveInputMode, usesTouchControls, touchSensitivity, saveTouchSensitivity, shotSightPicture, saveShotSightPicture, shotAssistancePreference, saveShotAssistancePreference, type InputMode } from './inputMode';
import { resolveShotAssistance, type ShotAssistancePreference } from './shotAssistance';
import { HUNT_CHALLENGES, HUNT_CHALLENGE_KEY, parseHuntChallenge } from '../game/huntChallenge';
import { build3DPreparationHref, parseHuntLaunch, resolveThreeHuntChallenge, resolveThreeHuntProfile } from '../game/gameplayMode';
import { GUNS, getGun, unlockedGuns } from '../game/guns';
import { loadCareer, saveCareer } from '../game/career';
import { loadQuickConfig, saveQuickConfig } from '../game/quick';
import { setAudioEnabled, unlockAudio } from '../audio';
import type { LandscapeModel } from '../game/landscape';
import type { Engine, Quality } from './engine';
import type { TimeOfDay } from './palette';
import { huntingDoctrine } from '../game/huntDoctrine';
import { getSpecies } from '../game/species';
import type { GunSystem } from './subsystems/gun';
import type { Hunt3DSystem } from './subsystems/hunt3d';
import { requestOfflineUpdate, type OfflineUpdateState } from './offline';
import { openHuntJournal } from './huntJournalView';
import { FieldGuide, FIELD_GUIDE_KEY, readFieldGuide, type GuideInput } from './fieldGuide';
import type { BirdsSystem } from './subsystems/birds';

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
  private touch = usesTouchControls();
  private capture = new URLSearchParams(location.search).has('capture');
  private launch = parseHuntLaunch(location.search);
  private activeChallenge = resolveThreeHuntChallenge(location.search);
  private updateState: OfflineUpdateState = 'none';
  private falconry = resolveThreeHuntProfile(location.search).quick?.huntingMethod === 'goshawk';
  private guide = new FieldGuide(readFieldGuide((() => { try { return localStorage; } catch { return null; } })()));
  private guideSaved = JSON.stringify(this.guide.snapshot());
  private guideElapsed = 0;
  constructor(private engine: Engine, landscape: LandscapeModel) {
    const signal = this.abort.signal;
    const preparationLink = document.getElementById('field-preparation') as HTMLAnchorElement | null;
    if (preparationLink) preparationLink.href = build3DPreparationHref(location.search, landscape.area.id, landscape.dropPoint.id);
    document.body.classList.toggle('capture', this.capture);
    document.body.classList.toggle('touch-controls-active', this.touch);
    const placeEndControl = () => {
      const end = document.getElementById('end-hunt')!;
      (this.touch ? document.getElementById('mobile-hunt-actions')! : document.body).append(end);
    };
    placeEndControl();
    const tips = document.getElementById('field-guide-enabled') as HTMLInputElement;
    tips.checked = !this.guide.snapshot().disabled;
    document.getElementById('field-guide-preferences')!.hidden = this.falconry;
    tips.addEventListener('change', () => {
      this.guide.setEnabled(tips.checked); this.persistGuide();
      document.getElementById('first-hunt-guide')!.hidden = true;
    }, { signal });
    document.getElementById('field-guide-repeat')!.addEventListener('click', () => {
      this.guide.reset(); tips.checked = true; this.persistGuide();
      document.getElementById('field-guide-status')!.textContent = 'Tips will return when they fit your next action.';
    }, { signal });
    // Reuse the engine's presentation loop; no separate timer or simulation
    // writes. Dependencies are read only after all systems report ready.
    engine.register({ id: 'field-guide', init() {}, update: (_ctx, dt) => this.updateGuide(dt) });
    engine.ctx.events.addEventListener('pause', () => { this.guide.suspend(); this.guideElapsed = 0; }, { signal });
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
    if (this.falconry) {
      document.body.classList.add('falconry-hunt');
      document.getElementById('field-description')!.textContent='A goshawk on the fist. A finished pointing dog. Work the cattail edges together.';
      document.getElementById('field-method')!.textContent='GOSHAWK · FROM THE FIST · QUICK HUNT';
      const instructions=document.getElementById('field-instructions')!;
      instructions.innerHTML='<p class="desktop-instructions"><kbd>W A S D</kbd> Walk · <kbd>Q</kbd> Whistle dog · <kbd>M</kbd> Survey map</p><p class="desktop-instructions"><kbd>Space</kbd> Slip · <kbd>R</kbd> Recall hawk · <kbd>F</kbd> Watch hawk · <kbd>E</kbd> Pick up</p><p class="touch-instructions">Drag left to walk; farther to run. Drag right to look. Tap Slip at the flush. Use Recall hawk to call it back, or Pick up when you reach caught quarry.</p><p class="touch-instructions orientation-tip">Turn your phone sideways for a wider view of the field.</p><p>Walk in on the point. Face a rising bird and slip your goshawk. The dog comes to heel while the hawk flies. On a catch, the dog lies beside the hawk. Walk within arm’s reach and pick the hawk up onto your fist.</p><p class="field-tip">After the hawk returns, whistle to send the dog hunting again.</p>';
      document.getElementById('controls')!.innerHTML='WASD move · Shift run · Q whistle · M survey map<br>Space slip · R recall hawk · F watch hawk · E pick up';
    }
    if (isFalconryPractice(location.search)) {
      document.getElementById('field-title')!.textContent='Cattail Coverts · Falconry practice';
      document.getElementById('field-description')!.textContent='One planted rooster, about 31 yards ahead. Your dog starts in scent and establishes the point. Walk in, face the flush, and slip.';
      this.overlay.querySelector('.field-tip')!.textContent='This drill uses a holding bird and a favorable wind. Catches and escapes play out normally. Use New drill for a fresh opportunity, or Repeat setup to try the same bird again.';
    }
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
    document.getElementById('shotgun-setting')!.addEventListener('change', (event) => {
      this.changeShotgun((event.target as HTMLSelectElement).value);
    }, { signal });
    document.getElementById('retry-field')!.addEventListener('click', () => location.reload(), { signal });
    document.getElementById('pause-hunt')!.addEventListener('click', () => this.pause(), { signal });
    for (const id of ['field-journal-open', 'summary-journal-open']) {
      const button = document.getElementById(id);
      button?.addEventListener('click', () => openHuntJournal(loadCareer(), button), { signal });
    }
    document.getElementById('app-update-button')!.addEventListener('click', () => {
      if (this.canApplyOfflineUpdate()) requestOfflineUpdate();
    }, { signal });
    document.addEventListener('keydown', (event) => {
      if ((document.getElementById('hunt-journal') as HTMLDialogElement | null)?.open) return;
      if (event.code === 'Escape' && document.body.classList.contains('field-map-open')) return;
      if (event.code === 'Escape' && this.readyState && !this.capture && !this.complete) {
        event.preventDefault();
        if (this.engine.ctx.paused) this.resume(); else this.pause();
      }
      if (event.code === 'Tab' && !this.overlay.hidden) {
        const focusable = Array.from(this.overlay.querySelectorAll<HTMLElement>('button,select,input,a,summary'))
          .filter(element => !element.closest('[hidden]') && !element.matches(':disabled') && element.getClientRects().length > 0);
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }, { signal });
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.entered) this.pause(); }, { signal });
    window.addEventListener('blur', () => { if (this.entered && !this.capture) this.pause(); }, { signal });
    // Rotation cancels any held movement/trigger and waits for an intentional
    // resume after the phone has laid out its new viewport.
    window.addEventListener('orientationchange', () => { if (this.entered && !this.capture) this.pause(); }, { signal });
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
      this.refreshShotgunMenu();
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
      document.getElementById('hunt-hud')?.setAttribute('hidden', '');
      document.getElementById('controls')?.setAttribute('hidden', '');
      const again = document.getElementById('hunt-again');
      (again && !again.hidden ? again : document.getElementById('hunt-menu'))?.focus();
      const updates = document.getElementById('app-update-panel')!;
      document.getElementById('hunt-summary-content')?.append(updates);
      this.offlineUpdateState(this.updateState);
      const diagnostics = document.getElementById('performance-tools')!;
      if (!diagnostics.hidden) {
        document.getElementById('hunt-summary-content')?.append(diagnostics);
        const start = document.getElementById('performance-start') as HTMLButtonElement;
        start.disabled = true; start.hidden = true;
        (document.getElementById('performance-route') as HTMLInputElement).readOnly = true;
        document.getElementById('performance-status')!.textContent = 'Hunt finished. Save the report before starting another hunt.';
      }
    }, { signal });
    const quality = document.getElementById('quality-setting') as HTMLSelectElement;
    quality.value = this.engine.ctx.quality;
    quality.addEventListener('change', () => {
      try { localStorage.setItem('uplandin.3d.quality', quality.value); } catch { /* private browsing */ }
      if (!this.entered) {
        const url = new URL(location.href); url.searchParams.set('quality', quality.value); location.replace(url);
      } else {
        const url = new URL(location.href); url.searchParams.set('quality', quality.value); history.replaceState(null, '', url);
        if (preparationLink) preparationLink.href = build3DPreparationHref(url.search, landscape.area.id, landscape.dropPoint.id);
        this.status.hidden = false; this.status.textContent = 'Display change saved for the next hunt.';
      }
    }, { signal });
    const input = document.getElementById('controls-setting') as HTMLSelectElement;
    input.value = preferredInputMode();
    input.addEventListener('change', () => {
      const mode = input.value as InputMode;
      saveInputMode(mode); this.touch = usesTouchControls(mode);
      document.body.classList.toggle('touch-controls-active', this.touch);
      sight.value = shotSightPicture(this.touch);
      placeEndControl();
      const url = new URL(location.href); url.searchParams.set('controls', mode); history.replaceState(null, '', url);
      this.engine.ctx.events.dispatchEvent(new Event('input-reset'));
    }, { signal });
    for (const kind of ['look','swing'] as const) {
      const slider = document.getElementById(`touch-${kind}-sensitivity`) as HTMLInputElement;
      const output = document.getElementById(`touch-${kind}-value`)!;
      slider.value = String(touchSensitivity(kind)); output.textContent = `${Number(slider.value).toFixed(1)}×`;
      slider.addEventListener('input', () => {
        saveTouchSensitivity(kind, Number(slider.value)); output.textContent = `${Number(slider.value).toFixed(1)}×`;
        this.engine.ctx.events.dispatchEvent(new Event('touch-sensitivity-change'));
      }, { signal });
    }
    const sight = document.getElementById('touch-sight-setting') as HTMLSelectElement;
    sight.value = shotSightPicture(this.touch);
    sight.addEventListener('change', () => {
      saveShotSightPicture(sight.value === 'closer' ? 'closer' : 'wide');
      this.engine.ctx.events.dispatchEvent(new Event('touch-sight-change'));
    }, { signal });
    const assistance = document.getElementById('shot-assistance-setting') as HTMLSelectElement;
    assistance.value = shotAssistancePreference();
    assistance.addEventListener('change', () => {
      saveShotAssistancePreference(assistance.value as ShotAssistancePreference);
      this.refreshShotAssistance();
    }, { signal });
    this.refreshShotAssistance();
    const sound = document.getElementById('sound-setting') as HTMLInputElement;
    const challenge = document.getElementById('challenge-setting') as HTMLSelectElement;
    const challengeHelp = document.getElementById('challenge-help')!;
    document.getElementById('challenge-options')!.hidden = isFalconryPractice(location.search);
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
        const action = (detail: string | { action: string; source: string }) => this.engine.ctx.events.dispatchEvent(new CustomEvent('hunt-action', { detail }));
        bindTouchShotControl(button, { signal, enabled: () => !this.engine.ctx.paused && !this.falconry && !this.engine.ctx.get<GunSystem>('gun').isReloading(),
          look: (dx,dy) => this.engine.ctx.events.dispatchEvent(new CustomEvent('hunt-touch-look', { detail: {dx,dy} })),
          begin: () => { unlockAudio(); action('touch-mount'); },
          cancel: () => action('lower'),
          cancelTarget: document.getElementById('touch-lower')!,
          viewport: () => ({ width: window.innerWidth, height: window.innerHeight }),
          fire: (source) => action({ action: 'touch-fire', source }),
          events: this.engine.ctx.events });
        continue;
      }
      bindTouchActionControl(button, { signal, enabled: () => !this.engine.ctx.paused,
        events: this.engine.ctx.events, activate: () => {
        let action = button.dataset.action;
        if (action === 'lower' || action === 'reload') this.engine.ctx.events.dispatchEvent(new Event('touch-shot-cancel'));
        if (action === 'aim') {
          const next = button.getAttribute('aria-pressed') !== 'true';
          button.setAttribute('aria-pressed', String(next)); action = next ? 'mount' : 'lower';
        }
        this.engine.ctx.events.dispatchEvent(new CustomEvent('hunt-action', { detail: action }));
      } });
    }
    window.addEventListener('resize', () => this.engine.ctx.events.dispatchEvent(new Event('touch-shot-cancel')), { signal });
  }
  canApplyOfflineUpdate(): boolean { return !this.capture && (!this.entered || this.complete); }

  private persistGuide(): void {
    const serialized = JSON.stringify(this.guide.snapshot());
    if (serialized === this.guideSaved) return;
    this.guideSaved = serialized;
    try { localStorage.setItem(FIELD_GUIDE_KEY, serialized); } catch { /* Tips also work for this visit without storage. */ }
  }

  private updateGuide(dt: number): void {
    const line = document.getElementById('first-hunt-guide');
    if (!line) return;
    if (!this.readyState || !this.entered || this.complete || this.capture || this.falconry || this.engine.ctx.paused) {
      line.hidden = true; return;
    }
    this.guideElapsed += dt;
    if (this.guideElapsed < .15) return;
    const elapsed = this.guideElapsed; this.guideElapsed = 0;
    const ctx = this.engine.ctx, hunt = ctx.get<Hunt3DSystem>('hunt3d'), gun = ctx.get<GunSystem>('gun');
    const dogs = Array.from({ length: hunt.dogCount() }, (_, i) => hunt.dog(i));
    const dog = dogs.find(d => d.state === 'pointing') ?? dogs.find(d => d.state === 'retrieving') ?? dogs[0];
    if (!dog) { line.hidden = true; return; }
    const world = hunt.simToWorld(dog.pos.x, dog.pos.y, { x: 0, z: 0 });
    const fallback = document.getElementById('mouse-look-fallback');
    const input: GuideInput = this.touch ? 'touch' : fallback && !fallback.hidden ? 'drag-look' : 'desktop';
    const state = hunt.huntState();
    const text = this.guide.update({
      active: true, input, areaId: state.areaId,
      x: ctx.camera.position.x, z: ctx.camera.position.z, yaw: ctx.camera.rotation.y, pitch: ctx.camera.rotation.x,
      rise: ctx.get<BirdsSystem>('birds').isRiseActive(), mounted: gun.mountProgress() > .01,
      gunId: state.gunId, shells: gun.shellsRemaining(), reloading: gun.isReloading(),
      retrieved: state.birds.filter(bird => bird.state === 'retrieved').length,
      dog: { state: dog.state, scentStage: dog.scentStage, heading: dog.heading, rangeM: Math.hypot(world.x - ctx.camera.position.x, world.z - ctx.camera.position.z),
        carrying: dog.carryingBirdId !== null, allAtHeel: dogs.every(d => d.state === 'heel'),
        searchAreaChecked: dog.searchAreaChecked, waitingForHandler: dog.waitingForHandler },
    }, elapsed);
    if (text && line.textContent !== text) line.textContent = text;
    line.hidden = !text; this.persistGuide();
  }

  offlineUpdateState(state: OfflineUpdateState): void {
    this.updateState = state;
    const panel = document.getElementById('app-update-panel')!;
    panel.hidden = state === 'none' || this.capture;
    const button = document.getElementById('app-update-button') as HTMLButtonElement;
    const safe = this.canApplyOfflineUpdate();
    button.disabled = !safe || state === 'applying';
    button.textContent = state === 'applying' ? 'Updating…' : 'Update game';
    const copy: Record<OfflineUpdateState, string> = {
      none: '', ready: 'A new version is ready. Updating starts a fresh hunt.',
      applying: 'Installing the new version…',
      'other-tabs': 'Close other game tabs, then try updating again.',
      unsafe: 'Finish this hunt before installing the update.',
      failed: 'The update could not finish. You can keep playing and try again later.',
    };
    document.getElementById('app-update-status')!.textContent = !safe && state !== 'none'
      ? 'A new version is ready. Finish this hunt before installing it.' : copy[state];
  }

  private refreshShotAssistance(): void {
    const preference = shotAssistancePreference();
    const profile = resolveShotAssistance(this.activeChallenge, preference, 'touch');
    const lead = preference === 'difficulty' ? `${HUNT_CHALLENGES[this.activeChallenge].label} hunt: ` : '';
    const descriptions = {
      off: 'No shot forgiveness. Lead and timing decide the shot.',
      light: 'Light forgiveness for close misses. Keep swinging ahead of crossing birds.',
      generous: 'More forgiveness for close misses. Keep swinging ahead of crossing birds.',
    };
    document.getElementById('shot-assistance-help')!.textContent = lead + descriptions[profile.level];
  }
  private refreshShotgunMenu(): void {
    if (!this.readyState || this.falconry) return;
    const gun = getGun(this.engine.ctx.get<GunSystem>('gun').equippedGunId());
    const choices = this.launch?.kind === 'career' ? unlockedGuns(loadCareer().hunter.level) : GUNS;
    const select = document.getElementById('shotgun-setting') as HTMLSelectElement;
    select.replaceChildren(...choices.map(choice => {
      const option = document.createElement('option');
      option.value = choice.id; option.textContent = choice.name;
      return option;
    }));
    select.value = gun.id;
    select.disabled = this.lostContext || this.complete;
    document.getElementById('shotgun-options')!.hidden = false;
    document.getElementById('shotgun-equipped')!.textContent = `${gun.name} · ${gun.shells}-shell capacity`;
    const rack = document.getElementById('shotgun-rack') as HTMLAnchorElement;
    rack.href = `./shotguns3d.html?gun=${encodeURIComponent(gun.id)}`;
  }
  private changeShotgun(id: string): void {
    if (this.falconry || !this.readyState || !this.engine.ctx.paused || this.complete || this.lostContext) return;
    // Read the current save at the moment of choice; opening the rack or
    // another tab must not make this menu write back an old career snapshot.
    const career = this.launch?.kind === 'career' ? loadCareer() : null;
    const choices = career ? unlockedGuns(career.hunter.level) : GUNS;
    if (!choices.some(gun => gun.id === id) || !this.engine.ctx.get<GunSystem>('gun').equipGun(this.engine.ctx, id)) {
      this.refreshShotgunMenu();
      return;
    }
    if (career) {
      career.hunter.shotgunId = id; saveCareer(career);
    } else if (this.launch?.kind === 'quick') {
      saveQuickConfig({ ...loadQuickConfig(), gunId: id });
    } else {
      const url = new URL(location.href); url.searchParams.set('gun', id); history.replaceState(null, '', url);
    }
    this.refreshShotgunMenu();
    document.getElementById('shotgun-status')!.textContent = `${getGun(id).name} equipped. ${this.entered ? 'Return to' : 'Enter'} the field when ready.`;
    this.engine.renderOnce();
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
    this.activeChallenge = this.engine.ctx.get<Hunt3DSystem>('hunt3d').getActiveChallenge();
    this.refreshShotAssistance();
    const light=document.getElementById('light-setting') as HTMLSelectElement;
    light.disabled=false;light.value=this.engine.ctx.timeOfDay;
    this.overlay.hidden = this.capture;
    this.status.hidden = true; this.progress.hidden = true;
    document.getElementById('field-guide')!.hidden = this.capture;
    document.getElementById('field-instructions')!.hidden = false;
    this.refreshShotgunMenu();
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
    this.refreshShotgunMenu();
    document.getElementById('shotgun-status')!.textContent = '';
    this.enter.innerHTML = 'Return to the field <span aria-hidden="true">↗</span>';
    this.enter.focus();
  }
  private resume(): void {
    if (!this.readyState || this.complete || this.lostContext) return;
    this.entered = true; unlockAudio();
    this.offlineUpdateState(this.updateState);
    this.overlay.classList.add('field-has-entered');
    (document.getElementById('field-guide') as HTMLDetailsElement).open = false;
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
  return usesTouchControls() ? 'lite' : 'high';
}
