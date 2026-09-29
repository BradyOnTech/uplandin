import './home.css';
import './huntJournal.css';
import { loadCareer } from '../game/career';
import { dateLabel } from '../game/season';
import { saveGameplayMode, type GameplayMode } from '../game/gameplayMode';
import { openHuntJournal } from './huntJournalView';
import { enableOfflineHunts, requestOfflineUpdate } from './offline';
import { propertyMenuArt, titleMenuArt } from './menuArt';

const root = document.getElementById('home')!;
let career = loadCareer();
function node<K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = ''): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag); element.textContent = text; element.className = className; return element;
}
function link(text: string, href: string, className = ''): HTMLAnchorElement { const element = node('a', text, className); element.href = href; return element; }
function button(text: string, action: () => void, className = ''): HTMLButtonElement {
  const element = node('button', text, className); element.type = 'button'; element.addEventListener('click', action); return element;
}
let renderer: GameplayMode = '3d';
try { if (localStorage.getItem('uplandin.gameplay-mode.v1') === '2d') renderer = '2d'; } catch { /* Browsing without storage still supports Quick Hunt. */ }
const requestedRenderer = new URLSearchParams(location.search).get('renderer');
if (requestedRenderer === '2d' || requestedRenderer === '3d') renderer = requestedRenderer;
const art = node('img', '', 'home-landscape'); art.src = titleMenuArt; art.alt = ''; art.decoding = 'async';
root.append(art, node('div', '', 'home-shade'));
const frame = node('div', '', 'home-frame');
const header = node('header', '', 'home-masthead');
header.append(node('span', 'UPLANDIN', 'home-wordmark'), node('span', 'A FIELD. A GOOD DOG. A DAY WELL SPENT.', 'home-motto'));
const settings = button('Play settings', () => showSettings(settings), 'home-settings'); header.append(settings);
const main = node('main', '', 'home-main');
const introduction = node('div', '', 'home-introduction');
introduction.append(node('p', 'THE COUNTRY IS CALLING', 'home-eyebrow'), node('h1', 'Follow the dog.\nFind your country.'), node('p', 'From the plum thickets to the high rimrock. Pick your ground, take a good dog, and see what the day brings.', 'home-description'));
const actions = node('nav', '', 'home-actions'); actions.setAttribute('aria-label', 'Choose your hunt');
const quick = link('', './prepare3d.html?mode=quick', 'home-action home-action-primary');
quick.append(node('span', '01', 'home-action-index'), node('span', 'Quick Hunt', 'home-action-title'), node('span', 'Any ground. Your own pace.', 'home-action-detail'), node('span', '↗', 'home-action-arrow'));
const hasCareer = career.kennel.length > 0;
const careerLink = link('', './prepare3d.html?mode=career', 'home-action');
careerLink.append(node('span', '02', 'home-action-index'), node('span', hasCareer ? 'Continue your season' : 'Start a season', 'home-action-title'), node('span', hasCareer ? `${dateLabel(career.date)} · ${career.kennel.length} ${career.kennel.length === 1 ? 'dog' : 'dogs'} in the kennel` : 'Raise your dogs. Build a hunting life.', 'home-action-detail'), node('span', '↗', 'home-action-arrow'));
actions.append(quick, careerLink); introduction.append(actions); main.append(introduction);
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
main.append(grounds);
const footer = node('footer', '', 'home-footer');
const utilities = node('nav'); utilities.setAttribute('aria-label', 'Equipment and records');
const journal = button('Field journal', () => openHuntJournal(loadCareer(), journal));
utilities.append(link('Gun rack', './shotguns3d.html'), journal, button('Install & offline', () => showSettings(installButton)));
const installButton = utilities.lastElementChild as HTMLButtonElement;
const rendererNote = button('', () => showSettings(rendererNote), 'home-renderer-note');
footer.append(utilities, rendererNote);
frame.append(header, main, footer); root.append(frame);
function syncLinks(): void {
  for (const [element, mode] of [[quick, 'quick'], [careerLink, 'career']] as const) element.href = `./prepare3d.html?mode=${mode}&renderer=${renderer}`;
  for (const preview of previews) preview.href = `./prepare3d.html?mode=quick&renderer=${renderer}&area=${preview.dataset.area}`;
  rendererNote.textContent = renderer === '3d' ? '3D field experience' : '2D classic experience';
}
syncLinks();
window.addEventListener('pageshow', event => {
  if (!event.persisted) return;
  career = loadCareer();
  if (requestedRenderer !== '2d' && requestedRenderer !== '3d') {
    try { renderer = localStorage.getItem('uplandin.gameplay-mode.v1') === '2d' ? '2d' : '3d'; } catch { /* Keep the current choice without storage. */ }
  }
  careerLink.querySelector('.home-action-title')!.textContent = career.kennel.length ? 'Continue your season' : 'Start a season';
  careerLink.querySelector('.home-action-detail')!.textContent = career.kennel.length
    ? `${dateLabel(career.date)} · ${career.kennel.length} ${career.kennel.length === 1 ? 'dog' : 'dogs'} in the kennel`
    : 'Raise your dogs. Build a hunting life.';
  syncLinks(); syncRenderer();
});

const dialog = node('dialog', '', 'home-dialog'); dialog.setAttribute('aria-labelledby', 'home-settings-title');
const dialogHeader = node('header'); const titleWrap = node('div'); titleWrap.append(node('p', 'MAKE YOURSELF AT HOME', 'home-eyebrow'));
const title = node('h2', 'Play your way'); title.id = 'home-settings-title'; titleWrap.append(title);
const close = button('Close', () => dialog.close(), 'home-dialog-close'); dialogHeader.append(titleWrap, close);
const dialogContent = node('div', '', 'home-dialog-content');
const rendererField = node('fieldset'); rendererField.append(node('legend', 'Game view'));
const rendererChoices = node('div', '', 'home-renderer-choices');
for (const [id, label, detail] of [['3d', 'In the field', 'Immersive 3D landscapes'], ['2d', 'The classic', 'Top-down 2D hunting']] as const) {
  const choice = button('', () => { renderer = id; saveGameplayMode(renderer); syncLinks(); syncRenderer(); }, 'home-renderer-choice');
  choice.dataset.renderer = id; choice.append(node('strong', label), node('span', detail)); rendererChoices.append(choice);
}
rendererField.append(rendererChoices, node('p', 'Your career and kennel are shared between both views.', 'home-settings-help')); dialogContent.append(rendererField);
function syncRenderer(): void { rendererChoices.querySelectorAll('button').forEach(choice => choice.setAttribute('aria-pressed', String(choice.dataset.renderer === renderer))); }
syncRenderer();
const install = node('section', '', 'home-install'); install.append(node('h3', 'Take the whole game with you'), node('p', 'On iPhone or iPad, use Safari’s Share menu and Add to Home Screen. On Android or desktop, choose Install in your browser. The installed game opens without browser bars.'));
const offline = node('p', '', 'home-offline-status'); offline.id = 'offline-status'; offline.setAttribute('role', 'status');
const updateStatus = node('p', '', 'home-offline-status'); updateStatus.setAttribute('role', 'status');
const update = button('Update game', requestOfflineUpdate, 'home-update'); update.hidden = true;
install.append(offline, updateStatus, update); dialogContent.append(install);
dialog.append(dialogHeader, dialogContent); document.body.append(dialog);
let opener: HTMLElement | undefined;
function showSettings(from: HTMLElement): void { opener = from; dialog.showModal(); close.focus({ preventScroll: true }); }
dialog.addEventListener('close', () => opener?.focus({ preventScroll: true }));
enableOfflineHunts({ canReload: () => true, onUpdateState: state => {
  update.hidden = state === 'none'; update.disabled = state === 'applying';
  update.textContent = state === 'applying' ? 'Updating…' : 'Update game';
  updateStatus.textContent = ({ none: '', ready: 'An update is ready.', applying: 'Applying the latest game update…', 'other-tabs': 'Close your other game windows, then try the update again.', unsafe: 'Finish your hunt before updating.', failed: 'The update could not finish. Reconnect and try again.' })[state];
} });
