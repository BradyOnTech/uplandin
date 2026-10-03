import { fitPages, type FitPager } from './fitPager';
import { requestOfflineUpdate, type OfflineUpdateState } from './offline';
import { fetchPublishedVersion, readingRuns, releasesAfter, takeUnseenReleases, thisBuild, versionText, type PublishedVersion, type Release } from './gameVersion';

type Mode = 'browse' | 'updated';
const NEW_NOTES_SHOWN = 4;

function node<K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = ''): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag); element.textContent = text; element.className = className; return element;
}
function button(text: string, action: () => void, className = ''): HTMLButtonElement {
  const element = node('button', text, className); element.type = 'button'; element.addEventListener('click', action); return element;
}
function notesList(notes: readonly string[]): HTMLUListElement {
  const list = node('ul', '', 'home-news-notes');
  for (const note of notes) list.append(node('li', note));
  return list;
}
function savedStorage(): Storage | undefined {
  try { return globalThis.localStorage; } catch { return undefined; }
}

export const UPDATE_MESSAGES: Record<OfflineUpdateState, string> = {
  none: '', ready: 'An update is ready.', applying: 'Applying the latest game update…',
  'other-tabs': 'Close your other game windows, then try the update again.',
  unsafe: 'Finish your hunt before updating.', failed: 'The update could not finish. Reconnect and try again.',
};

export interface WhatsNew {
  /** Keep the version line and What's new in step with the offline worker. */
  updateState(state: OfflineUpdateState): void;
  /** The update line for a ready update, naming its version once known. */
  readyText(): string;
  /** Once, after an update brings release notes this player has not seen. */
  showIfUpdated(): void;
}

/**
 * The home screen's version line and What's new: which version this copy is,
 * whether production has a newer one (and Update game when it is ready), and
 * the release notes. `onPublished` hears when production's version is known.
 */
export function mountWhatsNew(footer: HTMLElement, onPublished: () => void = () => {}): WhatsNew {
  const build = thisBuild();
  const label = versionText(build) + (import.meta.env.DEV ? ' · dev' : '');
  let state: OfflineUpdateState = 'none';
  let published: PublishedVersion | null = null;
  let checking = false;
  let mode: Mode = 'browse';
  let unseen: Release[] = [];

  const line = button('', () => open('browse', line), 'home-version');
  const badge = node('span', '', 'home-version-badge'); badge.hidden = true;
  line.append(node('span', label), badge);
  line.setAttribute('aria-haspopup', 'dialog');
  line.title = 'What’s new';
  footer.append(line);

  const dialog = node('dialog', '', 'home-dialog home-news'); dialog.setAttribute('aria-labelledby', 'home-news-title');
  const header = node('header'); const titles = node('div');
  const eyebrow = node('p', '', 'home-eyebrow');
  const title = node('h2', `Version ${build.version}`); title.id = 'home-news-title';
  titles.append(eyebrow, title);
  const close = button('Close', () => dialog.close(), 'home-dialog-close');
  header.append(titles, close);
  const content = node('div', '', 'home-dialog-content home-news-content');
  const pager = node('div', '', 'home-dialog-pager');
  dialog.append(header, content, pager); document.body.append(dialog);
  const status = node('section', '', 'home-news-status');
  const update = button('Update game', requestOfflineUpdate, 'home-update');
  let fit: FitPager | null = null;
  let opener: HTMLElement | undefined;
  dialog.addEventListener('close', () => opener?.focus({ preventScroll: true }));

  const newer = () => (published && published.commit !== build.commit ? published : null);
  const workerUpdates = () => 'serviceWorker' in navigator && window.isSecureContext;

  function renderStatus(): void {
    const versions = node('dl', '', 'home-news-versions');
    versions.append(node('dt', 'Playing'), node('dd', label));
    const latest = newer();
    if (published) {
      // Production's own label, so a release can be checked against its commit.
      const value = node('dd', published.label);
      if (!latest) value.append(node('span', 'You’re up to date.', 'home-news-same'));
      versions.append(node('dt', 'Latest'), value);
    } else if (checking) versions.append(node('dt', 'Latest'), node('dd', 'Checking…'));
    status.replaceChildren(versions);
    if (mode === 'updated') status.append(node('p', 'Here’s what changed since you last played.', 'home-news-lead'));
    if (latest) {
      // What the newer version brings beyond the notes this copy already has.
      const notes = releasesAfter(latest.releases, build.releases[0]?.through).flatMap(release => release.notes);
      if (notes.length) {
        const shown = notes.slice(0, NEW_NOTES_SHOWN);
        if (notes.length > shown.length) shown.push(`And ${notes.length - shown.length} more`);
        status.append(node('p', 'New in the update:', 'home-news-lead'), notesList(shown));
      }
    }
    if (state !== 'none') {
      const message = state !== 'ready' ? UPDATE_MESSAGES[state] : latest ? 'It’s ready.' : UPDATE_MESSAGES.ready;
      status.append(node('p', message, 'home-news-lead'), update);
    } else if (latest) {
      status.append(node('p', workerUpdates()
        ? 'It’s downloading. Update game appears here when it’s ready.'
        : 'Reload the page to play it.', 'home-news-lead'));
    }
  }

  function check(): void {
    if (checking) return;
    checking = true;
    void fetchPublishedVersion().then(result => {
      published = result; checking = false;
      renderStatus(); onPublished();
    });
  }

  function open(next: Mode, from?: HTMLElement): void {
    mode = next; opener = from;
    eyebrow.textContent = mode === 'updated' ? 'JUST UPDATED' : 'WHAT’S NEW';
    const releases = mode === 'updated' ? unseen : build.releases;
    const runs = readingRuns(releases).map(run => {
      const section = node('section', '', run.day ? 'home-news-day' : 'home-news-day home-news-more');
      if (run.day) section.append(node('h3', run.day));
      section.append(notesList(run.notes));
      return section;
    });
    if (!runs.length) runs.push(node('p', 'This copy has no release notes.', 'home-news-lead'));
    content.replaceChildren(status, ...runs);
    if (mode === 'browse') check();
    renderStatus();
    if (!dialog.open) dialog.showModal();
    close.focus({ preventScroll: true });
    fit ??= fitPages(content, { nav: pager, key: 'home-news' });
    fit.refresh();
  }

  function readyText(): string {
    const latest = newer();
    return latest ? `${latest.label} is ready.` : UPDATE_MESSAGES.ready;
  }

  return {
    updateState(next) {
      state = next;
      badge.hidden = next === 'none';
      badge.textContent = next === 'applying' ? 'Updating…' : 'Update ready';
      update.disabled = next === 'applying';
      update.textContent = next === 'applying' ? 'Updating…' : 'Update game';
      // Learn which version the update is, for the update lines.
      if (next === 'ready' && !published) check();
      if (dialog.open) renderStatus();
    },
    readyText,
    showIfUpdated() {
      unseen = takeUnseenReleases(build.releases, savedStorage());
      if (unseen.length) open('updated');
    },
  };
}
