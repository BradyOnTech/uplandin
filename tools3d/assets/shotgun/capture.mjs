/** Normal-lens viewmodel diagnostics. Staged cosmetic poses, not gameplay proof. */
import puppeteer from 'puppeteer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const base = process.argv[2] || 'http://localhost:4517';
const out = resolve('docs/3d/shotgun-review'); mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ headless: true });
const report = { scope: 'staged-viewmodel-diagnostics', fov: 70, width: 1920, height: 1080, screenshots: [], errors: [] };
try {
  const page = await browser.newPage(); await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  page.on('pageerror', (error) => report.errors.push(String(error)));
  await page.goto(`${base}/index3d.html?capture=1&area=quail-fields&breed=gsp&coat=liver-white&tod=morning&quality=high`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__ready3d === true, { timeout: 60000 });
  await page.evaluate(() => { window.__api3d.setPose(20, 10, 200, 4); window.__api3d.renderOnce(); });
  for (const [name, state] of [['carry', 'carry'], ['mount', 'mount'], ['reload-reach', .34], ['reload-insert', .44], ['reload-second-shell', .67], ['reload-return', .92]]) {
    const details = await page.evaluate((state) => {
      if (typeof state === 'number') window.__gunAudit.setReloadPreview(state);
      else window.__gunAudit.setState(state);
      window.__api3d.renderOnce();
      return window.__gunAudit.viewmodel();
    }, state);
    if (details.fov !== 70) throw new Error(`Unexpected altered lens: ${details.fov}`);
    if (name === 'mount' && Math.hypot(details.beadNdc.x, details.beadNdc.y) > .002) throw new Error(`Mounted bead misses camera shot ray: ${JSON.stringify(details)}`);
    await page.screenshot({ path: `${out}/${name}.png` }); report.screenshots.push({ name, ...details });
  }
  const geometry = await page.evaluate(async () => {
    const { createSportingShotgun } = await import('/src/three/assets/shotgun.ts');
    const model = createSportingShotgun('pump'); let triangles = 0, drawGroups = 0;
    model.root.traverse((node) => { if (node.isMesh) { triangles += (node.geometry.index?.count ?? node.geometry.attributes.position.count) / 3; drawGroups++; } });
    model.dispose(); return { triangles, drawGroups };
  });
  report.geometry = geometry;
  report.result = report.errors.length === 0 ? 'passed' : 'failed';
  writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
