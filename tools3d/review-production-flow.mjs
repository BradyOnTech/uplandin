#!/usr/bin/env node
/** Real menu/replay interaction over disposable saved-career fixtures.
 * No live user storage, hunt state, camera or bird outcome is modified.
 * This checks results/launch wiring, not shooting feel or phone performance.
 */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer';
import { verifyEvidenceImage } from './evidence-image.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const base = option('--url', 'http://127.0.0.1:4606');
const out = resolve(option('--out', 'output/production-wave-one/flow'));
const selected = option('--cases', '').split(',').filter(Boolean);
mkdirSync(out, { recursive: true });
const report = { base, evidence: 'ordinary UI actions with isolated starting-save fixtures', cases: [], errors: [], result: 'running' };
const wait = ms => new Promise(done => setTimeout(done, ms));
const browser = await puppeteer.launch({ headless: true });
const startingCareer = week => ({
  version: 2, hunts: 0, downed: 0, escaped: 0, areas: {},
  kennel: [{ id: 'dog-1', name: 'Sage', breedId: 'gsp', level: 1, xp: 19, bornSeason: 1 }],
  activeDogId: 'dog-1', braceDogId: null,
  hunter: { level: 1, xp: 9, shotgunId: 'remington-870', truckTier: 0, dogBoxTier: 1 },
  regionsUnlocked: ['southern-plains'], date: { season: 1, week }, homeRegionId: 'southern-plains',
});
const journalHistory = () => Array.from({ length: 30 }, (_, i) => ({
  huntNumber: 40 - i, areaId: ['sharptail-prairie', 'chukar-ridge', 'quail-fields', 'pheasant-coverts'][i % 4],
  date: { season: 2, week: 20 - (i % 21) }, retrieved: 2, downed: 3, escaped: 7,
  pointFlushes: 4, doubles: 1, henDowns: i === 2 ? 1 : 0, hunterXp: 9,
  dogs: [{ name: 'Millie of the Northern Prairie', breedId: 'english-setter' }, { name: 'Boone', breedId: 'gsp' }],
}));
const cases = [
  ...['sharptail-prairie', 'chukar-ridge', 'quail-fields', 'pheasant-coverts'].map(area => ({
    name: `replay-${area}`, query: `area=${area}&breed=gsp&quality=lite&seed=1184004868`, width: 844, height: 390,
  })),
  { name: 'career-landscape', query: 'play=career&area=quail-fields&quality=lite&seed=11', width: 844, height: 390, week: 9 },
  { name: 'career-portrait', query: 'play=career&area=quail-fields&quality=lite&seed=11', width: 390, height: 844, week: 9 },
  { name: 'career-season-end', query: 'play=career&area=quail-fields&quality=lite&seed=11', width: 844, height: 390, week: 21 },
  { name: 'journal-full-landscape', query: 'play=career&area=quail-fields&quality=lite&seed=11', width: 844, height: 390, week: 9, journalOnly: 'full' },
  { name: 'journal-full-portrait', query: 'play=career&area=quail-fields&quality=lite&seed=11', width: 390, height: 844, week: 9, journalOnly: 'full' },
  { name: 'journal-legacy', query: 'play=career&area=quail-fields&quality=lite&seed=11', width: 390, height: 844, week: 9, journalOnly: 'legacy' },
];
try {
  for (const setup of cases.filter(item => !selected.length || selected.includes(item.name))) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    const item = { ...setup, errors: [] }; report.cases.push(item);
    page.on('pageerror', error => item.errors.push(String(error)));
    await page.setViewport({ width: setup.width, height: setup.height, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
    if (setup.week !== undefined) {
      // A one-time fixture before boot; replay must retain the settled save.
      await page.evaluateOnNewDocument(career => {
        if (!sessionStorage.getItem('production-flow-fixture')) {
          localStorage.setItem('uplandin.career.v1', JSON.stringify(career));
          sessionStorage.setItem('production-flow-fixture', '1');
        }
      }, { ...startingCareer(setup.week), ...(setup.journalOnly === 'full' ? { hunts: 40, recentHunts: journalHistory() }
        : setup.journalOnly === 'legacy' ? { hunts: 8 } : {}) });
    }
    await page.goto(`${base}/index3d.html?${setup.query}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__ready3d, { timeout: 60000 });
    const token = await page.evaluate(() => window.__evidenceBootToken = crypto.randomUUID());
    item.start = await page.evaluate(() => ({ seed: new URL(location.href).searchParams.get('seed'),
      generatedDog: window.__generatedDogAudit?.()?.source,
      career: localStorage.getItem('uplandin.career.v1'),
    }));
    assert.equal(item.start.generatedDog, 'generated-gsp', 'GSP default is inconsistent between maps');
    await page.tap('#enter-field');
    await page.waitForFunction(() => document.getElementById('field-overlay').hidden);
    await wait(150);
    await page.tap('#pause-hunt');
    await page.waitForFunction(() => !document.getElementById('field-overlay').hidden);
    await page.tap('#field-journal-open');
    await page.waitForSelector('#hunt-journal[open]');
    item.pauseJournal = await page.evaluate(() => {
      const dialog = document.getElementById('hunt-journal'), content = dialog.querySelector('.hunt-journal-content');
      const close = document.getElementById('hunt-journal-close').getBoundingClientRect();
      return { modal: dialog.matches(':modal'), count: dialog.querySelectorAll('li').length,
        copy: dialog.textContent, overflow: dialog.scrollWidth > dialog.clientWidth,
        scrollable: content.scrollHeight > content.clientHeight,
        closeVisible: close.height >= 44 && close.top >= 0 && close.bottom <= innerHeight,
        saved: localStorage.getItem('uplandin.career.v1') };
    });
    assert.equal(item.pauseJournal.saved, item.start.career, 'Opening the pause journal settled or changed a hunt');
    assert.equal(item.pauseJournal.modal, true); assert.equal(item.pauseJournal.overflow, false);
    assert.equal(item.pauseJournal.closeVisible, true);
    assert.equal(item.pauseJournal.count, setup.journalOnly === 'full' ? 30 : 0);
    if (setup.journalOnly === 'legacy') assert.match(item.pauseJournal.copy, /earlier hunts.*career totals/);
    if (setup.journalOnly) {
      await page.screenshot({ path: resolve(out, `${setup.name}.png`) });
      if (setup.journalOnly === 'full') {
        assert.equal(item.pauseJournal.scrollable, true);
        await page.evaluate(() => {
          const content = document.querySelector('.hunt-journal-content'); content.scrollTop = content.scrollHeight;
        });
        await page.screenshot({ path: resolve(out, `${setup.name}-last.png`) });
      }
    }
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('hunt-journal'));
    assert.equal(await page.evaluate(() => document.getElementById('field-overlay').hidden), false, 'Escape resumed the paused hunt behind the journal');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'field-journal-open');
    if (setup.journalOnly) {
      assert.equal(await page.evaluate(() => localStorage.getItem('uplandin.career.v1')), item.start.career);
      assert.deepEqual(item.errors, []); await context.close(); continue;
    }
    await page.tap('#end-hunt');
    await page.waitForFunction(() => !document.getElementById('hunt-summary').hidden);
    item.summary = await page.evaluate(() => {
      const button = id => {
        const el = document.getElementById(id), r = el.getBoundingClientRect();
        return { hidden: el.hidden, text: el.textContent, height: r.height, top: r.top, bottom: r.bottom,
          accessible: !el.hidden && document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === el };
      };
      return { copy: document.getElementById('hunt-summary-copy').textContent,
        career: localStorage.getItem('uplandin.career.v1'), again: button('hunt-again'), menu: button('hunt-menu'),
        focused: document.activeElement.id, overflow: document.documentElement.scrollWidth > innerWidth };
    });
    assert.equal(item.summary.overflow, false);
    assert.ok(item.summary.menu.accessible && item.summary.menu.height >= 44 && item.summary.menu.bottom <= setup.height);
    if (setup.week !== undefined) {
      assert.match(item.summary.copy, /Hunter level 2 reached/);
      assert.match(item.summary.copy, /Newly available/);
      assert.match(item.summary.copy, /the truck/);
      assert.match(item.summary.copy, /27 XP to level 3/);
      const career = JSON.parse(item.summary.career);
      assert.equal(career.hunts, 1); assert.equal(career.hunter.level, 2);
      assert.equal(career.date.week, setup.week + 1);
      assert.equal(career.recentHunts.length, 1);
      assert.equal(career.recentHunts[0].date.week, setup.week, 'Journal changed the date to the following week');
      item.awardVisible = await page.evaluate(() => {
        const heading = document.querySelector('.field-notes-career h3').getBoundingClientRect();
        const footer = document.querySelector('.hunt-summary-actions').getBoundingClientRect();
        const top = document.getElementById('hunt-summary-content').getBoundingClientRect().top;
        return heading.top >= top && heading.bottom <= footer.top;
      });
      assert.equal(item.awardVisible, true, 'Career achievement is hidden below the initial results fold');
    } else assert.equal(item.summary.career, item.start.career, 'Standalone hunt changed career');
    await wait(350);
    assert.equal(await page.evaluate(() => localStorage.getItem('uplandin.career.v1')), item.summary.career);
    const file = resolve(out, `${setup.name}.png`);
    const png = await page.screenshot({ path: file, clip: { x: 0, y: 0, width: setup.width, height: setup.height } });
    item.image = { file, ...await verifyEvidenceImage(page, png, token) };
    await page.tap('#summary-journal-open');
    await page.waitForSelector('#hunt-journal[open]');
    item.journal = await page.evaluate(() => ({
      modal: document.getElementById('hunt-journal').matches(':modal'),
      count: document.querySelectorAll('.hunt-journal-list > li').length,
      copy: document.getElementById('hunt-journal').textContent,
      overflow: document.getElementById('hunt-journal').scrollWidth > document.getElementById('hunt-journal').clientWidth,
      saved: localStorage.getItem('uplandin.career.v1'),
    }));
    assert.equal(item.journal.modal, true); assert.equal(item.journal.overflow, false);
    assert.equal(item.journal.saved, item.summary.career, 'Reading journal changed the career');
    assert.equal(item.journal.count, setup.week === undefined ? 0 : 1);
    if (setup.week !== undefined) assert.match(item.journal.copy, /Hunt 1.*Quail Fields/);
    else assert.match(item.journal.copy, /Complete a Career hunt/);
    await page.screenshot({ path: resolve(out, `${setup.name}-journal.png`) });
    // Escape closes only the native journal and returns to the same summary.
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('hunt-journal'));
    assert.equal(await page.evaluate(() => document.activeElement.id), 'summary-journal-open');
    assert.equal(await page.evaluate(() => document.getElementById('hunt-summary').hidden), false);
    if (setup.week === 21) {
      assert.equal(item.summary.again.hidden, true);
      assert.equal(item.summary.menu.text, 'Return home');
      assert.equal(item.summary.focused, 'hunt-menu');
      assert.match(item.summary.copy, /season is complete/);
      const nextVisible = await page.evaluate(() => {
        const next = [...document.querySelectorAll('.field-notes-career p')].find(p => p.textContent.includes('season is complete'));
        return next.getBoundingClientRect().bottom <= document.querySelector('.hunt-summary-actions').getBoundingClientRect().top;
      });
      assert.ok(nextVisible, 'Season transition instruction is below the initial results fold');
      await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), page.tap('#hunt-menu')]);
      assert.ok(new URL(page.url()).pathname.endsWith('/index.html'));
    } else {
      assert.ok(item.summary.again.accessible && item.summary.again.height >= 44);
      await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), page.tap('#hunt-again')]);
      await page.waitForFunction(() => window.__ready3d, { timeout: 60000 });
      item.replay = await page.evaluate(() => ({ seed: new URL(location.href).searchParams.get('seed'),
        actualSeed: window.__api3d.hunt().seed, career: localStorage.getItem('uplandin.career.v1'),
        ready: !document.getElementById('field-overlay').hidden && document.getElementById('hunt-summary').hidden,
      }));
      assert.ok(item.replay.seed && item.replay.seed !== item.start.seed, 'Hunt again repeated the exact seed');
      assert.equal(Number(item.replay.seed), item.replay.actualSeed);
      assert.equal(item.replay.career, item.summary.career); assert.equal(item.replay.ready, true);
    }
    assert.deepEqual(item.errors, []);
    await context.close();
  }
  report.result = 'passed';
} catch (error) { report.result = 'failed'; report.errors.push(String(error.stack ?? error)); process.exitCode = 1; }
finally { await browser.close(); writeFileSync(resolve(out, 'report.json'), JSON.stringify(report, null, 2)); }
