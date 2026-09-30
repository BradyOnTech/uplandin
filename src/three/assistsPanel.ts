import { DOG_RANGES, type DogRange } from '../game/dogRange';
import { ASSIST_PRESETS, TRACKING_ASSISTS, matchingPreset, presetAssists, type AssistPreset, type HuntAssists, type TrackingAssist } from '../game/huntAssists';
import { huntAssists, onHuntAssists, setHuntAssists } from './assistsRuntime';
import './assists.css';

interface Options {
  /** A career hunter's earned tracking tier; higher gear is shown but locked. */
  earnedTier?: number | null;
  /** Compact rows for tight menus. */
  compact?: boolean;
  signal?: AbortSignal;
  /** Heading level text; omit for none. */
  title?: string;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};

/** A segmented single choice that behaves as a radio group from the keyboard. */
function segmented<T extends string>(label: string, options: { id: T; label: string; disabled?: boolean; title?: string }[],
  value: () => T, choose: (id: T) => void): { root: HTMLElement; sync(): void } {
  const root = el('div', 'assist-segmented');
  root.setAttribute('role', 'radiogroup'); root.setAttribute('aria-label', label);
  const buttons = options.map(option => {
    const button = el('button', 'assist-chip', option.label) as HTMLButtonElement;
    button.type = 'button'; button.dataset.value = option.id; button.setAttribute('role', 'radio');
    if (option.title) button.title = option.title;
    button.disabled = !!option.disabled;
    button.addEventListener('click', () => choose(option.id));
    button.addEventListener('keydown', event => {
      const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
      if (!step) return;
      event.preventDefault();
      const enabled = options.filter(o => !o.disabled);
      const index = enabled.findIndex(o => o.id === value());
      const next = enabled[(index + step + enabled.length) % enabled.length];
      choose(next.id);
      root.querySelector<HTMLButtonElement>(`[data-value="${next.id}"]`)?.focus();
    });
    root.append(button);
    return button;
  });
  const sync = () => {
    for (const button of buttons) {
      const on = button.dataset.value === value();
      button.setAttribute('aria-checked', String(on)); button.tabIndex = on ? 0 : -1;
      button.classList.toggle('on', on);
    }
  };
  sync();
  return { root, sync };
}

function toggle(label: string, value: () => boolean, set: (on: boolean) => void): { root: HTMLElement; sync(): void } {
  const button = el('button', 'assist-switch') as HTMLButtonElement;
  button.type = 'button'; button.setAttribute('role', 'switch'); button.setAttribute('aria-label', label);
  button.append(el('span', 'assist-switch-track'), el('span', 'assist-switch-state'));
  button.addEventListener('click', () => set(!value()));
  const sync = () => {
    const on = value();
    button.setAttribute('aria-checked', String(on)); button.classList.toggle('on', on);
    button.querySelector('.assist-switch-state')!.textContent = on ? 'On' : 'Off';
  };
  sync();
  return { root: button, sync };
}

/**
 * Difficulty presets and the individual assists behind them. Every change
 * applies at once, in the field as well as in the menus; changing a single
 * assist turns the preset into Custom.
 */
export function createAssistsPanel(options: Options = {}): HTMLElement {
  const root = el('section', `assists-panel${options.compact ? ' compact' : ''}`);
  if (options.title) {
    root.append(el('p', 'field-section-kicker', 'DIFFICULTY'), el('h3', 'assists-title', options.title));
  }
  const earned = options.earnedTier ?? null;
  const apply = (next: HuntAssists) => setHuntAssists(next);
  const change = (patch: Partial<HuntAssists>) => apply({ ...huntAssists(), ...patch });

  const presetIds = Object.keys(ASSIST_PRESETS) as AssistPreset[];
  const current = () => matchingPreset(huntAssists()) ?? 'custom';
  const presets = segmented<AssistPreset | 'custom'>('Difficulty', [
    ...presetIds.map(id => ({ id, label: ASSIST_PRESETS[id].label })),
    { id: 'custom' as const, label: 'Custom', disabled: true, title: 'Change any assist below' },
  ], current, id => { if (id !== 'custom') apply(presetAssists(id, huntAssists().dogRange)); });
  presets.root.classList.add('assist-presets');
  const note = el('p', 'assist-note');
  note.setAttribute('aria-live', 'polite');
  root.append(presets.root, note);

  const rows = el('div', 'assist-rows');
  const row = (label: string, control: HTMLElement, help?: HTMLElement) => {
    const line = el('div', 'assist-row');
    const text = el('div', 'assist-row-text');
    text.append(el('span', 'assist-row-label', label));
    if (help) text.append(help);
    line.append(text, control);
    rows.append(line);
  };

  const trackingIds = Object.keys(TRACKING_ASSISTS) as TrackingAssist[];
  const trackingHelp = el('small', 'assist-row-help');
  const tracking = segmented<TrackingAssist>('Dog tracking', trackingIds.map(id => ({
    id, label: TRACKING_ASSISTS[id].label,
    disabled: earned !== null && TRACKING_ASSISTS[id].gearTier > earned,
    title: earned !== null && TRACKING_ASSISTS[id].gearTier > earned ? 'Earned with hunter levels' : TRACKING_ASSISTS[id].description,
  })), () => huntAssists().tracking, id => change({ tracking: id }));
  row('Dog tracking', tracking.root, trackingHelp);

  const map = toggle('Survey map', () => huntAssists().surveyMap, on => change({ surveyMap: on }));
  row('Survey map', map.root, el('small', 'assist-row-help', 'The property atlas on M.'));
  const ring = toggle('Aiming ring', () => huntAssists().aimRing, on => change({ aimRing: on }));
  row('Aiming ring', ring.root, el('small', 'assist-row-help', 'Off: shoot off the bead on the rib.'));
  const hints = toggle('Control hints', () => huntAssists().hints, on => change({ hints: on }));
  row('Control hints', hints.root, el('small', 'assist-row-help', 'Key reminders and first-hunt tips.'));

  const rangeIds = Object.keys(DOG_RANGES) as DogRange[];
  const rangeHelp = el('small', 'assist-row-help');
  const range = segmented<DogRange>('Dog range', rangeIds.map(id => ({ id, label: DOG_RANGES[id].label })),
    () => huntAssists().dogRange, id => change({ dogRange: id }));
  row('Dog range', range.root, rangeHelp);
  root.append(rows);

  const sync = () => {
    const assists = huntAssists(), preset = matchingPreset(assists);
    presets.sync(); tracking.sync(); map.sync(); ring.sync(); hints.sync(); range.sync();
    note.textContent = preset ? ASSIST_PRESETS[preset].description : 'Custom: your own mix of assists.';
    const tier = TRACKING_ASSISTS[assists.tracking];
    trackingHelp.textContent = earned !== null && tier.gearTier > earned
      ? `${tier.description} Not yet earned: you carry ${TRACKING_ASSISTS[trackingIds.find(id => TRACKING_ASSISTS[id].gearTier === earned) ?? 'bell'].label}.`
      : tier.description;
    rangeHelp.textContent = DOG_RANGES[assists.dogRange].description;
  };
  sync();
  onHuntAssists(sync, options.signal);
  return root;
}
