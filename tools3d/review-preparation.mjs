#!/usr/bin/env node
/** Disposable browser profiles exercise preparation, save boundaries and the
 * real field handoff. No forced hunt outcome or live player save is involved. */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer';

const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const base = option('--url', 'http://127.0.0.1:4605');
const out = resolve(option('--out', 'output/production-wave-three/preparation'));
const selected = option('--cases', '').split(',').filter(Boolean);
mkdirSync(out, { recursive: true });
const report = { base, scope: 'Real UI actions with disposable save fixtures. No human shooting or phone performance claim.', cases: [], result: 'running', errors: [] };
const browser = await puppeteer.launch({ headless: true });
async function click(page, selector) {
  // The fixed launch bar is deliberately above the page. Bring the desired
  // control into the usable viewport, as a person scrolling to it would.
  await page.$eval(selector, element => element.scrollIntoView({ block: 'center', inline: 'nearest' }));
  assert.equal(await page.$eval(selector, element => {
    const box = element.getBoundingClientRect();
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return element === hit || element.contains(hit);
  }), true, `The control ${selector} is covered`);
  await page.click(selector);
}
const key = 'uplandin.career.v1';
const advanced = {
  version: 2, hunts: 14, downed: 25, escaped: 30, areas: {},
  kennel: [{ id: 'dog-1', name: 'Sage', breedId: 'gsp', level: 4, xp: 170, bornSeason: 1 },
    { id: 'dog-2', name: 'Boone', breedId: 'english-setter', level: 3, xp: 80, bornSeason: 1 }],
  activeDogId: 'dog-1', braceDogId: 'dog-2',
  hunter: { level: 7, xp: 429, shotgunId: 'over-under', truckTier: 0, dogBoxTier: 1 },
  regionsUnlocked: ['southern-plains'], date: { season: 2, week: 22 }, homeRegionId: 'southern-plains',
};
async function scenario(name, viewport, fixture, action) {
  if (selected.length && !selected.includes(name)) return;
  const context = await browser.createBrowserContext(), page = await context.newPage();
  const record = { name, errors: [] }; report.cases.push(record);
  page.on('pageerror', e => record.errors.push(String(e)));
  await page.setViewport({ ...viewport, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  if (fixture) await page.evaluateOnNewDocument(value => {
    if (!sessionStorage.getItem('prep-fixture')) {
      localStorage.setItem('uplandin.career.v1', JSON.stringify(value)); sessionStorage.setItem('prep-fixture', '1');
    }
  }, fixture);
  const screenshot = async suffix => {
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Page overflows horizontally');
    await page.screenshot({ path: resolve(out, `${name}-${suffix}.png`), fullPage: true });
  };
  try { await action(page, record, screenshot); }
  catch (error) {
    record.failureUrl = page.url();
    await page.screenshot({ path: resolve(out, `${name}-failure.png`) });
    throw error;
  }
  assert.deepEqual(record.errors, []); await context.close();
}
try {
  await scenario('quick-landscape', { width: 844, height: 390 }, advanced, async (page, record, screenshot) => {
    // Returning from a standalone Chukar link must override an older Quick
    // preference without changing the property on the next loadout edit.
    await page.goto(`${base}/prepare3d.html?mode=quick&area=chukar-ridge&drop=west-track`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('#prep-start');
    const saved = await page.evaluate(key => localStorage.getItem(key), key);
    await page.select('#prep-breed', 'english-setter');
    assert.equal(await page.$eval('#prep-area', el => el.value), 'chukar-ridge');
    await page.select('#prep-gun', 'over-under');
    await click(page, '.hunt-options summary');
    await page.select('#prep-quality', 'lite');
    await page.select('#prep-challenge', 'relaxed');
    await page.select('#prep-level', '7');
    await click(page, '.hunt-options summary');
    await page.select('#prep-weather', 'frost'); await page.select('#prep-wind', 'strong');
    await page.select('#prep-quick-brace', 'gsp');
    await click(page, '#mode-career'); await click(page, '#mode-quick');
    assert.equal(await page.$eval('#prep-area', el => el.value), 'chukar-ridge');
    assert.equal(await page.$eval('#prep-drop', el => el.value), 'west-track');
    assert.equal(await page.$eval('#prep-breed', el => el.value), 'english-setter');
    assert.equal(await page.$eval('#prep-level', el => el.value), '7');
    await screenshot('setup');
    assert.equal(await page.evaluate(key => localStorage.getItem(key), key), saved);
    await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), page.click('#prep-start')]);
    await page.waitForFunction(() => window.__ready3d, { timeout: 60000 });
    record.launch = await page.evaluate(() => ({ url: location.href, title: document.getElementById('field-title').textContent,
      config: JSON.parse(localStorage.getItem('uplandin.quick.v1')), gun: document.getElementById('shotgun-setting').value }));
    assert.match(record.launch.url, /play=quick/); assert.match(record.launch.url, /drop=west-track/);
    assert.equal(record.launch.title, 'Chukar Ridge'); assert.equal(record.launch.gun, 'over-under');
    assert.equal(record.launch.config.breedId, 'english-setter'); assert.equal(record.launch.config.areaId, 'chukar-ridge');
    assert.equal(record.launch.config.weather, 'frost'); assert.equal(record.launch.config.wind, 'strong'); assert.equal(record.launch.config.breed2Id, 'gsp');
    await click(page, '#enter-field'); await click(page, '#pause-hunt'); await click(page, '#end-hunt');
    await page.waitForSelector('#hunt-summary:not([hidden])');
    assert.equal(await page.evaluate(key => localStorage.getItem(key), key), saved, 'Quick hunt changed career');
    await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), page.click('#hunt-menu')]);
    assert.ok(new URL(page.url()).pathname.endsWith('/prepare3d.html'));
    await page.waitForSelector('#prep-area'); assert.equal(await page.$eval('#prep-area', el => el.value), 'chukar-ridge');
  });
  await scenario('new-career-portrait', { width: 390, height: 844 }, null, async (page, record, screenshot) => {
    await page.goto(`${base}/prepare3d.html?mode=career`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('#puppy-name');
    await page.setViewport({ width: 320, height: 740, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Small phone setup overflows horizontally');
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
    assert.equal(await page.evaluate(key => localStorage.getItem(key), key), null, 'Viewing setup wrote a career');
    await page.type('#puppy-name', 'Sage'); await page.select('#puppy-breed', 'english-setter');
    await page.select('#home-region', 'great-basin'); await page.select('#prep-drop', 'west-track');
    assert.equal(await page.$eval('#puppy-name', el => el.value), 'Sage', 'Changing breed erased the typed name');
    assert.equal(await page.$eval('#puppy-breed', el => el.value), 'english-setter');
    assert.equal(await page.$eval('#home-region', el => el.value), 'great-basin');
    await page.select('#puppy-breed', 'gsp'); await page.select('#home-region', 'southern-plains');
    await screenshot('first-season'); await click(page, '#prep-dog-save');
    await page.waitForSelector('#prep-calendar');
    record.created = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
    assert.equal(record.created.kennel.length, 1); assert.equal(record.created.homeRegionId, 'southern-plains');
    assert.equal(record.created.hunts, 0); assert.equal(record.created.date.week, 0);
    assert.equal(await page.$eval('#prep-start', el => el.disabled), true);
    await click(page, '#prep-calendar');
    assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).date.week, key), 9);
    await page.select('#prep-area', 'chukar-ridge'); assert.equal(await page.$eval('#prep-start', el => el.disabled), true, 'Level1 travel was allowed');
    await page.select('#prep-area', 'quail-fields'); await screenshot('ready');
    await click(page, '.hunt-options summary'); await page.select('#prep-quality', 'lite');
    await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), page.click('#prep-start')]);
    await page.waitForFunction(() => window.__ready3d, { timeout: 60000 });
    assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).date.week, key), 9, 'Launching charged a week');
    await click(page, '#enter-field'); await click(page, '#pause-hunt'); await click(page, '#end-hunt');
    await page.waitForSelector('#hunt-summary:not([hidden])');
    const result = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
    assert.equal(result.hunts, 1); assert.equal(result.date.week, 10); assert.equal(result.recentHunts.length, 1);
    await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), page.click('#hunt-menu')]);
    assert.equal(new URL(page.url()).searchParams.get('mode'), 'career');
    await page.waitForSelector('#prep-journal'); await click(page, '#prep-journal');
    await page.waitForSelector('#hunt-journal[open]'); assert.equal(await page.$$eval('.hunt-journal-list li', rows => rows.length), 1);
    await screenshot('journal'); await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'prep-journal');
  });
  await scenario('career-season-end', { width: 1280, height: 800 }, advanced, async (page, record, screenshot) => {
    await page.goto(`${base}/prepare3d.html?mode=career`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('#prep-calendar'); await screenshot('before');
    assert.equal(await page.$eval('#prep-start', el => el.disabled), true);
    assert.match(await page.$eval('#prep-calendar', el => el.textContent), /Start season 3/);
    await click(page, '#prep-calendar');
    record.nextSeason = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
    assert.deepEqual(record.nextSeason.date, { season: 3, week: 0 }); assert.equal(record.nextSeason.hunts, 14);
    assert.equal(record.nextSeason.kennel.length, 2); assert.equal(record.nextSeason.braceDogId, 'dog-2');
    await page.select('#prep-area', 'grouse-woods'); await page.select('#prep-dog', 'dog-2');
    await page.select('#prep-brace', 'dog-1'); await page.select('#prep-gun', 'semi-auto');
    await page.select('#prep-drop', 'west-track');
    await click(page, '#mode-career'); await click(page, '#mode-quick'); await click(page, '#mode-career');
    assert.equal(await page.$eval('#prep-area', el => el.value), 'grouse-woods');
    assert.equal(await page.$eval('#prep-drop', el => el.value), 'west-track');
    assert.equal(await page.$eval('#prep-dog', el => el.value), 'dog-2');
    assert.equal(await page.$eval('#prep-brace', el => el.value), 'dog-1');
    assert.equal(await page.$eval('#prep-gun', el => el.value), 'semi-auto');
    assert.equal(await page.$eval('#prep-start', el => el.disabled), false);
    const snapshot = await page.evaluate(key => localStorage.getItem(key), key);
    await click(page, '#prep-journal'); await click(page, '#hunt-journal-close');
    assert.equal(await page.evaluate(key => localStorage.getItem(key), key), snapshot);
    await screenshot('ready');
    await click(page, '.hunt-options summary'); await page.select('#prep-quality', 'lite');
    await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), page.click('#prep-start')]);
    await page.waitForFunction(() => window.__ready3d, { timeout: 60000 });
    const launched = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
    assert.equal(launched.activeDogId, 'dog-2'); assert.equal(launched.braceDogId, 'dog-1'); assert.equal(launched.hunter.shotgunId, 'semi-auto');
    assert.equal(launched.hunts, 14); assert.equal(launched.hunter.xp, 429); assert.deepEqual(launched.date, { season: 3, week: 0 });
  });
  await scenario('legacy-active-dog', { width: 844, height: 390 }, { ...advanced, activeDogId: null, braceDogId: null, date: { season: 2, week: 9 } }, async (page, record, screenshot) => {
    await page.goto(`${base}/prepare3d.html?mode=career`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('#prep-dog');
    await page.select('#prep-dog', 'dog-2'); assert.equal(await page.$eval('#prep-start', el => el.disabled), false);
    assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).activeDogId, key), null, 'Browsing wrote a missing active dog');
    const other = await page.browserContext().newPage();
    await other.goto(`${base}/prepare3d.html?mode=quick`, { waitUntil: 'domcontentloaded' });
    await other.evaluate(key => { const career = JSON.parse(localStorage.getItem(key)); career.hunts = 23; career.hunter.xp = 450; localStorage.setItem(key, JSON.stringify(career)); }, key);
    await page.waitForFunction(() => document.getElementById('preparation-message').textContent.includes('another tab'));
    await other.close(); await page.bringToFront();
    await page.select('#prep-dog', 'dog-2'); await click(page, '.hunt-options summary'); await page.select('#prep-quality', 'lite');
    await screenshot('recovered');
    await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), page.click('#prep-start')]);
    await page.waitForFunction(() => window.__ready3d, { timeout: 60000 });
    record.saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
    assert.equal(record.saved.activeDogId, 'dog-2'); assert.equal(record.saved.hunts, 23); assert.equal(record.saved.hunter.xp, 450);
  });
  await scenario('storage-unavailable', { width: 390, height: 844 }, null, async (page, record, screenshot) => {
    await page.evaluateOnNewDocument(() => { Storage.prototype.setItem = () => { throw new DOMException('Full', 'QuotaExceededError'); }; });
    await page.goto(`${base}/prepare3d.html?mode=career`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('#puppy-name'); await page.type('#puppy-name', 'Sage'); await click(page, '#prep-dog-save');
    assert.match(await page.$eval('#preparation-message', el => el.textContent), /could not save/);
    assert.equal(await page.$eval('#puppy-name', el => el.value), 'Sage');
    assert.equal(await page.evaluate(key => localStorage.getItem(key), key), null);
    await screenshot('preserved-draft');
  });
  report.result = 'passed';
} catch (error) { report.result = 'failed'; report.errors.push(String(error.stack ?? error)); process.exitCode = 1; }
finally { await browser.close(); writeFileSync(resolve(out, 'report.json'), JSON.stringify(report, null, 2)); }
