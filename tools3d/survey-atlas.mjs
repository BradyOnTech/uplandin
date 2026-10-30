#!/usr/bin/env node
/** Save a ground's survey-map atlas (the static layer of the in-hunt map:
 * terrain, cover, rimrock, routes are drawn live on top) as a PNG, from the
 * real module in a headless browser. Wrap in tools3d/heavy.sh.
 *   node tools3d/survey-atlas.mjs --area chukar-ridge --url http://localhost:4613 --out /tmp/atlas.png
 */
import puppeteer from 'puppeteer';
import { writeFileSync } from 'node:fs';
import { startServer } from './playthrough.mjs';

const args = process.argv.slice(2);
const arg = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const url = arg('--url', 'http://localhost:4517').replace(/\/$/, '');
const area = arg('--area', 'chukar-ridge'), out = arg('--out', `/tmp/${area}-atlas.png`);
const { server } = await startServer(url);
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.goto(`${url}/index3d.html?area=${area}&capture=1&quality=lite`, { waitUntil: 'load', timeout: 120000 });
  const data = await page.evaluate(async id => {
    const { getArea } = await import('/src/game/areas.ts');
    const { createSurveyAtlas } = await import('/src/three/maps/surveyMap.ts');
    const area = getArea(id), { canvas } = createSurveyAtlas(area);
    // Routes and entries, as the live map draws them over the atlas.
    const g = canvas.getContext('2d'), sx = canvas.width / area.world.w, sy = canvas.height / area.world.h;
    g.lineJoin = 'round'; g.lineCap = 'round'; g.beginPath();
    for (const trail of area.trails) trail.points.forEach((p, i) => i ? g.lineTo((p.x - area.world.x) * sx, (p.y - area.world.y) * sy) : g.moveTo((p.x - area.world.x) * sx, (p.y - area.world.y) * sy));
    g.setLineDash([]); g.strokeStyle = '#f8efd9a8'; g.lineWidth = 3.5; g.stroke(); g.setLineDash([5, 4]); g.strokeStyle = '#945a3e'; g.lineWidth = 1.3; g.stroke();
    g.setLineDash([]);
    for (const drop of area.dropPoints) {
      const x = (drop.position.x - area.world.x) * sx, y = (drop.position.y - area.world.y) * sy;
      g.fillStyle = '#835139'; g.strokeStyle = '#fff8e5'; g.lineWidth = 2; g.beginPath(); g.roundRect(x - 7, y - 6, 14, 12, 2); g.fill(); g.stroke();
      g.font = '600 13px -apple-system, sans-serif'; g.fillStyle = '#3b2d22'; g.fillText(drop.name, x + 10, y + 4);
    }
    return canvas.toDataURL('image/png');
  }, area);
  writeFileSync(out, Buffer.from(data.split(',')[1], 'base64'));
  console.log(JSON.stringify({ out }));
} finally { await browser.close(); server?.kill('SIGTERM'); }
