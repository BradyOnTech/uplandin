import { fitPages } from './fitPager';
import './fitPager.css';
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
  const header = document.createElement('header'); header.className = 'hunt-journal-header';
  const title = document.createElement('div');
  title.append(text('p', 'UPLANDIN / RECORDS FROM THE FIELD', 'eyebrow'));
  const heading = text('h2', 'Field journal'); heading.id = 'hunt-journal-title'; title.append(heading);
  const summary = text('p', `${career.hunts} career hunt${career.hunts === 1 ? '' : 's'} · ${entries.length} recent ${entries.length === 1 ? 'entry' : 'entries'}`, 'hunt-journal-intro');
  summary.id = 'hunt-journal-summary'; title.append(summary);
  dialog.setAttribute('aria-describedby', summary.id);
  const close = text('button', 'Close'); close.type = 'button'; close.id = 'hunt-journal-close';
  close.addEventListener('click', () => dialog.close()); header.append(title, close);
  if (entries.length) {
    const overview = document.createElement('section'); overview.className = 'hunt-journal-overview';
    const overviewTitle = text('p', `Across these ${entries.length} recorded hunt${entries.length === 1 ? '' : 's'}`, 'hunt-journal-overview-label');
    overviewTitle.id = 'hunt-journal-overview-title'; overview.setAttribute('aria-labelledby', overviewTitle.id);
    const totals = document.createElement('dl');
    const retrieved = entries.reduce((sum, entry) => sum + entry.retrieved, 0);
    const points = entries.reduce((sum, entry) => sum + entry.pointFlushes, 0);
    const grounds = new Set(entries.map((entry) => entry.areaId)).size;
    for (const [label, value] of [['Birds retrieved', retrieved], ['Point flushes', points], ['Grounds visited', grounds]] as const) {
      const pair = document.createElement('div'); pair.append(text('dt', label), text('dd', String(value))); totals.append(pair);
    }
    overview.append(overviewTitle, totals); header.append(overview);
  }
  const content = document.createElement('div'); content.className = 'hunt-journal-content';
  content.tabIndex = 0; content.setAttribute('role', 'region'); content.setAttribute('aria-label', 'Recent hunt entries');
  if (entries.length) {
    const list = document.createElement('ol'); list.className = 'hunt-journal-list';
    for (const [index, entry] of entries.entries()) {
      const notes = formatHuntJournalEntry(entry);
      const item = document.createElement('li');
      const number = text('span', String(entry.huntNumber).padStart(2, '0'), 'hunt-journal-number');
      number.setAttribute('aria-label', `Hunt ${entry.huntNumber}`);
      const identity = document.createElement('div'); identity.className = 'hunt-journal-identity';
      const date = text('p', notes.dateLabel, 'hunt-journal-date');
      if (index === 0) { date.prepend(text('span', 'Latest', 'hunt-journal-latest')); item.className = 'latest-entry'; }
      identity.append(date, text('h3', notes.areaName), text('p', notes.dogsLabel, 'hunt-journal-dogs'));
      const results = document.createElement('div'); results.className = 'hunt-journal-results';
      const outcomes = document.createElement('dl'); outcomes.className = 'hunt-journal-outcomes';
      for (const [label, value] of [['Retrieved', entry.retrieved], ['Downed', entry.downed], ['Escaped', entry.escaped], ['Point flushes', entry.pointFlushes]] as const) {
        const pair = document.createElement('div'); pair.append(text('dt', label), text('dd', String(value))); outcomes.append(pair);
      }
      results.append(outcomes);
      const detail = [`+${entry.hunterXp} hunter XP`];
      if (entry.doubles) detail.push(`${entry.doubles} double${entry.doubles === 1 ? '' : 's'}`);
      if (entry.henDowns) detail.push(`${entry.henDowns} protected hen${entry.henDowns === 1 ? '' : 's'} downed`);
      if (notes.bagLabel) detail.push(notes.bagLabel);
      if (entry.overLimit) detail.push(`${entry.overLimit} over the limit`);
      results.append(text('p', detail.join(' · '), 'hunt-journal-detail'));
      item.append(number, identity, results);
      list.append(item);
    }
    content.append(list);
  } else {
    const empty = document.createElement('div'); empty.className = 'hunt-journal-empty';
    const mark = document.createElement('div'); mark.className = 'hunt-journal-empty-mark'; mark.setAttribute('aria-hidden', 'true');
    mark.append(text('span', 'I'), text('span', 'FIELD NOTES'));
    empty.append(mark, text('p', 'THE FIRST PAGE', 'hunt-journal-empty-kicker'), text('h3', 'A season worth remembering'), text('p', career.hunts > 0
      ? 'Your earlier hunts are included in your career totals. Detailed entries begin with your next career hunt.'
      : 'The ground you covered. The dogs beside you. The birds brought home. Complete a Career hunt and your first entry will appear here.'),
    text('p', 'Quick Hunts leave your career unchanged.', 'hunt-journal-empty-note'));
    content.append(empty);
  }
  const footer = document.createElement('footer'); footer.className = 'hunt-journal-footer';
  // The journal turns its pages; it never scrolls.
  const pager = document.createElement('div'); pager.className = 'hunt-journal-pager';
  footer.append(text('span', 'Your latest 30 career hunts · saved on this device'), pager, text('span', 'UPLANDIN', 'hunt-journal-imprint'));
  dialog.append(header, content, footer);
  const list = content.querySelector<HTMLElement>('.hunt-journal-list');
  const fit = list ? fitPages(list, { nav: pager, key: 'hunt-journal' }) : null;
  dialog.addEventListener('close', () => { fit?.dispose(); dialog.remove(); if (opener?.isConnected) opener.focus({ preventScroll: true }); }, { once: true });
  document.body.append(dialog); dialog.showModal(); close.focus({ preventScroll: true });
  fit?.refresh();
}
