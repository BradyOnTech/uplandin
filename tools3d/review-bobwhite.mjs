#!/usr/bin/env node
/** Staged geometry comparison only; never evidence of an ordinary hunt. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer';

const arg = (name, fallback) => process.argv[process.argv.indexOf(name) + 1] ?? fallback;
const url = process.argv.includes('--url') ? arg('--url') : 'http://localhost:4517';
const out = resolve(process.argv.includes('--out') ? arg('--out') : '/tmp/quail-bobwhite-review');
mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ headless: true, defaultViewport: { width: 1440, height: 940, deviceScaleFactor: 1 } });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  // Serve an empty diagnostic document under Vite's origin, without starting either game.
  await page.setRequestInterception(true);
  page.on('request', request => {
    if (request.isNavigationRequest() && request.url() === `${url}/__bobwhite_review__`) {
      void request.respond({ status: 200, contentType: 'text/html', body: '<!doctype html><html><body></body></html>' });
    } else void request.continue();
  });
  await page.goto(`${url}/__bobwhite_review__`);
  const evidence = await page.evaluate(async () => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const asset = await import('/src/three/assets/bobwhite.ts');
    document.body.style.cssText = 'margin:0;background:#e1e3d8;color:#23362c;font:18px system-ui';
    const heading = document.createElement('div');
    heading.style.cssText = 'height:76px;box-sizing:border-box;padding:16px 28px';
    heading.innerHTML = '<strong>Bobwhite folded-wing review</strong><div style="font-size:14px;margin-top:4px">Staged asset comparison · identical mesh, lighting and cameras · not gameplay evidence</div>';
    document.body.append(heading);
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(1440, 864);
    renderer.setScissorTest(true);
    document.body.append(renderer.domElement);
    const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const body = asset.buildBobwhiteBody();
    const wings = [asset.buildBobwhiteWing(-1), asset.buildBobwhiteWing(1)];
    const views = [
      { name: 'Side', position: [0.48, 0.10, 0.02] },
      { name: 'Front', position: [0, 0.08, 0.48] },
      { name: 'Three-quarter', position: [0.36, 0.19, 0.36] },
    ];
    const bounds = [];
    for (let row = 0; row < 2; row++) {
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(row ? 0xe0e3d8 : 0xd3d8cf);
      scene.add(new THREE.HemisphereLight(0xf3f3e6, 0x646957, 2.0));
      const sun = new THREE.DirectionalLight(0xffebc3, 2.0);
      sun.position.set(1, 2, 3); scene.add(sun);
      const bird = new THREE.Group();
      bird.add(new THREE.Mesh(body, material));
      const left = new THREE.Group(), right = new THREE.Group();
      left.position.set(-0.03, 0.016, 0.028);
      right.position.set(0.03, 0.016, 0.028);
      left.add(new THREE.Mesh(wings[0], material)); right.add(new THREE.Mesh(wings[1], material));
      bird.add(left, right); scene.add(bird);
      if (row) asset.poseBobwhiteFoldedWings(left, right);
      else { left.rotation.set(0, 0.9, -1.35); right.rotation.set(0, -0.9, 1.35); }
      bird.updateMatrixWorld(true);
      bounds.push({ pose: row ? 'current-fold' : 'previous-fold',
        left: new THREE.Box3().setFromObject(left), right: new THREE.Box3().setFromObject(right) });
      for (let column = 0; column < views.length; column++) {
        const view = views[column];
        const camera = new THREE.PerspectiveCamera(38, 480 / 432, 0.01, 10);
        camera.position.set(...view.position); camera.lookAt(0, 0.03, 0.005);
        renderer.setViewport(column * 480, (1 - row) * 432, 480, 432);
        renderer.setScissor(column * 480, (1 - row) * 432, 480, 432);
        renderer.render(scene, camera);
        const label = document.createElement('div');
        label.textContent = `${row ? 'Revised — flank fold' : 'Previous — raised wings'} · ${view.name}`;
        label.style.cssText = `position:absolute;left:${column * 480 + 24}px;top:${row * 432 + 94}px;font-size:15px`;
        document.body.append(label);
      }
    }
    return { type: 'staged-asset-review', bodyTriangles: body.index.count / 3,
      wingTriangles: wings[0].attributes.position.count / 3, bounds,
      note: 'The first row reproduces the previous Euler pose on identical current geometry. No simulation or hunting state is involved.' };
  });
  await page.screenshot({ path: resolve(out, 'fold-comparison.png') });
  writeFileSync(resolve(out, 'fold-comparison.json'), JSON.stringify({ ...evidence, errors, createdAt: new Date().toISOString() }, null, 2));
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(JSON.stringify({ out, ...evidence }));
} finally { await browser.close(); }
