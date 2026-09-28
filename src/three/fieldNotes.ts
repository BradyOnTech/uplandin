import type { HuntState } from '../game/state';
import type { CareerHuntResult } from '../game/huntResults';
import { dogCareerProgress, hunterCareerProgress } from '../game/careerProgress';
import { dateLabel } from '../game/season';

/** Observed field outcomes only; hidden stocking is not a completion target. */
export function fieldNotes(hunt: HuntState, dogCount: number, seconds: number) {
  const retrieved = hunt.birds.filter(bird => bird.state === 'retrieved').length;
  const points = hunt.dogWork.slice(0, dogCount).reduce((sum, work) => sum + work.pointFlushes, 0);
  const minutes = Math.max(0, Math.floor(seconds / 60));
  const duration = minutes < 1 ? '<1 min' : `${minutes} min`;
  return {
    retrieved,
    rows: [
      { label: 'Point flushes', value: String(points) },
      { label: 'Birds escaped', value: String(hunt.escaped) },
      ...(hunt.doubles > 0 ? [{ label: 'Doubles', value: String(hunt.doubles) }] : []),
      { label: 'Time afield', value: duration },
    ],
    note: hunt.henDowns > 0
      ? `${hunt.henDowns} protected hen${hunt.henDowns === 1 ? ' was' : 's were'} downed. Identify the rooster before firing.`
      : retrieved > 0
        ? 'Retrieved and brought to hand.'
        : 'No birds in the bag this time.',
  };
}

/** Presentation of the already-settled award; never mutates or settles saves. */
export function careerFieldNotes(result: CareerHuntResult) {
  const level = result.hunterLevel;
  const outlook = hunterCareerProgress(result.career);
  return {
    heading: result.hunterLevelsGained > 0 ? `Hunter level ${level} reached` : `Hunter level ${level}`,
    hunterAward: `+${result.hunterGained} XP${result.henFine > 0 ? ` · protected-hen penalty applied (${result.henFine} XP)` : ''}`,
    progress: outlook.progress,
    dogs: result.dogAwards.map(award => {
      const dog = result.career.kennel.find(candidate => candidate.id === award.dogId);
      const development = dog ? dogCareerProgress(result.career, dog) : null;
      return {
        name: award.name,
        award: `+${award.gained} XP`,
        level: award.levelsGained > 0 ? `Level ${award.newLevel} reached` : `Level ${award.newLevel}`,
        advanced: award.levelsGained > 0,
        next: development ? development.progress
          ? `${development.progress.remaining} XP to level ${development.progress.nextLevel} · ${development.nextBenefit}`
          : 'Maximum experience reached' : null,
      };
    }),
    unlocks: result.unlocks,
    calendar: `${result.weeks} week${result.weeks === 1 ? '' : 's'} passed · ${dateLabel(result.career.date)}`,
    next: result.seasonEnded ? 'The season is complete. Return home and open Career to begin the next season with your kennel.' : '',
  };
}

export function renderCareerFieldNotes(container: HTMLElement, result: CareerHuntResult): void {
  const notes = careerFieldNotes(result);
  const panel = document.createElement('section'); panel.className = 'field-notes-career';
  panel.setAttribute('aria-label', 'Career progress');
  const heading = document.createElement('h3'); heading.textContent = notes.heading;
  const award = document.createElement('p'); award.className = 'field-career-award'; award.textContent = notes.hunterAward;
  panel.append(heading, award);
  // The next action matters before the optional detail on a short phone.
  if (notes.next) { const next = document.createElement('p'); next.textContent = notes.next; panel.append(next); }
  if (notes.progress) {
    const progress = document.createElement('progress'); progress.max = notes.progress.required; progress.value = notes.progress.earned;
    progress.setAttribute('aria-label', `Hunter progress to level ${notes.progress.nextLevel}`);
    const remaining = document.createElement('p'); remaining.className = 'field-career-next';
    remaining.textContent = `${notes.progress.remaining} XP to level ${notes.progress.nextLevel}`;
    panel.append(progress, remaining);
  }
  if (notes.unlocks.length) {
    const label = document.createElement('h4'); label.textContent = 'Newly available';
    const unlocks = document.createElement('ul'); unlocks.className = 'field-career-unlocks';
    for (const name of notes.unlocks) { const item = document.createElement('li'); item.textContent = name; unlocks.append(item); }
    panel.append(label, unlocks);
  }
  if (notes.dogs.length) {
    const dogs = document.createElement('dl'); dogs.className = 'field-career-dogs';
    for (const dog of notes.dogs) {
      const row = document.createElement('div');
      const name = document.createElement('dt'); name.textContent = dog.name;
      const detail = document.createElement('dd'); detail.textContent = `${dog.award} · ${dog.level}`;
      if (dog.advanced) detail.className = 'field-career-advanced';
      row.append(name, detail);
      if (dog.next) {
        const next = document.createElement('dd'); next.className = 'field-career-dog-next'; next.textContent = dog.next;
        row.append(next);
      }
      dogs.append(row);
    }
    panel.append(dogs);
  }
  const calendar = document.createElement('p'); calendar.className = 'field-career-calendar'; calendar.textContent = notes.calendar;
  panel.append(calendar);
  container.append(panel);
}

export function renderFieldNotes(container: HTMLElement, hunt: HuntState, dogCount: number, seconds: number, property: string, entry: string, career: CareerHuntResult | null = null): void {
  const notes = fieldNotes(hunt, dogCount, seconds);
  const location = document.createElement('p'); location.className = 'field-notes-location';
  location.textContent = `${property} · ${entry}`;
  const bag = document.createElement('div'); bag.className = 'field-notes-bag';
  const count = document.createElement('strong'); count.textContent = String(notes.retrieved);
  const label = document.createElement('span'); label.textContent = notes.retrieved === 1 ? 'bird retrieved' : 'birds retrieved';
  bag.append(count, label);
  const rows = document.createElement('dl'); rows.className = 'field-notes-stats';
  for (const row of notes.rows) {
    const cell = document.createElement('div');
    const term = document.createElement('dt'); term.textContent = row.label;
    const value = document.createElement('dd'); value.textContent = row.value;
    cell.append(term, value); rows.append(cell);
  }
  const note = document.createElement('p'); note.className = 'field-notes-note'; note.textContent = notes.note;
  container.replaceChildren(location, bag, rows, note);
  if (career) renderCareerFieldNotes(container, career);
}
