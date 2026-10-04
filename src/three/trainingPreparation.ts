import './training.css';
import { loadCareer, workingDogs } from '../game/career';
import { BREEDS, getBreed } from '../game/breeds';
import { isModeledBreed, resolveCoatFor } from '../game/dogCoats';
import { dateLabel } from '../game/season';
import { loadQuickConfig } from '../game/quick';
import { parseTraining, readTrainingRecord, TRAINING_DRILLS, trainingBudget, trainingRecordId, type TrainingDrill } from '../game/training';
import { renderDogDevelopment } from './trainingView';
import { enableOfflineHunts } from './offline';
import { menuMusicOnFirstGesture } from './menuMusic';

const root = document.getElementById('training')!;
const params = new URLSearchParams(location.search);
const career = loadCareer(), quick = loadQuickConfig(), dogs = workingDogs(career);
const initialParams = new URLSearchParams(params);
if (!parseTraining(initialParams.toString())) initialParams.set('training', 'planted-birds');
const initial = parseTraining(initialParams.toString())!;
let mode = params.get('mode') === 'career' ? 'career' : 'quick';
let drill: TrainingDrill = initial.drill, difficulty = initial.difficulty, cover = initial.cover, wind = initial.wind, seed = initial.seed;
let dogId = params.get('trainee') ?? career.activeDogId ?? dogs[0]?.id ?? '';
let breedId: string = isModeledBreed(params.get('breed') ?? '') ? params.get('breed')! : isModeledBreed(quick.breedId) ? quick.breedId : 'gsp';
let level = Math.max(1, Math.min(10, Number(params.get('level')) || quick.level));
const music = menuMusicOnFirstGesture();
enableOfflineHunts();
window.addEventListener('pagehide', () => music.stop(), { once: true });

function node<K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = ''): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag); el.textContent = text; el.className = className; return el;
}
function link(label: string, href: string): HTMLAnchorElement { const a = node('a', label); a.href = href; return a; }
function select(label: string, value: string, options: [string, string][], change: (value: string) => void): HTMLElement {
  const wrap = node('label', '', 'training-control'); wrap.append(node('span', label));
  const input = node('select'); input.setAttribute('aria-label', label);
  for (const [id, title] of options) { const option = node('option', title); option.value = id; option.selected = id === value; input.append(option); }
  input.addEventListener('change', () => { change(input.value); render(); }); wrap.append(input); return wrap;
}
function render(): void {
  const focus = (document.activeElement as HTMLElement | null)?.getAttribute('aria-label');
  const header = node('header', '', 'training-masthead'); header.append(link('UPLANDIN', './'), link('Back to hunt preparation', `./prepare3d.html?mode=${mode}`));
  const intro = node('div', '', 'training-intro');
  intro.append(node('p', 'QUAIL FIELDS · TRAINING GROUNDS', 'training-eyebrow'), node('h1', 'A better dog.\nOne good repetition.'), node('p', 'Work the wind, steady the point, bring it to hand. Familiar ground, focused practice, and short field challenges.'));
  const modePicker = node('div', '', 'training-mode'); modePicker.setAttribute('role', 'group'); modePicker.setAttribute('aria-label', 'Training mode');
  for (const [id, title] of [['quick', 'Quick challenges'], ['career', 'Train a career dog']]) {
    const button = node('button', title); button.type = 'button'; button.setAttribute('aria-pressed', String(id === mode)); button.addEventListener('click', () => { mode = id; render(); }); modePicker.append(button);
  }
  intro.append(modePicker);
  const layout = node('div', '', 'training-layout'), choices = node('section', '', 'training-drills'); choices.setAttribute('aria-label', 'Choose a drill');
  for (const [id, config] of Object.entries(TRAINING_DRILLS)) {
    const button = node('button', '', 'training-drill'); button.type = 'button'; button.setAttribute('aria-pressed', String(id === drill)); button.setAttribute('aria-label', config.name);
    button.append(node('strong', config.name), node('span', config.description)); button.addEventListener('click', () => { drill = id as TrainingDrill; render(); }); choices.append(button);
  }
  const setup = node('aside', '', 'training-setup'); setup.append(node('h2', TRAINING_DRILLS[drill].name));
  let selectedDog = dogs.find(d => d.id === dogId) ?? dogs[0];
  if (mode === 'career') {
    if (!selectedDog) setup.append(node('p', 'Start a season and choose your first dog to develop it here.'), link('Start your season →', './prepare3d.html?mode=career'));
    else {
      dogId = selectedDog.id;
      setup.append(select('Career dog', dogId, dogs.map(d => [d.id, `${d.name} · ${getBreed(d.breedId).name}`]), value => { dogId = value; }));
      const budget = trainingBudget(selectedDog, career.date);
      setup.append(node('p', `${dateLabel(career.date)} · ${budget.skillXp.toFixed(1)} skill XP and ${budget.dogXp} dog XP available this week.`, 'training-budget'), renderDogDevelopment(selectedDog));
    }
  } else {
    setup.append(select('Dog breed', breedId, BREEDS.filter(b => isModeledBreed(b.id)).map(b => [b.id, b.name]), value => { breedId = value; }));
    const label = node('label', '', 'training-control'); label.append(node('span', `Dog ability · Level ${level}`));
    const slider = node('input'); slider.type = 'range'; slider.min = '1'; slider.max = '10'; slider.value = String(level); slider.setAttribute('aria-label', 'Dog ability');
    slider.addEventListener('change', () => { level = Number(slider.value); render(); }); label.append(slider); setup.append(label);
  }
  setup.append(select('Difficulty', difficulty, [['foundation', 'Foundation · patient birds, shorter retrieves'], ['field', 'Field · longer work, normal patience'], ['advanced', 'Advanced · longer casts, less time on point']], value => { difficulty = value as typeof difficulty; }));
  setup.append(select('Cover', cover, [['light', 'Light cover'], ['heavy', 'Heavy cover']], value => { cover = value as typeof cover; }));
  setup.append(select('Wind', wind, [['calm', 'Calm'], ['breezy', 'Breezy'], ['strong', 'Strong']], value => { wind = value as typeof wind; }));
  const course = node('div', '', 'training-course');
  const courseLabel = node('span', `Course ${seed}`), newCourse = node('button', 'Change course'); newCourse.type = 'button';
  newCourse.addEventListener('click', () => { seed = (seed + 7919) >>> 0; render(); }); course.append(courseLabel, newCourse); setup.append(course);
  if (mode === 'quick') {
    let storage: Storage | null = null; try { storage = localStorage; } catch { /* Optional records. */ }
    const record = readTrainingRecord(storage, trainingRecordId({ drill, mode: 'quick', difficulty, cover, wind, seed }, breedId, level));
    setup.append(node('p', record ? `Personal best: ${record.medal} · ${record.score}/100 · ${record.seconds}s` : 'Clean work earns medals. Personal bests compare the same course, conditions, and dog ability.', 'training-budget'));
  }
  const start = node('button', mode === 'career' && selectedDog ? `Train ${selectedDog.name} →` : 'Enter training grounds →', 'training-start'); start.type = 'button'; start.disabled = mode === 'career' && !selectedDog;
  start.addEventListener('click', () => {
    // Recheck the chosen dog against current storage before launching.
    if (mode === 'career' && !workingDogs(loadCareer()).some(d => d.id === dogId)) { location.reload(); return; }
    const p = new URLSearchParams({ play: mode, area: 'quail-fields', training: drill, trainingDifficulty: difficulty,
      trainingCover: cover, wind, seed: String(seed), tod: 'morning' });
    if (mode === 'career') p.set('trainee', dogId); else { p.set('breed', breedId); p.set('level', String(level)); p.set('coat', resolveCoatFor(breedId, quick.coatId)); }
    location.assign(`./index3d.html?${p}`);
  }); setup.append(start, node('p', mode === 'career' ? 'Practice between hunting weekends. Repeat freely; credited training gains are limited per career week.' : 'A short challenge with your chosen dog ability. Replay this course to improve your score.', 'help'));
  layout.append(choices, setup); root.replaceChildren(header, intro, layout);
  // Preserve keyboard location when changing a choice rebuilds the view.
  if (focus) [...root.querySelectorAll<HTMLElement>('[aria-label]')].find(el => el.getAttribute('aria-label') === focus)?.focus();
}
render();
