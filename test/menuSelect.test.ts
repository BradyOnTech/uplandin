import { describe, expect, it, vi } from 'vitest';
import { enhanceMenuSelects } from '../src/three/menuSelect';

// A small DOM contract fixture, not a layout engine. Real modal focus trapping,
// native browser rendering and touch-sheet fit are separately browser-reviewed.
type Listener = { run: EventListenerOrEventListenerObject; signal?: AbortSignal };
class Target {
  listeners = new Map<string, Listener[]>();
  addEventListener(type: string, run: EventListenerOrEventListenerObject, options?: AddEventListenerOptions) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push({ run, signal: options?.signal }); this.listeners.set(type, listeners);
  }
  dispatchEvent(event: Event): boolean {
    if (!event.target) Object.defineProperty(event, 'target', { value: this, configurable: true });
    for (const { run, signal } of [...this.listeners.get(event.type) ?? []]) {
      if (!signal?.aborted) typeof run === 'function' ? run.call(this as unknown as EventTarget, event) : run.handleEvent(event);
    }
    if (event.bubbles && !event.cancelBubble && this instanceof Element && this.parentElement) this.parentElement.dispatchEvent(event);
    return !event.defaultPrevented;
  }
}
class Element extends Target {
  children: Element[] = []; parentElement: Element | null = null;
  attributes = new Map<string, string>(); dataset: Record<string, string> = {};
  style: Record<string, string> = {}; hidden = false; disabled = false; type = ''; name = '';
  ownText = ''; rect = { left: 60, top: 100, width: 300, height: 46 };
  constructor(public tagName: string, public ownerDocument: Document) { super(); }
  get id() { return this.getAttribute('id') ?? ''; } set id(value) { this.setAttribute('id', value); }
  get className() { return this.getAttribute('class') ?? ''; } set className(value) { this.setAttribute('class', value); }
  classList = {
    add: (name: string) => { this.className = [...new Set([...this.className.split(' ').filter(Boolean), name])].join(' '); },
    remove: (name: string) => { this.className = this.className.split(' ').filter(part => part !== name).join(' '); },
    contains: (name: string) => this.className.split(' ').includes(name),
  };
  get textContent(): string { return this.ownText + this.children.map(child => child.textContent).join(''); }
  set textContent(value: string) { this.replaceChildren(); this.ownText = value; }
  get tabIndex() { return Number(this.getAttribute('tabindex') ?? 0); } set tabIndex(value) { this.setAttribute('tabindex', String(value)); }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  removeAttribute(name: string) { this.attributes.delete(name); }
  append(...children: Element[]) { for (const child of children) { child.remove(); child.parentElement = this; this.children.push(child); } }
  after(child: Element) { child.remove(); child.parentElement = this.parentElement; this.parentElement!.children.splice(this.parentElement!.children.indexOf(this) + 1, 0, child); }
  remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this); this.parentElement = null; }
  replaceChildren(...children: Element[]) { for (const child of [...this.children]) child.remove(); this.ownText = ''; this.append(...children); }
  get isConnected(): boolean { return this === this.ownerDocument.body || !!this.parentElement?.isConnected; }
  contains(node: Element | null): boolean { return node === this || this.children.some(child => child.contains(node)); }
  matches(selector: string): boolean {
    return selector.split(',').some(part => {
      if (part === ':disabled') return this.disabled || !!this.parentElement?.closest('fieldset:disabled');
      if (part === 'fieldset:disabled') return this.tagName === 'FIELDSET' && this.disabled;
      if (part === '[hidden]') return this.hidden;
      if (part.startsWith('.')) return this.classList.contains(part.slice(1));
      return this.tagName === part.toUpperCase();
    });
  }
  closest(selector: string): Element | null { return this.matches(selector) ? this : this.parentElement?.closest(selector) ?? null; }
  querySelectorAll(selector: string): Element[] { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
  querySelector(selector: string) { return this.querySelectorAll(selector)[0] ?? null; }
  cloneNode(deep: boolean): Element {
    const result = this.ownerDocument.createElement(this.tagName); result.attributes = new Map(this.attributes); result.ownText = this.ownText;
    if (deep) result.append(...this.children.map(child => child.cloneNode(true)));
    return result;
  }
  get control(): Element | null { return this.getAttribute('for') ? this.ownerDocument.getElementById(this.getAttribute('for')!) : this.querySelector('select'); }
  focus() { this.ownerDocument.activeElement = this; this.dispatchEvent(new Event('focus')); }
  scrollIntoView = vi.fn();
  getBoundingClientRect() {
    let { left, top, width, height } = this.rect;
    if (this.tagName === 'DIALOG') {
      left = parseFloat(this.style.left ?? '0'); top = parseFloat(this.style.top ?? '0'); width = parseFloat(this.style.width ?? '300');
      height = Math.min(60 + this.querySelectorAll('.menu-select-option').length * 46, parseFloat(this.style.maxHeight ?? '1000'));
    }
    return { left, top, right: left + width, bottom: top + height, width, height };
  }
}
class Option extends Element {
  value = ''; get label() { return this.getAttribute('label') ?? this.textContent; } set label(value) { this.setAttribute('label', value); }
  get selected() { const parent = this.closest('select') as Select | null; return parent?.selectedOptions.includes(this) ?? false; }
}
class Select extends Element {
  multiple = false; size = 0; selectedIndex = 0;
  get options(): Option[] { return this.querySelectorAll('option') as Option[]; }
  get selectedOptions() { return this.options.filter((_, i) => i === this.selectedIndex); }
  get value() { return this.selectedOptions[0]?.value ?? ''; }
  set value(value: string) { this.selectedIndex = this.options.findIndex(option => option.value === value); }
  get labels() { return this.ownerDocument.body.querySelectorAll('label').filter(label => label.control === this); }
}
class Dialog extends Element {
  open = false;
  showModal() { this.open = true; }
  close() { this.open = false; this.dispatchEvent(new Event('close')); }
}
class Window extends Target {
  innerWidth = 1000; innerHeight = 700; coarse = false; Event = Event;
  visualViewport?: Target & { width: number; height: number; offsetLeft: number; offsetTop: number };
  matchMedia() { return { matches: this.coarse }; }
}
class Document extends Target {
  defaultView = new Window(); body = new Element('BODY', this); activeElement: Element | null = null;
  supported = true;
  createElement(tag: string): Element {
    tag = tag.toUpperCase();
    if (tag === 'SELECT') return new Select(tag, this);
    if (tag === 'OPTION') return new Option(tag, this);
    if (tag === 'DIALOG') {
      const dialog = new Dialog(tag, this);
      if (!this.supported) Object.defineProperty(dialog, 'showModal', { value: undefined });
      return dialog;
    }
    return new Element(tag, this);
  }
  getElementById(id: string): Element | null {
    const visit = (root: Element): Element | null => root.id === id ? root : root.children.map(visit).find(Boolean) ?? null;
    return visit(this.body);
  }
}
function key(target: Element, value: string, shiftKey = false) {
  const event = new Event('keydown', { bubbles: true, cancelable: true });
  Object.assign(event, { key: value, shiftKey }); target.dispatchEvent(event); return event;
}
function click(target: Element) { target.dispatchEvent(new Event('click', { bubbles: true, cancelable: true })); }
function fixture({ supported = true, width = 1000, height = 700, coarse = false } = {}) {
  const doc = new Document(); doc.supported = supported;
  Object.assign(doc.defaultView, { innerWidth: width, innerHeight: height, coarse });
  const root = doc.createElement('form'); doc.body.append(root);
  const add = (id = 'shotgun', words = ['Over & under', 'Side by side', 'Semi-auto']) => {
    const label = doc.createElement('label'), title = doc.createElement('span'); title.textContent = 'Shotgun';
    const select = doc.createElement('select') as Select; select.id = id; select.name = id;
    for (const text of words) {
      const option = doc.createElement('option') as Option; option.value = text.toLowerCase().replaceAll(' ', '-'); option.textContent = text; select.append(option);
    }
    label.append(title, select); root.append(label); return select;
  };
  const select = add();
  const enhance = () => enhanceMenuSelects(root as unknown as ParentNode);
  const trigger = (id = 'shotgun') => root.querySelectorAll('.menu-select-trigger').find(button => button.dataset.menuSelectFor === id)!;
  const dialog = () => doc.body.querySelector('.menu-select-dialog') as Dialog;
  const options = () => dialog().querySelectorAll('.menu-select-option');
  return { doc, root, select, add, enhance, trigger, dialog, options };
}

describe('menu select native authority and lifecycle', () => {
  it('keeps unsupported and multiple selects native; restores original accessibility on destroy', () => {
    const fallback = fixture({ supported: false }); const untouched = fallback.enhance();
    expect(fallback.trigger()).toBeUndefined(); expect(fallback.select.className).toBe(''); untouched.destroy();
    const f = fixture(); f.select.setAttribute('tabindex', '3'); f.select.setAttribute('aria-hidden', 'false');
    const multi = f.add('brace'); multi.multiple = true;
    const manager = f.enhance(); const again = f.enhance();
    expect(f.root.querySelectorAll('.menu-select-trigger')).toHaveLength(1);
    expect(f.select.id).toBe('shotgun'); expect(f.select.name).toBe('shotgun'); expect(f.select.options).toHaveLength(3);
    expect(f.select.tabIndex).toBe(-1); expect(f.select.getAttribute('aria-hidden')).toBe('true');
    expect(f.trigger().getAttribute('aria-label')).toBe('Shotgun: Over & under');
    manager.destroy(); again.destroy();
    expect(f.select.tabIndex).toBe(3); expect(f.select.getAttribute('aria-hidden')).toBe('false');
    expect(f.select.classList.contains('menu-select-native')).toBe(false); expect(f.doc.body.querySelectorAll('dialog')).toHaveLength(0);
  });

  it('commits through the original input/change contracts, descriptions and selected check state', () => {
    const f = fixture(); f.select.options[1].dataset.description = 'Two barrels, one useful choice.';
    const changes: string[] = [];
    f.select.addEventListener('input', () => changes.push(`input:${f.select.value}`));
    f.select.addEventListener('change', () => changes.push(`change:${f.select.value}`));
    const manager = f.enhance(); click(f.trigger());
    expect(f.dialog().open).toBe(true); expect(f.options()[0].getAttribute('aria-selected')).toBe('true');
    expect(f.options()[1].textContent).toContain('Two barrels, one useful choice.');
    click(f.options()[1]);
    expect(f.select.value).toBe('side-by-side'); expect(changes).toEqual(['input:side-by-side', 'change:side-by-side']);
    expect(f.dialog().open).toBe(false); expect(f.doc.activeElement).toBe(f.trigger());
    expect(f.trigger().textContent).toBe('Side by side');
    click(f.trigger()); click(f.options()[1]); expect(changes).toHaveLength(2);
    manager.destroy();
  });

  it('allows native change handlers to reject a choice or replace the preparation screen', () => {
    const f = fixture(); const manager = f.enhance();
    f.select.addEventListener('change', () => { f.select.value = 'over-&-under'; });
    click(f.trigger()); click(f.options()[2]);
    expect(f.select.value).toBe('over-&-under'); expect(f.trigger().textContent).toBe('Over & under');
    const oldTrigger = f.trigger(), oldDialog = f.dialog();
    f.select.addEventListener('change', () => { manager.destroy(); f.root.replaceChildren(); f.add('new-gun', ['Pump']); });
    click(oldTrigger); click(f.options()[1]);
    expect(oldDialog.open).toBe(false); expect(oldTrigger.isConnected).toBe(false);
    // Destroy must not explicitly focus a stale trigger after the handler.
    const replacement = f.enhance(); expect(f.trigger('new-gun').textContent).toBe('Pump');
    click(oldTrigger); expect(oldDialog.open).toBe(false);
    replacement.destroy();
  });

  it('syncs authoritative values/options/disabled state and discovers/removes controls without duplicates', () => {
    const f = fixture(), manager = f.enhance();
    f.select.value = 'semi-auto'; f.select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(f.trigger().textContent).toBe('Semi-auto');
    click(f.trigger()); f.select.disabled = true; manager.sync();
    expect(f.dialog().open).toBe(false); expect(f.trigger().disabled).toBe(true);
    click(f.trigger()); expect(f.dialog().open).toBe(false);
    f.select.disabled = false; const group = f.doc.createElement('optgroup'); group.disabled = true;
    const forbidden = f.doc.createElement('option') as Option; forbidden.textContent = 'Locked'; forbidden.value = 'locked'; group.append(forbidden);
    f.select.replaceChildren(group); f.select.selectedIndex = 0; manager.sync(); expect(f.trigger().disabled).toBe(true);
    const newSelect = f.add('quality', ['High', 'Lightweight']); manager.sync(); manager.sync();
    expect(f.root.querySelectorAll('.menu-select-trigger')).toHaveLength(2);
    click(f.trigger('quality')); const removed = f.trigger('quality'); newSelect.parentElement!.remove(); manager.sync();
    expect(f.dialog().open).toBe(false); expect(removed.isConnected).toBe(false);
    manager.destroy();
  });

  it('resets labels after native form reset and leaves no deferred work after destroy', async () => {
    const f = fixture(), manager = f.enhance(); f.select.value = 'semi-auto'; manager.sync();
    f.root.dispatchEvent(new Event('reset', { bubbles: true })); f.select.selectedIndex = 0;
    await Promise.resolve(); expect(f.trigger().textContent).toBe('Over & under');
    f.root.dispatchEvent(new Event('reset', { bubbles: true })); manager.destroy();
    await Promise.resolve(); expect(f.root.querySelectorAll('.menu-select-trigger')).toHaveLength(0);
  });
});

describe('menu select keyboard and viewport contracts', () => {
  it('navigates enabled choices without changing the value until Enter, with Home/End and typeahead', () => {
    const f = fixture(); f.select.options[1].disabled = true; const manager = f.enhance();
    key(f.trigger(), 'ArrowDown'); expect(f.doc.activeElement).toBe(f.options()[0]);
    key(f.doc.activeElement!, 'ArrowDown'); expect(f.doc.activeElement).toBe(f.options()[2]); expect(f.select.selectedIndex).toBe(0);
    key(f.doc.activeElement!, 'Home'); expect(f.doc.activeElement).toBe(f.options()[0]);
    key(f.doc.activeElement!, 'End'); expect(f.doc.activeElement).toBe(f.options()[2]);
    key(f.doc.activeElement!, 'o'); expect(f.doc.activeElement).toBe(f.options()[0]);
    key(f.doc.activeElement!, 'Enter'); expect(f.dialog().open).toBe(false);
    key(f.trigger(), 's'); expect(f.doc.activeElement).toBe(f.options()[2]);
    key(f.doc.activeElement!, 'Enter'); expect(f.select.selectedIndex).toBe(2);
    manager.destroy();
  });

  it('Escape cancels only this modal, preserves value, restores focus and contains keyboard events', () => {
    const f = fixture(), manager = f.enhance(); const fieldKey = vi.fn();
    f.doc.body.addEventListener('keydown', fieldKey); f.doc.body.addEventListener('keyup', fieldKey);
    click(f.trigger()); key(f.doc.activeElement!, 'End');
    const up = new Event('keyup', { bubbles: true }); f.doc.activeElement!.dispatchEvent(up);
    const escape = key(f.doc.activeElement!, 'Escape');
    expect(escape.defaultPrevented).toBe(true); expect(fieldKey).not.toHaveBeenCalled();
    expect(f.select.selectedIndex).toBe(0); expect(f.dialog().open).toBe(false); expect(f.doc.activeElement).toBe(f.trigger());
    click(f.trigger()); const cancel = new Event('cancel', { cancelable: true }); f.dialog().dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(true); expect(f.dialog().open).toBe(false);
    manager.destroy();
  });

  it('keeps current highlighted choice across explicit option sync and rejects removed/disabled choices', () => {
    const f = fixture(), manager = f.enhance(); click(f.trigger()); key(f.doc.activeElement!, 'End');
    const stale = f.options()[2]; f.select.options[2].disabled = true; manager.sync();
    expect(f.doc.activeElement).toBe(f.options()[0]);
    click(stale); expect(f.select.selectedIndex).toBe(0);
    const detached = f.options()[0]; f.select.replaceChildren(); manager.sync();
    click(detached); expect(f.dialog().open).toBe(false); expect(f.trigger().disabled).toBe(true);
    manager.destroy();
  });

  it.each([
    { width: 1000, height: 700, coarse: false, layout: 'popover' },
    { width: 390, height: 844, coarse: true, layout: 'sheet' },
    { width: 844, height: 390, coarse: true, layout: 'sheet' },
  ])('bounds the $layout within a $width × $height viewport with long lists', settings => {
    const f = fixture(settings); f.select.parentElement!.remove();
    f.add('long', Array.from({ length: 30 }, (_, i) => `Choice ${i + 1}`)); const manager = f.enhance();
    click(f.trigger('long')); expect(f.dialog().dataset.layout).toBe(settings.layout);
    const bounds = f.dialog().getBoundingClientRect();
    expect(bounds.left).toBeGreaterThanOrEqual(12); expect(bounds.top).toBeGreaterThanOrEqual(12);
    expect(bounds.right).toBeLessThanOrEqual(settings.width - 12); expect(bounds.bottom).toBeLessThanOrEqual(settings.height - 12);
    expect(f.options()).toHaveLength(30); expect(f.doc.activeElement).toBe(f.options()[0]); manager.destroy();
  });
});
