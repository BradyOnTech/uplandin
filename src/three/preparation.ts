import './preparation.css';
import { AREAS, getArea } from '../game/areas';
import { BREEDS, getBreed } from '../game/breeds';
import { CAREER_KEY, loadCareer, saveCareer, type Career } from '../game/career';
import { dogCareerProgress, hunterCareerProgress, type ExperienceProgress } from '../game/careerProgress';
import { GUNS } from '../game/guns';
import { saveGameplayMode } from '../game/gameplayMode';
import { HUNT_CHALLENGES, HUNT_CHALLENGE_KEY, parseHuntChallenge } from '../game/huntChallenge';
import { huntingDoctrine } from '../game/huntDoctrine';
import { careerPreparation, commitCareerSetup, commitCareerLoadout, commitPreparationDog, commitPreparationCalendar, commitCareerLaunch, commitQuickLaunch } from '../game/huntPreparation';
import { GEAR_NAMES } from '../game/progression';
import { loadQuickConfig, saveQuickConfig, normalizeQuickConfig, QUICK_KEY, WIND_CHOICES, WEATHER_CHOICES, type QuickConfig } from '../game/quick';
import { REGIONS, regionOfArea } from '../game/regions';
import { dateLabel } from '../game/season';
import { getSpecies } from '../game/species';
import { openHuntJournal } from './huntJournalView';
import { createPreparationMap } from './maps/preparationMap';
import { enableOfflineHunts, requestOfflineUpdate, type OfflineUpdateState } from './offline';
import { preparationInstalledEntry, rememberPreparationLaunch, preservePreparationDraft, consumePreparationDraft, discardPreparationDraft, type PreparationDraft } from './preparationOffline';
import { enhanceMenuSelects } from './menuSelect';
import { propertyMenuArt } from './menuArt';

const root = document.getElementById('preparation')!;
const installedEntry = preparationInstalledEntry(location.href, loadQuickConfig(), preferenceStorage());
if (installedEntry.url.href !== location.href) history.replaceState(null, '', installedEntry.url);
const params = installedEntry.url.searchParams;
const requestedRenderer = params.get('renderer') === '2d' ? '2d' : '3d';
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
let light = ['morning', 'noon', 'evening'].includes(params.get('tod') ?? '') ? params.get('tod')! : 'morning';
let coat = params.get('coat') ?? undefined, controls = params.get('controls') ?? undefined;
let message = '', addingDog = false, launching = false, updating = false, updateRequested = false;
type PreparationView = 'ground' | 'kit' | 'conditions';
let groundView: 'scene' | 'atlas' = 'scene';
let activeView: PreparationView = mode === 'career' && (careerPreparation(career).needsDog || careerPreparation(career).needsHome) ? 'kit' : 'ground';
let pickers: ReturnType<typeof enhanceMenuSelects> | undefined;
const panelScroll: Record<PreparationView, number> = { ground: 0, kit: 0, conditions: 0 };
const openDetails = new Set<string>();
let puppyDraft = { breedId: 'gsp', name: '', homeRegionId: career.homeRegionId ?? 'southern-plains' };
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
  activeView = mode === 'career' && (careerPreparation(career).needsDog || careerPreparation(career).needsHome) ? 'kit' : 'ground';
}

// Keep these nodes alive across setup changes: the offline client holds the
// status node, and asynchronous readiness must not rebuild a focused form.
const offlinePanel = node('details', '', 'hunt-options');
offlinePanel.id = 'prep-offline';
offlinePanel.append(node('summary', 'Install & offline play'));
offlinePanel.append(node('p', 'Use your browser’s Install or Add to Home Screen command to open Uplandin as a full-screen game. Wait for offline readiness before heading out without a connection.', 'help'));
const offlineStatus = node('p', '', 'help'); offlineStatus.id = 'offline-status'; offlineStatus.setAttribute('aria-live', 'polite');
const updateStatus = node('p', '', 'help'); updateStatus.id = 'prep-update-status'; updateStatus.setAttribute('role', 'status');
const updateButton = button('Update game', () => { if (!updating && !launching) { updateRequested = true; requestOfflineUpdate(); } }, 'secondary');
updateButton.id = 'prep-update'; updateButton.hidden = true;
offlinePanel.append(offlineStatus, updateStatus, updateButton);

function preferenceStorage(): Storage | null { try { return localStorage; } catch { return null; } }
function draftStorage(): Storage | null { try { return sessionStorage; } catch { return null; } }
function readPreference(key: string): string | null { try { return localStorage.getItem(key); } catch { return null; } }
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
  pickers?.sync();
}
function node<K extends keyof HTMLElementTagNameMap>(tag: K, value = '', className = ''): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag); el.textContent = value; el.className = className; return el;
}
function button(label: string, action: () => void, className = ''): HTMLButtonElement {
  const el = node('button', label, className); el.type = 'button'; el.addEventListener('click', action); return el;
}
function link(label: string, href: string): HTMLAnchorElement { const el = node('a', label); el.href = href; return el; }
function select(id: string, label: string, options: { id: string; label: string; description?: string }[], value: string, change: (value: string) => void): HTMLLabelElement {
  const wrapper = node('label', '', 'setup-field'); wrapper.htmlFor = id; wrapper.append(node('span', label));
  const input = node('select'); input.id = id;
  for (const choice of options) { const option = node('option', choice.label); option.value = choice.id; if (choice.description) option.dataset.description = choice.description; input.append(option); }
  input.value = value; input.addEventListener('change', () => { change(input.value); render(id); });
  wrapper.append(input); return wrapper;
}
const choices = (values: readonly string[]) => values.map(id => ({ id, label: id === 'random' ? 'Let the day decide' : id.charAt(0).toUpperCase() + id.slice(1) }));
const breeds = () => BREEDS.map(b => ({ id: b.id, label: b.name, description: b.blurb }));
function scrollPanel(view: PreparationView): HTMLElement | null {
  return root.querySelector<HTMLElement>(`[data-scroll-panel="${view}"]`);
}
function rememberPanelScroll(): void {
  for (const view of ['ground', 'kit', 'conditions'] as const) {
    const panel = scrollPanel(view);
    if (panel?.clientHeight) panelScroll[view] = panel.scrollTop;
  }
}
function restorePanelScroll(): void {
  for (const view of ['ground', 'kit', 'conditions'] as const) {
    const panel = scrollPanel(view);
    if (panel?.clientHeight) panel.scrollTop = panelScroll[view];
  }
}
function showView(view: PreparationView, remember = true): void {
  if (remember) rememberPanelScroll();
  activeView = view; root.dataset.view = view;
  root.querySelectorAll<HTMLButtonElement>('[data-prep-tab]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.prepTab === view)));
  restorePanelScroll();
}
function showGround(view: 'scene' | 'atlas'): void {
  groundView = view;
  const panel = document.getElementById('prep-ground-panel');
  if (panel) panel.dataset.groundView = view;
  root.querySelectorAll<HTMLButtonElement>('[data-ground-tab]').forEach(tab => tab.setAttribute('aria-pressed', String(tab.dataset.groundTab === view)));
}
function artUrl(path: string): string { return `${import.meta.env.BASE_URL}art/menus3d/${path}.webp`; }
function cardArt(container: HTMLElement, imageSrc: string, className: string): void {
  const image = node('img', '', className);
  image.alt = ''; image.decoding = 'async';
  image.addEventListener('load', () => { container.dataset.art = 'ready'; }, { once: true });
  image.addEventListener('error', () => { image.remove(); container.dataset.art = 'missing'; }, { once: true });
  image.src = imageSrc; container.prepend(image);
}
function dogIdentity(breedId: string, dogName?: string): HTMLElement {
  const breed = getBreed(breedId), identity = node('div', '', 'dog-identity');
  const portrait = node('div', '', 'dog-portrait');
  portrait.append(node('span', breed.name.split(' ').map(word => word[0]).join('').slice(0, 3), 'breed-monogram'));
  if (['gsp', 'english-setter'].includes(breed.id)) cardArt(portrait, artUrl(`dogs/${breed.id}`), 'dog-art');
  const profile = node('div', '', 'dog-profile');
  profile.append(node('p', dogName ? 'YOUR WORKING DOG' : 'BIRD DOG', 'eyebrow'), node('h3', dogName ?? breed.name), node('p', dogName ? breed.name : breed.blurb, 'loadout-caption'));
  const stats = node('div', '', 'breed-stats');
  for (const [label, value] of [['Nose', breed.stats.nose], ['Range', breed.stats.range], ['Stamina', breed.stats.stamina]] as const) {
    const stat = node('div', '', 'breed-stat'); stat.append(node('span', label));
    const meter = node('meter'); meter.min = 0; meter.max = 5; meter.value = value;
    meter.setAttribute('aria-label', `${breed.name} ${label.toLowerCase()}: ${value} of 5`);
    stat.append(meter); stats.append(stat);
  }
  profile.append(stats); identity.append(portrait, profile); return identity;
}
function gunIdentity(gun: (typeof GUNS)[number]): HTMLElement {
  const actions: Record<string, string> = { 'remington-870': 'Pump action', 'semi-auto': 'Semiautomatic', 'over-under': 'Over / under', 'side-by-side': 'Side by side' };
  const profile = node('div', '', 'gun-identity');
  const stage = node('div', '', 'gun-portrait');
  stage.append(node('span', actions[gun.id] ?? 'Sporting shotgun', 'gun-art-fallback'));
  cardArt(stage, artUrl(`guns/${gun.id}`), 'gun-art');
  const facts = node('div', '', 'gun-facts');
  facts.append(node('span', actions[gun.id] ?? 'Sporting shotgun'), node('strong', `${gun.shells} shells`));
  profile.append(stage, facts); return profile;
}
function section(title: string, intro?: string): HTMLElement {
  const el = node('section', '', 'setup-section'); el.append(node('h2', title)); if (intro) el.append(node('p', intro, 'section-intro')); return el;
}
function experienceBar(progress: ExperienceProgress, label: string): HTMLProgressElement {
  const meter = node('progress'); meter.max = progress.required; meter.value = progress.earned;
  meter.setAttribute('aria-label', `${label}: ${progress.earned} of ${progress.required} XP toward level ${progress.nextLevel}`);
  return meter;
}
function dogOutlook(dog: NonNullable<ReturnType<typeof careerPreparation>['activeDog']>, role: string): HTMLElement {
  const outlook = dogCareerProgress(career, dog), panel = node('div', '', 'dog-outlook');
  panel.dataset.dogId = dog.id; panel.setAttribute('aria-label', `${role} development: ${dog.name}`);
  panel.append(node('p', `${dog.name} · ${outlook.ageLabel}`, 'progress-label'));
  if (outlook.progress) {
    panel.append(experienceBar(outlook.progress, dog.name),
      node('p', `${outlook.progress.remaining} XP to level ${outlook.progress.nextLevel} · ${outlook.nextBenefit}`, 'progress-detail'));
  } else panel.append(node('p', 'Maximum experience reached', 'progress-detail'));
  if (outlook.ageEffect) panel.append(node('p', outlook.ageEffect, 'progress-age'));
  return panel;
}
function error(value: string): void { message = value; render(); document.getElementById('preparation-message')?.focus(); }
function persistCareer(next: Career): boolean {
  saveCareer(next);
  if (readPreference(CAREER_KEY) !== JSON.stringify(next)) { error('Your browser could not save this change. Allow site storage, then try again.'); return false; }
  career = next; return true;
}
function updateQuick(value: Partial<QuickConfig>): void {
  if (value.breedId && value.breedId !== quick.breedId) coat = undefined;
  quick = normalizeQuickConfig({ ...quick, areaId, ...value }); areaId = quick.areaId;
}
function refreshFromCareer(): void {
  career = loadCareer(); dogId = career.activeDogId ?? ''; braceId = career.braceDogId ?? ''; gunId = career.hunter.shotgunId;
}

function dogForm(container: HTMLElement, first: boolean): void {
  const form = node('form', '', 'puppy-form'); form.id = 'puppy-form';
  let breedId = puppyDraft.breedId;
  const breed = select('puppy-breed', 'Breed', breeds(), breedId, value => { breedId = value; });
  // Keep typed names while choosing a breed; this small form owns its draft.
  breed.querySelector('select')!.replaceWith((() => {
    const input = node('select'); input.id = 'puppy-breed';
    for (const b of BREEDS) { const option = node('option', b.name); option.value = b.id; input.append(option); }
    input.value = breedId; input.onchange = () => { breedId = input.value; puppyDraft.breedId = breedId; }; return input;
  })());
  const nameLabel = node('label', '', 'setup-field'); nameLabel.htmlFor = 'puppy-name'; nameLabel.append(node('span', 'Your dog’s name'));
  const name = node('input'); name.id = 'puppy-name'; name.name = 'dog-name'; name.required = true; name.maxLength = 24; name.autocomplete = 'off'; name.placeholder = 'e.g. Sage';
  name.value = puppyDraft.name; name.oninput = () => { puppyDraft.name = name.value; }; nameLabel.append(name);
  form.append(breed, nameLabel);
  let homeRegionId = career.homeRegionId ?? puppyDraft.homeRegionId;
  if (!career.homeRegionId) {
    const homeLabel = node('label', '', 'setup-field'); homeLabel.htmlFor = 'home-region'; homeLabel.append(node('span', 'Your home ground'));
    const home = node('select'); home.id = 'home-region';
    for (const region of REGIONS.filter(r => r.built)) { const option = node('option', region.name); option.value = region.id; home.append(option); }
    home.value = homeRegionId; home.onchange = () => { homeRegionId = home.value; puppyDraft.homeRegionId = homeRegionId; }; homeLabel.append(home); form.append(homeLabel);
    form.append(node('p', 'Home hunts take one week. A truck unlocks travel at hunter level 2; trips take two weeks.', 'help'));
  }
  const submit = node('button', first ? 'Begin your career' : 'Welcome this dog', 'primary'); submit.type = 'submit'; submit.id = 'prep-dog-save'; form.append(submit);
  if (!first) form.append(button('Cancel', () => { addingDog = false; puppyDraft.name = ''; render(); }, 'text-button'));
  form.onsubmit = event => {
    event.preventDefault(); const current = loadCareer();
    const result = first ? commitCareerSetup(current, { homeRegionId, dog: { name: name.value, breedId } })
      : commitPreparationDog(current, { name: name.value, breedId });
    if (!result.ok) { error(result.message); return; }
    if (!persistCareer(result.career)) return;
    addingDog = false; refreshFromCareer();
    if (first) areaId = careerPreparation(career).areas.find(a => a.isHome)?.area.id ?? areaId;
    message = `${name.value.trim()} is ready for a first season.`;
    puppyDraft = { breedId: 'gsp', name: '', homeRegionId: career.homeRegionId ?? 'southern-plains' }; render();
  };
  container.append(form);
}

function render(focusId?: string): void {
  const saved = careerPreparation(career);
  if (!career.kennel.some(dog => dog.id === dogId)) dogId = saved.activeDog?.id ?? career.kennel[0]?.id ?? '';
  if (!saved.canBrace || braceId === dogId || !career.kennel.some(dog => dog.id === braceId)) braceId = '';
  if (!saved.availableGuns.some(gun => gun.id === gunId)) gunId = saved.availableGuns[0].id;
  const projected = commitCareerLoadout(career, { activeDogId: dogId || undefined, braceDogId: braceId || null, gunId });
  const preparation = careerPreparation(projected.ok ? projected.career : career);
  const onboarding = mode === 'career' && (preparation.needsDog || preparation.needsHome);
  if (!AREAS.some(a => a.id === areaId)) areaId = 'quail-fields';
  if (mode === 'quick' && quick.huntingMethod === 'goshawk') areaId = 'pheasant-coverts';
  const area = getArea(areaId), doctrine = huntingDoctrine(area.id), entry = preparation.areas.find(a => a.area.id === areaId)!;
  if (!area.dropPoints.some(drop => drop.id === dropPointId)) dropPointId = area.dropPoints[0].id;
  const selectedDrop = area.dropPoints.find(drop => drop.id === dropPointId)!;
  // Preserve the local reading position and disclosure state before replacing
  // controls. The native choice remains authoritative; its picker is transient.
  rememberPanelScroll();
  root.querySelectorAll<HTMLDetailsElement>('details[id]').forEach(details => {
    if (details.open) openDetails.add(details.id); else openDetails.delete(details.id);
  });
  pickers?.destroy(); pickers = undefined;
  root.replaceChildren();
  const header = node('header', '', 'prep-header');
  const brand = link('', './home3d.html'); brand.className = 'brand'; brand.setAttribute('aria-label', 'Uplandin home'); brand.append(node('strong', 'UPLANDIN'), node('span', 'The field book'));
  const nav = node('nav'); nav.setAttribute('aria-label', 'Game');
  const journal = button('Journal', () => openHuntJournal(loadCareer(), journal)); journal.id = 'prep-journal'; journal.setAttribute('aria-label', 'Field journal');
  const otherRenderer = requestedRenderer === '3d' ? '2d' : '3d';
  const classic = link(otherRenderer === '2d' ? 'Classic field' : '3D field', `./prepare3d.html?renderer=${otherRenderer}&mode=${mode}&area=${encodeURIComponent(areaId)}&drop=${encodeURIComponent(dropPointId)}`); nav.append(journal, classic);
  const modes = node('div', '', 'mode-switch'); modes.setAttribute('role', 'group'); modes.setAttribute('aria-label', 'Hunt mode');
  for (const [id, label] of [['quick', 'Quick hunt'], ['career', 'Career']] as const) {
    const control = button(label, () => {
      if (mode === id) return;
      propertyDrafts[mode] = { areaId, dropPointId }; mode = id; message = ''; addingDog = false; career = loadCareer();
      ({ areaId, dropPointId } = propertyDrafts[mode]);
      const next = careerPreparation(career);
      activeView = mode === 'career' && (next.needsDog || next.needsHome) ? 'kit' : 'ground';
      render(`mode-${id}`); history.replaceState(null, '', `?renderer=${requestedRenderer}&mode=${mode}`);
    });
    control.id = `mode-${id}`; control.setAttribute('aria-pressed', String(mode === id)); modes.append(control);
  }
  header.append(brand, modes, nav);
  const main = node('main', '', 'prep-main');
  const toolbar = node('div', '', 'prep-toolbar');
  const intro = node('div', '', 'prep-intro'); intro.append(node('h1', 'Plan your hunt.'));
  const status = node('p', mode === 'career' ? `${dateLabel(career.date)} · Hunter level ${career.hunter.level} · ${career.hunts} hunts`
    : 'Your ground. Your dog. Your kind of day.', 'prep-status'); intro.append(status);
  const tabs = node('nav', '', 'prep-tabs'); tabs.setAttribute('aria-label', 'Hunt preparation');
  for (const [view, label] of [['ground', 'Ground'], ['kit', 'Kit'], ['conditions', 'Conditions']] as const) {
    const tab = button(label, () => showView(view)); tab.id = `prep-view-${view}`; tab.dataset.prepTab = view;
    tab.setAttribute('aria-controls', `prep-${view}-panel`); tab.setAttribute('aria-pressed', String(activeView === view)); tabs.append(tab);
  }
  toolbar.append(intro, tabs); main.append(toolbar);
  const notice = node('p', message, 'prep-message'); notice.id = 'preparation-message'; notice.setAttribute('role', 'status'); notice.tabIndex = -1; notice.hidden = !message; main.append(notice);
  const grid = node('div', '', 'prep-grid');
  grid.classList.toggle('first-season', onboarding);
  const property = node('section', '', 'prep-panel property-panel'); property.id = 'prep-ground-panel'; property.dataset.prepView = 'ground'; property.dataset.groundView = groundView;
  const propertyTop = node('div', '', 'property-top');
  const field = select('prep-area', 'YOUR HUNTING GROUND', AREAS.map(a => ({ id: a.id, label: a.name, description: regionOfArea(a.id).name })), areaId,
    value => { areaId = value; dropPointId = ''; if (mode === 'quick') updateQuick({ areaId: value }); });
  field.querySelector('select')!.disabled = mode === 'quick' && quick.huntingMethod === 'goshawk';
  const groundTabs = node('div', '', 'ground-tabs'); groundTabs.setAttribute('role', 'group'); groundTabs.setAttribute('aria-label', 'Property view');
  for (const [view, label] of [['scene', 'The ground'], ['atlas', 'Atlas']] as const) {
    const tab = button(label, () => showGround(view)); tab.id = `prep-show-${view}`; tab.dataset.groundTab = view;
    tab.setAttribute('aria-pressed', String(groundView === view)); tab.setAttribute('aria-controls', `prep-ground-${view}`); groundTabs.append(tab);
  }
  propertyTop.append(field, groundTabs); property.append(propertyTop);
  const speciesIds = mode === 'career' ? entry.openSpeciesIds : area.speciesMix.map(s => s.speciesId);
  const speciesLabel = speciesIds.length ? speciesIds.map(id => getSpecies(id).name).join(' · ') : 'Season currently closed';
  const groundScroll = node('div', '', 'prep-panel-scroll ground-scroll'); groundScroll.dataset.scrollPanel = 'ground';
  const overview = node('div', '', 'ground-overview'); overview.id = 'prep-ground-scene';
  const hero = node('div', '', 'property-hero');
  const propertyArt = propertyMenuArt(area.id);
  if (propertyArt) cardArt(hero, propertyArt, 'property-art');
  const heroCopy = node('div', '', 'property-hero-copy'); heroCopy.append(node('p', doctrine.region, 'eyebrow'), node('h2', area.name), node('p', speciesLabel, 'property-species')); hero.append(heroCopy);
  const approach = node('div', '', 'property-approach');
  approach.append(node('span', 'THE APPROACH', 'eyebrow'), node('h3', doctrine.method.toLowerCase().replace(/(^| · )([a-z])/g, (_, gap: string, letter: string) => gap + letter.toUpperCase())), node('p', doctrine.description));
  overview.append(hero, approach); groundScroll.append(overview);
  const mapStage = node('div', '', 'map-stage'); mapStage.id = 'prep-ground-atlas'; mapStage.style.setProperty('--map-aspect', String(area.world.w / area.world.h));
  const map = node('div', '', 'property-map'); map.setAttribute('aria-label', `${area.name} terrain and truck entries`);
  let atlas = atlases.get(area.id);
  if (!atlas) { atlas = createPreparationMap(area); if (atlases.size >= 2) atlases.delete(atlases.keys().next().value!); atlases.set(area.id, atlas); }
  atlas.setAttribute('role', 'img'); atlas.setAttribute('aria-label', `Survey of ${area.name}: cover, contours and paths`); map.append(atlas);
  const north = node('span', 'N ↑', 'map-north'); north.setAttribute('aria-hidden', 'true'); map.append(north);
  area.dropPoints.forEach((drop, i) => {
    const marker = button(String(i + 1), () => { dropPointId = drop.id; render(`map-drop-${drop.id}`); }, 'map-entry');
    marker.id = `map-drop-${drop.id}`; marker.setAttribute('aria-label', `Truck entry ${i + 1}: ${drop.name}`); marker.setAttribute('aria-pressed', String(drop.id === dropPointId));
    const x = (drop.position.x - area.world.x) / area.world.w, y = (drop.position.y - area.world.y) / area.world.h;
    marker.style.left = `calc(${x * 100}% + ${30 - 60 * x}px)`;
    marker.style.top = `calc(${y * 100}% + ${30 - 60 * y}px)`; map.append(marker);
  });
  mapStage.append(map); groundScroll.append(mapStage);
  const notes = node('details', '', 'property-notes'); notes.id = 'prep-property-notes';
  notes.append(node('summary', 'In the field'), node('p', doctrine.tip, 'field-advice'));
  groundScroll.append(notes); property.append(groundScroll);
  const entryControls = node('div', '', 'ground-entry');
  entryControls.append(select('prep-drop', 'TRUCK ENTRY', area.dropPoints.map((drop, i) => ({ id: drop.id, label: `${i + 1}. ${drop.name}` })), dropPointId, value => { dropPointId = value; })); property.append(entryControls);
  grid.append(property);
  const kitPanel = node('section', '', 'prep-panel kit-panel'); kitPanel.id = 'prep-kit-panel'; kitPanel.dataset.prepView = 'kit';
  const kitHeading = node('div', '', 'prep-panel-heading'); kitHeading.append(node('p', 'A GOOD DOG. A TRUSTED GUN.', 'eyebrow'), node('h2', 'Your company afield')); kitPanel.append(kitHeading);
  const settings = node('div', '', 'prep-panel-scroll kit-scroll'); settings.dataset.scrollPanel = 'kit'; kitPanel.append(settings);
  if (onboarding) {
    const setup = section('Your first season', 'Choose a home ground and a dog to grow with you.');
    setup.classList.add('career-onboarding');
    if (preparation.needsDog) dogForm(setup, true);
    else {
      let homeId = puppyDraft.homeRegionId;
      const home = node('select'); home.id = 'home-region'; home.setAttribute('aria-label', 'Home region');
      for (const region of REGIONS.filter(r => r.built)) { const option = node('option', region.name); option.value = region.id; home.append(option); }
      home.value = homeId; home.onchange = () => { homeId = home.value; puppyDraft.homeRegionId = homeId; };
      const saveHome = button('Set home ground', () => {
        const result = commitCareerSetup(loadCareer(), { homeRegionId: homeId });
        if (!result.ok) error(result.message); else if (persistCareer(result.career)) { areaId = careerPreparation(career).areas.find(a => a.isHome)!.area.id; render(); }
      }, 'primary'); saveHome.id = 'prep-home-save'; setup.append(home, saveHome);
    }
    settings.append(setup);
  } else {
    const companions = section('The dog'); companions.classList.add('loadout-card', 'dog-card');
    const workingDog = mode === 'career' ? preparation.activeDog : undefined;
    companions.append(dogIdentity(workingDog?.breedId ?? quick.breedId, workingDog?.name));
    if (mode === 'career') {
      if (!career.kennel.some(d => d.id === dogId)) dogId = career.activeDogId ?? '';
      companions.append(select('prep-dog', 'Working dog', career.kennel.map(d => ({ id: d.id, label: `${d.name} · ${getBreed(d.breedId).name} · Level ${d.level}` })), dogId, value => { dogId = value; if (braceId === value) braceId = ''; }));
      if (preparation.activeDog) companions.append(dogOutlook(preparation.activeDog, 'Working dog'));
      if (preparation.canBrace) {
        companions.append(select('prep-brace', 'Second dog', [{ id: '', label: 'Hunt with one dog' }, ...career.kennel.filter(d => d.id !== dogId).map(d => ({ id: d.id, label: `${d.name} · Level ${d.level}` }))], braceId, value => { braceId = value; }));
        if (preparation.braceDog) companions.append(dogOutlook(preparation.braceDog, 'Second dog'));
      }
      companions.append(node('p', 'Points, retrieves and birds downed over a point build your dog’s experience.', 'progress-earning'));
      companions.append(node('p', `${GEAR_NAMES[preparation.gearTier]} · ${career.kennel.length}/${preparation.kennelCapacity} kennel places`, 'help'));
      if (addingDog) dogForm(companions, false);
      else if (preparation.canAddDog) {
        const addDog = button('Add a dog to your kennel', () => { addingDog = true; render(); }, 'text-button'); addDog.id = 'prep-add-dog'; companions.append(addDog);
      }
    } else {
      companions.append(select('prep-breed', 'Breed', breeds(), quick.breedId, value => updateQuick({ breedId: value })));
      if (quick.huntingMethod !== 'goshawk') companions.append(select('prep-level', 'Experience', Array.from({ length: 10 }, (_, i) => ({ id: String(i + 1), label: `Level ${i + 1}${i === 0 ? ' · First season' : i === 9 ? ' · Finished dog' : ''}` })), String(quick.level), value => updateQuick({ level: Number(value) })));
      else { companions.querySelector('select')!.disabled = true; companions.append(node('p', 'A finished GSP works with your goshawk.', 'help')); }
    }
    const dogChoice = companions.querySelector<HTMLSelectElement>('#prep-breed, #prep-dog')?.closest('.setup-field');
    const dogProfile = companions.querySelector('.dog-profile');
    if (dogChoice && dogProfile) { dogProfile.querySelector('h3')?.remove(); dogProfile.querySelector('.eyebrow')?.remove(); dogProfile.prepend(dogChoice); }
    settings.append(companions);
    const equipment = section(quick.huntingMethod === 'goshawk' && mode === 'quick' ? 'Hunting partner' : 'The shotgun'); equipment.classList.add('loadout-card', 'gun-card');
    if (mode === 'quick' && quick.huntingMethod === 'goshawk') equipment.append(node('p', 'Goshawk · From the fist', 'section-intro'));
    else {
      const guns = mode === 'career' ? preparation.availableGuns : GUNS;
      if (mode === 'career' && !guns.some(g => g.id === gunId)) gunId = guns[0].id;
      equipment.append(select('prep-gun', 'Shotgun', guns.map(g => ({ id: g.id, label: g.name, description: `${g.shells} shells · ${g.blurb}` })), mode === 'career' ? gunId : quick.gunId, value => { if (mode === 'career') gunId = value; else updateQuick({ gunId: value }); }));
      const selectedGun = guns.find(g => g.id === (mode === 'career' ? gunId : quick.gunId)) ?? guns[0];
      equipment.append(gunIdentity(selectedGun));
      const rack = link('Inspect in the gun rack ↗', `./shotguns3d.html?gun=${encodeURIComponent(mode === 'career' ? gunId : quick.gunId)}`); rack.target = '_blank'; rack.rel = 'noopener'; rack.className = 'text-link'; equipment.append(rack);
    }
    settings.append(equipment);
    if (mode === 'career') {
      const outlook = hunterCareerProgress(career), panel = node('aside', '', 'career-outlook');
      panel.id = 'prep-career-outlook'; panel.setAttribute('aria-label', 'Hunter progress');
      const progress = node('div');
      progress.append(node('p', outlook.progress
        ? `${outlook.progress.remaining} XP to hunter level ${outlook.progress.nextLevel}` : 'Maximum hunter level reached', 'progress-label'));
      if (outlook.progress) progress.append(experienceBar(outlook.progress, 'Hunter'));
      progress.append(node('p', 'Hunts completed, downed birds and doubles earn XP.', 'progress-detail'));
      const reward = node('div');
      reward.append(node('p', outlook.nextUnlock ? `Ahead at level ${outlook.nextUnlock.level}` : 'Your equipment is fully unlocked', 'progress-detail'));
      if (outlook.nextUnlock) reward.append(node('p', outlook.nextUnlock.labels.join(' · '), 'progress-reward'));
      panel.append(progress, reward); settings.append(panel);
    }
    if (mode === 'career') {
      const calendar = preparation.calendarAction;
      if (calendar) {
        const panel = section('The season ahead', entry.selectable ? `${entry.isHome ? 'Home hunt' : 'Hunting trip'} · ${entry.weeks} week${entry.weeks === 1 ? '' : 's'} afield.` : entry.reason ?? undefined);
        const advance = button(calendar.label, () => {
          const result = commitPreparationCalendar(loadCareer(), calendar.kind);
          if (!result.ok) error(result.message); else if (persistCareer(result.career)) { message = `Calendar advanced · ${dateLabel(career.date)}.`; render(); }
        }, 'secondary'); advance.id = 'prep-calendar'; panel.append(advance); settings.append(panel);
      }
    }
  }
  const conditionsPanel = node('section', '', 'prep-panel conditions-panel'); conditionsPanel.id = 'prep-conditions-panel'; conditionsPanel.dataset.prepView = 'conditions';
  const conditionsHeading = node('div', '', 'prep-panel-heading'); conditionsHeading.append(node('p', 'SET THE DAY', 'eyebrow'), node('h2', 'Conditions & display')); conditionsPanel.append(conditionsHeading);
  const conditions = node('div', '', 'prep-panel-scroll conditions-scroll'); conditions.dataset.scrollPanel = 'conditions'; conditionsPanel.append(conditions);
  const day = section('The day'); day.classList.add('conditions-group');
  const experience = section('The hunt'); experience.classList.add('conditions-group');
  const extras = section('Equipment & display'); extras.classList.add('conditions-group');
  day.append(select('prep-light', 'Light', choices(['morning', 'noon', 'evening']), light, value => { light = value; }));
  if (mode === 'quick') {
    day.append(select('prep-weather', 'Weather', choices(WEATHER_CHOICES), quick.weather, value => updateQuick({ weather: value as QuickConfig['weather'] })),
      select('prep-wind', 'Wind', choices(WIND_CHOICES), quick.wind, value => updateQuick({ wind: value as QuickConfig['wind'] })));
    experience.append(select('prep-method', 'Method', [{ id: 'shotgun', label: 'Shotgun' }, { id: 'goshawk', label: 'Goshawk · Cattail Coverts' }], quick.huntingMethod ?? 'shotgun', value => updateQuick({ huntingMethod: value as QuickConfig['huntingMethod'] })));
    if (quick.huntingMethod !== 'goshawk') extras.append(select('prep-quick-brace', 'Second dog', [{ id: 'none', label: 'Hunt with one dog' }, ...breeds()], quick.breed2Id, value => updateQuick({ breed2Id: value })));
    extras.append(select('prep-gear', 'Tracking gear', GEAR_NAMES.map((label, i) => ({ id: String(i), label })), String(quick.gearTier), value => updateQuick({ gearTier: Number(value) })));
  } else day.append(node('p', 'Weather and bird experience follow your career season.', 'help'));
  experience.append(select('prep-challenge', 'Challenge', Object.entries(HUNT_CHALLENGES).map(([id, value]) => ({ id, label: value.label, description: value.description })), challenge, value => { challenge = parseHuntChallenge(value); }), node('p', HUNT_CHALLENGES[challenge].description, 'help'));
  if (requestedRenderer === '3d' || (mode === 'quick' && quick.huntingMethod === 'goshawk')) extras.append(select('prep-quality', 'Graphics', [{ id: 'auto', label: 'Use device preference' }, { id: 'lite', label: 'Lightweight' }, { id: 'high', label: 'High' }], quality, value => { quality = value; }));
  if (requestedRenderer === '2d' && mode === 'quick' && quick.huntingMethod === 'goshawk') experience.append(node('p', 'Goshawk hunts open in the 3D field.', 'help'));
  conditions.append(day, experience, extras);

  conditions.append(offlinePanel);
  const reviewConditions = button(`${light.charAt(0).toUpperCase() + light.slice(1)} · ${HUNT_CHALLENGES[challenge].label}  →`, () => { showView('conditions'); document.getElementById('prep-view-conditions')?.focus(); }, 'conditions-shortcut');
  reviewConditions.setAttribute('aria-label', 'Review conditions and display'); settings.append(reviewConditions);
  grid.append(kitPanel, conditionsPanel); main.append(grid);
  const footer = node('footer', '', 'launch-bar'); const outing = node('div', '', 'launch-destination');
  if (onboarding) outing.append(node('small', 'A HUNTING LIFE'), node('strong', 'Your first season'), node('span', preparation.needsDog ? 'A home ground and a good dog.' : 'Choose your home ground.'));
  else outing.append(node('small', 'YOUR NEXT OUTING'), node('strong', area.name), node('span', mode === 'career' && entry.reason ? entry.reason
    : `${selectedDrop.name}${mode === 'career' ? ` · ${entry.weeks} week${entry.weeks === 1 ? '' : 's'}` : ' · Quick hunt'}`));
  const start = button(onboarding ? preparation.needsDog ? 'Begin your career' : 'Set home ground' : 'Head to the field ↗', () => {
    if (!onboarding) { launch(); return; }
    // Reveal the form before native validation tries to focus its required
    // name field. The footer submits the same form, never a second save path.
    showView('kit');
    if (preparation.needsDog) root.querySelector<HTMLFormElement>('#puppy-form')?.requestSubmit();
    else document.getElementById('prep-home-save')?.click();
  }, 'primary'); start.id = 'prep-start';
  const unavailable = mode === 'career' && !onboarding && !entry.selectable;
  start.dataset.unavailable = String(unavailable); start.disabled = launching || updating || unavailable;
  const reason = node('p', mode === 'career' && !entry.selectable ? '' : 'Read the wind. Trust your dog.', 'launch-reason'); footer.append(outing, reason, start);
  root.append(header, main, footer);
  root.querySelectorAll<HTMLDetailsElement>('details[id]').forEach(details => { if (openDetails.has(details.id)) details.open = true; });
  const nativeFocus = focusId ? document.getElementById(focusId) : null;
  if (nativeFocus) {
    const view = nativeFocus.closest<HTMLElement>('[data-prep-view]')?.dataset.prepView as PreparationView | undefined;
    // Ground stays alongside the selected right-hand panel on desktop.
    if (view && (view !== 'ground' || window.matchMedia('(max-width:899px)').matches)) activeView = view;
    nativeFocus.closest('details')?.setAttribute('open', '');
  }
  if (focusId?.startsWith('map-drop-')) groundView = 'atlas';
  showGround(groundView);
  showView(activeView, false);
  pickers = enhanceMenuSelects(root);
  restorePanelScroll();
  if (focusId) {
    const focused = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-menu-select-for]')).find(trigger => trigger.dataset.menuSelectFor === focusId) ?? nativeFocus;
    if (focused) { focused.scrollIntoView({ block: 'nearest', inline: 'nearest' }); focused.focus({ preventScroll: true }); }
  }
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
  const renderer = mode === 'quick' && quick.huntingMethod === 'goshawk' ? '3d' : requestedRenderer;
  saveGameplayMode(renderer);
  try { localStorage.setItem(HUNT_CHALLENGE_KEY, challenge); } catch { /* The URL also carries this choice. */ }
  const url = new URL(result.href, location.href);
  if (renderer === '2d') url.pathname = url.pathname.replace(/index3d\.html$/, 'classic.html');
  url.searchParams.set('challenge', challenge); url.searchParams.set('tod', light); url.searchParams.set('dog', 'generated');
  // Keep Auto distinct from the effective tier chosen by device preference.
  url.searchParams.set('quality', quality);
  if (coat) url.searchParams.set('coat', coat);
  if (controls) url.searchParams.set('controls', controls);
  rememberPreparationLaunch(currentDraft(), preferenceStorage());
  discardPreparationDraft(draftStorage());
  launching = true; (document.getElementById('prep-start') as HTMLButtonElement).disabled = true; location.assign(url.href);
}

window.addEventListener('storage', event => {
  if (event.key === CAREER_KEY && mode === 'career') { refreshFromCareer(); message = 'Your career changed in another tab. Review your setup before heading out.'; render(); }
});
window.addEventListener('pagehide', event => { if (!event.persisted) { pickers?.destroy(); pickers = undefined; } });
render();
enableOfflineHunts({ canReload: () => !launching && updateRequested && preservePreparationDraft(location.href, currentDraft(), draftStorage()),
  onUpdateState: offlineUpdateState });
