import './home.css';
import './huntJournal.css';
import './fitPager.css';
import { fitPages, type FitPager } from './fitPager';
import { loadCareer } from '../game/career';
import { dateLabel } from '../game/season';
import { saveGameplayMode, type GameplayMode } from '../game/gameplayMode';
import { openHuntJournal } from './huntJournalView';
import { enableOfflineHunts, requestOfflineUpdate, type OfflineUpdateState } from './offline';
import { mountWhatsNew, UPDATE_MESSAGES } from './whatsNew';
import { propertyMenuArt, titleMenuArt } from './menuArt';
import { getArea } from '../game/areas';
import { getBreed } from '../game/breeds';
import { loadQuickConfig, saveQuickConfig } from '../game/quick';
import { commitQuickLaunch } from '../game/huntPreparation';
import { HUNT_CHALLENGE_KEY } from '../game/huntChallenge';
import { huntingDoctrine } from '../game/huntDoctrine';
import { coatLabel, isModeledBreed, modelForBreed, resolveCoatFor } from '../game/dogCoats';
import { coatSwatch } from './dogs/coatSwatch';
import { DEFAULT_DOG_STYLE, DOG_STYLE_KEY, DOG_STYLE_LABELS, DOG_STYLE_SELECTABLE, DOG_STYLES, effectiveDogStyle, preferredDogStyle, saveDogStyle, type DogStyle } from './dogs/dogStyle';
import { menuMusicOnFirstGesture } from './menuMusic';

const root = document.getElementById('home')!;
let career = loadCareer();
function node<K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = ''): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag); element.textContent = text; element.className = className; return element;
}
function link(text: string, href: string, className = ''): HTMLAnchorElement { const element = node('a', text, className); element.href = href; return element; }
function button(text: string, action: () => void, className = ''): HTMLButtonElement {
  const element = node('button', text, className); element.type = 'button'; element.addEventListener('click', action); return element;
}
// The classic 2D hunt is retired from the menus: every link opens the 3D field.
const renderer: GameplayMode = '3d';
const art = node('img', '', 'home-landscape'); art.src = titleMenuArt; art.alt = ''; art.decoding = 'async';
root.append(art, node('div', '', 'home-shade'));
const frame = node('div', '', 'home-frame');
const header = node('header', '', 'home-masthead');
header.append(node('span', 'UPLANDIN', 'home-wordmark'), node('span', 'A FIELD. A GOOD DOG. A DAY WELL SPENT.', 'home-motto'));
const settings = button('Play settings', () => showSettings(settings), 'home-settings'); header.append(settings);
// The dog art style was the last play setting here; install help stays in the footer.
settings.hidden = !DOG_STYLE_SELECTABLE;
const main = node('main', '', 'home-main');
const introduction = node('div', '', 'home-introduction');
introduction.append(node('p', 'THE COUNTRY IS CALLING', 'home-eyebrow'), node('h1', 'Follow the dog.\nFind your country.'), node('p', 'From the plum thickets to the high rimrock. Pick your ground, take a good dog, and see what the day brings.', 'home-description'));
const actions = node('nav', '', 'home-actions'); actions.setAttribute('aria-label', 'Choose your hunt');
const quick = link('', './prepare3d.html?mode=quick', 'home-action home-action-primary');
quick.append(node('span', '01', 'home-action-index'), node('span', 'Quick Hunt', 'home-action-title'), node('span', 'Any ground. Your own pace.', 'home-action-detail'), node('span', '↗', 'home-action-arrow'));
const quickDetail = quick.querySelector<HTMLElement>('.home-action-detail')!;
const hasCareer = career.kennel.length > 0;
const careerLink = link('', './prepare3d.html?mode=career', 'home-action');
careerLink.append(node('span', '02', 'home-action-index'), node('span', hasCareer ? 'Continue your season' : 'Start a season', 'home-action-title'), node('span', hasCareer ? `${dateLabel(career.date)} · ${career.kennel.length} ${career.kennel.length === 1 ? 'dog' : 'dogs'} in the kennel` : 'Raise your dogs. Build a hunting life.', 'home-action-detail'), node('span', '↗', 'home-action-arrow'));
careerLink.querySelector('.home-action-index')!.textContent = '03';
// Straight into a bird-rich preserve day on your last Quick Hunt setup.
const loaded = button('', () => launchLoadedField(), 'home-action home-action-loaded');
loaded.append(node('span', '02', 'home-action-index'), node('span', 'Loaded field', 'home-action-title'), node('span', 'Birds in every piece of cover. Fast action, right now.', 'home-action-detail'), node('span', '↗', 'home-action-arrow'));
const training = link('', './training3d.html?mode=quick', 'home-action');
training.append(node('span', '04', 'home-action-index'), node('span', 'Training Grounds', 'home-action-title'), node('span', 'Develop your dog. Try a short field challenge.', 'home-action-detail'), node('span', '↗', 'home-action-arrow'));
actions.append(quick, loaded, careerLink, training); introduction.append(actions); main.append(introduction);

function launchLoadedField(): void {
  const last = loadQuickConfig();
  // Loaded fields are the four hand-built open properties, shotgun in hand.
  const areaId = huntingDoctrine(last.areaId).spatialEncounter ? last.areaId : 'quail-fields';
  const result = commitQuickLaunch({ ...last, areaId, huntingMethod: 'shotgun' });
  if (!result.ok) { location.assign('./prepare3d.html?mode=quick&step=day&challenge=loaded'); return; }
  saveQuickConfig(result.config);
  try { localStorage.setItem(HUNT_CHALLENGE_KEY, 'loaded'); } catch { /* The URL carries it. */ }
  saveGameplayMode('3d');
  const url = new URL(result.href, location.href);
  url.searchParams.set('challenge', 'loaded'); url.searchParams.set('tod', 'morning'); url.searchParams.set('dog', 'generated');
  location.assign(url.href);
}
const side = node('div', '', 'home-side');
// Your dog, as it will walk out of the truck, one tap from the dog chooser.
const dogCard = link('', './prepare3d.html?mode=quick&step=dog', 'home-dog');
dogCard.setAttribute('aria-label', 'Your dog. Choose your dog');
const grounds = node('aside', '', 'home-grounds'); grounds.setAttribute('aria-labelledby', 'home-grounds-title');
const groundsHeading = node('div', '', 'home-grounds-heading'); const groundsTitle = node('h2', 'Find your ground'); groundsTitle.id = 'home-grounds-title';
groundsHeading.append(groundsTitle, node('span', 'FOUR DISTINCT HUNTS')); grounds.append(groundsHeading);
const previews: HTMLAnchorElement[] = [];
for (const [id, title, description, number] of [
  ['quail-fields', 'Quail Fields', 'Plum thickets & covey rises', '01'], ['pheasant-coverts', 'Cattail Coverts', 'Heavy cover & close flushes', '02'],
  ['chukar-ridge', 'Chukar Ridge', 'High benches & rimrock', '03'], ['sharptail-prairie', 'Sharptail Prairie', 'Big skies & open country', '04'],
]) {
  const preview = link('', '', 'home-ground'); preview.dataset.area = id;
  const image = node('img'); image.src = propertyMenuArt(id)!; image.alt = ''; image.decoding = 'async';
  const copy = node('div'); copy.append(node('span', number, 'home-ground-index'), node('h3', title), node('p', description));
  preview.append(image, copy, node('span', '↗', 'home-ground-arrow')); grounds.append(preview); previews.push(preview);
}
side.append(dogCard, grounds); main.append(side);
const footer = node('footer', '', 'home-footer');
const utilities = node('nav'); utilities.setAttribute('aria-label', 'Equipment and records');
const journal = button('Field journal', () => openHuntJournal(loadCareer(), journal));
utilities.append(link('Gun rack', './shotguns3d.html'), journal, button('Install & offline', () => showSettings(installButton)));
const installButton = utilities.lastElementChild as HTMLButtonElement;
footer.append(utilities);
// The version this copy is, at a glance; it opens What's new.
const whatsNew = mountWhatsNew(footer, () => syncInstallUpdate());
frame.append(header, main, footer); root.append(frame);
function syncLinks(): void {
  for (const [element, mode] of [[quick, 'quick'], [careerLink, 'career']] as const) element.href = `./prepare3d.html?mode=${mode}&renderer=${renderer}`;
  for (const preview of previews) preview.href = `./prepare3d.html?mode=quick&renderer=${renderer}&area=${preview.dataset.area}`;
  syncDog();
}
function syncDog(): void {
  const lead = career.kennel.find(d => d.id === career.activeDogId);
  const quickSetup = loadQuickConfig();
  const breedId = lead?.breedId ?? quickSetup.breedId, coatId = lead ? lead.coatId : quickSetup.coatId;
  const threeD = renderer === '3d', breed = getBreed(breedId), model = modelForBreed(breedId);
  const style: DogStyle = effectiveDogStyle(model, preferredDogStyle());
  dogCard.href = `./prepare3d.html?mode=${lead ? 'career' : 'quick'}&renderer=${renderer}&step=dog`;
  dogCard.replaceChildren();
  const portrait = node('span', '', 'home-dog-portrait');
  portrait.append(node('span', breed.name.split(' ').map(w => w[0]).join('').slice(0, 3), 'home-dog-monogram'));
  if (threeD || isModeledBreed(breedId)) {
    const image = node('img'); image.alt = ''; image.decoding = 'async';
    image.addEventListener('load', () => { portrait.dataset.art = 'ready'; }, { once: true });
    const base = `${import.meta.env.BASE_URL}art/menus3d/dogs/${model}-${style}`;
    image.addEventListener('error', () => { if (image.src.endsWith(`${style}.webp`)) image.remove(); else image.src = `${base}.webp`; });
    image.src = `${base}-${resolveCoatFor(breedId, coatId)}.webp`; portrait.prepend(image);
  }
  const copy = node('span', '', 'home-dog-copy');
  copy.append(node('span', lead ? 'YOUR WORKING DOG' : 'YOUR QUICK HUNT DOG', 'home-dog-eyebrow'), node('strong', lead?.name ?? breed.name));
  const detail = node('span', '', 'home-dog-detail');
  if (threeD) { const chip = node('span', '', 'home-dog-swatch'); chip.style.background = coatSwatch(resolveCoatFor(breedId, coatId)); detail.append(chip); }
  detail.append(document.createTextNode([lead ? breed.name : null, threeD ? coatLabel(breedId, coatId) : null, threeD && DOG_STYLE_SELECTABLE ? DOG_STYLE_LABELS[style].label : null].filter(Boolean).join(' · ')));
  copy.append(detail, node('span', 'Choose your dog →', 'home-dog-action'));
  dogCard.append(portrait, copy);
  quickDetail.textContent = `Last out: ${getArea(quickSetup.areaId).name} · ${getBreed(quickSetup.breedId).name}`;
}
syncLinks();
window.addEventListener('pageshow', event => {
  if (!event.persisted) return;
  career = loadCareer();
  careerLink.querySelector('.home-action-title')!.textContent = career.kennel.length ? 'Continue your season' : 'Start a season';
  careerLink.querySelector('.home-action-detail')!.textContent = career.kennel.length
    ? `${dateLabel(career.date)} · ${career.kennel.length} ${career.kennel.length === 1 ? 'dog' : 'dogs'} in the kennel`
    : 'Raise your dogs. Build a hunting life.';
  syncLinks();
});

const dialog = node('dialog', '', 'home-dialog'); dialog.setAttribute('aria-labelledby', 'home-settings-title');
const dialogHeader = node('header'); const titleWrap = node('div'); titleWrap.append(node('p', 'MAKE YOURSELF AT HOME', 'home-eyebrow'));
const title = node('h2', DOG_STYLE_SELECTABLE ? 'Play your way' : 'Install & offline'); title.id = 'home-settings-title'; titleWrap.append(title);
const close = button('Close', () => dialog.close(), 'home-dialog-close'); dialogHeader.append(titleWrap, close);
const dialogContent = node('div', '', 'home-dialog-content');
// One art style for every dog, while the house style is still being chosen.
const styleField = node('fieldset'); styleField.append(node('legend', 'Dog art style'));
const styleChoices = node('div', '', 'home-renderer-choices home-style-choices');
const styleOptions: [DogStyle | 'breed', string, string][] = [['breed', 'Breed default', `${DEFAULT_DOG_STYLE.gsp} GSP · ${DEFAULT_DOG_STYLE['english-setter']} setter`], ...DOG_STYLES.map(s => [s, DOG_STYLE_LABELS[s].label, DOG_STYLE_LABELS[s].detail] as [DogStyle, string, string])];
for (const [id, label, detail] of styleOptions) {
  const choice = button('', () => {
    if (id === 'breed') { try { localStorage.removeItem(DOG_STYLE_KEY); } catch { /* optional */ } } else saveDogStyle(id);
    syncStyle(); syncDog();
  }, 'home-renderer-choice');
  choice.dataset.style = id; choice.append(node('strong', label), node('span', detail)); styleChoices.append(choice);
}
styleField.append(styleChoices, node('p', 'Compare both styles side by side on the Dog step of hunt preparation.', 'home-settings-help'));
if (DOG_STYLE_SELECTABLE) dialogContent.append(styleField);
function syncStyle(): void { const current = preferredDogStyle() ?? 'breed'; styleChoices.querySelectorAll('button').forEach(choice => choice.setAttribute('aria-pressed', String(choice.dataset.style === current))); }
syncStyle();
const install = node('section', '', 'home-install'); install.append(node('h3', 'Take the whole game with you'), node('p', 'On iPhone or iPad, use Safari’s Share menu and Add to Home Screen. On Android or desktop, choose Install in your browser. The installed game opens without browser bars.'));
const offline = node('p', '', 'home-offline-status'); offline.id = 'offline-status'; offline.setAttribute('role', 'status');
const updateStatus = node('p', '', 'home-offline-status'); updateStatus.setAttribute('role', 'status');
const update = button('Update game', requestOfflineUpdate, 'home-update'); update.hidden = true;
install.append(offline, updateStatus, update); dialogContent.append(install);
const dialogPager = node('div', '', 'home-dialog-pager');
dialog.append(dialogHeader, dialogContent, dialogPager); document.body.append(dialog);
let opener: HTMLElement | undefined;
let settingsFit: FitPager | null = null;
function showSettings(from: HTMLElement): void {
  opener = from; dialog.showModal(); close.focus({ preventScroll: true });
  settingsFit ??= fitPages(dialogContent, { nav: dialogPager, key: 'home-settings' });
  settingsFit.refresh();
}
dialog.addEventListener('close', () => opener?.focus({ preventScroll: true }));
let updateState: OfflineUpdateState = 'none';
function syncInstallUpdate(): void {
  update.hidden = updateState === 'none'; update.disabled = updateState === 'applying';
  update.textContent = updateState === 'applying' ? 'Updating…' : 'Update game';
  // A ready update names its version once the server has said which it is.
  updateStatus.textContent = updateState === 'ready' ? whatsNew.readyText() : UPDATE_MESSAGES[updateState];
}
enableOfflineHunts({ canReload: () => true, onUpdateState: state => {
  updateState = state; syncInstallUpdate(); whatsNew.updateState(state);
} });
whatsNew.showIfUpdated();
menuMusicOnFirstGesture();
