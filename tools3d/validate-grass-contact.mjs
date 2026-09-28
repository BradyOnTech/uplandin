#!/usr/bin/env node
/** GPU regression for the production grass material, independent of gameplay.
 * Hold camera, wind, geometry and time fixed; move only the dog contact point.
 * Run: node tools3d/validate-grass-contact.mjs --out output/playwright/grass-contact
 * Requires Chrome. Uses the actual shader rather than a CPU copy of its math.
 */
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), outIndex = args.indexOf('--out');
const out = resolve(outIndex < 0 ? 'output/playwright/grass-contact' : args[outIndex + 1]);
mkdirSync(out, { recursive: true });
const bundle = await build({ stdin: {
  contents: "export {GrassSystem} from './src/three/subsystems/grass'; export {sharptailGrassGeometry} from './src/three/subsystems/sharptailGrass'; export {nativeFamilyGeometry} from './src/three/subsystems/sharptailNativeFamily'; export {nativePlantGeometry} from './src/three/subsystems/sharptailNativePlants'; export * as THREE from 'three';",
  resolveDir: root, loader: 'js',
}, bundle: true, write: false, format: 'iife', globalName: 'GrassContactFixture', logLevel: 'silent' });
const report = { scope: 'Actual shared grass material and prairie geometry rendered on GPU. Isolated spatial-contact regression, not an ordinary hunt or performance benchmark.', cases: [], errors: [] };
let browser;
try {
  browser = await puppeteer.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage();
  await page.setViewport({ width: 512, height: 512 });
  page.on('pageerror', error => report.errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.evaluate(() => {
    const { THREE, GrassSystem } = GrassContactFixture;
    const system = new GrassSystem(), uniforms = system.makeUniforms(0, 100, 120);
    const material = system.makeMaterial(uniforms);
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(12, 1, .1, 200);
    camera.position.set(0, 3, 0);
    scene.add(new THREE.AmbientLight(0xffffff, 2));
    const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
    renderer.setSize(512, 512); renderer.setClearColor(0x142634);
    document.body.style.margin = '0'; document.body.append(renderer.domElement);
    const target = new THREE.WebGLRenderTarget(512, 512);
    window.fixture = { THREE, system, uniforms, material, scene, camera, renderer, target };
  });
  // Legacy cover details plus the current common and rank foreground assets.
  for (const detail of ['field', 'mobile', 'distant', 'windlaid', 'bunch', 'rank']) {
    const rows = await page.evaluate(detail => {
      const { THREE, uniforms, material, scene, camera, renderer, target } = window.fixture;
      const geometry = detail === 'rank' ? GrassContactFixture.nativePlantGeometry('rank', false)
        : ['windlaid', 'bunch'].includes(detail) ? GrassContactFixture.nativeFamilyGeometry(detail, 'base')
        : GrassContactFixture.sharptailGrassGeometry('cover', detail);
      const mesh = new THREE.InstancedMesh(geometry, material, 1);
      mesh.frustumCulled = false; scene.add(mesh);
      const image = (dogX, dogZ, radius, wind = 0, time = 0) => {
        uniforms.uPart2.value.set(dogX, dogZ, radius);
        uniforms.uWindAmp.value = wind; uniforms.uTime.value = time;
        renderer.setRenderTarget(target); renderer.render(scene, camera);
        const pixels = new Uint8Array(512 * 512 * 4);
        renderer.readRenderTargetPixels(target, 0, 0, 512, 512, pixels);
        return pixels;
      };
      const changedPixels = (a, b) => {
        let count = 0;
        for (let i = 0; i < a.length; i += 4) if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) count++;
        return count;
      };
      const rows = [];
      for (const radius of [.44, 1.7, 2.4]) {
        for (const distance of [10, 20, 35]) {
          mesh.setMatrixAt(0, new THREE.Matrix4().makeTranslation(0, 0, -distance));
          mesh.instanceMatrix.needsUpdate = true;
          camera.lookAt(0, .6, -distance); camera.updateMatrixWorld(true);
          const absent = image(10, -60, radius), distantDog = image(0, -60, radius);
          rows.push({ detail, radius, distanceFromDog: 60 - distance,
            remoteChangedPixels: changedPixels(absent, distantDog),
            nearChangedPixels: changedPixels(absent, image(.1, -distance, radius)),
            windChangedPixels: changedPixels(absent, image(10, -60, radius, .13, 2)) });
        }
      }
      scene.remove(mesh); geometry.dispose(); mesh.dispose();
      return rows;
    }, detail);
    report.cases.push(...rows);
  }
  for (const row of report.cases) {
    assert.equal(row.remoteChangedPixels, 0, `Dog ${row.distanceFromDog}m away moved ${row.remoteChangedPixels} pixels (${row.detail}, radius ${row.radius})`);
    assert.ok(row.nearChangedPixels > 0, 'Local dog contact must still move grass');
    assert.ok(row.windChangedPixels > 0, 'Independent wind must still move grass');
  }
  assert.equal(report.errors.length, 0, JSON.stringify(report.errors));
  report.result = 'passed';
} catch (error) {
  report.result = 'failed'; report.failure = String(error); process.exitCode = 1;
} finally {
  await browser?.close();
  writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ result: report.result, cases: report.cases.length, failure: report.failure, out }));
}
