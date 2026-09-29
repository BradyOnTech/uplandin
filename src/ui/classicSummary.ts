import type { HuntState } from '../game/state';
import type { CareerHuntResult } from '../game/huntResults';
import { getArea, getDropPoint } from '../game/areas';
import { careerFieldNotes } from '../three/fieldNotes';
import './classicSummary.css';

/** A read-only report of the completed hunt, never a second settlement. The
 * classic renderer does not retain elapsed field time, so none is invented. */
export function classicSummaryNotes(hunt: HuntState, dogCount: number, career: CareerHuntResult | null) {
  const area = getArea(hunt.areaId);
  const retrieved = hunt.birds.filter(bird => bird.state === 'retrieved').length;
  const uncollected = hunt.birds.filter(bird => bird.state === 'downed' || bird.state === 'carried').length;
  const points = hunt.dogWork.slice(0, dogCount).reduce((sum, work) => sum + work.pointFlushes, 0);
  return {
    property: area.name,
    entry: getDropPoint(area, hunt.dropPointId).name,
    retrieved,
    mode: career ? 'Career hunt' : 'Quick Hunt',
    rows: [
      { label: 'Birds downed', value: hunt.downed },
      { label: 'Point flushes', value: points },
      { label: 'Birds escaped', value: hunt.escaped },
      ...(hunt.doubles > 0 ? [{ label: 'Doubles', value: hunt.doubles }] : []),
    ],
    note: retrieved ? 'Retrieved and brought to hand.' : 'No birds in the bag this time.',
    uncollected: uncollected ? `${uncollected} downed bird${uncollected === 1 ? ' was' : 's were'} not brought to hand.` : '',
    warning: hunt.henDowns ? `${hunt.henDowns} protected hen${hunt.henDowns === 1 ? ' was' : 's were'} downed. Identify the rooster before firing.` : '',
    career: career ? careerFieldNotes(career) : null,
    canReplay: !career?.seasonEnded,
  };
}

export interface ClassicSummaryOptions {
  hunt: HuntState;
  dogCount: number;
  /** Already settled and saved by FieldScene, or null for Quick Hunt. */
  career: CareerHuntResult | null;
  onReplay(): void;
  onPrepare(): void;
  onContinue(): void;
}

function text<K extends keyof HTMLElementTagNameMap>(tag: K, value: string, className?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.textContent = value;
  if (className) element.className = className;
  return element;
}

/** The scene owns this modal's lifetime. Disposing it does not navigate, save,
 * or resume a completed hunt; an explicit action navigates exactly once. */
export function openClassicSummary(options: ClassicSummaryOptions): { dispose(): void } {
  const notes = classicSummaryNotes(options.hunt, options.dogCount, options.career);
  const listeners = new AbortController();
  const dialog = document.createElement('dialog');
  dialog.id = 'classic-summary';
  dialog.setAttribute('aria-labelledby', 'classic-summary-title');
  dialog.setAttribute('aria-describedby', 'classic-summary-location');
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    listeners.abort();
    if (dialog.open) dialog.close();
    dialog.remove();
  };
  const leave = (callback: () => void) => {
    if (disposed) return;
    dispose();
    callback();
  };
  const button = (label: string, className: string, callback: () => void) => {
    const node = text('button', label, className);
    node.type = 'button';
    node.addEventListener('click', () => leave(callback), { signal: listeners.signal });
    return node;
  };

  const header = document.createElement('header'); header.className = 'classic-summary-header';
  const identity = document.createElement('div');
  const heading = text('h2', 'Hunt complete'); heading.id = 'classic-summary-title'; heading.tabIndex = -1;
  const location = text('p', `${notes.property} · ${notes.entry}`); location.id = 'classic-summary-location';
  identity.append(text('p', 'UPLANDIN / FIELD REPORT', 'classic-summary-eyebrow'), heading, location);
  header.append(identity, text('span', notes.mode, 'classic-summary-mode'));

  const content = document.createElement('div'); content.className = 'classic-summary-content';
  content.tabIndex = 0; content.setAttribute('role', 'region'); content.setAttribute('aria-label', 'Hunt results');
  const outcome = document.createElement('section'); outcome.className = 'classic-summary-outcome';
  outcome.setAttribute('aria-label', 'Field outcomes');
  const bag = document.createElement('div'); bag.className = 'classic-summary-bag';
  bag.append(text('strong', String(notes.retrieved)), text('span', notes.retrieved === 1 ? 'bird retrieved' : 'birds retrieved'));
  const stats = document.createElement('dl'); stats.className = 'classic-summary-stats';
  for (const { label, value } of notes.rows) {
    const pair = document.createElement('div'); pair.append(text('dt', label), text('dd', String(value))); stats.append(pair);
  }
  outcome.append(bag, stats);
  content.append(outcome, text('p', notes.note, 'classic-summary-note'));
  if (notes.uncollected) content.append(text('p', notes.uncollected, 'classic-summary-warning'));
  if (notes.warning) content.append(text('p', notes.warning, 'classic-summary-warning'));

  if (notes.career) {
    const career = notes.career;
    const section = document.createElement('section'); section.className = 'classic-summary-career';
    section.setAttribute('aria-label', 'Career progress');
    const progressHeading = document.createElement('div'); progressHeading.className = 'classic-summary-progress-heading';
    progressHeading.append(text('h3', career.heading), text('p', career.hunterAward, 'classic-summary-award'));
    section.append(progressHeading, text('p', career.calendar, 'classic-summary-calendar'));
    if (career.next) section.append(text('p', career.next, 'classic-summary-season'));
    if (career.progress) {
      const progress = document.createElement('progress'); progress.max = career.progress.required; progress.value = career.progress.earned;
      progress.setAttribute('aria-label', `Hunter progress to level ${career.progress.nextLevel}`);
      section.append(progress, text('p', `${career.progress.remaining} XP to level ${career.progress.nextLevel}`, 'classic-summary-next'));
    }
    if (career.unlocks.length) {
      const list = document.createElement('ul'); list.className = 'classic-summary-unlocks';
      for (const unlock of career.unlocks) list.append(text('li', unlock));
      section.append(text('h4', 'Newly available'), list);
    }
    if (career.dogs.length) {
      const dogs = document.createElement('details'); dogs.className = 'classic-summary-dogs';
      dogs.append(text('summary', 'Dog development'));
      const list = document.createElement('dl');
      for (const dog of career.dogs) {
        const row = document.createElement('div');
        row.append(text('dt', dog.name), text('dd', `${dog.award} · ${dog.level}`));
        if (dog.next) row.append(text('dd', dog.next, 'classic-summary-dog-next'));
        list.append(row);
      }
      dogs.append(list); section.append(dogs);
    }
    content.append(section);
  } else {
    content.append(text('p', 'Quick Hunts leave your career and kennel unchanged.', 'classic-summary-quick-note'));
  }

  const footer = document.createElement('footer'); footer.className = 'classic-summary-footer';
  footer.append(text('span', notes.career
    ? notes.canReplay ? 'The season continues in your field book.' : 'The next season starts in preparation.'
    : 'Another cover. Another day.', 'classic-summary-footer-note'));
  const actions = document.createElement('div'); actions.className = 'classic-summary-actions';
  actions.append(button('Hunt preparation', 'classic-summary-secondary', options.onPrepare));
  actions.append(notes.canReplay
    ? button('Hunt again', 'classic-summary-primary', options.onReplay)
    : button('Plan next season', 'classic-summary-primary', options.onContinue));
  footer.append(actions);
  dialog.append(header, content, footer);
  // Phaser listens at the window. Keep modal keys, including Escape, out of
  // its field controls; Escape returns to preparation rather than resuming.
  for (const name of ['keydown', 'keyup']) dialog.addEventListener(name, event => event.stopPropagation(), { signal: listeners.signal });
  dialog.addEventListener('cancel', event => { event.preventDefault(); leave(options.onPrepare); }, { signal: listeners.signal });
  dialog.addEventListener('close', () => leave(options.onPrepare), { signal: listeners.signal });
  document.body.append(dialog);
  dialog.showModal();
  heading.focus({ preventScroll: true });
  return { dispose };
}
