/** The tailgate photo in the field report: a print beside the day's bag
 * that opens full size, and the picture to save. Plain DOM, no innerHTML. */

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function saveLink(full: string, fileName: string): HTMLAnchorElement {
  const link = node('a', 'tailgate-save', 'Save photo');
  link.href = full; link.download = fileName;
  return link;
}

/** Open the picture full size in a modal; Escape or Close returns to the report. */
export function openTailgatePhoto(full: string, fileName: string, opener?: HTMLElement): void {
  if (document.getElementById('tailgate-view')) return;
  const dialog = node('dialog', 'tailgate-view'); dialog.id = 'tailgate-view';
  dialog.setAttribute('aria-label', 'Tailgate photo');
  const image = node('img'); image.src = full; image.alt = 'The day’s birds on the tailgate, the dog beside the truck.';
  const actions = node('div', 'tailgate-view-actions');
  const close = node('button', 'tailgate-close', 'Close'); close.type = 'button';
  close.addEventListener('click', () => dialog.close());
  actions.append(saveLink(full, fileName), close);
  dialog.append(image, actions);
  dialog.addEventListener('close', () => { dialog.remove(); if (opener?.isConnected) opener.focus({ preventScroll: true }); }, { once: true });
  document.body.append(dialog); dialog.showModal(); close.focus({ preventScroll: true });
}

/** Lead the field notes with the print, beside where the day was and the bag. */
export function renderTailgatePhoto(container: HTMLElement, full: string, fileName: string): void {
  if (container.querySelector('.tailgate-photo')) return;
  const figure = node('figure', 'tailgate-photo');
  const open = node('button', 'tailgate-print'); open.type = 'button';
  open.setAttribute('aria-label', 'Open the tailgate photo');
  const image = node('img'); image.src = full; image.alt = 'The day’s birds on the tailgate, the dog beside the truck.';
  open.append(image);
  open.addEventListener('click', () => openTailgatePhoto(full, fileName, open));
  const caption = node('figcaption', undefined, 'On the tailgate · ');
  caption.append(saveLink(full, fileName));
  figure.append(open, caption);
  const hero = node('div', 'field-notes-hero'), side = node('div', 'field-notes-hero-text');
  for (const selector of ['.field-notes-location', '.field-notes-bag']) {
    const part = container.querySelector(selector);
    if (part) side.append(part);
  }
  hero.append(figure, side);
  container.prepend(hero);
}

/** "uplandin-quail-fields-2026-10-02.jpg" */
export function tailgateFileName(areaId: string, date = new Date()): string {
  const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return `uplandin-${areaId}-${day}.jpg`;
}
