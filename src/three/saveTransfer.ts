import { loadCareer } from '../game/career';
import { applySave, describeCareer, exportSave, parseSave, SAVE_MAX_BYTES, saveFileName, type SaveFile } from '../game/saveFile';

/** Settings section: export the career and settings to a file, or import
 * one in its place after the player confirms what will be replaced. */

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function storage(): Storage | null {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

function download(save: SaveFile): void {
  const blob = new Blob([JSON.stringify(save)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), link = node('a');
  link.href = url; link.download = saveFileName();
  document.body.append(link); link.click(); link.remove();
  // Give the browser time to hand the download off before releasing it.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

const exportedLabel = (iso: string) => {
  const date = iso ? new Date(iso) : null;
  return date && !Number.isNaN(date.getTime()) ? ` from ${date.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}` : '';
};

export function saveTransferSection(): HTMLElement {
  const section = node('section', 'save-transfer'); section.setAttribute('aria-label', 'Your save');
  section.append(node('p', 'help', 'Your career, kennel, journal and settings live in this browser. Keep a copy, or carry them to another device.'));
  const actions = node('div', 'save-actions');
  const exporter = node('button', 'secondary', 'Export save'); exporter.type = 'button'; exporter.id = 'save-export';
  const importer = node('button', 'secondary', 'Import save…'); importer.type = 'button'; importer.id = 'save-import';
  const file = node('input'); file.type = 'file'; file.accept = '.json,application/json'; file.hidden = true; file.id = 'save-file';
  actions.append(exporter, importer, file);
  const status = node('p', 'save-status'); status.setAttribute('role', 'status');
  const confirm = node('div', 'save-confirm'); confirm.hidden = true;
  section.append(actions, status, confirm);

  exporter.addEventListener('click', () => {
    const store = storage();
    if (!store) { status.textContent = 'This browser isn’t keeping saves, so there is nothing to export.'; return; }
    download(exportSave(store));
    status.textContent = `Saved ${saveFileName()} · ${describeCareer(loadCareer(store))}.`;
  });
  importer.addEventListener('click', () => { file.value = ''; file.click(); });
  file.addEventListener('change', async () => {
    const chosen = file.files?.[0];
    confirm.hidden = true; confirm.replaceChildren();
    if (!chosen) return;
    if (chosen.size > SAVE_MAX_BYTES) { status.textContent = 'That file is too large to be an Uplandin save.'; return; }
    const read = parseSave(await chosen.text());
    if (!read.ok) { status.textContent = read.message; return; }
    status.textContent = '';
    // Nothing is replaced until the player says so.
    const here = describeCareer(loadCareer(storage()));
    const question = node('p', undefined, here === 'No career yet'
      ? `Import the save${exportedLabel(read.save.exportedAt)} (${describeCareer(read.save.career)})?`
      : `Replace the career on this device (${here}) with the save${exportedLabel(read.save.exportedAt)} (${describeCareer(read.save.career)})? This can’t be undone; export this one first to keep it.`);
    const replace = node('button', 'primary', here === 'No career yet' ? 'Import' : 'Replace'); replace.type = 'button'; replace.id = 'save-replace';
    const keep = node('button', 'secondary', 'Keep this one'); keep.type = 'button';
    keep.addEventListener('click', () => { confirm.hidden = true; confirm.replaceChildren(); status.textContent = 'Nothing was changed.'; importer.focus(); });
    replace.addEventListener('click', () => {
      const store = storage();
      if (!store || !applySave(read.save, store)) { status.textContent = 'This browser wouldn’t store the save. Nothing was changed.'; return; }
      status.textContent = 'Save imported. Reloading…';
      location.reload();
    });
    const buttons = node('div', 'save-actions'); buttons.append(replace, keep);
    confirm.append(question, buttons); confirm.hidden = false; replace.focus();
  });
  return section;
}
