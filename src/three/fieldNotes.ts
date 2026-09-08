import type { HuntState } from '../game/state';

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
      { label: 'Time afield', value: duration },
    ],
    note: hunt.henDowns > 0
      ? `${hunt.henDowns} protected hen${hunt.henDowns === 1 ? ' was' : 's were'} downed. Identify the rooster before firing.`
      : retrieved > 0
        ? 'Retrieved and brought to hand.'
        : 'No birds in the bag this time.',
  };
}

export function renderFieldNotes(container: HTMLElement, hunt: HuntState, dogCount: number, seconds: number, property: string, entry: string, career: string): void {
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
  if (career) {
    const progression = document.createElement('p'); progression.className = 'field-notes-career';
    progression.textContent = career.replace(/^ · /, ''); container.append(progression);
  }
}
