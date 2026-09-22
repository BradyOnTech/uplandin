import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { prepareInstalledHuntUrl } from '../src/three/offline';

function storage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, values };
}

it('restores standalone choices for the installed 3D icon with a fresh hunt, never its old seed', () => {
  const save = storage();
  prepareInstalledHuntUrl('https://game.test/hunt/index3d.html?area=chukar-ridge&drop=west-track&breed=gsp&coat=liver-white&dog=generated&gun=over-under&challenge=relaxed&quality=lite&seed=42', save);
  const installed = prepareInstalledHuntUrl('https://game.test/hunt/index3d.html?installed=1', save, () => 500);
  expect(installed.pathname).toBe('/hunt/index3d.html');
  expect(installed.searchParams.get('area')).toBe('chukar-ridge');
  expect(installed.searchParams.get('challenge')).toBe('relaxed');
  expect(installed.searchParams.get('gun')).toBe('over-under');
  expect(installed.searchParams.get('quality')).toBe('lite');
  expect(installed.searchParams.get('seed')).toBe('500');
  expect(installed.searchParams.has('installed')).toBe(false);
  expect([...save.values.values()].join('')).not.toContain('seed');
  expect(prepareInstalledHuntUrl('https://game.test/hunt/index3d.html?installed=1', save, () => 501).searchParams.get('seed')).toBe('501');
});

it('leaves ordinary deep links and explicit replay seeds unchanged', () => {
  const save = storage();
  prepareInstalledHuntUrl('https://game.test/index3d.html?area=quail-fields&drop=south-gate', save);
  const link = 'https://game.test/index3d.html?area=sharptail-prairie&seed=42';
  expect(prepareInstalledHuntUrl(link, save).href).toBe(link);
});

it('never turns an installed launch into a captured, practice or career hunt', () => {
  const save = storage();
  prepareInstalledHuntUrl('https://game.test/index3d.html?area=chukar-ridge&dog=generated', save);
  prepareInstalledHuntUrl('https://game.test/index3d.html?play=career&area=pheasant-coverts&seed=8', save);
  prepareInstalledHuntUrl('https://game.test/index3d.html?capture=1&area=quail-fields', save);
  const installed = prepareInstalledHuntUrl('https://game.test/index3d.html?installed=1', save, () => 9);
  expect(installed.searchParams.get('area')).toBe('chukar-ridge');
  expect(installed.searchParams.has('play')).toBe(false);
  expect(installed.searchParams.has('capture')).toBe(false);
});

it('uses the generated dog for a new install and tolerates denied storage', () => {
  const denied = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
  const installed = prepareInstalledHuntUrl('https://game.test/index3d.html?installed=1', denied, () => 7);
  expect(installed.searchParams.get('dog')).toBe('generated');
  expect(installed.searchParams.get('seed')).toBe('7');
});

it('keeps an explicit installed property and drop ahead of saved choices', () => {
  const save = storage();
  prepareInstalledHuntUrl('https://game.test/index3d.html?area=quail-fields&drop=south-gate&dog=rigged', save);
  const installed = prepareInstalledHuntUrl('https://game.test/index3d.html?installed=1&area=chukar-ridge&drop=west-track&dog=generated', save, () => 2);
  expect(installed.searchParams.get('drop')).toBe('west-track');
  expect(installed.searchParams.get('dog')).toBe('generated');
});

it('keeps separate 3D and 2D installed launches and relative icons at both deployment depths', () => {
  const three = JSON.parse(readFileSync(new URL('../public/manifest3d.webmanifest', import.meta.url), 'utf8'));
  const two = JSON.parse(readFileSync(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'));
  expect(two.start_url).toBe('./');
  for (const base of ['https://game.test/', 'https://game.test/play/']) {
    expect(new URL(three.start_url, base).href).toBe(`${base}index3d.html?installed=1`);
    expect(new URL(three.id, base).href).toBe(`${base}index3d.html`);
    for (const icon of three.icons) expect(new URL(icon.src, base).href).toBe(`${base}${icon.src.slice(2)}`);
  }
});
