#!/usr/bin/env node
/*
 * Prop placement audit (round 7): boots the 3D build headless, reads the
 * placement table FloraSystem publishes at init (window.__floraAudit —
 * one row per placed prop with its base height measured against the
 * heightfield across its whole footprint), and fails loudly on:
 *
 *   FLOAT:  base sits > 0.12 m above the LOWEST ground in the footprint
 *           (daylight under the downhill rim — the round-7 boulder tell)
 *   BURIED: the HIGHEST ground in the footprint stands > 1.6 m above the
 *           base (the prop drowned in a slope)
 *
 * Usage:  node tools3d/audit-props.mjs [--url http://localhost:5173]
 * Exit code 1 if any offender is found — run it after placement changes.
 */
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer';

const args = process.argv.slice(2);
const get = (flag, dflt) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : dflt;
};
const baseUrl = get('--url', 'http://localhost:4517');
const FLOAT_MAX = 0.12;
const BURY_MAX = 1.6;

async function reachable(url) {
  try {
    const res = await fetch(url + '/index3d.html', { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

async function main() {
  let server = null;
  let url = baseUrl;
  if (!(await reachable(url))) {
    server = spawn('npx', ['vite', '--port', '4517', '--strictPort'], { stdio: 'pipe' });
    url = 'http://localhost:4517';
    for (let i = 0; i < 40; i++) {
      if (await reachable(url)) break;
      await new Promise((r) => setTimeout(r, 500));
      if (i === 39) throw new Error('vite never came up');
    }
  }
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle'],
  });
  try {
    const page = await browser.newPage();
    await page.goto(`${url}/index3d.html?capture=1&tod=noon`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction('window.__ready3d === true', { timeout: 30000 });
    const rows = await page.evaluate(() => window.__floraAudit ?? []);
    if (rows.length === 0) {
      console.error('audit: window.__floraAudit is empty — flora did not publish');
      process.exit(1);
    }
    const floats = rows.filter((r) => r.floatGap > FLOAT_MAX);
    const buried = rows.filter((r) => r.sink > BURY_MAX);
    const byKind = {};
    for (const r of rows) byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
    console.log(
      `audit: ${rows.length} props (${Object.entries(byKind).map(([k, n]) => `${k} ${n}`).join(', ')})`,
    );
    for (const r of floats) {
      console.log(`  FLOAT  ${r.kind} at (${r.x}, ${r.z}): base ${r.floatGap} m above low ground`);
    }
    for (const r of buried) {
      console.log(`  BURIED ${r.kind} at (${r.x}, ${r.z}): high ground ${r.sink} m above base`);
    }
    if (floats.length + buried.length === 0) {
      console.log('audit: no floats, nothing buried — all props seated');
    } else {
      process.exit(1);
    }
  } finally {
    await browser.close();
    if (server) server.kill('SIGTERM');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
