import { renderDogDevelopment } from './trainingView';
import './training.css';
import './preparation.css';
import { OFFERED_AREAS, isOfferedArea, getArea } from '../game/areas';
import { BREEDS, getBreed, type BreedConfig } from '../game/breeds';
import {
  CAREER_KEY, canNameLastSeason, inLastSeason, isRetired, loadCareer, saveCareer, seasonsHunted, setLastSeason, workingDogs,
  type Career, type KennelDog,
} from '../game/career';
import { dogCareerProgress, hunterCareerProgress, type ExperienceProgress } from '../game/careerProgress';
import { coatLabel, coatsForBreed, isModeledBreed, modelForBreed, resolveCoatFor } from '../game/dogCoats';
import { GUNS, type GunConfig } from '../game/guns';
import { saveGameplayMode } from '../game/gameplayMode';
import { HUNT_CHALLENGES, HUNT_CHALLENGE_KEY, parseHuntChallenge, type HuntChallenge } from '../game/huntChallenge';
import { huntingDoctrine } from '../game/huntDoctrine';
import { careerPreparation, commitCareerSetup, commitCareerLoadout, commitDogCoat, commitPreparationDog, commitPreparationCalendar, commitCareerLaunch, commitQuickLaunch } from '../game/huntPreparation';
import { GEAR_NAMES } from '../game/progression';
import { loadQuickConfig, saveQuickConfig, normalizeQuickConfig, QUICK_KEY, WIND_CHOICES, WEATHER_CHOICES, type QuickConfig } from '../game/quick';
import { OFFERED_REGIONS, regionOfArea } from '../game/regions';
import { dateLabel } from '../game/season';
import { getSpecies } from '../game/species';
import { limitsLabel } from '../game/bagLimits';
import { openHuntJournal } from './huntJournalView';
import { saveTransferSection } from './saveTransfer';
import { createPreparationMap } from './maps/preparationMap';
import { enableOfflineHunts, requestOfflineUpdate, type OfflineUpdateState } from './offline';
import { preparationInstalledEntry, rememberPreparationLaunch, preservePreparationDraft, consumePreparationDraft, discardPreparationDraft, type PreparationDraft } from './preparationOffline';
import { propertyMenuArt } from './menuArt';
import { coatSwatch } from './dogs/coatSwatch';
import { DEFAULT_DOG_STYLE, DOG_STYLE_KEY, DOG_STYLE_LABELS, DOG_STYLE_SELECTABLE, DOG_STYLES, effectiveDogStyle, preferredDogStyle, resolveDogStyle, saveDogStyle, type DogStyle } from './dogs/dogStyle';
import type { DogPreview, PreviewDog, PreviewPose } from './dogPreview';
import { fitPages, type FitPager } from './fitPager';
import { menuMusicOnFirstGesture } from './menuMusic';
import { createAssistsPanel } from './assistsPanel';
import { huntAssists, onHuntAssists } from './assistsRuntime';
import { ASSIST_PRESETS, matchingPreset } from '../game/huntAssists';
import './fitPager.css';

/*
 * Hunt preparation is four short steps: where (ground), who (dog), with what
 * (gear) and when (day). A rail summarises every choice and jumps between
 * steps; the launch bar always shows the whole outing, the way between
 * steps and the way out. Nothing scrolls: each step is laid out to fit the
 * screen, and on a small screen its sections page with Back / More. Saves go through the same commit functions
 * as before: nothing here writes a career or Quick setup directly.
 */

type Step = 'ground' | 'dog' | 'gear' | 'day';
const STEPS: readonly { id: Step; label: string; eyebrow: string; title: string }[] = [
  { id: 'ground', label: 'Ground', eyebrow: 'Where', title: 'Choose your ground' },
  { id: 'dog', label: 'Dog', eyebrow: 'Who', title: 'Choose your dog' },
  { id: 'gear', label: 'Gear', eyebrow: 'With what', title: 'Pick your gear' },
  { id: 'day', label: 'Day', eyebrow: 'When', title: 'Set the day' },
];
const GUN_ACTIONS: Record<string, string> = { 'remington-870': 'Pump action', 'semi-auto': 'Semiautomatic', 'over-under': 'Over / under', 'side-by-side': 'Side by side' };
const LIGHTS = [
  { id: 'morning', label: 'Morning', detail: 'Long shadows, cool air' },
  { id: 'noon', label: 'Noon', detail: 'High sun, bright cover' },
  { id: 'evening', label: 'Evening', detail: 'Warm, low light' },
] as const;
const STAT_LABELS: readonly [keyof BreedConfig['stats'], string][] = [['nose', 'Nose'], ['speed', 'Speed'], ['range', 'Range'], ['steadiness', 'Steadiness'], ['stamina', 'Stamina']];
const POSES: readonly [PreviewPose, string][] = [['stand', 'Standing'], ['point', 'On point'], ['trot', 'Trotting'], ['run', 'Running']];

const root = document.getElementById('preparation')!;
const installedEntry = preparationInstalledEntry(location.href, loadQuickConfig(), preferenceStorage());
if (installedEntry.url.href !== location.href) history.replaceState(null, '', installedEntry.url);
const params = installedEntry.url.searchParams;
// The classic 2D hunt is retired from the menus: preparation always opens the 3D field.
const requestedRenderer = '3d';
const threeD = requestedRenderer === '3d';
let career = loadCareer(), quick = installedEntry.quick;
let mode: 'quick' | 'career' = params.get('mode') === 'career' ? 'career' : 'quick';
let areaId = params.get('area') ?? (mode === 'career'
  ? careerPreparation(career).areas.find(area => area.isHome)?.area.id ?? quick.areaId : quick.areaId);
if (mode === 'quick') { quick = normalizeQuickConfig({ ...quick, areaId }); areaId = quick.areaId; }
let dropPointId = params.get('drop') ?? '';
let dogId = career.activeDogId ?? '', braceId = career.braceDogId ?? '';
let gunId = career.hunter.shotgunId;
let challenge = parseHuntChallenge(params.get('challenge') ?? readPreference(HUNT_CHALLENGE_KEY));
let quality = params.get('quality') ?? readPreference('uplandin.3d.quality') ?? 'auto';
if (!['auto', 'lite', 'high'].includes(quality)) quality = 'auto';
// One art style for every dog while the house style is undecided.
let dogStyle: DogStyle | null = resolveDogStyle(params.get('dogstyle')) ?? preferredDogStyle();
let light = ['morning', 'noon', 'evening'].includes(params.get('tod') ?? '') ? params.get('tod')! : 'morning';
let coat = params.get('coat') ?? undefined, controls = params.get('controls') ?? undefined;
let message = '', addingDog = false, launching = false, updating = false, updateRequested = false;
let groundView: 'scene' | 'atlas' = 'scene';
let previewPose: PreviewPose = 'stand', compareStyles = false;
let puppyDraft: PreparationDraft['puppyDraft'] = { breedId: 'gsp', name: '', homeRegionId: career.homeRegionId ?? 'southern-plains' };
const propertyDrafts: Record<string, { areaId: string; dropPointId: string }> = {
  quick: { areaId: quick.areaId, dropPointId: '' },
  career: { areaId: careerPreparation(career).areas.find(area => area.isHome)?.area.id ?? 'quail-fields', dropPointId: '' },
};
const atlases = new Map<string, HTMLCanvasElement>();
const restored = consumePreparationDraft(location.href, draftStorage());
if (restored) {
  ({ mode, areaId, dropPointId, quick, dogId, braceId, gunId, quality, light, coat, controls, addingDog, puppyDraft } = restored);
  challenge = parseHuntChallenge(restored.challenge); Object.assign(propertyDrafts, restored.propertyDrafts);
  message = 'Your hunt setup is ready to continue.';
}
// A coat carried by an older link belongs to the Quick lead dog.
if (coat && mode === 'quick') { quick = normalizeQuickConfig({ ...quick, coatId: coat }); coat = undefined; }
// Only the GSP and English Setter have 3D models; the field draws nothing else.
if (threeD && mode === 'quick') {
  if (!isModeledBreed(quick.breedId)) quick = normalizeQuickConfig({ ...quick, breedId: 'gsp', coatId: undefined });
  if (quick.breed2Id !== 'none' && !isModeledBreed(quick.breed2Id)) quick = normalizeQuickConfig({ ...quick, breed2Id: 'english-setter', coat2Id: undefined });
}
const requestedStep = params.get('step') as Step | null;
let step: Step = STEPS.some(s => s.id === requestedStep) ? requestedStep! : needsSetup() ? 'dog' : 'ground';

// These nodes outlive re-renders: the offline client holds the status node,
// and the live dog preview keeps its WebGL canvas and animation state.
const offlinePanel = node('section', '', 'settings-group');
offlinePanel.id = 'prep-offline';
offlinePanel.append(node('h3', 'Install & offline play'), node('p', 'Use your browser’s Install or Add to Home Screen command to open Uplandin as a full-screen game. Wait for offline readiness before heading out without a connection.', 'help'));
const offlineStatus = node('p', '', 'help'); offlineStatus.id = 'offline-status'; offlineStatus.setAttribute('aria-live', 'polite');
const updateStatus = node('p', '', 'help'); updateStatus.id = 'prep-update-status'; updateStatus.setAttribute('role', 'status');
const updateButton = button('Update game', () => { if (!updating && !launching) { updateRequested = true; requestOfflineUpdate(); } }, 'secondary');
updateButton.id = 'prep-update'; updateButton.hidden = true;
offlinePanel.append(offlineStatus, updateStatus, updateButton);
const dogStage = node('div', '', 'dog-stage');
const dogStageCanvas = node('div', '', 'dog-stage-canvas');
dogStage.append(dogStageCanvas);
let preview: DogPreview | null = null, previewState: 'idle' | 'loading' | 'live' | 'failed' = 'idle';
const settingsDialog = node('dialog', '', 'prep-dialog'); settingsDialog.setAttribute('aria-labelledby', 'prep-settings-title');
document.body.append(settingsDialog);

function preferenceStorage(): Storage | null { try { return localStorage; } catch { return null; } }
function draftStorage(): Storage | null { try { return sessionStorage; } catch { return null; } }
function readPreference(key: string): string | null { try { return localStorage.getItem(key); } catch { return null; } }
function needsSetup(): boolean { const s = careerPreparation(career); return mode === 'career' && (s.needsDog || s.needsHome); }
function currentDraft(): PreparationDraft {
  return { mode, areaId, dropPointId, quick, dogId, braceId, gunId, challenge, quality, light, coat, controls, addingDog, puppyDraft,
    propertyDrafts: { quick: propertyDrafts.quick, career: propertyDrafts.career } };
}
function offlineUpdateState(state: OfflineUpdateState): void {
  updating = state === 'applying';
  if (!updating) { updateRequested = false; discardPreparationDraft(draftStorage()); }
  updateButton.hidden = state === 'none'; updateButton.disabled = updating || launching;
  updateButton.textContent = updating ? 'Updating…' : 'Update game';
  updateStatus.textContent = ({ none: '', ready: 'An update is ready. Your current setup will be kept.',
    applying: 'Updating the game. Keeping your hunt setup…', 'other-tabs': 'Close other game windows, then try the update again. Your setup is still here.',
    unsafe: 'The update could not safely keep this setup. Your current draft is still here; you can continue preparing your hunt.',
    failed: 'The update did not finish. Reconnect, then try again. Your setup is still here.' })[state];
  const start = document.getElementById('prep-start') as HTMLButtonElement | null;
  if (start) start.disabled = launching || updating || start.dataset.unavailable === 'true';
}
function node<K extends keyof HTMLElementTagNameMap>(tag: K, value = '', className = ''): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag); el.textContent = value; if (className) el.className = className; return el;
}
function button(label: string, action: () => void, className = ''): HTMLButtonElement {
  const el = node('button', label, className); el.type = 'button'; el.addEventListener('click', action); return el;
}
function link(label: string, href: string, className = ''): HTMLAnchorElement { const el = node('a', label, className); el.href = href; return el; }
function artUrl(path: string): string { return `${import.meta.env.BASE_URL}art/menus3d/${path}.webp`; }
function cardArt(container: HTMLElement, sources: string[], className: string): void {
  const image = node('img', '', className);
  image.alt = ''; image.decoding = 'async';
  let index = 0;
  image.addEventListener('load', () => { container.dataset.art = 'ready'; });
  image.addEventListener('error', () => {
    if (++index < sources.length) { image.src = sources[index]; return; }
    image.remove(); container.dataset.art = 'missing';
  });
  image.src = sources[0]; container.prepend(image);
}
const capital = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
/** Short breed names for tight summaries; full names stay on the cards. */
const shortBreed = (breedId: string) => ({ gsp: 'GSP', 'english-setter': 'English Setter', 'english-pointer': 'Pointer', gwp: 'Wirehair', griffon: 'Griffon' } as Record<string, string>)[breedId] ?? getBreed(breedId).name;

/**
 * A radio group of rich option buttons. Arrow keys move and select, as with
 * native radios; the checked option is the group's one tab stop.
 */
interface RadioOption<T extends string> { id: T; disabled?: boolean; label: string; build?(el: HTMLButtonElement): void }
function radioGroup<T extends string>(config: { id: string; label: string; value: T; options: readonly RadioOption<T>[]; className?: string; onChange(value: T): void; rerender?(focusId: string): void }): HTMLElement {
  const group = node('div', '', `choice-group ${config.className ?? ''}`.trim());
  group.setAttribute('role', 'radiogroup'); group.setAttribute('aria-label', config.label); group.id = config.id;
  const buttons: HTMLButtonElement[] = [];
  const choose = (option: RadioOption<T>) => {
    if (option.disabled) return;
    if (option.id !== config.value) config.onChange(option.id);
    (config.rerender ?? render)(`${config.id}-${option.id}`);
  };
  for (const option of config.options) {
    const el = node('button', '', 'choice'); el.type = 'button'; el.id = `${config.id}-${option.id}`;
    el.setAttribute('role', 'radio'); el.setAttribute('aria-checked', String(option.id === config.value));
    if (option.disabled) el.setAttribute('aria-disabled', 'true');
    el.tabIndex = option.id === config.value ? 0 : -1;
    if (option.build) { option.build(el); el.setAttribute('aria-label', option.label); } else el.textContent = option.label;
    el.addEventListener('click', () => choose(option));
    el.addEventListener('keydown', event => {
      const keys: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
      if (!(event.key in keys) && event.key !== 'Home' && event.key !== 'End') return;
      event.preventDefault();
      const enabled = config.options.filter(o => !o.disabled);
      if (!enabled.length) return;
      const current = enabled.findIndex(o => o.id === option.id);
      const next = event.key === 'Home' ? enabled[0] : event.key === 'End' ? enabled[enabled.length - 1]
        : enabled[(Math.max(0, current) + keys[event.key] + enabled.length) % enabled.length];
      choose(next);
    });
    buttons.push(el); group.append(el);
  }
  // With no checked option (a stale value), keep the group reachable.
  if (!buttons.some(b => b.tabIndex === 0)) { const first = buttons.find(b => !b.hasAttribute('aria-disabled')); if (first) first.tabIndex = 0; }
  return group;
}
function field(label: string, control: HTMLElement, hint?: string): HTMLElement {
  const wrap = node('div', '', 'prep-field');
  const heading = node('h3', label, 'field-label');
  const labelId = `${control.id || label.replace(/\W+/g, '-').toLowerCase()}-label`;
  heading.id = labelId; control.setAttribute('aria-labelledby', labelId); control.removeAttribute('aria-label');
  wrap.append(heading, control);
  if (hint) wrap.append(node('p', hint, 'help'));
  return wrap;
}
function experienceBar(progress: ExperienceProgress, label: string): HTMLProgressElement {
  const meter = node('progress'); meter.max = progress.required; meter.value = progress.earned;
  meter.setAttribute('aria-label', `${label}: ${progress.earned} of ${progress.required} XP toward level ${progress.nextLevel}`);
  return meter;
}
function statBars(breed: BreedConfig, compact = false): HTMLElement {
  const stats = node('dl', '', compact ? 'breed-stats compact' : 'breed-stats');
  for (const [key, label] of compact ? STAT_LABELS.filter(([k]) => k !== 'speed' && k !== 'steadiness') : STAT_LABELS) {
    const row = node('div', '', 'breed-stat'), value = breed.stats[key];
    const bar = node('dd'); bar.style.setProperty('--value', String(value / 5));
    bar.setAttribute('aria-label', `${value} of 5`);
    row.append(node('dt', label), bar); stats.append(row);
  }
  return stats;
}
function swatch(breedId: string, coatId: string | undefined, className = 'coat-swatch'): HTMLElement {
  const chip = node('span', '', className); chip.setAttribute('aria-hidden', 'true');
  chip.style.background = threeD || isModeledBreed(breedId) ? coatSwatch(resolveCoatFor(breedId, coatId)) : 'radial-gradient(circle,#cfc6b0,#8d8570)';
  return chip;
}
function error(value: string): void { message = value; render(); document.getElementById('preparation-message')?.focus(); }
function persistCareer(next: Career): boolean {
  saveCareer(next);
  if (readPreference(CAREER_KEY) !== JSON.stringify(next)) { error('Your browser could not save this change. Allow site storage, then try again.'); return false; }
  career = next; return true;
}
function updateQuick(value: Partial<QuickConfig>): void {
  if (value.breedId && value.breedId !== quick.breedId && !('coatId' in value)) value = { ...value, coatId: undefined };
  if (value.breed2Id && value.breed2Id !== quick.breed2Id && !('coat2Id' in value)) value = { ...value, coat2Id: undefined };
  quick = normalizeQuickConfig({ ...quick, areaId, ...value }); areaId = quick.areaId;
}
function refreshFromCareer(): void {
  career = loadCareer(); dogId = career.activeDogId ?? ''; braceId = career.braceDogId ?? ''; gunId = career.hunter.shotgunId;
}
const breedChoices = (): readonly BreedConfig[] => threeD ? BREEDS.filter(b => isModeledBreed(b.id)) : BREEDS;
const goshawk = () => mode === 'quick' && quick.huntingMethod === 'goshawk';

/* ------------------------------------------------------------------ the dog */

/** The lead and (optional) second dog as drawn in the field. */
function chosenDogs(): { lead: { breedId: string; coatId?: string; name?: string } | null; second: { breedId: string; coatId?: string; name?: string } | null } {
  if (mode === 'career') {
    if (needsSetup()) return { lead: { breedId: puppyDraft.breedId, coatId: puppyDraft.coatId, name: puppyDraft.name || undefined }, second: null };
    const working = workingDogs(career);
    const lead = working.find(d => d.id === dogId) ?? null, mate = working.find(d => d.id === braceId) ?? null;
    return { lead: lead && { breedId: lead.breedId, coatId: lead.coatId, name: lead.name }, second: mate && careerPreparation(career).canBrace ? { breedId: mate.breedId, coatId: mate.coatId, name: mate.name } : null };
  }
  return { lead: { breedId: quick.breedId, coatId: quick.coatId },
    second: quick.breed2Id !== 'none' && !goshawk() ? { breedId: quick.breed2Id, coatId: quick.coat2Id } : null };
}
function styleFor(breedId: string): DogStyle { return effectiveDogStyle(modelForBreed(breedId), dogStyle); }
function previewDogs(): PreviewDog[] {
  const { lead, second } = chosenDogs();
  if (!lead) return [];
  const model = modelForBreed(lead.breedId), coatId = resolveCoatFor(lead.breedId, lead.coatId);
  if (compareStyles && DOG_STYLE_SELECTABLE) return DOG_STYLES.map(style => ({ breed: model, coat: coatId, style, label: DOG_STYLE_LABELS[style].label }));
  const dogs: PreviewDog[] = [{ breed: model, coat: coatId, style: styleFor(lead.breedId), label: lead.name ?? getBreed(lead.breedId).name }];
  if (second) dogs.push({ breed: modelForBreed(second.breedId), coat: resolveCoatFor(second.breedId, second.coatId), style: styleFor(second.breedId), label: second.name ?? getBreed(second.breedId).name });
  return dogs;
}
function stageFallback(): void {
  // A still portrait stands in when WebGL is unavailable or still loading.
  dogStage.querySelector('.dog-stage-fallback')?.remove();
  const { lead } = chosenDogs(); if (!lead) return;
  const still = node('div', '', 'dog-stage-fallback');
  const model = modelForBreed(lead.breedId);
  still.append(node('span', getBreed(lead.breedId).name.split(' ').map(w => w[0]).join('').slice(0, 3), 'breed-monogram'));
  const style = styleFor(lead.breedId), coatId = resolveCoatFor(lead.breedId, lead.coatId);
  // The classic 2D hunt has its own sprites: show breed art only where it exists.
  const sources = threeD ? [artUrl(`dogs/${model}-${style}-${coatId}`), artUrl(`dogs/${model}-${style}`), artUrl(`dogs/${model}`)]
    : isModeledBreed(lead.breedId) ? [artUrl(`dogs/${lead.breedId}`)] : [];
  if (sources.length) cardArt(still, sources, 'dog-still');
  dogStage.prepend(still);
}
function syncPreview(): void {
  const showing = step === 'dog' && threeD;
  dogStage.dataset.state = previewState;
  if (!showing) { preview?.setActive(false); return; }
  if (previewState === 'idle') {
    previewState = 'loading'; dogStage.dataset.state = previewState; stageFallback();
    import('./dogPreview').then(({ createDogPreview }) => {
      try {
        preview = createDogPreview(dogStageCanvas, { quality: quality === 'lite' ? 'lite' : quality === 'high' ? 'high' : undefined,
          onReady: () => { previewState = 'live'; dogStage.dataset.state = previewState; } });
        syncPreview();
      } catch { previewState = 'failed'; dogStage.dataset.state = previewState; }
    }).catch(() => { previewState = 'failed'; dogStage.dataset.state = previewState; });
    return;
  }
  if (previewState === 'failed') { stageFallback(); return; }
  if (!preview) return;
  if (previewState !== 'live') stageFallback();
  preview.setActive(true);
  preview.show(previewDogs());
  preview.setPose(previewPose);
}

function dogStagePanel(): HTMLElement {
  const wrap = node('div', '', 'dog-stage-wrap');
  dogStage.querySelectorAll('.dog-stage-overlay').forEach(el => el.remove());
  const dogs = previewDogs();
  const labels = node('div', '', 'dog-stage-overlay dog-stage-labels');
  labels.dataset.count = String(dogs.length);
  for (const d of dogs) {
    const tag = node('span', '', 'dog-stage-tag');
    tag.append(node('strong', d.label ?? ''), node('small', compareStyles ? DOG_STYLE_LABELS[d.style].detail : coatLabel(d.breed, d.coat)));
    labels.append(tag);
  }
  const hint = node('p', 'Drag to turn', 'dog-stage-overlay dog-stage-hint');
  if (threeD) dogStage.append(labels, hint);
  else {
    // No live model in the classic view: a portrait (or monogram) and the breed's strengths.
    const lead = chosenDogs().lead;
    dogStage.dataset.state = 'still'; stageFallback();
    if (lead) {
      const tag = node('div', '', 'dog-stage-overlay dog-stage-labels');
      const label = node('span', '', 'dog-stage-tag'); label.append(node('strong', lead.name ?? getBreed(lead.breedId).name), node('small', capital(getBreed(lead.breedId).blurb)));
      tag.append(label); dogStage.append(tag);
      const stats = statBars(getBreed(lead.breedId)); stats.classList.add('stage-stats');
      wrap.append(dogStage, stats); return wrap;
    }
  }
  wrap.append(dogStage);
  if (threeD) {
    // Pose and style sit on the stage so the dog stays in view while they change.
    const poses = node('div', '', 'dog-stage-overlay dog-stage-poses');
    poses.append(radioGroup({ id: 'preview-pose', label: 'Preview pose', value: previewPose, className: 'segmented',
      options: POSES.map(([id, label]) => ({ id, label })), onChange: value => { previewPose = value; } }));
    dogStage.append(poses);
    if (DOG_STYLE_SELECTABLE) {
      // The art style sits on the stage with the poses, so the dog keeps the room.
      const styles = node('div', '', 'dog-stage-overlay style-picker');
      const current: string = compareStyles ? 'compare' : dogStyle ?? 'breed';
      const group = radioGroup({ id: 'prep-dog-style', label: 'Dog art style', value: current, className: 'segmented',
        options: [...DOG_STYLES.map(style => ({ id: style as string, label: DOG_STYLE_LABELS[style].label })), { id: 'compare', label: 'Compare' }],
        onChange: value => {
          if (value === 'compare') { compareStyles = true; return; }
          compareStyles = false; dogStyle = value as DogStyle; saveDogStyle(dogStyle);
        } });
      group.title = compareStyles ? 'Both styles side by side. Pick one to use it for every dog.'
        : dogStyle ? 'Art style for every dog in the field.' : `No style chosen yet: the GSP shows ${DEFAULT_DOG_STYLE.gsp} and the setter ${DEFAULT_DOG_STYLE['english-setter']}.`;
      styles.append(group);
      dogStage.append(styles);
    }
  }
  return wrap;
}

function breedCards(id: string, value: string, onChange: (breedId: string) => void, disabled = false): HTMLElement {
  const breeds = breedChoices();
  return radioGroup({ id, label: 'Breed', value, className: breeds.length > 3 ? 'breed-list' : 'breed-cards',
    options: breeds.map(breed => ({ id: breed.id, label: `${breed.name}, ${breed.blurb}`, disabled: disabled && breed.id !== value,
      build: el => {
        const head = node('span', '', 'choice-head');
        head.append(node('strong', breed.name), node('small', capital(breed.blurb)));
        el.append(head);
        if (breeds.length <= 3) el.append(statBars(breed));
      } })),
    onChange });
}
function coatSwatches(id: string, breedId: string, value: string | undefined, onChange: (coatId: string) => void): HTMLElement {
  const current = resolveCoatFor(breedId, value);
  const group = radioGroup({ id, label: 'Coat', value: current, className: 'coat-choices',
    options: coatsForBreed(breedId).map(c => ({ id: c.id, label: c.label, build: el => { el.append(swatch(breedId, c.id), node('span', c.label, 'coat-name')); } })),
    onChange });
  return group;
}
function kennelCard(dog: KennelDog): (el: HTMLButtonElement) => void {
  return el => {
    const breed = getBreed(dog.breedId), outlook = dogCareerProgress(career, dog);
    el.append(swatch(dog.breedId, dog.coatId, 'coat-swatch large'));
    const text = node('span', '', 'choice-head');
    text.append(node('strong', dog.name), node('small', `${breed.name} · Level ${dog.level} · ${outlook.ageLabel}`));
    el.append(text);
    if (threeD && !isModeledBreed(dog.breedId)) el.append(node('span', 'Setter body in 3D', 'tag'));
  };
}

function dogStep(panel: HTMLElement): void {
  // The stage stays in view on every page; the choices beside it page.
  const stage = dogStagePanel(); stage.dataset.fitIgnore = '';
  panel.append(stage);
  const choices = panel;
  const preparation = careerPreparation(career);
  if (mode === 'career' && (preparation.needsDog || preparation.needsHome)) { firstSeason(choices, preparation.needsDog); return; }
  if (mode === 'career') { careerDogs(choices); return; }
  if (goshawk()) {
    choices.append(field('Breed', breedCards('prep-breed', 'gsp', () => undefined, true), 'A finished GSP works with your goshawk.'));
    choices.append(field('Coat', coatSwatches('prep-coat', 'gsp', quick.coatId, value => updateQuick({ coatId: value }))));
    return;
  }
  choices.append(field('Breed', breedCards('prep-breed', quick.breedId, value => updateQuick({ breedId: value }))));
  if (threeD) choices.append(field('Coat', coatSwatches('prep-coat', quick.breedId, quick.coatId, value => updateQuick({ coatId: value }))));
  const level = node('div', '', 'level-slider');
  const range = node('input'); range.type = 'range'; range.min = '1'; range.max = '10'; range.step = '1'; range.value = String(quick.level); range.id = 'prep-level';
  const describe = (value: number) => `Level ${value}${value === 1 ? ' · first season' : value === 10 ? ' · finished dog' : value >= 7 ? ' · seasoned' : ''}`;
  const readout = node('output', describe(quick.level)); readout.htmlFor.add('prep-level');
  range.setAttribute('aria-valuetext', describe(quick.level));
  range.addEventListener('input', () => { readout.textContent = describe(Number(range.value)); range.setAttribute('aria-valuetext', readout.textContent); });
  range.addEventListener('change', () => { updateQuick({ level: Number(range.value) }); render('prep-level'); });
  const labels = node('div', '', 'level-ends'); labels.append(node('span', 'Young dog'), node('span', 'Finished'));
  level.append(readout, range, labels);
  choices.append(field('Experience', level));
  // A brace is part of choosing dogs, not a display setting.
  const brace = node('div', '', 'brace-block');
  brace.append(radioGroup({ id: 'prep-quick-brace', label: 'Second dog', value: quick.breed2Id === 'none' ? 'none' : 'brace', className: 'segmented wide',
    options: [{ id: 'none', label: 'Hunt one dog' }, { id: 'brace', label: 'Add a second dog' }],
    onChange: value => updateQuick({ breed2Id: value === 'none' ? 'none' : quick.breedId === 'gsp' ? 'english-setter' : 'gsp' }) }));
  if (quick.breed2Id !== 'none') {
    brace.append(radioGroup({ id: 'prep-breed2', label: 'Second dog breed', value: quick.breed2Id, className: 'segmented wide',
      options: breedChoices().map(b => ({ id: b.id, label: b.name })), onChange: value => updateQuick({ breed2Id: value }) }));
    if (threeD) brace.append(coatSwatches('prep-coat2', quick.breed2Id, quick.coat2Id, value => updateQuick({ coat2Id: value })));
  }
  choices.append(field('Second dog', brace));
}

function careerDogs(choices: HTMLElement): void {
  const preparation = careerPreparation(career), working = workingDogs(career);
  if (!working.some(d => d.id === dogId)) dogId = preparation.activeDog?.id ?? '';
  choices.append(field('Working dog', radioGroup({ id: 'prep-dog', label: 'Working dog', value: dogId, className: 'kennel-list',
    options: working.map(d => ({ id: d.id, label: `${d.name}, ${getBreed(d.breedId).name}, level ${d.level}`, build: kennelCard(d) })),
    onChange: value => { dogId = value; if (braceId === value) braceId = ''; } })));
  const lead = working.find(d => d.id === dogId);
  if (lead) {
    if (threeD) choices.append(field(`${lead.name}’s coat`, coatSwatches('prep-coat', lead.breedId, lead.coatId, value => {
      const result = commitDogCoat(loadCareer(), lead.id, value);
      if (!result.ok) error(result.message); else persistCareer(result.career);
    })));
    const outlook = dogCareerProgress(career, lead), panel = node('div', '', 'dog-outlook');
    panel.append(node('p', `${lead.name} · ${outlook.ageLabel}`, 'progress-label'));
    if (outlook.progress) panel.append(experienceBar(outlook.progress, lead.name), node('p', `${outlook.progress.remaining} XP to level ${outlook.progress.nextLevel} · ${outlook.nextBenefit}`, 'progress-detail'));
    else panel.append(node('p', 'Maximum experience reached', 'progress-detail'));
    if (outlook.ageEffect) panel.append(node('p', outlook.ageEffect, 'progress-age'));
    // An old dog's last season is its handler's call, never the game's.
    if (inLastSeason(career, lead)) {
      panel.append(node('p', `${lead.name}’s last season. ${lead.name} retires to the porch when it ends.`, 'last-season'));
      const keep = button(`Keep ${lead.name} hunting`, () => { if (persistCareer(setLastSeason(loadCareer(), lead.id, false))) render('prep-last-season'); }, 'text-button');
      keep.id = 'prep-last-season'; panel.append(keep);
    } else if (canNameLastSeason(career, lead)) {
      const name = button(`Make this ${lead.name}’s last season`, () => { if (persistCareer(setLastSeason(loadCareer(), lead.id, true))) render('prep-last-season'); }, 'text-button');
      name.id = 'prep-last-season'; panel.append(name);
    } else panel.append(node('p', 'Points, retrieves and birds downed over a point build your dog’s experience.', 'help'));
    panel.append(renderDogDevelopment(lead));
    const train = node('a', `Train ${lead.name} →`, 'training-link'); train.href = `./training3d.html?mode=career&trainee=${encodeURIComponent(lead.id)}`; panel.append(train);
    choices.append(panel);
  }
  if (preparation.canBrace && working.length > 1) {
    choices.append(field('Second dog', radioGroup({ id: 'prep-brace', label: 'Second dog', value: braceId || 'none', className: 'kennel-list compact',
      options: [{ id: 'none', label: 'Hunt one dog', build: (el: HTMLButtonElement) => { el.append(node('span', '', 'coat-swatch large empty'), node('span', 'Hunt one dog', 'choice-head')); } },
        ...working.filter(d => d.id !== dogId).map(d => ({ id: d.id, label: `${d.name}, ${getBreed(d.breedId).name}`, build: kennelCard(d) }))],
      onChange: value => { braceId = value === 'none' ? '' : value; } })));
  } else if (!preparation.canBrace) choices.append(node('p', 'Hunting two dogs together unlocks at a higher hunter level.', 'help'));
  porch(choices);
  const kennel = node('div', '', 'kennel-footer');
  kennel.append(node('p', `${GEAR_NAMES[preparation.gearTier]} · ${working.length}/${preparation.kennelCapacity} kennel places`, 'help'));
  if (addingDog) { choices.append(kennel); dogForm(choices, false); return; }
  if (preparation.canAddDog) {
    const add = button('Add a dog to your kennel', () => { addingDog = true; puppyDraft = { ...puppyDraft, breedId: 'gsp', coatId: undefined, name: '' }; render('puppy-name'); }, 'secondary');
    add.id = 'prep-add-dog'; kennel.append(add);
  }
  choices.append(kennel);
}

/** Retired dogs, with the seasons they gave and their record. */
function porch(choices: HTMLElement): void {
  const retired = career.kennel.filter(isRetired);
  if (!retired.length) return;
  const section = node('section', '', 'kennel-porch'); section.setAttribute('aria-label', 'On the porch');
  section.append(node('h4', 'On the porch', 'field-label'));
  const list = node('ul');
  for (const dog of retired) {
    const life = dog.lifetime ? ` · ${dog.lifetime.points} points · ${dog.lifetime.retrieves} retrieves` : '';
    const item = node('li'); item.append(node('strong', dog.name), node('span', ` ${getBreed(dog.breedId).name} · ${seasonsHunted(dog)} seasons${life}`));
    list.append(item);
  }
  section.append(list); choices.append(section);
}

function dogForm(container: HTMLElement, first: boolean): void {
  const form = node('form', '', 'puppy-form'); form.id = 'puppy-form';
  if (!first) form.append(node('h3', 'A new dog', 'form-title'));
  const nameLabel = node('label', '', 'text-field'); nameLabel.htmlFor = 'puppy-name'; nameLabel.append(node('span', 'Name', 'field-label'));
  const name = node('input'); name.id = 'puppy-name'; name.name = 'dog-name'; name.required = true; name.maxLength = 24; name.autocomplete = 'off'; name.placeholder = 'e.g. Sage';
  name.value = puppyDraft.name; name.addEventListener('input', () => { puppyDraft.name = name.value; syncLaunchSummary(); });
  nameLabel.append(name); form.append(nameLabel);
  form.append(field('Breed', breedCards('puppy-breed', puppyDraft.breedId, value => { puppyDraft = { ...puppyDraft, breedId: value, coatId: undefined }; })));
  if (threeD) form.append(field('Coat', coatSwatches('puppy-coat', puppyDraft.breedId, puppyDraft.coatId, value => { puppyDraft = { ...puppyDraft, coatId: value }; })));
  if (first && !career.homeRegionId) {
    const built = OFFERED_REGIONS;
    form.append(field('Home ground', radioGroup({ id: 'home-region', label: 'Home ground', value: puppyDraft.homeRegionId, className: 'region-cards',
      options: built.map(r => ({ id: r.id, label: r.name, build: el => { const head = node('span', '', 'choice-head'); head.append(node('strong', r.name), node('small', r.blurb)); el.append(head); } })),
      onChange: value => { puppyDraft = { ...puppyDraft, homeRegionId: value }; } }),
    'Home hunts take one week. A truck unlocks travel at hunter level 2; trips take two weeks.'));
  }
  const actions = node('div', '', 'form-actions');
  const submit = node('button', first ? 'Begin your career' : 'Welcome this dog', 'primary'); submit.type = 'submit'; submit.id = 'prep-dog-save';
  actions.append(submit);
  if (!first) actions.append(button('Cancel', () => { addingDog = false; puppyDraft.name = ''; render('prep-add-dog'); }, 'text-button'));
  form.append(actions);
  form.addEventListener('submit', event => {
    event.preventDefault(); const current = loadCareer();
    const dog = { name: name.value, breedId: puppyDraft.breedId, coatId: threeD ? resolveCoatFor(puppyDraft.breedId, puppyDraft.coatId) : undefined };
    const result = first ? commitCareerSetup(current, { homeRegionId: career.homeRegionId ?? puppyDraft.homeRegionId, dog })
      : commitPreparationDog(current, dog);
    if (!result.ok) { error(result.message); return; }
    if (!persistCareer(result.career)) return;
    addingDog = false; refreshFromCareer();
    if (first) { areaId = careerPreparation(career).areas.find(a => a.isHome)?.area.id ?? areaId; }
    message = `${name.value.trim()} is ready for a first season.`;
    puppyDraft = { breedId: 'gsp', name: '', homeRegionId: career.homeRegionId ?? 'southern-plains' };
    render();
  });
  container.append(form);
}

function firstSeason(choices: HTMLElement, needsDog: boolean): void {
  const intro = node('div', '', 'first-season');
  // A kennel that has all retired carries on with a new pup.
  const carryingOn = needsDog && career.kennel.some(isRetired);
  intro.append(node('p', 'A HUNTING LIFE', 'eyebrow'), node('h3', carryingOn ? 'A new pup' : 'Your first season'),
    node('p', carryingOn ? 'Your old dogs are on the porch. Name a young dog to carry on.'
      : needsDog ? 'Name a young dog to grow with you, and choose the country you call home.' : 'Choose the country you call home.', 'help'));
  choices.append(intro);
  if (needsDog) { dogForm(choices, true); return; }
  choices.append(field('Home ground', radioGroup({ id: 'home-region', label: 'Home ground', value: puppyDraft.homeRegionId, className: 'region-cards',
    options: OFFERED_REGIONS.map(r => ({ id: r.id, label: r.name, build: el => { const head = node('span', '', 'choice-head'); head.append(node('strong', r.name), node('small', r.blurb)); el.append(head); } })),
    onChange: value => { puppyDraft = { ...puppyDraft, homeRegionId: value }; } })));
  const save = button('Set home ground', () => {
    const result = commitCareerSetup(loadCareer(), { homeRegionId: puppyDraft.homeRegionId });
    if (!result.ok) error(result.message); else if (persistCareer(result.career)) { areaId = careerPreparation(career).areas.find(a => a.isHome)!.area.id; render(); }
  }, 'primary'); save.id = 'prep-home-save'; choices.append(save);
}

/* --------------------------------------------------------------- the ground */

function groundStep(panel: HTMLElement): void {
  const preparation = careerPreparation(career);
  const rows = mode === 'career' ? preparation.areas : OFFERED_AREAS.map(area => ({ area, selectable: !goshawk() || area.id === 'pheasant-coverts', reason: goshawk() ? 'Goshawk hunts use Cattail Coverts.' : null, isHome: false }));
  // The hand-built properties lead with their art; the rest follow as a list.
  const groundOptions = (subset: typeof rows, featured: boolean) => subset.map(row => ({ id: row.area.id,
    label: `${row.area.name}, ${regionOfArea(row.area.id).name}${row.selectable ? '' : `. ${row.reason ?? ''}`}`,
    disabled: mode === 'quick' && !row.selectable,
    build: (el: HTMLButtonElement) => {
      const region = regionOfArea(row.area.id);
      if (featured) { const art = node('span', '', 'ground-thumb'); const src = propertyMenuArt(row.area.id); if (src) cardArt(art, [src], 'ground-thumb-art'); el.append(art); }
      else { const chip = node('span', '', 'region-chip'); chip.dataset.region = region.id; chip.setAttribute('aria-hidden', 'true'); el.append(chip); }
      const head = node('span', '', 'choice-head');
      head.append(node('strong', row.area.name), node('small', featured ? region.name : `${region.name} · ${row.area.speciesMix.map(sp => getSpecies(sp.speciesId).name).slice(0, 2).join(', ')}`));
      el.append(head);
      if (mode === 'career' && row.isHome) el.append(node('span', 'Home', 'tag'));
      if (mode === 'career' && !row.selectable) { el.classList.add('unavailable'); el.append(node('span', row.reason ?? 'Unavailable', 'choice-note')); }
    } }));
  const featuredRows = rows.filter(row => propertyMenuArt(row.area.id)), otherRows = rows.filter(row => !propertyMenuArt(row.area.id));
  const onArea = (value: string) => { areaId = value; dropPointId = ''; if (mode === 'quick') updateQuick({ areaId: value }); };
  const grounds = node('div', '', 'ground-row');
  grounds.append(radioGroup({ id: 'prep-area', label: 'Featured grounds', value: areaId, className: 'ground-cards', options: groundOptions(featuredRows, true), onChange: onArea }));
  if (otherRows.length) {
    // The other properties open in a picker rather than growing the page.
    const chosenOther = otherRows.find(row => row.area.id === areaId);
    const more = button('', () => openMoreGround(otherRows, groundOptions(otherRows, false), onArea), `ground-more${chosenOther ? ' chosen' : ''}`);
    more.id = 'prep-more-ground'; more.setAttribute('aria-haspopup', 'dialog');
    const head = node('span', '', 'choice-head');
    head.append(node('strong', chosenOther ? chosenOther.area.name : 'More ground'), node('small', chosenOther ? `${regionOfArea(chosenOther.area.id).name} · change` : `${otherRows.length} more properties`));
    more.append(node('span', chosenOther ? '✓' : '+', 'ground-more-mark'), head);
    grounds.append(more);
  }
  panel.append(grounds);
  const area = getArea(areaId), doctrine = huntingDoctrine(area.id);
  const entry = preparation.areas.find(a => a.area.id === areaId)!;
  const speciesIds = mode === 'career' ? entry.openSpeciesIds : area.speciesMix.map(s => s.speciesId);
  const detail = node('section', '', 'ground-detail'); detail.id = 'prep-ground-panel'; detail.dataset.groundView = groundView;
  const top = node('div', '', 'ground-detail-top');
  const title = node('div');
  title.append(node('p', doctrine.region.toUpperCase(), 'eyebrow'), node('h3', area.name), node('p', speciesIds.length ? speciesIds.map(id => getSpecies(id).name).join(' · ') : 'Season currently closed', 'property-species'));
  const limits = limitsLabel(area.id, speciesIds);
  if (challenge === 'loaded') title.append(node('p', 'Preserve day · no daily limit', 'property-limit'));
  else if (limits) title.append(node('p', `Daily limit · ${limits}`, 'property-limit'));
  const tabs = radioGroup({ id: 'prep-show', label: 'Property view', value: groundView, className: 'segmented',
    options: [{ id: 'scene', label: 'The ground' }, { id: 'atlas', label: 'Atlas' }], onChange: value => { groundView = value; } });
  top.append(title, tabs); detail.append(top);
  const view = node('div', '', 'ground-view'), notes = node('div', '', 'ground-notes');
  detail.append(view, notes);
  if (groundView === 'scene') {
    const hero = node('div', '', 'property-hero'); const art = propertyMenuArt(area.id); if (art) cardArt(hero, [art], 'property-art');
    view.append(hero);
  } else {
    const mapStage = node('div', '', 'map-stage'); mapStage.style.setProperty('--map-aspect', String(area.world.w / area.world.h));
    const map = node('div', '', 'property-map'); map.setAttribute('aria-label', `${area.name} terrain and truck entries`);
    let atlas = atlases.get(area.id);
    if (!atlas) { atlas = createPreparationMap(area); if (atlases.size >= 2) atlases.delete(atlases.keys().next().value!); atlases.set(area.id, atlas); }
    atlas.setAttribute('role', 'img'); atlas.setAttribute('aria-label', `Survey of ${area.name}: cover, contours and paths`); map.append(atlas);
    const north = node('span', 'N ↑', 'map-north'); north.setAttribute('aria-hidden', 'true'); map.append(north);
    area.dropPoints.forEach((drop, i) => {
      const marker = button(String(i + 1), () => { dropPointId = drop.id; render(`map-drop-${drop.id}`); }, 'map-entry');
      marker.id = `map-drop-${drop.id}`; marker.setAttribute('aria-label', `Truck entry ${i + 1}: ${drop.name}`); marker.setAttribute('aria-pressed', String(drop.id === dropPointId));
      const x = (drop.position.x - area.world.x) / area.world.w, y = (drop.position.y - area.world.y) / area.world.h;
      marker.style.left = `calc(${x * 100}% + ${30 - 60 * x}px)`; marker.style.top = `calc(${y * 100}% + ${30 - 60 * y}px)`; map.append(marker);
    });
    mapStage.append(map); view.append(mapStage);
  }
  // The decision first (where the truck stops), then the reading.
  notes.append(field('Truck entry', radioGroup({ id: 'prep-drop', label: 'Truck entry', value: dropPointId, className: 'segmented wrap',
    options: area.dropPoints.map((drop, i) => ({ id: drop.id, label: `${i + 1}. ${drop.name}` })), onChange: value => { dropPointId = value; } })));
  const approach = node('div', '', 'property-approach');
  approach.append(node('p', 'THE APPROACH', 'eyebrow'), node('h4', doctrine.method.toLowerCase().replace(/(^| · )([a-z])/g, (_, gap: string, letter: string) => gap + letter.toUpperCase())), node('p', doctrine.description));
  const tip = node('p', doctrine.tip, 'field-advice');
  approach.append(tip);
  notes.append(approach);
  panel.append(detail);
}

function openMoreGround(rows: { area: { id: string; name: string } }[], options: RadioOption<string>[], onArea: (value: string) => void): void {
  const dialog = node('dialog', '', 'prep-dialog more-ground-dialog'); dialog.setAttribute('aria-labelledby', 'more-ground-title');
  const header = node('header'); const title = node('div');
  title.append(node('p', 'MORE GROUND', 'eyebrow'), node('h2', `${rows.length} more properties`)); title.querySelector('h2')!.id = 'more-ground-title';
  const close = button('Close', () => dialog.close(), 'secondary');
  header.append(title, close);
  const body = node('div', '', 'prep-dialog-body');
  body.append(radioGroup({ id: 'prep-area-more', label: 'More ground', value: areaId, className: 'ground-list', options,
    onChange: value => { onArea(value); }, rerender: focusId => { dialog.close(); render(focusId.startsWith('prep-area-more') ? 'prep-more-ground' : focusId); } }));
  const pager = node('div', '', 'dialog-pager');
  dialog.append(header, body, pager); document.body.append(dialog);
  const fit = fitPages(body.firstElementChild as HTMLElement, { nav: pager, key: 'prep-more-ground' });
  dialog.addEventListener('close', () => { fit.dispose(); dialog.remove(); document.getElementById('prep-more-ground')?.focus({ preventScroll: true }); }, { once: true });
  dialog.showModal();
  body.querySelector<HTMLElement>('[aria-checked=true]')?.focus({ preventScroll: true });
}

/* ----------------------------------------------------------------- the gear */

function gearStep(panel: HTMLElement): void {
  const preparation = careerPreparation(career);
  if (mode === 'quick') {
    const method = field('How you hunt', radioGroup({ id: 'prep-method', label: 'Hunting method', value: quick.huntingMethod ?? 'shotgun', className: 'segmented wide',
      options: [
        { id: 'shotgun', label: 'Shotgun' },
        { id: 'goshawk', label: 'Goshawk' },
      ], onChange: value => updateQuick({ huntingMethod: value as QuickConfig['huntingMethod'] }) }));
    method.classList.add('gear-method'); panel.append(method);
  }
  if (goshawk()) {
    const note = node('p', 'Your goshawk rides on the fist. A finished GSP finds and points the birds; slip the hawk at the flush.', 'help gear-guns');
    panel.append(note);
  } else {
    const unlocked = new Set((mode === 'career' ? preparation.availableGuns : GUNS).map(g => g.id));
    const current = mode === 'career' ? gunId : quick.gunId;
    const guns = field('Shotgun', radioGroup({ id: 'prep-gun', label: 'Shotgun', value: current, className: 'gun-cards',
      options: GUNS.map((gun: GunConfig) => ({ id: gun.id, label: `${gun.name}, ${gun.shells} shells${unlocked.has(gun.id) ? '' : `, unlocks at hunter level ${gun.unlockLevel}`}`, disabled: !unlocked.has(gun.id),
        build: el => {
          const art = node('span', '', 'gun-portrait'); art.append(node('span', GUN_ACTIONS[gun.id] ?? 'Shotgun', 'gun-art-fallback'));
          cardArt(art, [artUrl(`guns/${gun.id}`)], 'gun-art');
          const head = node('span', '', 'choice-head');
          head.append(node('strong', gun.name), node('small', `${GUN_ACTIONS[gun.id] ?? 'Sporting shotgun'} · ${gun.shells} shells · ${gun.chokes.map(c => c.name.toLowerCase()).join(' / ')}`));
          el.append(art, head);
          if (!unlocked.has(gun.id)) el.append(node('span', `Hunter level ${gun.unlockLevel}`, 'tag locked'));
        } })),
      onChange: value => { if (mode === 'career') gunId = value; else updateQuick({ gunId: value }); } }));
    const rack = link('Gun rack ↗', `./shotguns3d.html?gun=${encodeURIComponent(current)}`, 'text-link field-aside'); rack.target = '_blank'; rack.rel = 'noopener';
    guns.querySelector('.field-label')?.after(rack);
    guns.classList.add('gear-guns'); panel.append(guns);
  }
  // Difficulty is the hunter's kit: tracking collar, map, sight picture.
  const kit = createAssistsPanel({ compact: true, earnedTier: mode === 'career' ? preparation.gearTier : null });
  const kitField = field('Your kit', kit);
  kitField.classList.add('gear-kit'); panel.append(kitField);
}

/* ------------------------------------------------------------------ the day */

function dayStep(panel: HTMLElement): void {
  panel.append(field('Light', radioGroup({ id: 'prep-light', label: 'Light', value: light, className: 'light-cards',
    options: LIGHTS.map(l => ({ id: l.id, label: `${l.label}, ${l.detail}`, build: el => {
      el.append(node('span', '', `light-swatch light-${l.id}`));
      const h = node('span', '', 'choice-head'); h.append(node('strong', l.label), node('small', l.detail)); el.append(h);
    } })), onChange: value => { light = value; } })));
  if (mode === 'quick') {
    const conditions = node('div', '', 'day-conditions');
    conditions.append(field('Weather', radioGroup({ id: 'prep-weather', label: 'Weather', value: quick.weather, className: 'segmented wrap',
      options: WEATHER_CHOICES.map(id => ({ id, label: id === 'random' ? 'Any' : capital(id) })), onChange: value => updateQuick({ weather: value as QuickConfig['weather'] }) })));
    conditions.append(field('Wind', radioGroup({ id: 'prep-wind', label: 'Wind', value: quick.wind, className: 'segmented wrap',
      options: WIND_CHOICES.map(id => ({ id, label: id === 'random' ? 'Any' : capital(id) })), onChange: value => updateQuick({ wind: value as QuickConfig['wind'] }) })));
    panel.append(conditions);
  } else panel.append(node('p', 'Weather and bird behaviour follow your career season.', 'help'));
  panel.append(field('Challenge', radioGroup({ id: 'prep-challenge', label: 'Challenge', value: challenge, className: 'challenge-cards',
    options: (Object.entries(HUNT_CHALLENGES) as [HuntChallenge, (typeof HUNT_CHALLENGES)[HuntChallenge]][])
      .filter(([id]) => mode !== 'career' || id !== 'loaded').map(([id, c]) => ({ id, label: `${c.label}. ${c.description}`,
      build: el => { const h = node('span', '', 'choice-head'); h.append(node('strong', c.label), node('small', c.description)); el.append(h); } })),
    onChange: value => { challenge = parseHuntChallenge(value); } })));
  if (mode === 'career') {
    const preparation = careerPreparation(career), calendar = preparation.calendarAction;
    const entry = preparation.areas.find(a => a.area.id === areaId)!;
    if (calendar) {
      const season = node('section', '', 'season-panel');
      season.append(node('h3', 'The season ahead', 'field-label'), node('p', `${dateLabel(career.date)} · ${entry.selectable ? `${entry.isHome ? 'Home hunt' : 'Hunting trip'} · ${entry.weeks} week${entry.weeks === 1 ? '' : 's'} afield` : entry.reason ?? ''}`, 'help'));
      const advance = button(calendar.label, () => {
        const result = commitPreparationCalendar(loadCareer(), calendar.kind);
        const before = loadCareer();
        if (!result.ok) error(result.message); else if (persistCareer(result.career)) {
          const retired = result.career.kennel.filter(dog => isRetired(dog) && !before.kennel.some(prior => prior.id === dog.id && isRetired(prior)));
          message = `Calendar advanced · ${dateLabel(career.date)}.`
            + retired.map(dog => ` ${dog.name} retires to the porch after ${seasonsHunted(dog)} seasons.`).join('');
          render('prep-calendar');
        }
      }, 'secondary'); advance.id = 'prep-calendar'; season.append(advance); panel.append(season);
    }
  }
}

/* ------------------------------------------------------------ summaries */

function summaries(): Record<Step, { value: string; detail: string }> {
  const preparation = careerPreparation(career);
  const area = getArea(areaId), drop = area.dropPoints.find(d => d.id === dropPointId) ?? area.dropPoints[0];
  const entry = preparation.areas.find(a => a.area.id === areaId);
  const { lead, second } = chosenDogs();
  const dogValue = mode === 'career' && needsSetup() ? (puppyDraft.name.trim() || 'Your first dog') : lead ? lead.name ?? shortBreed(lead.breedId) : 'Choose a dog';
  const dogDetail = lead ? [lead.name ? shortBreed(lead.breedId) : null, threeD ? coatLabel(lead.breedId, lead.coatId) : null, mode === 'quick' ? `Level ${quick.level}` : null, second ? `+ ${second.name ?? shortBreed(second.breedId)}` : null].filter(Boolean).join(' · ') : '';
  const gun = GUNS.find(g => g.id === (mode === 'career' ? gunId : quick.gunId));
  return {
    ground: { value: area.name, detail: mode === 'career' && entry && !entry.selectable ? entry.reason ?? '' : drop.name },
    dog: { value: dogValue, detail: dogDetail },
    gear: { value: goshawk() ? 'Goshawk' : gun?.name ?? 'Shotgun', detail: goshawk() ? 'From the fist' : `${gun?.shells ?? 0} shells · ${kitLabel()}` },
    day: { value: capital(light), detail: [mode === 'quick' && quick.weather !== 'random' ? capital(quick.weather) : null, HUNT_CHALLENGES[challenge].label].filter(Boolean).join(' · ') },
  };
}
function syncLaunchSummary(): void {
  const s = summaries(), detail = document.getElementById('launch-detail');
  if (detail) detail.textContent = [s.dog.value, s.gear.value, s.day.value].join(' · ');
  const dogSummary = document.querySelector('[data-step-summary=dog] strong');
  if (dogSummary) dogSummary.textContent = s.dog.value;
  const gearDetail = document.querySelector('[data-step-summary=gear] small');
  if (gearDetail) gearDetail.textContent = s.gear.detail;
}

/** The kit as a rail line: the preset's name, or Custom. */
function kitLabel(): string {
  const preset = matchingPreset(huntAssists());
  return preset ? `${ASSIST_PRESETS[preset].label} kit` : 'Custom kit';
}
onHuntAssists(() => syncLaunchSummary());

/* ---------------------------------------------------------------- settings */

function openSettings(opener: HTMLElement): void {
  settingsDialog.replaceChildren();
  const header = node('header');
  const heading = node('div'); heading.append(node('p', 'PLAY YOUR WAY', 'eyebrow'));
  const title = node('h2', 'Settings'); title.id = 'prep-settings-title'; heading.append(title);
  const close = button('Close', () => settingsDialog.close(), 'secondary'); header.append(heading, close);
  const body = node('div', '', 'prep-dialog-body');
  // Inside the dialog a choice refreshes the dialog, not the screen behind it.
  const refresh = (focusId: string) => { openSettings(opener); document.getElementById(focusId)?.focus(); };
  const settingsRadio = <T extends string>(id: string, label: string, value: T, options: RadioOption<T>[], change: (v: T) => void) =>
    radioGroup({ id, label, value, className: 'segmented wrap', options, onChange: change, rerender: refresh });
  if (threeD || goshawk()) body.append(field('Graphics', settingsRadio('prep-quality', 'Graphics', quality, [
    { id: 'auto', label: 'Match this device' }, { id: 'lite', label: 'Lightweight' }, { id: 'high', label: 'High' }], v => { quality = v; })));
  if (threeD && DOG_STYLE_SELECTABLE) {
    body.append(field('Dog art style', settingsRadio('prep-settings-style', 'Dog art style', dogStyle ?? 'breed', [
      { id: 'breed', label: 'Each breed’s default' }, ...DOG_STYLES.map(s => ({ id: s, label: DOG_STYLE_LABELS[s].label }))],
    v => { dogStyle = v === 'breed' ? null : v as DogStyle; if (dogStyle) saveDogStyle(dogStyle); else try { localStorage.removeItem(DOG_STYLE_KEY); } catch { /* optional */ } }),
    'The same choice is on the Dog step, where you can compare both styles.'));
  }
  body.append(field('Your save', saveTransferSection()));
  body.append(offlinePanel);
  const dialogPager = node('div', '', 'dialog-pager');
  settingsDialog.append(header, body, dialogPager);
  dialogFit?.dispose(); dialogFit = fitPages(body, { nav: dialogPager, key: 'prep-settings' });
  if (!settingsDialog.open) {
    settingsDialog.showModal(); close.focus({ preventScroll: true });
    settingsDialog.addEventListener('close', () => { render(); opener.isConnected ? opener.focus() : document.getElementById('prep-settings')?.focus(); }, { once: true });
  }
}

/* ------------------------------------------------------------------ render */

let stepPager: FitPager | null = null;
let dialogFit: FitPager | null = null;
// A dog step lays out differently across the narrow breakpoint (the stage
// joins the column), so a width change across it rebuilds the step.
const narrowStep = window.matchMedia?.('(max-width:1100px)');
narrowStep?.addEventListener?.('change', () => { if (step === 'dog') render(); });

function showStep(next: Step, focusHeading = false): void {
  step = next; render();
  const url = new URL(location.href); url.searchParams.set('step', step); history.replaceState(null, '', url);
  if (focusHeading) document.getElementById('prep-step-title')?.focus({ preventScroll: true });
}

function render(focusId?: string): void {
  const saved = careerPreparation(career);
  const working = workingDogs(career);
  if (!working.some(dog => dog.id === dogId)) dogId = saved.activeDog?.id ?? working[0]?.id ?? '';
  if (!saved.canBrace || braceId === dogId || !working.some(dog => dog.id === braceId)) braceId = '';
  if (!saved.availableGuns.some(gun => gun.id === gunId)) gunId = saved.availableGuns[0].id;
  const projected = commitCareerLoadout(career, { activeDogId: dogId || undefined, braceDogId: braceId || null, gunId });
  const preparation = careerPreparation(projected.ok ? projected.career : career);
  const onboarding = mode === 'career' && (preparation.needsDog || preparation.needsHome);
  if (!isOfferedArea(areaId)) areaId = 'quail-fields';
  if (goshawk()) areaId = 'pheasant-coverts';
  const area = getArea(areaId), entry = preparation.areas.find(a => a.area.id === areaId)!;
  if (!area.dropPoints.some(drop => drop.id === dropPointId)) dropPointId = area.dropPoints[0].id;
  root.replaceChildren();
  root.dataset.step = step; root.dataset.mode = mode;

  const header = node('header', '', 'prep-header');
  const brand = link('', './home3d.html', 'brand'); brand.setAttribute('aria-label', 'Uplandin home'); brand.append(node('strong', 'UPLANDIN'), node('span', 'Plan your hunt'));
  const modes = radioGroup({ id: 'mode', label: 'Hunt mode', value: mode, className: 'mode-switch',
    options: [{ id: 'quick', label: 'Quick hunt' }, { id: 'career', label: 'Career' }],
    onChange: value => {
      propertyDrafts[mode] = { areaId, dropPointId }; mode = value; message = ''; addingDog = false; compareStyles = false; career = loadCareer();
      ({ areaId, dropPointId } = propertyDrafts[mode]);
      if (needsSetup()) step = 'dog';
      history.replaceState(null, '', `?renderer=${requestedRenderer}&mode=${mode}&step=${step}`);
    } });
  const nav = node('nav'); nav.setAttribute('aria-label', 'Game');
  const journal = button('Journal', () => openHuntJournal(loadCareer(), journal), 'header-button'); journal.id = 'prep-journal'; journal.setAttribute('aria-label', 'Field journal');
  const settings = button('Settings', () => openSettings(settings), 'header-button'); settings.id = 'prep-settings';
  nav.append(journal, settings);
  header.append(brand, modes, nav);

  const main = node('main', '', 'prep-main');
  const rail = node('nav', '', 'prep-rail'); rail.setAttribute('aria-label', 'Hunt preparation steps');
  const status = node('p', mode === 'career' ? `${dateLabel(career.date)} · Hunter level ${career.hunter.level} · ${career.hunts} hunts` : 'Quick hunt · everything unlocked', 'rail-status');
  rail.append(status);
  const list = node('ol', '', 'step-list');
  const s = summaries();
  STEPS.forEach((info, i) => {
    const item = node('li');
    const locked = onboarding && info.id !== 'dog';
    const b = button('', () => showStep(info.id), 'step-button'); b.id = `prep-view-${info.id}`; b.dataset.stepSummary = info.id;
    if (info.id === step) b.setAttribute('aria-current', 'step');
    if (locked) { b.disabled = true; b.title = 'Choose your first dog and home ground first.'; }
    b.append(node('span', String(i + 1).padStart(2, '0'), 'step-index'));
    const text = node('span', '', 'step-text');
    text.append(node('span', info.label, 'step-label'), node('strong', s[info.id].value), node('small', s[info.id].detail));
    b.append(text);
    if (info.id === 'dog' && threeD) { const chip = chosenDogs().lead; if (chip) b.append(swatch(chip.breedId, chip.coatId, 'coat-swatch step-swatch')); }
    item.append(b); list.append(item);
  });
  rail.append(list);
  if (mode === 'career' && !onboarding) {
    const outlook = hunterCareerProgress(career), panel = node('div', '', 'career-outlook');
    panel.id = 'prep-career-outlook'; panel.setAttribute('aria-label', 'Hunter progress');
    panel.append(node('p', outlook.progress ? `${outlook.progress.remaining} XP to hunter level ${outlook.progress.nextLevel}` : 'Maximum hunter level reached', 'progress-label'));
    if (outlook.progress) panel.append(experienceBar(outlook.progress, 'Hunter'));
    if (outlook.nextUnlock) panel.append(node('p', `Level ${outlook.nextUnlock.level}: ${outlook.nextUnlock.labels.join(' · ')}`, 'progress-detail'));
    rail.append(panel);
  }
  main.append(rail);

  const content = node('section', '', 'prep-step'); content.setAttribute('aria-labelledby', 'prep-step-title');
  const info = STEPS.find(x => x.id === step)!, index = STEPS.indexOf(info);
  const head = node('div', '', 'step-head');
  const titleWrap = node('div');
  const title = node('h1', info.title); title.id = 'prep-step-title'; title.tabIndex = -1;
  titleWrap.append(node('p', `${String(index + 1).padStart(2, '0')} · ${info.eyebrow.toUpperCase()}`, 'eyebrow'), title);
  head.append(titleWrap);
  content.append(head);
  const notice = node('p', message, 'prep-message'); notice.id = 'preparation-message'; notice.setAttribute('role', 'status'); notice.tabIndex = -1; notice.hidden = !message;
  content.append(notice);
  const panel = node('div', '', `step-panel step-${step}`); panel.id = `prep-${step}-panel`;
  if (step === 'ground') groundStep(panel);
  else if (step === 'dog') dogStep(panel);
  else if (step === 'gear') gearStep(panel);
  else dayStep(panel);
  const pagerNav = node('div', '', 'step-pager'); pagerNav.hidden = true;
  content.append(panel, pagerNav); main.append(content);

  const footer = node('footer', '', 'launch-bar'); const outing = node('div', '', 'launch-destination');
  if (onboarding) outing.append(node('small', 'A HUNTING LIFE'), node('strong', 'Your first season'), node('span', preparation.needsDog ? 'Name your dog and choose a home ground.' : 'Choose your home ground.'));
  else {
    const where = `${area.name} · ${(area.dropPoints.find(d => d.id === dropPointId) ?? area.dropPoints[0]).name}`;
    outing.append(node('small', mode === 'career' ? `YOUR NEXT OUTING · ${entry.weeks} WEEK${entry.weeks === 1 ? '' : 'S'}` : 'YOUR NEXT OUTING · QUICK HUNT'), node('strong', where));
    const detail = node('span', mode === 'career' && entry.reason ? entry.reason : [s.dog.value, s.gear.value, s.day.value].join(' · ')); detail.id = 'launch-detail';
    outing.append(detail);
  }
  const start = button('', () => {
    if (!onboarding) { launch(); return; }
    // The footer submits the same form, never a second save path.
    if (step !== 'dog') showStep('dog');
    if (preparation.needsDog) root.querySelector<HTMLFormElement>('#puppy-form')?.requestSubmit();
    else document.getElementById('prep-home-save')?.click();
  }, 'primary'); start.id = 'prep-start';
  if (onboarding) start.textContent = preparation.needsDog ? 'Begin your career' : 'Set home ground';
  else { start.append(node('span', 'Head to the field', 'start-long'), node('span', 'Hunt', 'start-short'), node('span', ' ↗')); start.setAttribute('aria-label', 'Head to the field'); }
  const unavailable = mode === 'career' && !onboarding && !entry.selectable;
  start.dataset.unavailable = String(unavailable); start.disabled = launching || updating || unavailable;
  // The way through the steps lives beside the way out, always in reach.
  const stepNav = node('div', '', 'step-nav');
  if (!onboarding && index > 0) {
    const previous = STEPS[index - 1];
    const back = button(`‹ ${previous.label}`, () => showStep(previous.id, true), 'secondary step-back'); back.id = 'prep-previous-step';
    back.setAttribute('aria-label', `Back to ${previous.label.toLowerCase()}`); stepNav.append(back);
  }
  if (!onboarding && index < STEPS.length - 1) {
    const nextInfo = STEPS[index + 1];
    const next = button(`Next: ${nextInfo.label} ›`, () => showStep(nextInfo.id, true), 'secondary next-step'); next.id = 'prep-next-step';
    stepNav.append(next);
  }
  footer.append(outing, stepNav, start);
  root.append(header, main, footer);

  stepPager?.dispose();
  stepPager = fitPages(panel, { nav: pagerNav, key: `${mode}:${step}` });
  if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
  syncPreview();
}

function launch(): void {
  if (launching || updating) return;
  const result = mode === 'career' ? commitCareerLaunch(loadCareer(), { areaId, dropPointId, activeDogId: dogId, braceDogId: braceId || null, gunId })
    : commitQuickLaunch({ ...quick, areaId }, dropPointId);
  if (!result.ok) { refreshFromCareer(); error(result.message); return; }
  if ('career' in result) { if (!persistCareer(result.career)) return; }
  else {
    saveQuickConfig(result.config);
    if (readPreference(QUICK_KEY) !== JSON.stringify(result.config)) { error('Your browser could not save this setup. Allow site storage, then try again.'); return; }
  }
  saveGameplayMode('3d');
  try { localStorage.setItem(HUNT_CHALLENGE_KEY, challenge); } catch { /* The URL also carries this choice. */ }
  const url = new URL(result.href, location.href);
  url.searchParams.set('challenge', challenge); url.searchParams.set('tod', light); url.searchParams.set('dog', 'generated');
  // Keep Auto distinct from the effective tier chosen by device preference.
  url.searchParams.set('quality', quality);
  const { lead, second } = chosenDogs();
  if (DOG_STYLE_SELECTABLE && dogStyle) url.searchParams.set('dogstyle', dogStyle);
  if (lead) url.searchParams.set('coat', resolveCoatFor(lead.breedId, lead.coatId));
  if (second) url.searchParams.set('coat2', resolveCoatFor(second.breedId, second.coatId));
  if (controls) url.searchParams.set('controls', controls);
  rememberPreparationLaunch(currentDraft(), preferenceStorage());
  discardPreparationDraft(draftStorage());
  preview?.setActive(false);
  launching = true; (document.getElementById('prep-start') as HTMLButtonElement).disabled = true; location.assign(url.href);
}

window.addEventListener('storage', event => {
  if (event.key === CAREER_KEY && mode === 'career') { refreshFromCareer(); message = 'Your career changed in another tab. Review your setup before heading out.'; render(); }
});
window.addEventListener('pagehide', event => { if (!event.persisted) { preview?.dispose(); preview = null; previewState = 'idle'; } });
window.addEventListener('pageshow', event => { if (event.persisted) { launching = false; render(); } });
render();
enableOfflineHunts({ canReload: () => !launching && updateRequested && preservePreparationDraft(location.href, currentDraft(), draftStorage()),
  onUpdateState: offlineUpdateState });
menuMusicOnFirstGesture();
