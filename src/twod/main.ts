import './journey.css';
import { Journey, parseJourneySave, SAVE_KEY, SITES, type Vec } from './journey';
import { JourneyWorld } from './journey-world';
import { WildlifeEncounter } from './wildlife';
import { FieldAudio } from './audio';

const root = document.querySelector<HTMLElement>('#adventure')!;
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const glyphs: Record<string, string> = {
  menu: '<path d="M5 7h14M5 12h14M5 17h14"/>',
  book: '<path d="M12 6c-3-2-6-2-9-1v14c3-1 6-1 9 1 3-2 6-2 9-1V5c-3-1-6-1-9 1Zm0 0v14"/>',
  paw: '<ellipse cx="12" cy="16" rx="5" ry="4"/><ellipse cx="5" cy="9" rx="2" ry="3"/><ellipse cx="10" cy="5" rx="2" ry="3"/><ellipse cx="16" cy="6" rx="2" ry="3"/><ellipse cx="20" cy="11" rx="2" ry="3"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  map: '<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5Zm6-2v16m6-14v16"/>',
  leaf: '<path d="M19 3C10 3 3 6 3 13a6 6 0 0 0 6 6c7 0 10-7 10-16Z"/><path d="M3 21 15 9"/>',
};
const icon = (id: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${glyphs[id] ?? glyphs.leaf}</svg>`;
let storageOK = true;
const audio = new FieldAudio();
let raw: string | null = null;
try { raw = localStorage.getItem(SAVE_KEY); audio.muted = localStorage.getItem(`${SAVE_KEY}:muted`) === 'true'; } catch { storageOK = false; }
let game = new Journey(parseJourneySave(raw));
let started = false, ready = false;
let modal = '', encounter: WildlifeEncounter | null = null;
let route: Vec[] = [], target: Vec | null = null;
let dogRoute: Vec[] = [], dogGoal: Vec | null = null, dogPlanAt = -1;
let keys = new Set<string>(), stick: Vec = { x: 0, y: 0 };
let lastTime = 0, frame = 0, saveTime = 0, uiTime = 0, ambientTime = 0;
let dialogue: { speaker: string; lines: string[]; index: number; after?: () => void } | null = null;
let focusBefore: HTMLElement | null = null;

root.innerHTML = `<div class="journey-shell is-title">
  <canvas id="world" tabindex="0" aria-label="Briar Glen adventure. Move with arrow keys, WASD, or tap the world. E interacts."></canvas>
  <div class="world-shade" aria-hidden="true"></div>
  <header class="journey-header"><div class="place-tag"><span class="place-dot"></span><span id="place">Briar Glen</span></div><button id="menu" class="menu-button" aria-label="Open adventure menu">${icon('menu')}</button></header>
  <div id="quest" class="quest-note" aria-live="polite"></div>
  <div class="adventure-controls"><div id="joystick" class="touch-stick" aria-label="Drag to walk"><span class="stick-cross">+</span><span id="knob"></span></div><button id="action" class="action-button"><span class="action-letter"><span class="key-desktop">E</span><span class="key-touch">A</span></span><span id="action-label">Talk</span></button></div>
  <div class="desktop-guide"><span>WASD / arrows to walk</span><i>·</i><span>E to interact</span><i>·</i><span>J notebook</span></div>
  <div id="welcome" class="welcome"><span class="chapter-caption">UPLANDIN · CHAPTER ONE</span><h1>A little further<br>from home.</h1><p>A curious dog. An open trail.<br>A whole valley to get to know.</p><button id="start" class="primary">${game.save.introduced ? 'Continue adventure' : 'Begin adventure'} ${icon('arrow')}</button><span class="welcome-foot">BRIAR GLEN</span></div>
  <div id="loading" class="loading-note">Opening the garden gate…</div>
  <div id="dialogue" class="dialogue" role="dialog" aria-modal="true" aria-label="Conversation" hidden></div>
  <div id="overlay" class="overlay" hidden></div>
  <div id="wildlife-root"></div>
</div>`;
const $ = <T extends HTMLElement = HTMLElement>(s: string) => root.querySelector<T>(s)!;
const canvas = $<HTMLCanvasElement>('#world');
const world = new JourneyWorld(canvas);

function persist() {
  if (!started) return;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(game.snapshot())); } catch { storageOK = false; }
}
function clearMovement() { keys.clear(); stick = { x: 0, y: 0 }; route = []; target = null; $('#knob').style.transform = ''; }
function busy() { return !started || !ready || Boolean(modal) || Boolean(encounter) || document.hidden; }
function updateHUD() {
  $('.journey-shell').classList.toggle('is-paused', Boolean(modal) || Boolean(encounter));
  $<HTMLButtonElement>('#menu').disabled = Boolean(modal) || Boolean(encounter);
  $('#place').textContent = game.location();
  const objective = game.objective();
  if ($('#quest').textContent !== objective) $('#quest').textContent = objective;
  const action = game.context();
  $('#action-label').textContent = action?.label ?? 'Explore';
  $<HTMLButtonElement>('#action').disabled = !action || action.kind === 'none' || busy();
  $('#action').classList.toggle('unavailable', !action || action.kind === 'none');
}
function start() {
  if (!ready) return;
  void audio.unlock(); audio.play('click');
  started = true;
  $('.journey-shell').classList.remove('is-title');
  $('#welcome').hidden = true;
  canvas.focus({ preventScroll: true });
  updateHUD(); persist();
}
$('#start').onclick = start;
$('#action').onclick = interact;
$('#menu').onclick = showMenu;

function showDialogue(speaker: string, lines: string[], after?: () => void) {
  clearMovement(); modal = 'dialogue';
  focusBefore = document.activeElement as HTMLElement | null;
  dialogue = { speaker, lines, index: 0, after };
  drawDialogue(); updateHUD();
}
function drawDialogue() {
  if (!dialogue) return;
  const last = dialogue.index === dialogue.lines.length - 1;
  $('#dialogue').innerHTML = `<div class="dialogue-avatar ${dialogue.speaker.toLowerCase() === 'wren' ? 'ranger' : ''}" aria-hidden="true">${dialogue.speaker === game.save.dogName ? icon('paw') : icon('leaf')}</div><div class="dialogue-copy"><span class="speaker">${esc(dialogue.speaker)}</span><p>${esc(dialogue.lines[dialogue.index])}</p><button id="next-line" class="dialogue-next">${last ? 'Let’s go' : 'Next'} <span aria-hidden="true">▾</span></button></div>`;
  $('#dialogue').hidden = false;
  $('#next-line').onclick = nextLine;
  $('#next-line').focus({ preventScroll: true });
}
function nextLine() {
  if (!dialogue) return;
  if (++dialogue.index < dialogue.lines.length) { audio.play('click'); drawDialogue(); return; }
  const after = dialogue.after;
  dialogue = null; modal = ''; $('#dialogue').hidden = true;
  focusBefore?.focus({ preventScroll: true }); canvas.focus({ preventScroll: true });
  persist(); updateHUD(); after?.();
}
function interact() {
  if (busy()) return;
  void audio.unlock(); clearMovement();
  const result = game.interact();
  if (!result) return;
  if (result.kind === 'dialogue') { audio.play('click'); showDialogue(result.speaker, result.lines); }
  else if (result.kind === 'encounter') {
    const wasComplete = game.save.completed;
    encounter = new WildlifeEncounter($('#wildlife-root'), result.species, game.save.dogName, success => {
      encounter?.destroy(); encounter = null;
      game.finishEncounter(result.species, success); persist(); updateHUD();
      canvas.focus({ preventScroll: true });
      if (!wasComplete && game.save.completed) showDialogue('A little further', [
        'The goldfinch settles beside you. For a moment, the whole valley is quiet.',
        `${game.save.dogName} leans against your leg. New birds, one new friendship, and a trail that feels like home.`,
        'Chapter one complete. Your notebook is saved. You can keep exploring, revisit your favorite birds, or stop here for today.',
      ]);
    }, name => audio.play(name));
    encounter.start(); updateHUD();
  }
  persist();
}

function openOverlay(kind: string, content: string, label: string) {
  if (encounter) return;
  clearMovement(); modal = kind;
  focusBefore = document.activeElement as HTMLElement | null;
  $('#overlay').innerHTML = `<section class="notebook-panel" role="dialog" aria-modal="true" aria-label="${label}"><button id="close-overlay" class="close-button" aria-label="Close ${label}">${icon('close')}</button>${content}</section>`;
  $('#overlay').hidden = false; $('#close-overlay').onclick = closeOverlay;
  $('#close-overlay').focus({ preventScroll: true }); updateHUD();
}
function closeOverlay() {
  modal = ''; $('#overlay').hidden = true; $('#overlay').innerHTML = '';
  focusBefore?.focus({ preventScroll: true }); if (started) canvas.focus({ preventScroll: true }); updateHUD();
}
function showMenu() {
  if (encounter || modal === 'dialogue' || !started) return;
  persist();
  openOverlay('menu', `<span class="small-caption">TAKE YOUR TIME</span><h2>Your adventure</h2><p class="menu-progress">${esc(game.save.dogName)} is right here. The trail can wait.</p><div class="menu-options"><button id="open-notebook">${icon('book')}<span>Field notebook<small>${game.save.observed.length} of 5 birds discovered</small></span>${icon('arrow')}</button><button id="open-map">${icon('map')}<span>Valley map<small>A little help finding your way</small></span>${icon('arrow')}</button><button id="toggle-sound">${icon('leaf')}<span>Birdsong<small>${audio.muted ? 'Sound is off' : 'Sound is on'}</small></span></button></div><p class="save-note">${storageOK ? 'Your adventure saves as you go, in this browser.' : 'Saving is unavailable. Keep this tab open to keep exploring.'}</p><button id="resume" class="primary wide">Back to the trail ${icon('arrow')}</button>`, 'Adventure menu');
  $('#open-notebook').onclick = showNotebook; $('#open-map').onclick = showMap;
  $('#toggle-sound').onclick = () => { audio.muted = !audio.muted; if (!audio.muted) void audio.unlock().then(() => audio.play('bird')); try { localStorage.setItem(`${SAVE_KEY}:muted`, String(audio.muted)); } catch {} showMenu(); };
  $('#resume').onclick = closeOverlay;
}
function showNotebook() {
  if (!started || encounter || modal === 'dialogue') return;
  const entries = SITES.map(site => {
    const found = game.save.observed.includes(site.id);
    return `<article class="bird-entry ${found ? 'recorded' : ''}"><div class="notebook-bird" style="--bird-color:${found ? site.color : '#a9b8a4'}" aria-hidden="true"><span>${found ? '⌁' : '?'}</span></div><div><span class="entry-number">${String(SITES.indexOf(site) + 1).padStart(2, '0')} / ${found ? 'DISCOVERED' : 'STILL OUT THERE'}</span><h3>${found ? esc(site.name) : ['A garden visitor', 'A meadow whistle', 'An orchard secret', 'A flash over water', 'A song on the hill'][SITES.indexOf(site)]}</h3><p>${found ? esc(site.description) : ['Listen near the village garden.', 'Let your dog lead you into the tall grass.', 'Milo knows the old orchard well.', 'Find a way across the river.', 'Get to know the valley. Then climb the eastern hill.'][SITES.indexOf(site)]}</p></div></article>`;
  }).join('');
  openOverlay('notebook', `<span class="small-caption">BRIAR GLEN · FIELD NOTES</span><h2>A valley of little things.</h2><p class="menu-progress">${game.save.observed.length} / 5 birds discovered with ${esc(game.save.dogName)}.</p><div class="bird-pages">${entries}</div><div class="pocket-note">${icon('paw')}<p>${game.save.completed ? 'Chapter one complete. There is always more to notice.' : esc(game.objective())}</p></div><button id="notebook-back" class="primary wide">Back to the adventure ${icon('arrow')}</button>`, 'Field notebook');
  $('#notebook-back').onclick = closeOverlay;
}
function showMap() {
  if (!started || encounter || modal === 'dialogue') return;
  const regions = [{ x: 285, y: 752, name: 'Briar Village' }, { x: 489, y: 600, name: 'Clover Meadow' }, { x: 454, y: 204, name: 'Fernwood Grove' }, { x: 940, y: 153, name: 'Sunlit Overlook' }];
  openOverlay('map', `<span class="small-caption">FOLDED IN YOUR POCKET</span><h2>The way around.</h2><div class="valley-map"><svg viewBox="0 0 1152 896" role="img" aria-label="Village southwest, meadow in the middle, orchard north, river east, and Sunlit Overlook across the bridge."><rect width="1152" height="896" rx="40" fill="#b4cd9c"/><path d="M730 0 Q705 220 736 448T728 896" stroke="#83bdc8" stroke-width="64" fill="none"/><path d="M272 720V640H432V448H560V290M432 448H935V224" stroke="#eee1b5" stroke-width="31" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M694 448h85" stroke="${game.save.bridgeOpen ? '#aa8255' : '#677d67'}" stroke-width="34"/>${regions.map(r => `<text x="${r.x}" y="${r.y}" text-anchor="middle" fill="#325746" font-family="sans-serif" font-size="30" font-weight="600">${r.name}</text>`).join('')}${SITES.map(site => `<circle cx="${site.x}" cy="${site.y}" r="13" fill="${game.save.observed.includes(site.id) ? '#f6cf65' : '#5d8860'}" stroke="#faf3d9" stroke-width="5"/>`).join('')}<circle cx="348" cy="688" r="12" fill="#b77c64"/><circle cx="${game.player.x}" cy="${game.player.y}" r="19" fill="#ed966b" stroke="#fffbed" stroke-width="7"/></svg></div><p class="map-caption"><span class="map-you"></span> You are here <span class="map-bird"></span> Little discoveries</p><p class="map-hint">${game.save.bridgeOpen ? 'The bridge is open. The river trail leads to Sunlit Overlook.' : 'Wren is by the village cottage. The old bridge needs her repair kit.'}</p><button id="map-back" class="primary wide">Back to the trail ${icon('arrow')}</button>`, 'Valley map');
  $('#map-back').onclick = closeOverlay;
}

function goTo(point: Vec) {
  if (busy()) return;
  route = world.routeTo(game.player, point, game.save.bridgeOpen);
  target = route.length ? route[route.length - 1] : null;
}
let down: Vec | null = null;
canvas.onpointerdown = event => { if (busy()) return; down = { x: event.clientX, y: event.clientY }; void audio.unlock(); canvas.focus({ preventScroll: true }); };
canvas.onpointerup = event => {
  if (down && Math.hypot(event.clientX - down.x, event.clientY - down.y) < 15) goTo(world.screenToWorld(event.clientX, event.clientY));
  down = null;
};
canvas.onpointercancel = () => { down = null; };
let pointer: number | null = null;
const joystick = $('#joystick');
function moveStick(event: PointerEvent) {
  const b = joystick.getBoundingClientRect();
  const x = event.clientX - b.left - b.width / 2, y = event.clientY - b.top - b.height / 2;
  const d = Math.hypot(x, y), scale = Math.min(1, d / 30);
  stick = d > 7 ? { x: x / d * scale, y: y / d * scale } : { x: 0, y: 0 };
  $('#knob').style.transform = `translate(${stick.x * 25}px,${stick.y * 25}px)`; route = []; target = null;
}
joystick.onpointerdown = event => { if (busy() || pointer !== null) return; pointer = event.pointerId; joystick.setPointerCapture(pointer); moveStick(event); void audio.unlock(); };
joystick.onpointermove = event => { if (event.pointerId === pointer) moveStick(event); };
const releaseStick = () => { pointer = null; stick = { x: 0, y: 0 }; $('#knob').style.transform = ''; };
joystick.onpointerup = releaseStick; joystick.onpointercancel = releaseStick; joystick.onlostpointercapture = releaseStick;

function move(dt: number) {
  let dx = Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft')) + stick.x;
  let dy = Number(keys.has('s') || keys.has('arrowdown')) - Number(keys.has('w') || keys.has('arrowup')) + stick.y;
  if (Math.hypot(dx, dy) > .1) { route = []; target = null; }
  else if (route.length) {
    dx = route[0].x - game.player.x; dy = route[0].y - game.player.y;
    if (Math.hypot(dx, dy) < 4) { route.shift(); if (!route.length) target = null; return; }
  }
  const length = Math.hypot(dx, dy); if (length < .05) return;
  const amount = Math.min((keys.has('shift') ? 148 : 112) * dt, length > 2 ? length : Infinity);
  dx = dx / length * amount; dy = dy / length * amount;
  const p = game.player, old = { ...p };
  if (world.isWalkable(p.x + dx, p.y + dy, game.save.bridgeOpen)) { p.x += dx; p.y += dy; }
  else { if (world.isWalkable(p.x + dx, p.y, game.save.bridgeOpen)) p.x += dx; if (world.isWalkable(p.x, p.y + dy, game.save.bridgeOpen)) p.y += dy; }
  if (Math.hypot(p.x - old.x, p.y - old.y) < .01 && route.length) { route = []; target = null; }
}

function navigateDog(from: Vec, to: Vec, amount: number): Vec {
  if (!dogGoal || Math.hypot(to.x - dogGoal.x, to.y - dogGoal.y) > 18 || game.time - dogPlanAt > .35) {
    dogRoute = world.routeTo(from, to, game.save.bridgeOpen);
    dogGoal = { ...to }; dogPlanAt = game.time;
  }
  while (dogRoute.length && Math.hypot(dogRoute[0].x - from.x, dogRoute[0].y - from.y) < 3) dogRoute.shift();
  if (!dogRoute.length) return from;
  const next = dogRoute[0], gap = Math.hypot(next.x - from.x, next.y - from.y);
  const step = Math.min(1, amount / Math.max(.001, gap));
  const position = { x: from.x + (next.x - from.x) * step, y: from.y + (next.y - from.y) * step };
  if (!world.isWalkable(position.x, position.y, game.save.bridgeOpen)) { dogGoal = null; return from; }
  return position;
}

document.addEventListener('keydown', event => {
  if (encounter) return;
  const key = event.key.toLowerCase();
  if (modal === 'dialogue') {
    if (['e', ' ', 'enter'].includes(key)) { event.preventDefault(); if (!event.repeat) nextLine(); }
    return;
  }
  if (modal) {
    if (key === 'escape') { event.preventDefault(); closeOverlay(); }
    if (key === 'tab') {
      const buttons = [...$('#overlay').querySelectorAll<HTMLElement>('button,input,a[href]')];
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    return;
  }
  if (!started) { if ((key === 'enter' || key === ' ') && !event.repeat) { event.preventDefault(); start(); } return; }
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key)) event.preventDefault();
  if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(key)) keys.add(key);
  if (event.repeat) return;
  if (key === 'e' || key === ' ') { event.preventDefault(); interact(); }
  if (key === 'escape') showMenu(); if (key === 'j') showNotebook(); if (key === 'm') showMap();
});
document.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', clearMovement);
document.addEventListener('visibilitychange', () => { clearMovement(); persist(); if (document.hidden) audio.suspend(); else lastTime = performance.now(); });
window.addEventListener('pagehide', persist);

function tick(now: number) {
  const dt = Math.min(.05, Math.max(0, (now - (lastTime || now)) / 1000)); lastTime = now;
  if (ready) {
    if (!busy()) { move(dt); game.update(dt, navigateDog); saveTime += dt; ambientTime += dt; if (saveTime > 2) { saveTime = 0; persist(); } if (ambientTime > 19) { ambientTime = 0; audio.play('bird'); } }
    world.render({ player: game.player, dog: game.dog, dogState: game.dogState, time: game.time, observed: game.save.observed, introduced: game.save.introduced, satchelFound: game.save.satchelFound, bridgeOpen: game.save.bridgeOpen, completed: game.save.completed, target }, encounter || modal ? 0 : dt);
    uiTime += dt; if (uiTime > .15) { uiTime = 0; updateHUD(); }
  }
  frame = requestAnimationFrame(tick);
}
world.load().then(() => {
  if (!world.isWalkable(game.player.x, game.player.y, game.save.bridgeOpen)) {
    game.player = { x: 272, y: 704 }; game.dog = { x: 244, y: 722 };
  }
  ready = true; $('#loading').hidden = true; updateHUD();
}).catch(() => { $('#loading').textContent = 'The garden gate is stuck. Reload to try again.'; });
frame = requestAnimationFrame(tick);
if (import.meta.hot) import.meta.hot.dispose(() => { cancelAnimationFrame(frame); encounter?.destroy(); audio.destroy(); });
