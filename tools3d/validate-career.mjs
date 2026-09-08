#!/usr/bin/env node
/** Real-input hunts in disposable browser contexts. The only authored state is
 * the explicitly labeled starting profile; no user browser/profile is opened. */
import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runNormalGameplay, startServer } from './playthrough.mjs';

const args = process.argv.slice(2);
const get = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const out = resolve(get('--out', '/tmp/quail-career'));
mkdirSync(out, { recursive: true });
const CAREER_KEY = 'uplandin.career.v1';
const fixture = {
  version: 2, hunts: 0, downed: 0, escaped: 0, areas: {},
  kennel: [{ id: 'dog-1', name: 'QA GSP', breedId: 'gsp', level: 8,
    xp: Array.from({ length: 7 }, (_, i) => Math.round(20 * Math.pow(i + 1, 1.5))).reduce((a, b) => a + b), bornSeason: 1 }],
  activeDogId: 'dog-1', braceDogId: null,
  hunter: { level: 1, xp: 0, shotgunId: 'remington-870', truckTier: 0, dogBoxTier: 1 },
  regionsUnlocked: ['southern-plains'], date: { season: 3, week: 9 }, homeRegionId: 'southern-plains',
};
const quick = { breedId: 'gsp', level: 8, areaId: 'quail-fields', wind: 'random', gunId: 'remington-870', gearTier: 3, breed2Id: 'none', weather: 'random' };
const results = { evidence: 'isolated-profile-real-input-career-and-quick-hunts', fixture, checks: [], errors: [] };
const check = (name, detail) => { results.checks.push({ name, detail }); console.log(`PASS ${name}`); };
let browser, server;
try {
  const serving = await startServer(get('--url', 'http://localhost:4517')); server = serving.server;
  browser = await puppeteer.launch({ headless: !args.includes('--headed'), args: [] });
  for (const play of (get('--play', '') ? [get('--play', '')] : ['career', 'quick'])) {
    assert.ok(['career', 'quick'].includes(play), 'play is career or quick');
    const context = await browser.createBrowserContext();
    try {
      const page = await context.newPage();
      // Give the disposable context an origin without booting or modifying the game.
      await page.setRequestInterception(true);
      const seedUrl = `${serving.url}/__automation_profile_seed__`;
      const intercept = (request) => request.url() === seedUrl
        ? request.respond({ status: 200, contentType: 'text/html', body: '<title>Isolated QA profile</title>' })
        : request.continue();
      page.on('request', intercept);
      await page.goto(seedUrl);
      const seeded = JSON.stringify(fixture);
      await page.evaluate(({ key, seeded, quick }) => {
        localStorage.setItem(key, seeded); localStorage.setItem('uplandin.quick.v1', JSON.stringify(quick));
      }, { key: CAREER_KEY, seeded, quick });
      page.off('request', intercept); await page.setRequestInterception(false);
      const run = await runNormalGameplay(page, { url: serving.url, play, out, name: play,
        quality: get('--quality', 'high'), drop: get('--drop', 'south-gate'), video: args.includes('--video'),
        maxSeconds: Number(get('--seconds', '240')) });
      assert.equal(run.result, 'passed');
      assert.equal(run.saveStableOnReplay, true);
      assert.equal(run.careerStableWhileSummaryVisible, true);
      const savedAfterReplay = await page.evaluate((key) => localStorage.getItem(key), CAREER_KEY);
      assert.equal(savedAfterReplay, run.careerAtSummary);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction('window.__ready3d === true', { timeout: 60000 });
      assert.equal(await page.evaluate((key) => localStorage.getItem(key), CAREER_KEY), savedAfterReplay);
      if (play === 'career') {
        const saved = JSON.parse(savedAfterReplay);
        assert.equal(saved.hunts, fixture.hunts + 1);
        assert.equal(saved.areas['quail-fields'].hunts, 1);
        assert.equal(saved.downed, fixture.downed + run.completedHunt.tally.downed);
        const dogAward = Number(run.summary.match(/QA GSP \+(\d+) XP/)?.[1]);
        const hunterAward = Number(run.summary.match(/hunter \+(\d+) XP/)?.[1]);
        const weeks = Number(run.summary.match(/(\d+) weeks? passed/)?.[1]);
        assert.ok(dogAward > 0 && hunterAward > 0);
        assert.equal(saved.kennel[0].xp, fixture.kennel[0].xp + dogAward);
        assert.equal(saved.hunter.xp, fixture.hunter.xp + hunterAward);
        assert.equal(weeks, 1);
        assert.equal(saved.date.week, fixture.date.week + weeks);
        assert.equal(saved.date.season, fixture.date.season);
        check('career awards and calendar settle once and survive summary, replay, and reload', { saved, summary: run.summary, dogAward, hunterAward, weeks });
      } else {
        assert.equal(savedAfterReplay, seeded);
        check('Quick Hunt leaves seeded career byte-identical through summary, replay, and reload', { bytes: seeded.length, summary: run.summary });
      }
    } finally { await context.close(); }
  }
  results.result = 'passed';
} catch (error) {
  results.result = 'failed'; results.errors.push(String(error)); console.error(error); process.exitCode = 1;
} finally {
  writeFileSync(`${out}/career-persistence.json`, JSON.stringify(results, null, 2));
  await browser?.close(); server?.kill('SIGTERM');
}
