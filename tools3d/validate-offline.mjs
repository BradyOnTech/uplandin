#!/usr/bin/env node
/** Historical cache-inventory smoke. Page-only offline emulation does not block
 * worker fetches reliably; use validate-offline-preservation.mjs for the hard
 * network-boundary acceptance check. This helper cannot certify a full outage.
 */
import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const args = process.argv.slice(2);
const get = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const base = get('--url', 'http://localhost:4520');
const out = resolve(get('--out', '/tmp/quail-offline'));
mkdirSync(out, { recursive: true });
const report = { evidence: 'production-service-worker-offline-browser', checks: [], errors: [] };
const browser = await puppeteer.launch({ headless: true, args: [] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  page.on('pageerror', (error) => report.errors.push(String(error)));
  await page.goto(`${base}/index3d.html?breed=gsp&coat=liver-white&drop=south-gate&quality=lite`);
  await page.waitForFunction('window.__ready3d === true', { timeout: 60000 });
  await page.waitForFunction('navigator.serviceWorker.controller !== null', { timeout: 30000 });
  const inventory = await page.evaluate(async () => {
    const keys = await caches.keys();
    const cache = await caches.open(keys.find(key => key.startsWith('uplandin-v3-')));
    const urls = (await cache.keys()).map(request => request.url);
    return { keys, urls };
  });
  report.cache = inventory;
  for (const path of ['index3d.html', 'models/quail-kit/manifest.json', 'models/quail-kit/field-tree-upright-lite.glb']) {
    assert.ok(inventory.urls.some(url => url.endsWith(path)), `cache includes ${path}`);
  }
  report.checks.push('Quail Fields kit and 3D shell physically present in the installed cache');
  await page.setOfflineMode(true);
  const loadedOffline = [];
  page.on('response', (response) => {
    if (response.fromServiceWorker()) loadedOffline.push({ url: response.url(), status: response.status() });
  });
  await page.goto(`${base}/index3d.html?breed=gsp&coat=liver-white&area=quail-fields&drop=west-track&quality=lite`);
  await page.waitForFunction('window.__ready3d === true', { timeout: 60000 });
  const ready = await page.evaluate(() => ({ telemetry: window.__api3d.telemetry() }));
  assert.equal(ready.telemetry.quality, 'lite');
  assert.ok(loadedOffline.some(response => response.url.includes('models/quail-kit/')));
  report.checks.push('Different drop URL loads the Quail Fields kit offline from service worker');
  report.offlineReady = ready;
  await page.click('#enter-field');
  await page.keyboard.down('KeyW');
  await new Promise(done => setTimeout(done, 1200));
  await page.keyboard.up('KeyW');
  await page.evaluate(() => document.exitPointerLock());
  await page.click('#end-hunt');
  await page.waitForFunction('document.getElementById("hunt-summary").hidden === false');
  await page.screenshot({ path: `${out}/offline-summary.png` });
  await Promise.all([page.waitForNavigation(), page.click('#hunt-again')]);
  await page.waitForFunction('window.__ready3d === true');
  assert.equal(await page.evaluate(() => window.__api3d.hunt().tally.downed), 0);
  report.checks.push('Offline walking, voluntary finish, summary and replay work');
  report.serviceWorkerResponses = loadedOffline;
  await page.screenshot({ path: `${out}/offline-replay.png` });
  assert.equal(report.errors.length, 0, report.errors.join('\n'));
  report.result = 'passed';
} catch (error) { report.errors.push(String(error)); report.result = 'failed'; process.exitCode = 1; }
finally {
  writeFileSync(`${out}/offline.json`, JSON.stringify(report, null, 2));
  console.log(report.result, report.checks, report.errors);
  await browser.close();
}
