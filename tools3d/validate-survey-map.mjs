#!/usr/bin/env node
/** Ordinary setup UI evidence; no scene setters or gameplay state mutations.
 * node tools3d/validate-survey-map.mjs --url http://localhost:4173
 */
import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const option = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const base = option('--url', 'http://localhost:4173').replace(/\/$/, '');
const out = resolve(option('--out', 'artifacts/3d/quail-survey-map'));
const label = option('--label', 'after');
await mkdir(out, { recursive: true });
const html = await fetch(`${base}/index.html`).then(response => { assert.ok(response.ok); return response.text(); });
assert.ok(!/\/@vite|\/src\/main/.test(html), 'Use an immutable production preview.');
const report = { evidence: 'ordinary-ui-quail-survey-map', label, base, startedAt: new Date().toISOString(), checks: [], errors: [] };
const browser = await puppeteer.launch({ headless: !args.includes('--headed'), args: [] });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
report.browser = await browser.version();
report.launchArgs = browser.process()?.spawnargs;
page.on('pageerror', error => report.errors.push(String(error)));
const scene = name => page.waitForFunction(name => window.__uplandin?.scene.isActive(name)
  && window.__uplandin.scene.getScene(name).children.list.length > 0, { timeout: 30000 }, name);
const rendered = () => page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
const click = async (x, y) => {
  const rect = await page.$eval('canvas', canvas => canvas.getBoundingClientRect().toJSON());
  await page.mouse.click(rect.x + x / 480 * rect.width, rect.y + y / 270 * rect.height);
};
const chooseQuail = async () => {
  for (let i = 0; i < 15; i++) {
    if (await page.evaluate(() => window.__uplandin.scene.getScene('QuickScene').cfg.areaId) === 'quail-fields') return;
    await click(411, 99);
  }
  throw new Error('Could not choose Quail Fields through the setup picker');
};
const readDrop = () => page.evaluate(() => {
  const drop = window.__uplandin.scene.getScene('DropScene');
  return { selected: drop.selected, area: drop.area, launch: drop.launchData.launch,
    texts: drop.children.list.filter(child => typeof child.text === 'string').map(child => child.text),
    canvas: { width: window.__uplandin.canvas.width, height: window.__uplandin.canvas.height },
    scripts: performance.getEntriesByType('resource').map(entry => entry.name).filter(name => /\.js(?:[?#]|$)/.test(name)) };
});
try {
  await page.goto(`${base}/index.html`, { waitUntil: 'domcontentloaded' }); await scene('TitleScene');
  await click(295, 113); await click(240, 207); await scene('QuickScene');
  await chooseQuail(); await click(352, 222); await scene('DropScene');
  const south = await readDrop();
  assert.equal(south.selected.id, 'south-gate'); assert.equal(south.area.id, 'quail-fields');
  await rendered();
  await page.screenshot({ path: `${out}/${label}-south-survey.png` });
  await page.keyboard.press('ArrowRight');
  const west = await readDrop(); assert.equal(west.selected.id, 'west-track');
  assert.deepEqual(west.area, south.area);
  await rendered();
  await page.screenshot({ path: `${out}/${label}-west-survey.png` });
  report.checks.push({ name: 'Actual 3D setup displays both drop selections using identical shared geography', south, west });
  await page.keyboard.press('Escape'); await scene('QuickScene');
  await page.keyboard.press('Escape'); await scene('TitleScene');
  if (!args.includes('--skip-field')) {
    await click(185, 113); await click(240, 207); await scene('QuickScene');
    await chooseQuail(); await click(352, 222); await scene('DropScene');
    await page.keyboard.press('Enter'); await scene('FieldScene');
    const before = await page.evaluate(() => ({ ...window.__uplandin.scene.getScene('FieldScene').hunt.hunterPos }));
    await click(290, 130); await new Promise(done => setTimeout(done, 1400));
    const field = await page.evaluate(() => {
      const scene = window.__uplandin.scene.getScene('FieldScene');
      return { area: scene.area.id, hunter: scene.hunt.hunterPos, birds: scene.hunt.birds.length };
    });
    assert.equal(field.area, 'quail-fields'); assert.ok(Math.hypot(field.hunter.x - before.x, field.hunter.y - before.y) > 1);
    await page.screenshot({ path: `${out}/${label}-2d-field.png` });
    await click(428, 18);
    await page.waitForFunction(() => window.__uplandin.scene.getScene('FieldScene').summaryShown === true, { timeout: 10000, polling: 100 });
    report.summary = await page.evaluate(() => {
      const scene = window.__uplandin.scene.getScene('FieldScene');
      return { shown: scene.summaryShown, active: scene.sys.isActive(), interactive: scene.children.list.filter(child => child.input?.enabled).map(child => ({ type: child.type, x: child.x, y: child.y, depth: child.depth })) };
    });
    assert.equal(report.summary.shown, true, 'The ordinary end-hunt button must show the summary');
    // summaryShown changes in the input handler before Phaser has rendered and
    // refreshed the new interactive button's display transform.
    await rendered();
    await click(302, 179); await scene('QuickScene'); await page.keyboard.press('Escape'); await scene('TitleScene');
    report.checks.push({ name: 'Ordinary 2D launch, movement, summary and return to menu preserved', before, field });
  }
  assert.equal(await page.evaluate(() => localStorage.getItem('uplandin.career.v1')), null);
  assert.deepEqual(report.errors, []);
  report.result = 'passed';
} catch (error) {
  report.result = 'failed'; report.failure = String(error); process.exitCode = 1;
  report.failureStack = error.stack;
  await page.screenshot({ path: `${out}/${label}-failure.png` }).catch(() => {});
} finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(`${out}/${label}.json`, JSON.stringify(report, null, 2));
  await browser.close();
  console.log(JSON.stringify({ result: report.result, checks: report.checks.length, failure: report.failure, out }));
}
