import './menuSelect.css';

export interface MenuSelects {
  /** Call after changing source options, values, disabled state, or mounted controls. */
  sync(): void;
  /** Restore native controls. Safe before replacing a screen; does not move focus. */
  destroy(): void;
}

type Entry = {
  select: HTMLSelectElement;
  trigger: HTMLButtonElement;
  value: HTMLSpanElement;
  abort: AbortController;
  tabIndex: string | null;
  ariaHidden: string | null;
};
type Choice = { option: HTMLOptionElement; button: HTMLButtonElement };
const owners = new WeakMap<HTMLSelectElement, object>();
let nextId = 0;

function optionAvailable(option: HTMLOptionElement): boolean {
  const group = option.parentElement;
  return !option.disabled && !option.hidden
    && !(group?.tagName === 'OPTGROUP' && ((group as HTMLOptGroupElement).disabled || group.hidden));
}

function labelFor(select: HTMLSelectElement): string {
  const explicit = select.getAttribute('aria-label');
  if (explicit) return explicit;
  const labelled = select.getAttribute('aria-labelledby')?.split(/\s+/)
    .map(id => select.ownerDocument.getElementById(id)?.textContent?.trim() ?? '').filter(Boolean).join(' ');
  if (labelled) return labelled;
  // Nested labels also contain options and the enhanced trigger; neither is
  // part of the field name. Clone only to read, never alter the source label.
  const labels = Array.from(select.labels ?? []).map(label => {
    const copy = label.cloneNode(true) as HTMLElement;
    copy.querySelectorAll('select,button').forEach(control => control.remove());
    return copy.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }).filter(Boolean).join(' ');
  return labels || select.name || 'Choose an option';
}

/** Progressive enhancement: native selects remain the sole value/form authority. */
export function enhanceMenuSelects(root: ParentNode): MenuSelects {
  const doc = (root as Node).ownerDocument ?? (root as Document);
  const win = doc.defaultView;
  const dialog = doc.createElement('dialog');
  // Older browsers retain fully usable native selects, without hidden controls.
  if (!win || !doc.body || typeof dialog.showModal !== 'function') return { sync() {}, destroy() {} };
  const manager = {}, entries = new Map<HTMLSelectElement, Entry>();
  const abort = new AbortController(), { signal } = abort;
  let active: Entry | null = null, choices: Choice[] = [], cursor = -1, destroyed = false;
  let prefix = '', typedAt = 0;
  dialog.className = 'menu-select-dialog';
  dialog.id = `menu-select-dialog-${++nextId}`;
  const header = doc.createElement('div'); header.className = 'menu-select-header';
  const title = doc.createElement('h2'); title.id = `${dialog.id}-title`;
  const closeButton = doc.createElement('button'); closeButton.type = 'button';
  closeButton.className = 'menu-select-close'; closeButton.textContent = '×';
  closeButton.setAttribute('aria-label', 'Close choices');
  const list = doc.createElement('div'); list.className = 'menu-select-options';
  list.setAttribute('role', 'listbox'); list.setAttribute('aria-labelledby', title.id);
  dialog.setAttribute('aria-labelledby', title.id);
  header.append(title, closeButton); dialog.append(header, list); doc.body.append(dialog);

  function close(restoreFocus = true): void {
    const previous = active;
    active = null; choices = []; cursor = -1; prefix = '';
    previous?.trigger.setAttribute('aria-expanded', 'false');
    if (dialog.open) dialog.close();
    if (restoreFocus && previous?.trigger.isConnected && !previous.trigger.disabled) previous.trigger.focus();
  }

  function focusChoice(index: number): void {
    if (!choices[index] || choices[index].button.disabled) return;
    cursor = index;
    choices.forEach((choice, i) => { choice.button.tabIndex = i === index ? 0 : -1; });
    const button = choices[index].button;
    button.focus({ preventScroll: true }); button.scrollIntoView({ block: 'nearest' });
  }

  function position(): void {
    if (!active || !dialog.open) return;
    const view = win!.visualViewport;
    const width = view?.width ?? win!.innerWidth, height = view?.height ?? win!.innerHeight;
    const x = view?.offsetLeft ?? 0, y = view?.offsetTop ?? 0, margin = 12;
    const sheet = width <= 600 || (height <= 560 && win!.matchMedia('(pointer: coarse)').matches);
    dialog.dataset.layout = sheet ? 'sheet' : 'popover';
    const bounds = active.trigger.getBoundingClientRect();
    const panelWidth = Math.max(0, Math.min(width - margin * 2, sheet ? 560 : Math.max(280, Math.min(420, bounds.width))));
    dialog.style.width = `${panelWidth}px`;
    const below = y + height - margin - bounds.bottom - 6, above = bounds.top - y - margin - 6;
    const useBelow = below >= Math.min(260, above);
    const available = sheet ? Math.min(480, height * .84, height - margin * 2)
      : Math.max(0, Math.min(420, height - margin * 2, Math.max(0, useBelow ? below : above)));
    dialog.style.maxHeight = `${available}px`;
    dialog.style.left = `${sheet ? x + (width - panelWidth) / 2 : Math.max(x + margin, Math.min(bounds.left, x + width - margin - panelWidth))}px`;
    // Measure after setting width/height, so wrapped descriptions never escape.
    const panelHeight = dialog.getBoundingClientRect().height;
    const top = sheet ? y + height - margin - panelHeight : useBelow ? bounds.bottom + 6 : bounds.top - 6 - panelHeight;
    dialog.style.top = `${Math.max(y + margin, Math.min(top, y + height - margin - panelHeight))}px`;
  }

  function choose(choice: Choice): void {
    const entry = active;
    if (!entry || entry.select.matches(':disabled') || entry.select.hidden || !optionAvailable(choice.option)) return;
    const index = Array.from(entry.select.options).indexOf(choice.option);
    if (index < 0) { sync(); return; }
    const changed = entry.select.selectedIndex !== index;
    close();
    if (changed) {
      entry.select.selectedIndex = index;
      // Existing handlers (including full preparation rerenders) own the
      // mutation. Close first, then read their final authoritative value.
      entry.select.dispatchEvent(new win!.Event('input', { bubbles: true }));
      entry.select.dispatchEvent(new win!.Event('change', { bubbles: true }));
    }
    if (!destroyed) sync();
  }

  function renderChoices(focus = false): void {
    if (!active) return;
    const prior = choices[cursor]?.option, priorValue = prior?.value;
    title.textContent = labelFor(active.select);
    const next: Choice[] = [];
    let group: Element | null = null;
    for (const option of Array.from(active.select.options)) {
      const parent = option.parentElement;
      if (option.hidden || (parent?.tagName === 'OPTGROUP' && parent.hidden)) continue;
      if (parent?.tagName === 'OPTGROUP' && parent !== group) {
        const heading = doc.createElement('div'); heading.className = 'menu-select-group';
        heading.textContent = (parent as HTMLOptGroupElement).label;
        list.append(heading); group = parent;
      }
      const button = doc.createElement('button'); button.type = 'button';
      button.className = 'menu-select-option'; button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', String(option.selected)); button.tabIndex = -1;
      button.disabled = !optionAvailable(option);
      const words = doc.createElement('span'); words.className = 'menu-select-words';
      const name = doc.createElement('span'); name.className = 'menu-select-option-name'; name.textContent = option.label;
      words.append(name);
      if (option.dataset.description) {
        const description = doc.createElement('span'); description.className = 'menu-select-description';
        description.textContent = option.dataset.description; words.append(description);
      }
      const check = doc.createElement('span'); check.className = 'menu-select-check';
      check.textContent = '✓'; check.setAttribute('aria-hidden', 'true'); button.append(words, check);
      const choice = { option, button }; next.push(choice); list.append(button);
      // These nodes are discarded as a unit; no retained per-option listener registry.
      button.addEventListener('click', () => choose(choice));
      button.addEventListener('focus', () => { cursor = choices.indexOf(choice); });
    }
    choices = next;
    const available = (choice: Choice) => !choice.button.disabled;
    cursor = choices.findIndex(choice => available(choice) && (choice.option === prior || (priorValue !== undefined && choice.option.value === priorValue)));
    if (cursor < 0) cursor = choices.findIndex(choice => available(choice) && choice.option.selected);
    if (cursor < 0) cursor = choices.findIndex(available);
    if (cursor >= 0) choices[cursor].button.tabIndex = 0;
    if (focus && cursor >= 0) focusChoice(cursor);
  }

  function open(entry: Entry, edge?: 'first' | 'last'): void {
    sync();
    if (destroyed || !entries.has(entry.select) || entry.trigger.disabled || entry.trigger.hidden) return;
    if (active) close(false);
    active = entry; prefix = ''; typedAt = 0;
    list.replaceChildren(); renderChoices();
    try { dialog.showModal(); } catch {
      // A disconnected or unsupported modal must never strand a hidden field.
      active = null; remove(entry); entry.select.focus(); return;
    }
    entry.trigger.setAttribute('aria-expanded', 'true'); position();
    if (edge) cursor = edge === 'first' ? choices.findIndex(choice => !choice.button.disabled)
      : choices.reduce((last, choice, index) => choice.button.disabled ? last : index, -1);
    if (cursor >= 0) focusChoice(cursor); else closeButton.focus();
  }

  function typeahead(key: string): void {
    const now = performance.now(), char = key.toLocaleLowerCase();
    prefix = now - typedAt > 700 ? char : prefix + char; typedAt = now;
    // Repeated letters cycle, while a phrase narrows to one label.
    const search = [...prefix].every(letter => letter === char) ? char : prefix;
    const start = search.length === 1 ? cursor + 1 : Math.max(0, cursor);
    for (let offset = 0; offset < choices.length; offset++) {
      const index = (start + offset) % choices.length, choice = choices[index];
      if (!choice.button.disabled && choice.option.label.trim().toLocaleLowerCase().startsWith(search)) { focusChoice(index); break; }
    }
  }

  function remove(entry: Entry): void {
    if (active === entry) close(false);
    entry.abort.abort(); entry.trigger.remove(); entry.select.classList.remove('menu-select-native');
    for (const [name, value] of [['tabindex', entry.tabIndex], ['aria-hidden', entry.ariaHidden]]) {
      if (value === null) entry.select.removeAttribute(name!); else entry.select.setAttribute(name!, value!);
    }
    entries.delete(entry.select); owners.delete(entry.select);
  }

  function sync(): void {
    if (destroyed) return;
    const sources = new Set(root.querySelectorAll<HTMLSelectElement>('select'));
    for (const entry of entries.values()) if (!sources.has(entry.select) || entry.select.multiple || entry.select.size > 1) remove(entry);
    for (const select of sources) {
      if (select.multiple || select.size > 1 || (owners.has(select) && owners.get(select) !== manager)) continue;
      let entry = entries.get(select);
      if (!entry) {
        const trigger = doc.createElement('button'); trigger.type = 'button'; trigger.className = 'menu-select-trigger';
        const value = doc.createElement('span'); value.className = 'menu-select-value';
        const chevron = doc.createElement('span'); chevron.className = 'menu-select-chevron'; chevron.setAttribute('aria-hidden', 'true');
        trigger.append(value, chevron);
        entry = { select, trigger, value, abort: new AbortController(), tabIndex: select.getAttribute('tabindex'), ariaHidden: select.getAttribute('aria-hidden') };
        const owned = entry, options = { signal: entry.abort.signal };
        trigger.addEventListener('click', event => { event.stopPropagation(); open(owned); }, options);
        trigger.addEventListener('keydown', event => {
          if (['Enter', ' ', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
            event.preventDefault(); event.stopPropagation(); open(owned, event.key === 'Home' ? 'first' : event.key === 'End' ? 'last' : undefined);
          } else if (event.key.length === 1 && event.key !== ' ' && !event.ctrlKey && !event.metaKey && !event.altKey) {
            event.preventDefault(); event.stopPropagation(); open(owned); typeahead(event.key);
          }
        }, options);
        select.addEventListener('change', sync, options); select.addEventListener('input', sync, options);
        select.addEventListener('invalid', event => { event.preventDefault(); open(owned); }, options);
        select.after(trigger); owners.set(select, manager); entries.set(select, entry);
        select.classList.add('menu-select-native'); select.tabIndex = -1; select.setAttribute('aria-hidden', 'true');
      }
      entry.value.textContent = select.selectedOptions[0]?.label ?? 'Choose…';
      entry.trigger.dataset.menuSelectFor = select.id;
      entry.trigger.disabled = select.matches(':disabled') || !Array.from(select.options).some(optionAvailable);
      entry.trigger.hidden = select.hidden;
      entry.trigger.setAttribute('aria-label', `${labelFor(select)}: ${entry.value.textContent}`);
      entry.trigger.setAttribute('aria-haspopup', 'dialog'); entry.trigger.setAttribute('aria-controls', dialog.id);
      entry.trigger.setAttribute('aria-expanded', String(active === entry));
      const description = select.getAttribute('aria-describedby');
      if (description) entry.trigger.setAttribute('aria-describedby', description); else entry.trigger.removeAttribute('aria-describedby');
    }
    if (active) {
      if (active.trigger.disabled || active.select.closest('[hidden]') || !active.trigger.isConnected) close(false);
      else {
        const focused = list.contains(doc.activeElement);
        list.replaceChildren(); renderChoices(focused); position();
      }
    }
  }

  dialog.addEventListener('keydown', event => {
    // The field's document-level Escape/Tab/shortcut handlers must not run
    // underneath the native modal, including on its Close button.
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); close(); return; }
    if (event.key === 'Tab') {
      const option = choices[cursor]?.button;
      if (!option) return;
      if ((event.shiftKey && doc.activeElement === closeButton) || (!event.shiftKey && doc.activeElement === option)) {
        event.preventDefault(); (event.shiftKey ? option : closeButton).focus();
      }
      return;
    }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const enabled = choices.map((choice, i) => choice.button.disabled ? -1 : i).filter(i => i >= 0);
      if (!enabled.length) return;
      const current = enabled.indexOf(cursor);
      const index = event.key === 'Home' ? 0 : event.key === 'End' ? enabled.length - 1
        : (current + (event.key === 'ArrowDown' ? 1 : -1) + enabled.length) % enabled.length;
      focusChoice(enabled[index]);
    } else if ((event.key === 'Enter' || event.key === ' ') && doc.activeElement !== closeButton && cursor >= 0) {
      event.preventDefault(); choose(choices[cursor]);
    } else if (event.key.length === 1 && event.key !== ' ' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault(); typeahead(event.key);
    }
  }, { signal });
  dialog.addEventListener('keyup', event => event.stopPropagation(), { signal });
  dialog.addEventListener('cancel', event => { event.preventDefault(); event.stopPropagation(); close(); }, { signal });
  dialog.addEventListener('close', () => { if (!dialog.open) close(); }, { signal });
  dialog.addEventListener('click', event => {
    event.stopPropagation();
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
  }, { signal });
  closeButton.addEventListener('click', () => close(), { signal });
  root.addEventListener('click', event => {
    const target = event.target as Element | null;
    if (!target?.closest || target.closest('button,a,input,select,textarea')) return;
    const label = target.closest('label') as HTMLLabelElement | null;
    const entry = label?.control ? entries.get(label.control as HTMLSelectElement) : undefined;
    if (entry) { event.preventDefault(); event.stopPropagation(); open(entry); }
  }, { signal });
  root.addEventListener('reset', () => { queueMicrotask(() => { if (!destroyed) sync(); }); }, { signal });
  win.addEventListener('resize', position, { signal });
  win.addEventListener('scroll', position, { signal, capture: true });
  win.visualViewport?.addEventListener('resize', position, { signal });
  win.visualViewport?.addEventListener('scroll', position, { signal });
  sync();
  return { sync, destroy() {
    if (destroyed) return;
    destroyed = true; close(false); abort.abort();
    for (const entry of entries.values()) remove(entry);
    dialog.remove();
  } };
}
