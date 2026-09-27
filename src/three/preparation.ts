import './preparation.css';
import { AREAS, getArea } from '../game/areas';
import { BREEDS, getBreed } from '../game/breeds';
import { CAREER_KEY, loadCareer, saveCareer, type Career } from '../game/career';
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

const root = document.getElementById('preparation')!;
const params = new URLSearchParams(location.search);
let career = loadCareer(), quick = loadQuickConfig();
let mode = params.get('mode') === 'career' ? 'career' : 'quick';
let areaId = params.get('area') ?? (mode === 'career'
  ? careerPreparation(career).areas.find(area => area.isHome)?.area.id ?? quick.areaId : quick.areaId);
if (mode === 'quick') { quick = normalizeQuickConfig({ ...quick, areaId }); areaId = quick.areaId; }
let dropPointId = params.get('drop') ?? '';
let dogId = career.activeDogId ?? '', braceId = career.braceDogId ?? '';
let gunId = career.hunter.shotgunId;
let challenge = parseHuntChallenge(readPreference(HUNT_CHALLENGE_KEY));
let quality = readPreference('uplandin.3d.quality') ?? 'auto';
let light = 'morning';
let message = '', addingDog = false, launching = false;
let puppyDraft = { breedId: 'gsp', name: '', homeRegionId: career.homeRegionId ?? 'southern-plains' };
const propertyDrafts: Record<string, { areaId: string; dropPointId: string }> = {
  quick: { areaId: quick.areaId, dropPointId: '' },
  career: { areaId: careerPreparation(career).areas.find(area => area.isHome)?.area.id ?? 'quail-fields', dropPointId: '' },
};
const atlases = new Map<string, HTMLCanvasElement>();

function readPreference(key: string): string | null { try { return localStorage.getItem(key); } catch { return null; } }
function node<K extends keyof HTMLElementTagNameMap>(tag: K, value = '', className = ''): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag); el.textContent = value; el.className = className; return el;
}
function button(label: string, action: () => void, className = ''): HTMLButtonElement {
  const el = node('button', label, className); el.type = 'button'; el.addEventListener('click', action); return el;
}
function link(label: string, href: string): HTMLAnchorElement { const el = node('a', label); el.href = href; return el; }
function select(id: string, label: string, options: { id: string; label: string }[], value: string, change: (value: string) => void): HTMLLabelElement {
  const wrapper = node('label', '', 'setup-field'); wrapper.htmlFor = id; wrapper.append(node('span', label));
  const input = node('select'); input.id = id;
  for (const choice of options) { const option = node('option', choice.label); option.value = choice.id; input.append(option); }
  input.value = value; input.addEventListener('change', () => { change(input.value); render(id); });
  wrapper.append(input); return wrapper;
}
const choices = (values: readonly string[]) => values.map(id => ({ id, label: id === 'random' ? 'Let the day decide' : id.charAt(0).toUpperCase() + id.slice(1) }));
const breeds = () => BREEDS.map(b => ({ id: b.id, label: b.name }));
function section(title: string, intro?: string): HTMLElement {
  const el = node('section', '', 'setup-section'); el.append(node('h2', title)); if (intro) el.append(node('p', intro, 'section-intro')); return el;
}
function error(value: string): void { message = value; render(); document.getElementById('preparation-message')?.focus(); }
function persistCareer(next: Career): boolean {
  saveCareer(next);
  if (readPreference(CAREER_KEY) !== JSON.stringify(next)) { error('Your browser could not save this change. Allow site storage, then try again.'); return false; }
  career = next; return true;
}
function updateQuick(value: Partial<QuickConfig>): void {
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
  if (!AREAS.some(a => a.id === areaId)) areaId = 'quail-fields';
  if (mode === 'quick' && quick.huntingMethod === 'goshawk') areaId = 'pheasant-coverts';
  const area = getArea(areaId), doctrine = huntingDoctrine(area.id), entry = preparation.areas.find(a => a.area.id === areaId)!;
  if (!area.dropPoints.some(drop => drop.id === dropPointId)) dropPointId = area.dropPoints[0].id;
  const selectedDrop = area.dropPoints.find(drop => drop.id === dropPointId)!;
  root.replaceChildren();
  const header = node('header', '', 'prep-header');
  const brand = node('div', '', 'brand'); brand.append(node('strong', 'UPLANDIN'), node('span', 'A field. A good dog.'));
  const nav = node('nav'); nav.setAttribute('aria-label', 'Game');
  const journal = button('Field journal', () => openHuntJournal(loadCareer(), journal)); journal.id = 'prep-journal';
  const classic = link('2D classic', './index.html'); classic.onclick = () => saveGameplayMode('2d'); nav.append(journal, classic); header.append(brand, nav);
  const main = node('main');
  const opening = node('div', '', 'prep-opening'); const intro = node('div'); intro.append(node('p', 'THE NEXT OUTING', 'eyebrow'), node('h1', 'Where will you hunt?'));
  const modes = node('div', '', 'mode-switch'); modes.setAttribute('role', 'group'); modes.setAttribute('aria-label', 'Hunt mode');
  for (const [id, label] of [['quick', 'Quick hunt'], ['career', 'Your career']]) {
    const control = button(label, () => {
      if (mode === id) return;
      propertyDrafts[mode] = { areaId, dropPointId }; mode = id; message = ''; addingDog = false; career = loadCareer();
      ({ areaId, dropPointId } = propertyDrafts[mode]);
      render(`mode-${id}`); history.replaceState(null, '', `?mode=${mode}`);
    });
    control.id = `mode-${id}`; control.setAttribute('aria-pressed', String(mode === id)); modes.append(control);
  }
  opening.append(intro, modes); main.append(opening);
  const status = node('p', mode === 'career' ? `${dateLabel(career.date)} · Hunter level ${career.hunter.level} · ${career.hunts} hunts`
    : 'Choose your day, your dog and your ground. Everything is available; your career stays unchanged.', 'prep-status'); main.append(status);
  const notice = node('p', message, 'prep-message'); notice.id = 'preparation-message'; notice.setAttribute('role', 'status'); notice.tabIndex = -1; notice.hidden = !message; main.append(notice);
  const grid = node('div', '', 'prep-grid');
  grid.classList.toggle('first-season', mode === 'career' && (preparation.needsDog || preparation.needsHome));
  const property = node('section', '', 'property-panel');
  const field = select('prep-area', 'Hunting ground', AREAS.map(a => ({ id: a.id, label: `${a.name} · ${regionOfArea(a.id).name}` })), areaId,
    value => { areaId = value; dropPointId = ''; if (mode === 'quick') updateQuick({ areaId: value }); });
  field.querySelector('select')!.disabled = mode === 'quick' && quick.huntingMethod === 'goshawk'; property.append(field);
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
  property.append(map);
  property.append(select('prep-drop', 'Park the truck', area.dropPoints.map((drop, i) => ({ id: drop.id, label: `${i + 1}. ${drop.name}` })), dropPointId, value => { dropPointId = value; }));
  const notes = node('div', '', 'property-notes'); notes.append(node('p', doctrine.region, 'eyebrow'), node('h2', area.name), node('p', doctrine.description), node('p', doctrine.tip, 'field-advice'));
  const speciesIds = mode === 'career' ? entry.openSpeciesIds : area.speciesMix.map(s => s.speciesId);
  notes.append(node('p', speciesIds.length ? speciesIds.map(id => getSpecies(id).name).join(' · ') : 'Season currently closed', 'species-line')); property.append(notes);
  grid.append(property);
  const settings = node('div', '', 'setup-panel');
  if (mode === 'career' && (preparation.needsDog || preparation.needsHome)) {
    const setup = section('Your first season', 'Choose a home ground and a dog to grow with you.');
    if (preparation.needsDog) dogForm(setup, true);
    else {
      let homeId = puppyDraft.homeRegionId;
      const home = node('select'); home.id = 'home-region'; home.setAttribute('aria-label', 'Home region');
      for (const region of REGIONS.filter(r => r.built)) { const option = node('option', region.name); option.value = region.id; home.append(option); }
      home.value = homeId; home.onchange = () => { homeId = home.value; puppyDraft.homeRegionId = homeId; };
      setup.append(home, button('Set home ground', () => {
        const result = commitCareerSetup(loadCareer(), { homeRegionId: homeId });
        if (!result.ok) error(result.message); else if (persistCareer(result.career)) { areaId = careerPreparation(career).areas.find(a => a.isHome)!.area.id; render(); }
      }, 'primary'));
    }
    settings.append(setup);
  } else {
    const companions = section('Your dog');
    if (mode === 'career') {
      if (!career.kennel.some(d => d.id === dogId)) dogId = career.activeDogId ?? '';
      companions.append(select('prep-dog', 'Working dog', career.kennel.map(d => ({ id: d.id, label: `${d.name} · ${getBreed(d.breedId).name} · Level ${d.level}` })), dogId, value => { dogId = value; if (braceId === value) braceId = ''; }));
      if (preparation.canBrace) companions.append(select('prep-brace', 'Second dog', [{ id: '', label: 'Hunt with one dog' }, ...career.kennel.filter(d => d.id !== dogId).map(d => ({ id: d.id, label: `${d.name} · Level ${d.level}` }))], braceId, value => { braceId = value; }));
      companions.append(node('p', `${GEAR_NAMES[preparation.gearTier]} · ${career.kennel.length}/${preparation.kennelCapacity} kennel places`, 'help'));
      if (addingDog) dogForm(companions, false);
      else if (preparation.canAddDog) {
        const addDog = button('Add a dog to your kennel', () => { addingDog = true; render(); }, 'text-button'); addDog.id = 'prep-add-dog'; companions.append(addDog);
      }
    } else {
      companions.append(select('prep-breed', 'Breed', breeds(), quick.breedId, value => updateQuick({ breedId: value })));
      companions.append(node('p', getBreed(quick.breedId).blurb, 'help'));
      if (quick.huntingMethod !== 'goshawk') companions.append(select('prep-level', 'Experience', Array.from({ length: 10 }, (_, i) => ({ id: String(i + 1), label: `Level ${i + 1}${i === 0 ? ' · First season' : i === 9 ? ' · Finished dog' : ''}` })), String(quick.level), value => updateQuick({ level: Number(value) })));
      else { companions.querySelector('select')!.disabled = true; companions.append(node('p', 'A finished GSP works with your goshawk.', 'help')); }
    }
    settings.append(companions);
    const equipment = section(quick.huntingMethod === 'goshawk' && mode === 'quick' ? 'Hunting partner' : 'Your shotgun');
    if (mode === 'quick' && quick.huntingMethod === 'goshawk') equipment.append(node('p', 'Goshawk · From the fist', 'section-intro'));
    else {
      const guns = mode === 'career' ? preparation.availableGuns : GUNS;
      if (mode === 'career' && !guns.some(g => g.id === gunId)) gunId = guns[0].id;
      equipment.append(select('prep-gun', 'Shotgun', guns.map(g => ({ id: g.id, label: g.name })), mode === 'career' ? gunId : quick.gunId, value => { if (mode === 'career') gunId = value; else updateQuick({ gunId: value }); }));
      const rack = link('Explore the 3D gun rack ↗', `./shotguns3d.html?gun=${encodeURIComponent(mode === 'career' ? gunId : quick.gunId)}`); rack.target = '_blank'; rack.rel = 'noopener'; rack.className = 'text-link'; equipment.append(rack);
    }
    settings.append(equipment);
    const conditions = node('details', '', 'hunt-options'); conditions.append(node('summary', 'Conditions & display'));
    if (mode === 'quick') {
      conditions.append(select('prep-method', 'Hunting method', [{ id: 'shotgun', label: 'Shotgun' }, { id: 'goshawk', label: 'Goshawk · Cattail Coverts' }], quick.huntingMethod ?? 'shotgun', value => updateQuick({ huntingMethod: value as QuickConfig['huntingMethod'] })));
      conditions.append(select('prep-weather', 'Weather', choices(WEATHER_CHOICES), quick.weather, value => updateQuick({ weather: value as QuickConfig['weather'] })),
        select('prep-wind', 'Wind', choices(WIND_CHOICES), quick.wind, value => updateQuick({ wind: value as QuickConfig['wind'] })));
      if (quick.huntingMethod !== 'goshawk') conditions.append(select('prep-quick-brace', 'Second dog', [{ id: 'none', label: 'Hunt with one dog' }, ...breeds()], quick.breed2Id, value => updateQuick({ breed2Id: value })));
      conditions.append(select('prep-gear', 'Tracking gear', GEAR_NAMES.map((label, i) => ({ id: String(i), label })), String(quick.gearTier), value => updateQuick({ gearTier: Number(value) })));
    } else conditions.append(node('p', 'Weather and bird experience follow your career season.', 'help'));
    conditions.append(select('prep-challenge', 'Challenge', Object.entries(HUNT_CHALLENGES).map(([id, value]) => ({ id, label: value.label })), challenge, value => { challenge = parseHuntChallenge(value); }),
      select('prep-light', 'Light', choices(['morning', 'noon', 'evening']), light, value => { light = value; }),
      select('prep-quality', 'Graphics', [{ id: 'auto', label: 'Use device preference' }, { id: 'lite', label: 'Lightweight' }, { id: 'high', label: 'High' }], quality, value => { quality = value; }));
    settings.append(conditions);
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
  grid.append(settings); main.append(grid);
  const footer = node('footer', '', 'launch-bar'); const outing = node('div');
  outing.append(node('strong', area.name), node('span', mode === 'career' && entry.reason ? entry.reason
    : `${selectedDrop.name}${mode === 'career' ? ` · ${entry.weeks} week${entry.weeks === 1 ? '' : 's'}` : ' · Quick hunt'}`));
  const start = button('Head to the field ↗', launch, 'primary'); start.id = 'prep-start';
  start.disabled = launching || (mode === 'career' && (!entry.selectable || preparation.needsDog || preparation.needsHome));
  const reason = node('p', mode === 'career' && !entry.selectable ? '' : 'Read the wind. Trust your dog.', 'launch-reason'); footer.append(outing, reason, start);
  root.append(header, main, footer);
  if (focusId) {
    const focused = document.getElementById(focusId); focused?.closest('details')?.setAttribute('open', '');
    if (focused) {
      const box = focused.getBoundingClientRect(), footerTop = footer.getBoundingClientRect().top;
      if (box.top < 16 || box.bottom > footerTop - 16) focused.scrollIntoView({ block: 'center', inline: 'nearest' });
      focused.focus({ preventScroll: true });
    }
  }
}

function launch(): void {
  if (launching) return;
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
  const url = new URL(result.href, location.href); url.searchParams.set('challenge', challenge); url.searchParams.set('tod', light); url.searchParams.set('dog', 'generated');
  if (quality === 'high' || quality === 'lite') url.searchParams.set('quality', quality);
  launching = true; (document.getElementById('prep-start') as HTMLButtonElement).disabled = true; location.assign(url.href);
}

window.addEventListener('storage', event => {
  if (event.key === CAREER_KEY && mode === 'career') { refreshFromCareer(); message = 'Your career changed in another tab. Review your setup before heading out.'; render(); }
});
render();
