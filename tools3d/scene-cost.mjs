#!/usr/bin/env node
/** Where a review view's triangles and draws go: renders a staged view and
 * lists visible meshes in the camera frustum by name, with draws and
 * triangles (instanced counts included). Wrap in tools3d/heavy.sh.
 *   node tools3d/scene-cost.mjs --area chukar-ridge --view talus --quality lite --url http://localhost:4613
 */
import puppeteer from 'puppeteer';
import { startServer } from './playthrough.mjs';

const args = process.argv.slice(2);
const arg = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const url = arg('--url', 'http://localhost:4517').replace(/\/$/, '');
const area = arg('--area', 'chukar-ridge'), viewId = arg('--view', 'truck'), quality = arg('--quality', 'high');
const { server } = await startServer(url);
const browser = await puppeteer.launch({ headless: true, args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-frame-rate-limit', '--disable-gpu-vsync'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 810 });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.goto(`${url}/index3d.html?${new URLSearchParams({ area, drop: 'south-gate', quality, tod: 'morning', dog: 'generated', seed: '7701', capture: '1' })}`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__ready3d === true && !!window.__api3d, { timeout: 240000, polling: 250 });
  const rows = await page.evaluate(async (id, viewId) => {
    const { getArea } = await import('/src/game/areas.ts');
    const { LandscapeModel } = await import('/src/game/landscape.ts');
    const { mapReviewViews } = await import('/tools3d/mapReviewViews.ts');
    const THREE = await import('/node_modules/three/build/three.module.js');
    const area = getArea(id), landscape = new LandscapeModel(area);
    const view = mapReviewViews(area).find(v => v.id === viewId);
    const world = landscape.propertyToWorld(view.at[0], view.at[1], { x: 0, z: 0 });
    const yaw = -Math.atan2(view.toward[0] - view.at[0], -(view.toward[1] - view.at[1])) * 180 / Math.PI;
    window.__api3d.pause(true);
    window.__api3d.setPose(world.x, world.z, yaw, view.pitch, view.lift ?? 0); window.__api3d.renderOnce();
    await new Promise(done => setTimeout(done, 400));
    window.__api3d.setPose(world.x, world.z, yaw, view.pitch, view.lift ?? 0); window.__api3d.renderOnce();
    const info = window.__api3d.info();
    const scene = window.__api3d.scene?.() ?? window.__scene3d;
    const camera = window.__api3d.camera?.() ?? window.__camera3d;
    const out = {};
    if (scene && camera) {
      camera.updateMatrixWorld(); const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      const sphere = new THREE.Sphere();
      scene.traverseVisible(o => {
        if (!o.isMesh) return;
        if (o.frustumCulled && o.geometry.boundingSphere) { sphere.copy(o.isInstancedMesh && o.boundingSphere ? o.boundingSphere : o.geometry.boundingSphere).applyMatrix4(o.matrixWorld); if (!frustum.intersectsSphere(sphere)) return; }
        const tris = (o.geometry.index ? o.geometry.index.count : o.geometry.getAttribute('position').count) / 3 * (o.isInstancedMesh ? o.count : 1);
        const key = (o.name || o.geometry.userData?.kind || 'unnamed').replace(/[0-9]+/g, '#');
        out[key] ??= { draws: 0, tris: 0 }; out[key].draws++; out[key].tris += tris;
      });
    }
    return { info, out };
  }, area, viewId);
  console.log(`${area} ${viewId} ${quality}: ${rows.info.calls} draws, ${rows.info.triangles} triangles`);
  for (const [k, v] of Object.entries(rows.out).sort((a, b) => b[1].tris - a[1].tris).slice(0, 25)) console.log(`${String(v.draws).padStart(4)} ${String(Math.round(v.tris)).padStart(9)}  ${k}`);
} finally { await browser.close(); server?.kill('SIGTERM'); }
