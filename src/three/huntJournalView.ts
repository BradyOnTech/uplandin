import type { Career } from '../game/career';
import { formatHuntJournalEntry, readHuntJournal } from '../game/huntJournal';

function text<K extends keyof HTMLElementTagNameMap>(tag: K, value: string, className?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag); node.textContent = value;
  if (className) node.className = className;
  return node;
}

/** Read-only career history. Native modal focus keeps the already-paused
 * field behind it; closing never resumes or settles the current hunt. */
export function openHuntJournal(career: Career, opener?: HTMLElement): void {
  if (document.getElementById('hunt-journal')) return;
  const entries = readHuntJournal(career);
  const dialog = document.createElement('dialog'); dialog.id = 'hunt-journal';
  dialog.setAttribute('aria-labelledby', 'hunt-journal-title');
  const header = document.createElement('header');
  const title = document.createElement('div');
  title.append(text('p', 'UPLANDIN · YOUR SEASON', 'eyebrow'));
  const heading = text('h2', 'Field journal'); heading.id = 'hunt-journal-title'; title.append(heading);
  const close = text('button', 'Close'); close.type = 'button'; close.id = 'hunt-journal-close';
  close.addEventListener('click', () => dialog.close()); header.append(title, close);
  const content = document.createElement('div'); content.className = 'hunt-journal-content';
  if (entries.length) {
    content.append(text('p', `${career.hunts} career hunt${career.hunts === 1 ? '' : 's'} · ${entries.length} recent ${entries.length === 1 ? 'entry' : 'entries'}`, 'hunt-journal-intro'));
    const list = document.createElement('ol'); list.className = 'hunt-journal-list';
    for (const entry of entries) {
      const notes = formatHuntJournalEntry(entry);
      const item = document.createElement('li');
      item.append(text('p', `Hunt ${entry.huntNumber} · ${notes.dateLabel}`, 'hunt-journal-date'),
        text('h3', notes.areaName), text('p', notes.dogsLabel, 'hunt-journal-dogs'));
      const outcomes = document.createElement('dl'); outcomes.className = 'hunt-journal-outcomes';
      for (const [label, value] of [['Retrieved', entry.retrieved], ['Downed', entry.downed], ['Escaped', entry.escaped], ['Point flushes', entry.pointFlushes]] as const) {
        const pair = document.createElement('div'); pair.append(text('dt', label), text('dd', String(value))); outcomes.append(pair);
      }
      item.append(outcomes);
      const detail = [`+${entry.hunterXp} hunter XP`];
      if (entry.doubles) detail.push(`${entry.doubles} double${entry.doubles === 1 ? '' : 's'}`);
      if (entry.henDowns) detail.push(`${entry.henDowns} protected hen${entry.henDowns === 1 ? '' : 's'} downed`);
      item.append(text('p', detail.join(' · '), 'hunt-journal-detail'));
      list.append(item);
    }
    content.append(list);
  } else {
    const empty = document.createElement('div'); empty.className = 'hunt-journal-empty';
    empty.append(text('h3', 'A season worth remembering'), text('p', career.hunts > 0
      ? 'Your earlier hunts are included in your career totals. Detailed entries begin with your next career hunt.'
      : 'Complete a Career hunt to begin your field journal. Quick hunts leave your career unchanged.'));
    content.append(empty);
  }
  const footer = text('p', 'Your latest 30 career hunts are kept on this device.', 'hunt-journal-footer');
  dialog.append(header, content, footer);
  dialog.addEventListener('close', () => { dialog.remove(); if (opener?.isConnected) opener.focus({ preventScroll: true }); }, { once: true });
  document.body.append(dialog); dialog.showModal(); close.focus({ preventScroll: true });
}
