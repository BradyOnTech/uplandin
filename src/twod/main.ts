import './style.css';
import { Adventure, createSave, parseSave, SAVE_KEY, LANDMARKS, PATCHES, SPECIES, dogLevel, levelProgress, type ApproachStrategy, type DogCommand, type Vec, type Save } from './model';
import { WorldRenderer } from './world';
import { Encounter } from './encounter';
import { FieldAudio } from './audio';

const icons: Record<string, string> = {
  leaf: '<path d="M19 3C10 3 3 6 3 13a6 6 0 0 0 6 6c7 0 10-7 10-16Z"/><path d="M3 21 15 9M9 15v-5m0 5h5"/>',
  arrow: '<path d="m5 12 14 0m-6-6 6 6-6 6"/>',
  book: '<path d="M12 5v16M3 3l9 2 9-2v16l-9 2-9-2V3Z"/><path d="m6 8 3 1m-3 3 3 1m6-4 3-1m-3 5 3-1"/>',
  map: '<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5Zm6-2v16m6-14v16"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  sound: '<path d="m3 9 4 0 5-4v14l-5-4H3V9Zm13-1a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  muted: '<path d="m3 9 4 0 5-4v14l-5-4H3V9Zm13 0 5 6m0-6-5 6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  paw: '<ellipse cx="12" cy="16" rx="5" ry="4"/><ellipse cx="5" cy="9" rx="2" ry="3"/><ellipse cx="10" cy="5" rx="2" ry="3"/><ellipse cx="16" cy="6" rx="2" ry="3"/><ellipse cx="20" cy="11" rx="2" ry="3"/>',
  wind: '<path d="M3 8h12c5 0 5-6 1-6M3 12h16c4 0 4 6 0 6M3 16h7c4 0 4 6 0 6"/>',
  home: '<path d="m3 10 9-7 9 7M5 9v12h14V9M9 21v-8h6v8"/>',
  star: '<path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7Z"/>',
  check: '<path d="m5 12 4 4 10-10"/>',
  target: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 1v5m0 12v5M1 12h5m12 0h5"/>',
};
const icon = (name: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] ?? icons.star}</svg>`;
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const compassDirection = (degrees: number): string => {
  const directions = ['east', 'southeast', 'south', 'southwest', 'west', 'northwest', 'north', 'northeast'];
  const normalized = ((degrees % 360) + 360) % 360;
  return directions[Math.round(normalized / 45) % directions.length];
};
const root = document.querySelector<HTMLElement>('#adventure')!;
const audio = new FieldAudio();
let storageAvailable = true;
function readSave(): Save { try { return parseSave(localStorage.getItem(SAVE_KEY)); } catch { storageAvailable = false; return createSave(); } }
let save = readSave();
let game: Adventure | null = null;
let world: WorldRenderer | null = null;
let encounter: Encounter | null = null;
let route: Vec[] = [];
let keys = new Set<string>();
let stick = { x: 0, y: 0 };
let frame = 0;
let lastTime = 0;
let startingXp = 0;
let toastTimer = 0;
let currentScreen = 'title';
let lastDogState = '';
let lastMessage = '';
let dialogKind = '';
let lastFocus: HTMLElement | null = null;
let uiTimer = 0;
let ambientTimer = 0;
let loading = false;
let previousPhase = '';
let walked = false;
try { audio.muted = localStorage.getItem(`${SAVE_KEY}:muted`) === 'true'; } catch { /* Optional preference. */ }

root.innerHTML = '<div id="screen"></div><div id="encounter-root"></div><div id="dialog" class="dialog-scrim" hidden></div><div id="toast" class="toast" role="status" aria-live="polite"></div>';
const screen = root.querySelector<HTMLElement>('#screen')!;
const dialog = root.querySelector<HTMLElement>('#dialog')!;
const $ = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;

function persist() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(currentScreen === 'field' && game ? game.save : save)); }
  catch { storageAvailable = false; toast('Your browser cannot save. Keep this tab open to keep your progress.'); }
}
function clearToast() {
  window.clearTimeout(toastTimer);
  const node = $('#toast');
  node.classList.remove('visible');
  node.hidden = true;
}
function toast(message: string) {
  const node = $('#toast');
  node.textContent = message; node.hidden = false; node.classList.add('visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { node.classList.remove('visible'); node.hidden = true; }, 4200);
}
function soundButton() { return `<button class="icon-button sound-button" aria-label="${audio.muted ? 'Turn sound on' : 'Mute sound'}">${icon(audio.muted ? 'muted' : 'sound')}</button>`; }
function wireSound() {
  root.querySelectorAll<HTMLButtonElement>('.sound-button').forEach(button => button.onclick = () => {
    audio.muted = !audio.muted;
    if (!audio.muted) void audio.unlock().then(() => audio.play('bird'));
    try { localStorage.setItem(`${SAVE_KEY}:muted`, String(audio.muted)); } catch { /* Optional preference. */ }
    root.querySelectorAll('.sound-button').forEach(b => { b.innerHTML = icon(audio.muted ? 'muted' : 'sound'); b.setAttribute('aria-label', audio.muted ? 'Turn sound on' : 'Mute sound'); });
  });
}

function showTitle() {
  clearToast();
  currentScreen = 'title'; game = null; world = null; route = []; keys.clear(); stick = { x: 0, y: 0 };
  encounter?.destroy(); encounter = null; closeDialog();
  screen.innerHTML = `<section class="title-screen">
    <div class="title-art" role="img" aria-label="A hunter and English Setter on a golden autumn trail beside a creek and cabin"></div>
    <header class="title-header"><a class="brand" href="./index2d.html">${icon('leaf')}<span>UPLANDIN<span class="brand-edition">FIELD ADVENTURES</span></span></a><div class="title-topright"><span class="edition-tag">A LITTLE FURTHER AFIELD</span>${soundButton()}</div></header>
    <div class="title-copy"><span class="eyebrow"><span class="tiny-star">✦</span> THE BRIAR GLEN TRAILS</span>
      <h1>Good country.<br>Better company.</h1>
      <p>A pocket-sized field adventure.<br>One good dog. A thousand little discoveries.</p>
      <div class="title-actions"><button id="start" class="button primary">${save.outings ? `Walk with ${esc(save.dogName)}` : 'Take the trail'} ${icon('arrow')}</button><button id="title-journal" class="button text-button">${icon('book')} Your field journal</button></div>
      <div class="trail-note">${icon('paw')}<span>${save.outings ? `${esc(save.dogName)} · Level ${dogLevel(save.xp)} · ${save.outings} ${save.outings === 1 ? 'outing' : 'outings'} together` : 'Your setter is waiting. No two walks are quite the same.'}</span></div>
    </div>
    <footer class="title-footer"><span>READ THE WIND · WORK THE COVER · BRING IT HOME</span><span>MADE FOR SLOW MORNINGS <i>✦</i></span></footer>
  </section>`;
  $('#start').onclick = () => { void audio.unlock(); if (save.outings || save.journal.length) void startOuting(); else showWelcome(); };
  $('#title-journal').onclick = () => showJournal(); wireSound();
}

function openDialog(kind: string, html: string, label: string) {
  clearToast();
  lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  keys.clear(); stick = { x: 0, y: 0 }; dialogKind = kind;
  encounter?.pause?.(true);
  dialog.innerHTML = `<section class="paper-dialog ${kind}-dialog" role="dialog" aria-modal="true" aria-label="${label}"><button class="dialog-close icon-button" aria-label="Close ${label}">${icon('close')}</button>${html}</section>`;
  dialog.hidden = false;
  $('.dialog-close').onclick = closeDialog;
  requestAnimationFrame(() => dialog.querySelector<HTMLElement>('input,button:not(.dialog-close)')?.focus());
}
function closeDialog() {
  dialog.hidden = true; dialog.innerHTML = ''; dialogKind = '';
  encounter?.pause?.(false);
  if (!audio.muted) void audio.unlock();
  lastFocus?.focus({ preventScroll: true }); lastFocus = null;
  lastTime = performance.now();
}
function showWelcome() {
  openDialog('welcome', `<span class="eyebrow">EVERY GOOD TRAIL STARTS WITH A FRIEND</span><div class="welcome-dog"><img src="${import.meta.env.BASE_URL}art/setter-portrait.png" alt="Your speckled English Setter" /></div><h2>Meet your trail partner.</h2><p>A curious English Setter with a good nose and a lot to learn. You’ll learn the country together.</p><label class="name-label" for="dog-name">WHAT SHOULD WE CALL THEM?</label><input id="dog-name" maxlength="18" value="${esc(save.dogName)}" autocomplete="off" spellcheck="false" /><div class="welcome-tips"><span>${icon('wind')} Read the wind</span><span>${icon('paw')} Cast the nose</span><span>${icon('target')} Lead the wing</span></div><button id="begin" class="button primary wide">Let’s go, partner ${icon('arrow')}</button><p class="fine-print">${storageAvailable ? 'Your partnership is saved in this browser after each outing.' : 'Saving is unavailable in this browser. Keep this tab open.'}</p>`, 'Meet your dog');
  $('#begin').onclick = () => { save.dogName = ($('#dog-name') as HTMLInputElement).value.trim().replace(/\s+/g, ' ').slice(0, 18) || 'Scout'; persist(); closeDialog(); void startOuting(); };
  $('#dog-name').onkeydown = e => { if (e.key === 'Enter') $('#begin').click(); };
}

async function startOuting() {
  if (loading) return; loading = true;
  closeDialog(); currentScreen = 'field';
  game = new Adventure(save); startingXp = save.xp; route = []; walked = false; previousPhase = ''; lastDogState = ''; lastMessage = '';
  screen.innerHTML = `<section class="field-screen"><canvas id="world" aria-label="Briar Glen field. Move with WASD, arrow keys, tap a destination, or use the touch stick. E interacts. C casts, H holds, Q heels, and R recalls your dog. M opens the map. J opens your journal." tabindex="0"></canvas>
    <header class="field-header"><div class="location-card"><span class="eyebrow">THE BRIAR GLEN TRAILS</span><h1 id="location">Briar Glen</h1><span class="field-weather">${icon('wind')} <b id="wind-readout">East wind</b><span>·</span><span id="time-readout">Golden morning</span></span></div><nav class="field-nav" aria-label="Field tools"><button id="map" class="icon-button" aria-label="Open trail map (M)">${icon('map')}</button><button id="journal" class="icon-button" aria-label="Open field journal (J)">${icon('book')}</button><button id="pause" class="icon-button" aria-label="Pause game (Escape)">${icon('pause')}</button></nav></header>
    <div class="objective-card"><span class="objective-label">FIELD NOTE <b id="cover-count">01</b></span><strong id="objective">Find the first cover</strong><span id="objective-detail">Cast your partner when you reach the goldgrass.</span><div class="trail-progress" aria-label="Hunting spots investigated">${PATCHES.map((p, i) => `<span id="progress-${i}" title="${esc(p.name)}"><i></i>${['Meadow', 'Marsh', 'Orchard'][i]}</span>`).join('')}</div><div class="field-readout"><span class="readout-wind">${icon('wind')}<b id="scent-label">No scent yet</b></span><span class="readout-energy"><i class="energy-icon">◆</i><b id="energy-value">100</b><small>NOSE</small></span></div><div class="scent-meter" aria-label="Scent strength"><i id="scent-meter-fill"></i></div></div>
    <div class="field-bottom"><div class="dog-card"><img src="${import.meta.env.BASE_URL}art/setter-portrait.png" alt="" /><div class="dog-copy"><div class="dog-heading"><strong>${esc(save.dogName)}</strong><span>LV ${dogLevel(save.xp)}</span></div><span id="dog-status">Ready for a good walk</span><div class="bond-track"><i style="width:${levelProgress(save.xp) * 100}%"></i></div><span class="bond-caption">BOND · TRUST <b id="trust-value">${Math.round(24 + dogLevel(save.xp) * 9)}%</b></span></div><span class="bag-counter">${icon('leaf')}<b id="bag">0</b></span></div>
      <div class="desktop-hints"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move</span><span><kbd>E</kbd> field action</span><span><kbd>C</kbd><kbd>H</kbd><kbd>Q</kbd> dog</span><span><kbd>M</kbd> map</span></div>
      <div class="field-controls"><div class="dog-commands" aria-label="Dog commands"><button class="command-button" data-command="cast"><span>Cast</span><small>Scout cover</small></button><button class="command-button" data-command="hold"><span>Hold</span><small>Stay steady</small></button><button class="command-button" data-command="heel"><span>Heel</span><small>Come back</small></button></div><div class="field-actions"><button id="recall" class="button recall-button" aria-label="Whistle to recall your dog (R)">${icon('paw')}<span>Whistle</span><kbd>R</kbd></button><button id="interact" class="button primary interaction-button">${icon('star')}<span>Field action</span><kbd>E</kbd></button></div></div></div>
    <div id="joystick" class="joystick" aria-label="Touch movement stick"><span class="joystick-cross">+</span><span id="stick-knob" class="stick-knob"></span></div><span class="touch-hint" id="touch-hint">DRAG TO WALK · TAP A TRAIL TO GO</span>
    <div id="field-loading" class="field-loading"><span class="loading-leaf">${icon('leaf')}</span><h2>A good morning is waiting.</h2><p>Opening the gate to Briar Glen…</p></div>
  </section>`;
  const canvas = $<HTMLCanvasElement>('#world');
  world = new WorldRenderer(canvas);
  $('#map').onclick = () => showMap(); $('#journal').onclick = () => showJournal(); $('#pause').onclick = () => showPause();
  $('#recall').onclick = () => { if (!game || !dialog.hidden) return; game.whistle(); audio.play('whistle'); toast(`${save.dogName}, here!`); };
  $('#interact').onclick = interact;
  root.querySelectorAll<HTMLButtonElement>('[data-command]').forEach(button => button.onclick = () => issueCommand(button.dataset.command as DogCommand));
  let down: Vec | null = null;
  canvas.onpointerdown = e => { down = { x: e.clientX, y: e.clientY }; void audio.unlock(); canvas.focus({ preventScroll: true }); };
  canvas.onpointerup = e => { if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 16 && dialog.hidden && game?.phase === 'explore') goTo(world!.screenToWorld(e.clientX, e.clientY)); down = null; };
  setupStick();
  try { await world.load(); $('#field-loading')?.remove(); loading = false; toast(`Morning, ${save.dogName}. Read the wind, then cast when you’re in range.`); updateUI(); }
  catch { loading = false; $('#field-loading').innerHTML = '<h2>The trail couldn’t load.</h2><p>Check your connection and reload to try again.</p><button class="button primary" onclick="location.reload()">Try again</button>'; }
}

function issueCommand(command: DogCommand) {
  if (!game || !dialog.hidden || loading) return;
  const result = game.dogCommand(command);
  if (command === 'heel') audio.play('whistle');
  toast(result.message);
  updateUI();
}

function setupStick() {
  const control = $('#joystick'); let pointer: number | null = null;
  const update = (e: PointerEvent) => {
    const box = control.getBoundingClientRect(); const dx = e.clientX - box.left - box.width / 2; const dy = e.clientY - box.top - box.height / 2;
    const length = Math.hypot(dx, dy); const distance = Math.min(35, length);
    stick = length > 8 ? { x: dx / length * distance / 35, y: dy / length * distance / 35 } : { x: 0, y: 0 };
    $('#stick-knob').style.transform = `translate(${stick.x * 32}px, ${stick.y * 32}px)`; route = []; if (game) game.target = null;
  };
  control.onpointerdown = e => { if (pointer !== null) return; pointer = e.pointerId; control.setPointerCapture(pointer); update(e); void audio.unlock(); };
  control.onpointermove = e => { if (pointer === e.pointerId) update(e); };
  const stop = () => { pointer = null; stick = { x: 0, y: 0 }; $('#stick-knob').style.transform = ''; };
  control.onpointerup = stop; control.onpointercancel = stop; control.onlostpointercapture = stop;
}
function goTo(target: Vec) {
  if (!world || !game || game.phase !== 'explore') return;
  route = world.routeTo(game.player, target); game.target = route.length ? route[route.length - 1] : null;
  if (!route.length) toast('Try a little closer to the trail.');
}
function move(dt: number) {
  if (!game || !world || game.phase !== 'explore') return;
  let dx = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0) + stick.x;
  let dy = (keys.has('s') || keys.has('arrowdown') ? 1 : 0) - (keys.has('w') || keys.has('arrowup') ? 1 : 0) + stick.y;
  if (Math.hypot(dx, dy) > 0.1) { route = []; game.target = null; }
  else if (route.length) {
    const point = route[0]; dx = point.x - game.player.x; dy = point.y - game.player.y;
    if (Math.hypot(dx, dy) < 5) { route.shift(); if (!route.length) game.target = null; return; }
  }
  const length = Math.hypot(dx, dy);
  if (length < 0.05) return;
  const speed = (keys.has('shift') ? 135 : 96) * dt;
  const step = Math.min(speed, length > 2 ? length : speed);
  dx = dx / length * step; dy = dy / length * step;
  const x = game.player.x, y = game.player.y;
  if (world.isWalkable(x + dx, y + dy)) { game.player.x += dx; game.player.y += dy; }
  else { if (world.isWalkable(x + dx, y)) game.player.x += dx; if (world.isWalkable(game.player.x, y + dy)) game.player.y += dy; }
  if (Math.hypot(game.player.x - x, game.player.y - y) < 0.01 && route.length) { route = []; game.target = null; }
  if (!walked) { walked = true; $('#touch-hint').classList.add('dismissed'); }
}

function showApproach() {
  if (!game?.activePatch || game.phase !== 'explore') return;
  const patch = game.activePatch;
  const species = SPECIES[patch.species];
  const wind = `${game.windDirection[0].toUpperCase()}${game.windDirection.slice(1)}`;
  openDialog('approach', `<span class="eyebrow">THE COVEY IS HOLDING</span><h2>Choose your approach.</h2><p>${esc(save.dogName)} has the ${esc(species.name.toLowerCase())} pinned in ${esc(patch.name.toLowerCase())}. Read the ${wind.toLowerCase()} wind, then decide how much patience to bring.</p><div class="approach-grid"><button class="approach-choice careful" data-approach="careful"><span class="approach-icon">◌</span><strong>Careful</strong><small>Quiet feet · best chance</small><b>FIELDCRAFT</b></button><button class="approach-choice steady" data-approach="steady"><span class="approach-icon">→</span><strong>Steady</strong><small>Balanced pace · reliable</small><b>GOOD RHYTHM</b></button><button class="approach-choice rush" data-approach="rush"><span class="approach-icon">»</span><strong>Rush</strong><small>Fast flush · risky reward</small><b>HIGH DRAMA</b></button></div><button id="approach-hold" class="button secondary wide">${icon('pause')} Hold a breath first</button><p class="approach-note">A settled dog gives you a cleaner read. Choose an approach when you’re ready to send the birds up.</p>`, 'Choose an approach');
  $('#approach-hold').onclick = () => { closeDialog(); issueCommand('hold'); };
  root.querySelectorAll<HTMLButtonElement>('[data-approach]').forEach(button => button.onclick = () => {
    const strategy = button.dataset.approach as ApproachStrategy;
    const result = game?.flush(strategy);
    if (!game || result !== 'encounter') { toast(game?.message ?? 'The covey is not ready.'); closeDialog(); updateUI(); return; }
    closeDialog();
    startEncounter();
  });
}

function interact() {
  if (!game || !dialog.hidden || loading) return;
  if (game.phase !== 'explore') return;
  const action = game.contextualAction();
  if (action.kind === 'camp') {
    if (!game.patches.some(p => p.completed) && !game.discovered.length) { game.interact(); toast(game.message); return; }
    showCamp(); return;
  }
  const nearDog = Math.hypot(game.player.x - game.dog.x, game.player.y - game.dog.y) <= 118;
  if (action.kind === 'flush' || (action.kind === 'approach' && game.activePatch?.found && nearDog)) { showApproach(); return; }
  if (action.kind === 'approach' && world) {
    goTo({ ...game.dog });
    toast(`Take the quiet line to ${save.dogName}.`);
    updateUI();
    return;
  }
  const result = game.interact();
  if (result === 'encounter') startEncounter();
  else if (result === 'discovery') { audio.play('discovery'); toast(game.message); persist(); }
  else if (result === 'search') { audio.play('discovery'); toast(game.message); }
  else if (result === 'recover') { audio.play('discovery'); toast(game.message); }
  else if (result === 'command') { toast(game.message); }
  else if (result === 'approach') { toast(game.message); }
  else if (result === 'whistle') { audio.play('whistle'); toast(game.message); }
  else if (result === 'summary') showSummary();
  else if (game.message && action.kind !== 'whistle') toast(game.message);
  updateUI();
}
function startEncounter() {
  clearToast();
  if (!game?.activePatch) return;
  keys.clear(); stick = { x: 0, y: 0 }; route = []; game.target = null;
  encounter = new Encounter($('#encounter-root'), game.activePatch.species, result => {
    encounter?.destroy(); encounter = null;
    game?.finishEncounter(result.hits, result.shots);
    persist(); toast(result.hits ? `${save.dogName} is bringing ${result.hits === 1 ? 'it' : 'them'} home.` : 'They flew well. There’s always the next cover.');
    lastTime = performance.now(); updateUI();
  }, name => audio.play(name), game.encounterBrief ?? undefined);
  void encounter.start().catch(() => { encounter?.destroy(); encounter = null; game?.finishEncounter(0, 0); toast('That covey got away. Keep exploring the trail.'); });
}
function showCamp() {
  if (!game || game.phase !== 'explore') return;
  const investigated = game.patches.filter(p => p.completed).length;
  const worked = game.patches.filter(p => p.state === 'worked').length;
  openDialog('camp', `<span class="eyebrow">BACK AT THE FIELD CABIN</span><div class="dialog-emblem">${icon('home')}</div><h2>A good place to call it.</h2><p>${investigated === 3 ? `${worked === 3 ? 'Every cover worked. A full morning together.' : 'Every cover was read. The country kept a few secrets.'} Put your feet up and see how you did.` : `${investigated} of 3 covers read and ${game.birdsBagged} birds brought home. Stay a little longer, or settle in and save your outing.`}</p><button id="finish" class="button primary wide">Finish this outing ${icon('check')}</button><button id="keep-walking" class="button secondary wide">A little more walking</button>`, 'Return to camp');
  $('#finish').onclick = () => { game!.finishOuting(); closeDialog(); showSummary(); }; $('#keep-walking').onclick = closeDialog;
}

function updateUI() {
  if (!game || currentScreen !== 'field') return;
  const states: Record<string, string> = {
    following: 'At heel · ready to cast', searching: 'Working the cover', pointing: 'On point · choose your approach', holding: 'Holding steady · take your time',
    retrieving: 'Finding the fall', returning: 'Bringing it to hand', tired: 'Tired · let the nose recover',
  };
  $('#dog-status').textContent = states[game.dogState] || 'Reading the country';
  $('#trust-value').textContent = `${Math.round(game.trust)}%`;
  $('.dog-card').classList.toggle('on-point', game.dogState === 'pointing' || game.dogState === 'holding');
  $('#bag').textContent = String(game.birdsBagged);
  $('#energy-value').textContent = String(Math.round(game.energy));
  $('#scent-meter-fill').style.width = `${Math.round((game.scentClue?.strength ?? 0) * 100)}%`;
  const scent = game.scentClue;
  const scentBearing = scent ? compassDirection(scent.bearing) : '';
  $('#scent-label').textContent = scent ? `SCENT ${scent.label.toUpperCase()} · ${scentBearing}` : 'NO SCENT YET';
  $('#scent-label').setAttribute('title', scent ? `${scent.label} scent toward the ${scentBearing}` : 'No scent yet');
  $('#wind-readout').textContent = `${game.windDirection[0].toUpperCase()}${game.windDirection.slice(1)} wind`;
  $('#time-readout').textContent = game.time < 90 ? 'Golden morning' : game.time < 180 ? 'Sun climbing' : 'Late morning';
  const nearest = [...LANDMARKS].sort((a, b) => Math.hypot(a.x - game!.player.x, a.y - game!.player.y) - Math.hypot(b.x - game!.player.x, b.y - game!.player.y))[0];
  $('#location').textContent = Math.hypot(nearest.x - game.player.x, nearest.y - game.player.y) < 190 ? nearest.name : 'Briar Glen';
  game.patches.forEach((p, i) => {
    const marker = $(`#progress-${i}`);
    marker.classList.toggle('complete', p.completed);
    marker.classList.toggle('false-trail', p.state === 'false-trail');
    marker.title = p.state === 'false-trail' ? `${p.name} · false trail` : p.state === 'worked' ? `${p.name} · worked` : p.name;
  });
  const next = [...game.patches].filter(p => !p.completed).sort((a, b) => Math.hypot(a.x - game!.player.x, a.y - game!.player.y) - Math.hypot(b.x - game!.player.x, b.y - game!.player.y))[0];
  const action = game.contextualAction();
  const active = game.activePatch;
  const coverIndex = active ? game.patches.findIndex(p => p.id === active.id) : next ? game.patches.findIndex(p => p.id === next.id) : -1;
  $('#cover-count').textContent = coverIndex >= 0 ? `0${coverIndex + 1}` : '—';
  let objective = next ? `Reach ${next.name}` : 'Bring the morning home';
  let detail = next ? 'Choose your line through the country, then cast when the scent turns promising.' : 'Return to the cabin to save your outing.';
  if (active?.clueReady && game.currentClue) {
    objective = 'Inspect the clue';
    detail = `${game.currentClue.kind[0].toUpperCase()}${game.currentClue.kind.slice(1)} found · move close and read the sign.`;
  } else if (active && !active.found && game.dogState === 'searching') {
    objective = `Work ${active.name}`;
    detail = `${active.revealedClues.length} of ${active.clues.length} clues read · follow ${save.dogName} through the cover.`;
  }
  if (active?.found && (game.dogState === 'pointing' || game.dogState === 'holding')) {
    objective = `${save.dogName} has a point`;
    detail = 'Choose a quiet, steady, or fast approach. Hold first if you want a settled flush.';
  }
  if (scent && scent.label !== 'lost' && !active?.clueReady && !active?.found) {
    detail += ` The scent is drifting ${scentBearing}; use it to choose your line.`;
  }
  if (game.activeRoamingBird) {
    objective = game.dogState === 'pointing' ? 'Recover the escape' : 'Follow the moving bird';
    detail = game.dogState === 'pointing' ? 'Walk close and bring the bird to hand.' : 'Cast again and let your partner relocate the bird in the wind.';
  } else if (!active && game.roamingBirds.length) {
    objective = `${game.roamingBirds.length} bird${game.roamingBirds.length === 1 ? '' : 's'} on the move`;
    detail = 'A miss opened another chance. Explore nearby cover and cast when a wing appears.';
  }
  if (game.phase === 'retrieve') { objective = 'That’s a good dog.'; detail = 'Wait for your partner to bring the birds to hand.'; }
  $('#objective').textContent = objective; $('#objective-detail').textContent = detail;
  const button = $<HTMLButtonElement>('#interact');
  const pointReady = Boolean(active?.found && (game.dogState === 'pointing' || game.dogState === 'holding') && Math.hypot(game.player.x - game.dog.x, game.player.y - game.dog.y) <= 118);
  button.querySelector('span')!.textContent = game.phase === 'retrieve' ? 'Retrieving…' : pointReady && (action.kind === 'flush' || action.kind === 'approach') ? 'Choose approach' : action.label;
  button.disabled = game.phase !== 'explore';
  $<HTMLButtonElement>('#recall').disabled = game.phase !== 'explore';
  button.classList.toggle('ready', action.kind === 'flush' || (action.kind === 'approach' && pointReady) || action.kind === 'search' || action.kind === 'recover');
  const commandState = game.dogState === 'searching' ? 'cast' : game.dogState === 'pointing' || game.dogState === 'holding' ? 'hold' : game.dogState === 'returning' || game.dogState === 'following' ? 'heel' : '';
  root.querySelectorAll<HTMLButtonElement>('[data-command]').forEach(commandButton => {
    commandButton.disabled = game!.phase !== 'explore';
    commandButton.classList.toggle('active', commandButton.dataset.command === commandState);
  });
  if (game.dogState !== lastDogState) {
    if (game.dogState === 'pointing') { audio.play('point'); if (dialog.hidden) toast(`${save.dogName} has found birds. Walk in and flush when you’re ready.`); }
    lastDogState = game.dogState;
  }
  if (previousPhase === 'retrieve' && game.phase === 'explore') { audio.play('discovery'); if (dialog.hidden) toast('To hand. A little more trust earned.'); }
  previousPhase = game.phase;
  if (game.message && game.message !== lastMessage) { lastMessage = game.message; }
}

function showMap() {
  const player = game?.player ?? { x: 250, y: 810 };
  openDialog('map', `<span class="eyebrow">KNOW A LITTLE MORE COUNTRY</span><h2>The Briar Glen trails</h2><p>Three covers. Four little discoveries. Take the long way.</p><div class="trail-map"><svg viewBox="0 0 1280 960" role="img" aria-label="Map of Briar Glen: cabin southwest, meadow west, marsh east, orchard north, overlook northeast"><defs><pattern id="map-grain" width="32" height="32" patternUnits="userSpaceOnUse"><circle cx="4" cy="9" r="2" fill="#9aa271" opacity=".25"/></pattern></defs><rect width="1280" height="960" fill="#c4c79a"/><rect width="1280" height="960" fill="url(#map-grain)"/><path d="M1110 90C900 200 1170 320 1095 420S1060 620 1210 740" fill="none" stroke="#628e89" stroke-width="70"/><path d="M240 845Q340 660 430 605T695 460Q810 370 710 280M650 490Q800 660 1000 565M710 280Q900 220 1040 200" fill="none" stroke="#e8d6ab" stroke-width="25" stroke-linecap="round"/><g fill="#879364" opacity=".6"><circle cx="410" cy="530" r="90"/><circle cx="665" cy="260" r="96"/><circle cx="945" cy="540" r="85"/></g>${LANDMARKS.map(l => `<g><circle cx="${l.x}" cy="${l.y}" r="20" fill="${game?.discovered.includes(l.id) || save.journal.includes(l.id) ? '#ad783c' : '#334e40'}" stroke="#f8efd4" stroke-width="5"/><text x="${l.x}" y="${l.y + 47}" text-anchor="middle" fill="#243d32" font-size="25" font-family="Georgia" font-weight="bold">${esc(l.name)}</text></g>`).join('')}<circle cx="${player.x}" cy="${player.y}" r="14" fill="#d86133" stroke="#fff8dc" stroke-width="5"/><text x="${player.x}" y="${player.y - 29}" text-anchor="middle" fill="#a1442d" font-size="21" font-weight="bold">YOU</text></svg></div><div class="map-destinations">${LANDMARKS.map(l => `<button class="map-destination" data-landmark="${l.id}"><span>${icon(l.id === 'camp' ? 'home' : 'leaf')} ${esc(l.name)}</span><small>${game ? 'Walk here' : 'View trail'} ${icon('arrow')}</small></button>`).join('')}</div><p class="fine-print">${game ? 'Choose a destination to walk there. You can steer at any time.' : 'Meet your setter and take the trail to explore Briar Glen.'}</p>`, 'Trail map');
  root.querySelectorAll<HTMLButtonElement>('[data-landmark]').forEach(button => button.onclick = () => {
    const landmark = LANDMARKS.find(l => l.id === button.dataset.landmark)!;
    if (game) { closeDialog(); goTo({ x: landmark.x, y: landmark.y + 36 }); toast(`Taking the trail toward ${landmark.name}.`); }
    else toast(landmark.description);
  });
}

function showJournal() {
  const journal = new Set([...(game?.save.journal ?? save.journal), ...(game?.discovered || [])]);
  const entries = Object.entries(SPECIES);
  const seenBirds = entries.filter(([id]) => journal.has(id)).length;
  openDialog('journal', `<span class="eyebrow">A RECORD OF GOOD MORNINGS</span><h2>Your field journal</h2><div class="journal-partner"><img src="${import.meta.env.BASE_URL}art/setter-portrait.png" alt="English Setter"/><div><strong>${esc(save.dogName)} & you</strong><span>Level ${dogLevel(save.xp)} partners · ${save.outings} outings together</span><div class="bond-track"><i style="width:${levelProgress(save.xp) * 100}%"></i></div></div><b>${save.totalBirds + (currentScreen === 'field' ? game?.birdsBagged ?? 0 : 0)}<small>BROUGHT HOME</small></b></div><div class="journal-heading"><h3>Birds of Briar Glen</h3><span>${seenBirds} / ${entries.length} ENCOUNTERED</span></div><div class="species-grid">${entries.map(([id, species]) => `<article class="species-card ${journal.has(id) ? 'seen' : 'unseen'}"><div class="species-illustration">${journal.has(id) ? `<span class="journal-bird ${id}" style="background-image:url('${import.meta.env.BASE_URL}art/${id === 'pheasant' ? 'ringneck-rooster-flush' : 'bobwhite-flush-sheet-alpha'}.png')"></span>` : '<span class="unknown-bird">?</span>'}</div><span class="eyebrow">${journal.has(id) ? 'ENCOUNTERED' : 'STILL OUT THERE'}</span><h4>${journal.has(id) ? esc(species.name) : ['The meadow bird', 'The marsh bird', 'The orchard bird'][entries.findIndex(([key]) => key === id)]}</h4><p>${journal.has(id) ? esc(species.description) : 'Follow your dog into new cover to add this bird to your journal.'}</p></article>`).join('')}</div><div class="journal-heading"><h3>Little discoveries</h3><span>${LANDMARKS.filter(l => l.id !== 'camp' && journal.has(l.id)).length} / 4 FOUND</span></div><div class="discovery-list">${LANDMARKS.filter(l => l.id !== 'camp').map(l => `<div class="discovery ${journal.has(l.id) ? 'seen' : ''}">${icon(journal.has(l.id) ? 'check' : 'map')}<div><strong>${esc(l.name)}</strong><span>${journal.has(l.id) ? esc(l.description) : 'Find the trail sign and take a closer look.'}</span></div></div>`).join('')}</div><p class="fine-print">Best outing: ${save.bestScore} points · A partnership grows with every point, retrieve, and discovery. As your dog levels up, their nose reaches a little farther.</p>`, 'Field journal');
}

function showPause() {
  if (!game) return;
  const canFinish = game.phase === 'explore' && (game.patches.some(p => p.completed) || game.discovered.length > 0);
  openDialog('pause', `<span class="eyebrow">TAKE A BREATHER</span><h2>The trail can wait.</h2><p>${esc(save.dogName)} is right here. Pick up where you left off.</p><button id="resume" class="button primary wide">Back to the field ${icon('arrow')}</button><div class="pause-options"><button id="controls" class="button secondary">How to play</button>${soundButton()}</div>${canFinish ? '<button id="pause-finish" class="button text-button wide">Finish outing & save</button>' : ''}<p class="fine-print">Movement pauses while a journal, map, or menu is open.</p>`, 'Game paused');
  $('#resume').onclick = closeDialog; $('#controls').onclick = showHelp;
  if (canFinish) $('#pause-finish').onclick = () => { closeDialog(); showCamp(); }; wireSound();
}
function showHelp() {
  openDialog('help', `<span class="eyebrow">A GOOD DOG SHOWS YOU THE WAY</span><h2>A few field notes.</h2><ol class="field-notes"><li><b>Choose your line.</b><p>Use WASD or arrows, tap the field, or drag the touch stick. C casts, H holds, Q heels, and R recalls. The map is a compass—steer whenever you want.</p></li><li><b>Work the cover.</b><p>Cast ${esc(save.dogName)} into range. Follow the nose to each clue, move close, and investigate. Three good reads turn a trail into a point.</p></li><li><b>Respect the point.</b><p>When your partner freezes, hold them for a breath or choose Careful, Steady, or Rush. Wind and your approach change the flush.</p></li><li><b>Lead the wing.</b><p>Birds cross at different depths and speeds. Read the rise, lead your shot, and watch for the pale decoy. Two shells per rise, three rises total.</p></li><li><b>Bring it home.</b><p>Let ${esc(save.dogName)} retrieve, then return to camp. Missed birds may roam back into the country for a patient recovery.</p></li></ol><button id="help-back" class="button primary wide">I’ve got the idea ${icon('check')}</button>`, 'How to play');
  $('#help-back').onclick = closeDialog;
}

function showSummary() {
  clearToast();
  if (!game || game.phase !== 'summary') return;
  save = game.save; persist(); currentScreen = 'summary';
  const completed = game.patches.filter(p => p.completed).length;
  const worked = game.patches.filter(p => p.state === 'worked').length;
  const gained = save.xp - startingXp;
  const leveled = dogLevel(save.xp) > dogLevel(startingXp);
  audio.play('discovery');
  screen.innerHTML = `<section class="summary-screen"><div class="summary-landscape"></div><div class="summary-paper"><span class="eyebrow">BRIAR GLEN · OUTING ${save.outings}</span><span class="summary-stamp">${icon(worked === 3 ? 'star' : 'leaf')}</span><h1>${worked === 3 ? 'A morning well spent.' : completed === 3 ? 'Good fieldwork.' : 'Every walk is a good walk.'}</h1><p>A little more country. A little closer to ${esc(save.dogName)}.</p><div class="summary-stats"><div><b>${game.birdsBagged}</b><span>BIRDS TO HAND</span></div><div><b>${worked}<small>/3</small></b><span>COVERS WORKED</span></div><div><b>${game.points}</b><span>FIELD SCORE</span></div></div><div class="summary-bond"><img src="${import.meta.env.BASE_URL}art/setter-portrait.png" alt="Your English Setter"/><div><strong>${leveled ? `A stronger partnership. Level ${dogLevel(save.xp)}!` : `${esc(save.dogName)} trusts you a little more.`}</strong><span>+${gained} bond XP · ${completed} covers read · ${game.shotsFired} shells fired · best ${save.bestScore}</span><div class="bond-track"><i style="width:${levelProgress(save.xp) * 100}%"></i></div></div></div><div class="summary-saved">${icon('check')} ${storageAvailable ? 'Outing saved. Your dog will be here when you’re ready.' : 'Progress is kept in this tab. Browser storage is unavailable.'}</div><button id="again" class="button primary wide">One more walk ${icon('arrow')}</button><div class="summary-secondary"><button id="summary-journal" class="button text-button">${icon('book')} Field journal</button><button id="home" class="button text-button">Back to the cabin</button></div></div></section>`;
  $('#again').onclick = () => void startOuting(); $('#summary-journal').onclick = showJournal; $('#home').onclick = showTitle;
}

document.addEventListener('keydown', event => {
  if (event.key === 'Tab' && !dialog.hidden) {
    const elements = [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled),input,a[href]')];
    const first = elements[0], last = elements[elements.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
  if (event.key === 'Escape') { event.preventDefault(); if (!dialog.hidden) closeDialog(); else if (game && currentScreen === 'field') showPause(); return; }
  if (event.target instanceof HTMLInputElement || !dialog.hidden || currentScreen !== 'field' || loading) return;
  const key = event.key.toLowerCase();
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key)) event.preventDefault();
  if (encounter) return;
  if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(key)) { keys.add(key); void audio.unlock(); }
  if (event.repeat) return;
  if (key === 'e' || key === ' ') { event.preventDefault(); interact(); }
  if (key === 'c') { event.preventDefault(); issueCommand('cast'); }
  if (key === 'h') { event.preventDefault(); issueCommand('hold'); }
  if (key === 'q') { event.preventDefault(); issueCommand('heel'); }
  if (key === 'r') $('#recall').click();
  if (key === 'm') showMap(); if (key === 'j') showJournal();
});
document.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => { keys.clear(); stick = { x: 0, y: 0 }; });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { keys.clear(); stick = { x: 0, y: 0 }; audio.suspend(); if (game && currentScreen === 'field' && dialog.hidden && !loading) showPause(); }
  else { lastTime = performance.now(); }
});
function tick(now: number) {
  const dt = Math.min(0.05, Math.max(0, (now - (lastTime || now)) / 1000)); lastTime = now;
  if (game && world && currentScreen === 'field' && !loading) {
    if (dialog.hidden && !encounter && !document.hidden) {
      move(dt); game.update(dt); ambientTimer += dt;
      if (ambientTimer > 12) { ambientTimer = 0; audio.play('bird'); }
    }
    if (!encounter) world.render({
      player: game.player,
      dog: game.dog,
      dogState: game.dogState,
      time: game.time,
      patches: game.patches.map(patch => ({ ...patch, currentClue: patch.clueReady ? patch.clues[patch.currentClueIndex] : null })),
      discovered: game.discovered,
      target: game.target,
      roamingBirds: game.roamingBirds,
    }, dialog.hidden ? dt : 0);
    uiTimer += dt; if (uiTimer > 0.1) { uiTimer = 0; updateUI(); }
  }
  frame = requestAnimationFrame(tick);
}
showTitle(); frame = requestAnimationFrame(tick);
if (import.meta.hot) import.meta.hot.dispose(() => { cancelAnimationFrame(frame); encounter?.destroy(); audio.destroy(); });
