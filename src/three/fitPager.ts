/**
 * No-scroll menus. A container sized by its layout shows as many of its
 * sections as fit; when they do not all fit (a phone, a short window) the
 * sections are grouped into pages with a small Back / Next pager instead of
 * a scrollbar. Sections are the container's element children. Pages are
 * recomputed whenever the container or its content changes size.
 */
export interface FitPagerOptions {
  /** Where the pager controls go; hidden when everything fits. */
  nav: HTMLElement;
  /** Remembers the page across re-renders of the same view. */
  key: string;
  /** Called after the visible page changes. */
  onPage?: (page: number, pages: number) => void;
}

const remembered = new Map<string, number>();

export interface FitPager { refresh(): void; dispose(): void; page(): number; pages(): number }

export function fitPages(container: HTMLElement, options: FitPagerOptions): FitPager {
  const { nav, key } = options;
  let pages: HTMLElement[][] = [];
  let current = remembered.get(key) ?? 0;
  let frame = 0;
  let measuring = false;
  const sections = () => Array.from(container.children).filter((el): el is HTMLElement =>
    el instanceof HTMLElement && !el.hasAttribute('data-fit-ignore') && !el.hidden);
  // Paging uses its own class so a section's own hidden state is untouched.
  const setOff = (section: HTMLElement, off: boolean) => section.classList.toggle('fit-off', off);
  const overflows = () => container.scrollHeight > container.clientHeight + 1 || container.scrollWidth > container.clientWidth + 1;

  const back = document.createElement('button');
  back.type = 'button'; back.className = 'fit-nav-button fit-back'; back.innerHTML = '<span aria-hidden="true">‹</span> Back';
  const next = document.createElement('button');
  next.type = 'button'; next.className = 'fit-nav-button fit-next'; next.innerHTML = 'More <span aria-hidden="true">›</span>';
  const dots = document.createElement('div');
  dots.className = 'fit-dots'; dots.setAttribute('role', 'tablist'); dots.setAttribute('aria-label', 'Pages');
  const status = document.createElement('span');
  status.className = 'fit-status'; status.setAttribute('aria-live', 'polite');
  nav.classList.add('fit-nav');
  nav.replaceChildren(back, dots, status, next);
  back.addEventListener('click', () => go(current - 1, true));
  next.addEventListener('click', () => go(current + 1, true));

  function show(page: number): void {
    const visible = new Set(pages[page] ?? []);
    for (const section of pages.flat()) setOff(section, pages.length > 1 && !visible.has(section));
  }

  function renderNav(): void {
    const many = pages.length > 1;
    nav.hidden = !many;
    container.classList.toggle('fit-paged', many);
    if (!many) return;
    back.disabled = current === 0;
    next.disabled = current === pages.length - 1;
    status.textContent = `${current + 1} of ${pages.length}`;
    dots.replaceChildren(...pages.map((_, index) => {
      const dot = document.createElement('button');
      dot.type = 'button'; dot.className = 'fit-dot'; dot.setAttribute('role', 'tab');
      dot.setAttribute('aria-selected', String(index === current)); dot.setAttribute('aria-label', `Page ${index + 1}`);
      dot.addEventListener('click', () => go(index, true));
      return dot;
    }));
  }

  function go(page: number, focus = false): void {
    const target = Math.max(0, Math.min(pages.length - 1, page));
    if (target === current && pages.length) return;
    current = target; remembered.set(key, current);
    show(current); renderNav();
    if (focus) {
      const first = pages[current]?.[0]?.querySelector<HTMLElement>('button:not(:disabled),[href],input,select,[tabindex="0"]');
      first?.focus({ preventScroll: true });
    }
    container.scrollTop = 0;
    options.onPage?.(current, pages.length);
  }

  function measure(): void {
    if (measuring || !container.isConnected) return;
    measuring = true;
    try {
      // Sections the stylesheet hides (touch-only or desktop-only copy) are
      // not content on this screen and never make up a page.
      for (const section of sections()) setOff(section, false);
      const all = sections().filter(section => section.getClientRects().length > 0);
      const focused = document.activeElement instanceof HTMLElement && container.contains(document.activeElement) ? document.activeElement : null;
      // Everything first: most desktop screens need no pages at all.
      for (const section of all) setOff(section, false);
      nav.hidden = true; container.classList.remove('fit-paged', 'fit-tight');
      if (!overflows() || all.length < 2) { pages = [all]; current = 0; renderNav(); container.classList.toggle('fit-tight', overflows()); return; }
      // Reserve the pager's own room, then fill pages greedily in order.
      nav.hidden = false; container.classList.add('fit-paged');
      pages = [];
      let page: HTMLElement[] = [];
      for (const section of all) setOff(section, true);
      for (const section of all) {
        setOff(section, false);
        if (page.length && overflows()) {
          for (const shown of page) setOff(shown, true);
          pages.push(page); page = [];
        }
        page.push(section);
      }
      if (page.length) pages.push(page);
      // A single section taller than the space is compressed by CSS.
      let tight = false;
      for (let index = 0; index < pages.length && !tight; index++) { show(index); tight = overflows(); }
      container.classList.toggle('fit-tight', tight);
      current = Math.min(focused ? Math.max(0, pages.findIndex(p => p.some(s => s.contains(focused)))) : current, pages.length - 1);
      remembered.set(key, current);
      show(current); renderNav();
    } finally { measuring = false; }
  }

  const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
  // The container, and every section in it: art loading, a section
  // appearing or text changing all re-page.
  const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => { if (!measuring) schedule(); });
  const observeAll = () => { resize?.disconnect(); resize?.observe(container); for (const el of Array.from(container.children)) resize?.observe(el); };
  observeAll();
  const mutations = typeof MutationObserver === 'undefined' ? null : new MutationObserver(() => { if (!measuring) { observeAll(); schedule(); } });
  mutations?.observe(container, { childList: true, attributes: true, subtree: true, attributeFilter: ['hidden'] });
  const keys = (event: KeyboardEvent) => {
    if (pages.length < 2 || event.defaultPrevented) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('input,select,textarea,[role=radiogroup],[role=slider]')) return;
    if (event.key === 'PageDown') { event.preventDefault(); go(current + 1, true); }
    else if (event.key === 'PageUp') { event.preventDefault(); go(current - 1, true); }
  };
  container.addEventListener('keydown', keys);
  // Content loaded later (art, the dog stage) can change heights.
  container.addEventListener('load', schedule, true);
  measure();
  schedule();

  return {
    refresh: schedule,
    page: () => current,
    pages: () => pages.length,
    dispose() {
      cancelAnimationFrame(frame); resize?.disconnect(); mutations?.disconnect();
      container.removeEventListener('keydown', keys); container.removeEventListener('load', schedule, true);
      for (const section of sections()) setOff(section, false);
      nav.hidden = true; nav.replaceChildren();
    },
  };
}
