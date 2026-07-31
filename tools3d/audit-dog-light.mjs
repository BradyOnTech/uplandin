#!/usr/bin/env node
/*
 * DOG LIGHT AUDIT — the numeric gate for the setter's coat (round 11).
 *
 * Renders the 8-shot dawn ring around the locked point (same camera math
 * as capture.mjs's debug-dog-ring-* shots: dist 4.2 m, pitch -13, camAz at
 * 45-degree steps) and MEASURES the dog's coat pixels per angle instead of
 * trusting a builder's claim.
 *
 * ISOLATION METHOD: once __ready3d fires, the audit KILLS the engine's rAF
 * loop (window.requestAnimationFrame = no-op) so ctx.time freezes — the
 * grass wind stops dead and every frame becomes a pure function of the
 * explicit renderOnce() calls this script makes. (Measured failure without
 * this: the live loop kept the wind swaying between screenshots, the
 * dog-diff mask flooded with shifting blade edges, and "coat" luminance
 * collapsed to the field's 0.28 with run-to-run variance of +/-0.3.)
 * Each angle is then rendered three times from the identical frozen pose —
 * with the dog (A), with the body hidden via
 * window.__dogAudit.setBodyVisible(false) (B), with the dog again (C).
 * setBodyVisible is a capture-only hook that hides ONLY the dog's body
 * meshes; the contact shadow, grass parting and the rest of the scene stay
 * identical. Coat pixels differ A-vs-B AND C-vs-B while matching A-vs-C;
 * the A-vs-C residual doubles as a frozen-scene validation (>0.5% of the
 * frame differing A-vs-C fails the angle loudly instead of silently
 * shrinking the mask). The mask is eroded 1 px so anti-aliased edge pixels
 * never pollute the stats.
 *
 * PER ANGLE it prints:
 *   - mean sun-side luminance / mean shade-side luminance / shade-sun ratio
 *     (sun side = coat pixels on the sun's side of the mask centroid along
 *     the sun azimuth's MEASURED screen projection). The ratio is gated
 *     only where both sides are genuinely visible — see the two-part
 *     geometric criterion at the `separable` computation: the sun axis
 *     must project wide enough on screen AND the camera must sit near
 *     perpendicular to the sun axis so the minority side holds >= ~25% of
 *     the visible surface. On this dawn ring that gates 0/135/180/315;
 *     45/90 see essentially only the lit face, 225/270 the shade face.
 *   - % coat pixels above 0.95 luminance (clipping — "effectively
 *     fullbright")
 *   - contrast vs adjacent grass: |mean coat luminance - mean luminance of
 *     the 2-6 px band of grass around the mask| (the 270 melt number)
 * Luminance is Rec.709-weighted display sRGB in [0,1].
 *
 * PASS THRESHOLDS (hard):
 *   - shade/sun ratio <= 0.80 at every angle where both sides are visible
 *   - clipped pixels <= 2% at every angle
 *   - grass contrast at 270 >= BEFORE_GRASS_CONTRAST_270 * 1.25
 * Exit code is non-zero unless 8/8 angles PASS.
 *
 * Usage: node tools3d/audit-dog-light.mjs [--url http://localhost:5173]
 */
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer';

// Measured by this tool on the round-10 material (before the round-11
// fix), commit 73500c1: the 270-ring coat sat 0.1868 luminance from the
// grass band around it (coat 0.334 flat, ratio 0.973 — the "grey ghost
// melts into grass" verdict as numbers). The fix must beat the contrast
// by >= 25%: threshold 0.2335.
const BEFORE_GRASS_CONTRAST_270 = 0.1868;

const RING = [0, 45, 90, 135, 180, 225, 270, 315];
const SUN_AZ = 52; // palette.ts TOD.dawn.sunAzimuth
const DIST = 4.2;
const PITCH = -13;
const BASE = [0, 40, 180, 4];
const MAX_TICKS = 30000;
const W = 960;
const H = 540;

const args = process.argv.slice(2);
const get = (flag, dflt) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : dflt;
};
const baseUrl = get('--url', 'http://localhost:4517');
// --dump <dir>: also write the with/without frames per angle (debugging).
const dumpDir = get('--dump', null);

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
    args: [
      '--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle',
      '--disable-frame-rate-limit', '--disable-gpu-vsync',
    ],
  });
  let failed = 0;
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
    await page.goto(`${url}/index3d.html?capture=1&tod=dawn`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction('window.__ready3d === true', { timeout: 30000 });
    // Freeze the engine loop: from here on the scene only changes when this
    // script calls renderOnce() — wind, time and smoothing all hold still.
    await page.evaluate(() => {
      window.requestAnimationFrame = () => 0;
    });

    // Run the frozen sim to the LOCKED point once (capture.mjs's exact
    // round-9 predicate); every ring angle then shoots the same pose.
    const lock = await page.evaluate(
      (base, maxTicks) => {
        window.__api3d.setTod('dawn');
        window.__api3d.setPose(...base);
        const hunt = () => window.__api3d.hunt();
        let lpx = null;
        let lpz = null;
        let locked = false;
        const lockedPoint = (h) => {
          if (h.dog.state !== 'pointing') {
            lpx = null;
            return false;
          }
          const still = lpx !== null && Math.hypot(h.dog.x - lpx, h.dog.z - lpz) < 0.01;
          lpx = h.dog.x;
          lpz = h.dog.z;
          if (!still) return false;
          window.__api3d.renderOnce();
          const st = window.__dogAudit && window.__dogAudit.state();
          if (!st) return false;
          const stance = st.paws.filter((p) => p.i !== 0);
          locked = stance.every((p) => p.gap > -0.06 && p.gap < 0.05);
          return locked;
        };
        window.__api3d.stepSim(240);
        let ticks = 240;
        let h = hunt();
        while (!lockedPoint(h) && ticks < maxTicks) {
          window.__api3d.stepSim(15);
          ticks += 15;
          h = hunt();
        }
        const st = window.__dogAudit.state();
        return { locked, ticks, yaw: st.yaw, dog: { x: h.dog.x, z: h.dog.z, state: h.dog.state } };
      },
      BASE, MAX_TICKS,
    );
    if (!lock.locked) {
      console.error(`no locked point in ${MAX_TICKS} ticks (state ${lock.dog.state})`);
      process.exit(1);
    }
    console.log(
      `locked point at (${lock.dog.x.toFixed(1)}, ${lock.dog.z.toFixed(1)}) after ${lock.ticks} ticks, ` +
      `nose az ${(((lock.yaw * 180) / Math.PI + 360) % 360).toFixed(0)} (sun az ${SUN_AZ})`,
    );
    console.log(`angle |   sun  shade  ratio |  clip% | grass-contrast | verdict`);

    for (const az of RING) {
      // capture.mjs camAz camera math: absolute azimuth from the dog.
      // The sun-side split axis is MEASURED through the live camera (the
      // projected screen offset of a 1 m step along the flat sun azimuth
      // from the dog's center), never derived from a camera convention.
      const view = await page.evaluate(
        (camAz, dist, pitch, sunAzDeg) => {
          const h = window.__api3d.hunt();
          const azr = (camAz * Math.PI) / 180;
          const rx = Math.sin(azr);
          const rz = Math.cos(azr);
          const camX = Math.max(-230, Math.min(230, h.dog.x + rx * dist));
          const camZ = Math.max(-230, Math.min(230, h.dog.z + rz * dist));
          const vx = h.dog.x - camX;
          const vz = h.dog.z - camZ;
          const yawDeg = (Math.atan2(-vx, -vz) * 180) / Math.PI;
          window.__dogAudit.setBodyVisible(true);
          window.__api3d.setPose(camX, camZ, yawDeg, pitch);
          window.__api3d.renderOnce();
          const cy = window.__dogAudit.heightAt(h.dog.x, h.dog.z) + 0.45;
          const c = window.__dogAudit.project(h.dog.x, cy, h.dog.z);
          const sr = (sunAzDeg * Math.PI) / 180;
          const s = window.__dogAudit.project(h.dog.x + Math.sin(sr), cy, h.dog.z + Math.cos(sr));
          const up = window.__dogAudit.project(h.dog.x, cy + 1, h.dog.z);
          const meterPx = Math.abs(up.y - c.y) || 1;
          return { sunPx: s.x - c.x, meterPx };
        },
        az, DIST, PITCH, SUN_AZ,
      );
      await new Promise((r) => setTimeout(r, 50));
      const shotA = await page.screenshot({ encoding: 'base64' });
      await page.evaluate(() => {
        window.__dogAudit.setBodyVisible(false);
        window.__api3d.renderOnce();
      });
      await new Promise((r) => setTimeout(r, 50));
      const shotB = await page.screenshot({ encoding: 'base64' });
      await page.evaluate(() => {
        window.__dogAudit.setBodyVisible(true);
        window.__api3d.renderOnce();
      });
      await new Promise((r) => setTimeout(r, 50));
      const shotC = await page.screenshot({ encoding: 'base64' });
      if (dumpDir) {
        const { writeFileSync, mkdirSync } = await import('node:fs');
        mkdirSync(dumpDir, { recursive: true });
        writeFileSync(`${dumpDir}/ring-${az}-with.png`, Buffer.from(shotA, 'base64'));
        writeFileSync(`${dumpDir}/ring-${az}-without.png`, Buffer.from(shotB, 'base64'));
      }

      // Measured screen projection of the flat sun axis, in units of one
      // projected vertical meter at the dog. Sign picks which side of the
      // centroid is the sun side.
      const sunScreenX = view.sunPx / view.meterPx;
      // BOTH SIDES VISIBLE requires two things, and both are geometry,
      // not taste. (1) The sun axis must project wide enough on screen
      // (|sunScreenX| >= 0.35) for a left/right split to mean anything.
      // (2) The camera must sit near-PERPENDICULAR to the sun axis: for a
      // convex body the visible arc is the 180 degrees facing the camera,
      // the lit arc is the 180 degrees facing the sun, so the minority
      // side's share of visible surface is (90 - |90 - angle(view,sun)|)
      // / 180. At ring angle 90 the view runs 38 degrees off the sun
      // axis: 79% of every visible pixel is the lit face, and no
      // correctly lit convex body can push the half-ratio to 0.80 there
      // — demanding it would reward anti-physical lighting. |cos| <=
      // 0.72 gates the ratio to angles where the minority side holds >=
      // ~25% of the view (this dawn ring: 0, 135, 180, 315). The 270
      // melt keeps its own dedicated gate: grass contrast, below.
      const viewAz = ((az + 180) * Math.PI) / 180;
      const cosViewSun = Math.cos(viewAz - (SUN_AZ * Math.PI) / 180);
      const separable = Math.abs(sunScreenX) >= 0.35 && Math.abs(cosViewSun) <= 0.72;

      const m = await page.evaluate(
        async (aB64, bB64, cB64, sunSX) => {
          const load = (b64) =>
            new Promise((res, rej) => {
              const im = new Image();
              im.onload = () => res(im);
              im.onerror = rej;
              im.src = 'data:image/png;base64,' + b64;
            });
          const [ia, ib, ic] = await Promise.all([load(aB64), load(bB64), load(cB64)]);
          const w = ia.width;
          const h = ia.height;
          const cv = document.createElement('canvas');
          cv.width = w;
          cv.height = h;
          const g = cv.getContext('2d', { willReadFrequently: true });
          g.drawImage(ia, 0, 0);
          const A = g.getImageData(0, 0, w, h).data;
          g.drawImage(ib, 0, 0);
          const B = g.getImageData(0, 0, w, h).data;
          g.drawImage(ic, 0, 0);
          const C = g.getImageData(0, 0, w, h).data;
          const n = w * h;
          const mask = new Uint8Array(n);
          let unstable = 0;
          for (let i = 0; i < n; i++) {
            const j = i * 4;
            const dAB =
              Math.abs(A[j] - B[j]) + Math.abs(A[j + 1] - B[j + 1]) + Math.abs(A[j + 2] - B[j + 2]);
            const dCB =
              Math.abs(C[j] - B[j]) + Math.abs(C[j + 1] - B[j + 1]) + Math.abs(C[j + 2] - B[j + 2]);
            const dAC =
              Math.abs(A[j] - C[j]) + Math.abs(A[j + 1] - C[j + 1]) + Math.abs(A[j + 2] - C[j + 2]);
            if (dAC > 12) unstable++;
            if (dAB > 24 && dCB > 24 && dAC <= 12) mask[i] = 1;
          }
          // Frozen-scene validation: with the rAF loop dead, the two
          // with-dog frames must be pixel-identical (small AA tolerance).
          if (unstable > n * 0.005) return { ok: false, count: 0, unstable: (unstable / n) * 100 };
          // Erode 1 px (4-neighborhood): drop anti-aliased edge pixels.
          const maskE = new Uint8Array(n);
          for (let y = 1; y < h - 1; y++) {
            for (let x = 1; x < w - 1; x++) {
              const i = y * w + x;
              if (mask[i] && mask[i - 1] && mask[i + 1] && mask[i - w] && mask[i + w]) maskE[i] = 1;
            }
          }
          const lum = (i) => {
            const j = i * 4;
            return (0.2126 * A[j] + 0.7152 * A[j + 1] + 0.0722 * A[j + 2]) / 255;
          };
          let count = 0;
          let cx = 0;
          let cy = 0;
          for (let i = 0; i < n; i++) {
            if (maskE[i]) {
              count++;
              cx += i % w;
              cy += (i / w) | 0;
            }
          }
          if (count < 300) return { ok: false, count };
          cx /= count;
          cy /= count;
          let sunSum = 0;
          let sunN = 0;
          let shadeSum = 0;
          let shadeN = 0;
          let clipN = 0;
          let coatSum = 0;
          const sgn = sunSX >= 0 ? 1 : -1;
          let x0 = w;
          let x1 = 0;
          for (let i = 0; i < n; i++) {
            if (maskE[i]) {
              const x = i % w;
              if (x < x0) x0 = x;
              if (x > x1) x1 = x;
            }
          }
          const qSum = [0, 0, 0, 0, 0];
          const qN = [0, 0, 0, 0, 0];
          for (let i = 0; i < n; i++) {
            if (!maskE[i]) continue;
            const L = lum(i);
            coatSum += L;
            if (L > 0.95) clipN++;
            const x = i % w;
            const q = Math.min(4, Math.floor(((x - x0) / Math.max(1, x1 - x0 + 1)) * 5));
            qSum[q] += L;
            qN[q]++;
            if ((x - cx) * sgn > 0) {
              sunSum += L;
              sunN++;
            } else {
              shadeSum += L;
              shadeN++;
            }
          }
          // Adjacent grass: the 2-6 px band around the full mask, stamped
          // by dilating mask pixels (chebyshev), minus the 2 px inner
          // dilation — measured on the WITH-dog frame (real neighbors).
          const dil6 = new Uint8Array(n);
          const dil2 = new Uint8Array(n);
          for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
              if (!mask[y * w + x]) continue;
              for (let dy = -6; dy <= 6; dy++) {
                const yy = y + dy;
                if (yy < 0 || yy >= h) continue;
                for (let dx = -6; dx <= 6; dx++) {
                  const xx = x + dx;
                  if (xx < 0 || xx >= w) continue;
                  dil6[yy * w + xx] = 1;
                  if (Math.abs(dx) <= 2 && Math.abs(dy) <= 2) dil2[yy * w + xx] = 1;
                }
              }
            }
          }
          let grassSum = 0;
          let grassN = 0;
          for (let i = 0; i < n; i++) {
            if (dil6[i] && !dil2[i]) {
              grassSum += lum(i);
              grassN++;
            }
          }
          return {
            ok: true,
            count,
            sun: sunN ? sunSum / sunN : 0,
            shade: shadeN ? shadeSum / shadeN : 0,
            clipPct: (clipN / count) * 100,
            coat: coatSum / count,
            grass: grassN ? grassSum / grassN : 0,
            cols: qSum.map((s, i) => (qN[i] ? s / qN[i] : 0)),
          };
        },
        shotA, shotB, shotC, sunScreenX,
      );

      if (!m.ok) {
        console.log(
          m.unstable !== undefined
            ? `  ${String(az).padStart(3)} | scene not frozen (${m.unstable.toFixed(2)}% pixels moved between with-dog frames) | FAIL`
            : `  ${String(az).padStart(3)} | dog not found (${m.count} px) | FAIL`,
        );
        failed++;
        continue;
      }
      const ratio = m.sun > 0 ? m.shade / m.sun : 0;
      const grassContrast = Math.abs(m.coat - m.grass);
      const reasons = [];
      if (separable && ratio > 0.8) reasons.push(`ratio ${ratio.toFixed(2)} > 0.80`);
      if (m.clipPct > 2) reasons.push(`clip ${m.clipPct.toFixed(1)}% > 2%`);
      if (az === 270 && grassContrast < BEFORE_GRASS_CONTRAST_270 * 1.25) {
        reasons.push(
          `grass-contrast ${grassContrast.toFixed(4)} < before ${BEFORE_GRASS_CONTRAST_270} * 1.25`,
        );
      }
      const verdict = reasons.length === 0 ? 'PASS' : `FAIL (${reasons.join('; ')})`;
      if (reasons.length > 0) failed++;
      console.log(
        `  ${String(az).padStart(3)} | ${m.sun.toFixed(3)}  ${m.shade.toFixed(3)}  ` +
        `${separable ? ratio.toFixed(3) : ' n/a '} | ${m.clipPct.toFixed(2).padStart(5)}% | ` +
        `${grassContrast.toFixed(4)} (coat ${m.coat.toFixed(3)} grass ${m.grass.toFixed(3)}) | ${verdict}` +
        (args.includes('--cols') ? `\n        cols L->R: ${m.cols.map((c) => c.toFixed(2)).join(' ')} (sunSX ${sunScreenX.toFixed(2)})` : ''),
      );
    }
    console.log(failed === 0 ? '8/8 PASS' : `${8 - failed}/8 PASS — ${failed} angle(s) failed`);
  } finally {
    await browser.close();
    if (server) server.kill('SIGTERM');
  }
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
