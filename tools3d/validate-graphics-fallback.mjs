#!/usr/bin/env node
/** Real browser capability failure: launch with WebGL disabled, then exercise
 * the ordinary startup error interface and retry. No engine mocks or capture. */
import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { startServer } from './playthrough.mjs';

const args = process.argv.slice(2);
const get = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const out = resolve(get('--out', '/tmp/quail-graphics-fallback'));
mkdirSync(out, { recursive: true });
const result = { evidence: 'browser-webgl-disabled-startup-recovery', expectedConsoleErrors: [], uncaughtErrors: [], checks: [] };
let browser, server;
try {
  const serving = await startServer(get('--url', 'http://localhost:4517')); server = serving.server;
  browser = await puppeteer.launch({ headless: true, args: ['--disable-webgl'] });
  const page = await browser.newPage();
  page.on('console', (message) => { if (message.type() === 'error') result.expectedConsoleErrors.push(message.text()); });
  page.on('pageerror', (error) => result.uncaughtErrors.push(String(error)));
  await page.setViewport({ width: 1280, height: 720 });
  result.browser = await browser.version(); result.launchArgs = browser.process().spawnargs;
  const url = `${serving.url}/index3d.html?area=quail-fields`;
  const inspect = async () => {
    await page.waitForFunction('document.getElementById("loading-status")?.textContent.includes("could not start")', { timeout: 30000 });
    const state = await page.evaluate(() => ({
      ready: window.__ready3d === true,
      webgl2Unavailable: document.createElement('canvas').getContext('webgl2') === null,
      overlay: !document.getElementById('field-overlay').hidden,
      loaderHidden: document.getElementById('loading-progress').hidden,
      enterHidden: document.getElementById('enter-field').hidden,
      retryVisible: !!document.getElementById('retry-field').getClientRects().length,
      menuVisible: !!document.querySelector('.menu-link').getClientRects().length,
      menuHref: document.querySelector('.menu-link').href,
      message: document.getElementById('loading-status').textContent,
      scripts: performance.getEntriesByType('resource').filter((entry) => /\.js(?:[?#]|$)/.test(entry.name)).map((entry) => entry.name),
    }));
    assert.equal(state.ready, false); assert.equal(state.webgl2Unavailable, true);
    assert.equal(state.overlay, true); assert.equal(state.loaderHidden, true);
    assert.equal(state.enterHidden, true); assert.equal(state.retryVisible, true);
    assert.equal(state.menuVisible, true); assert.equal(new URL(state.menuHref).pathname, '/index.html');
    return state;
  };
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  result.checks.push({ event: 'actual-disabled-webgl-shows-recovery', state: await inspect() });
  await page.screenshot({ path: `${out}/graphics-unavailable.png` });
  await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), page.click('#retry-field')]);
  result.checks.push({ event: 'retry-reloads-and-retains-recovery', state: await inspect() });
  assert.equal(result.uncaughtErrors.length, 0);
  result.result = 'passed'; console.log('PASS disabled WebGL startup and retry');
} catch (error) {
  result.result = 'failed'; result.error = String(error); console.error(error); process.exitCode = 1;
} finally {
  writeFileSync(`${out}/graphics-fallback.json`, JSON.stringify(result, null, 2));
  await browser?.close(); server?.kill('SIGTERM');
}
