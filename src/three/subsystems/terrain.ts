import * as THREE from 'three';
import type { Ctx, Subsystem } from '../engine';
import { P, TOD, type TimeOfDay } from '../palette';

/*
 * TERRAIN subsystem: the ground under the hunt. Gentle rolling prairie —
 * a heightfield from layered value noise (deterministic from a fixed
 * seed), vertex-colored in palette straws so the field reads as a warm
 * patchwork quilt, Firewatch-style, with zero textures. Warm straw and
 * khaki patches, cool olive sweeps in the swales, pale sunbleached crowns
 * on the swells, and fine luminance grain so nothing reads flat.
 *
 * Other subsystems query heightAt(x, z) — the one sanctioned crossing.
 */

export const TERRAIN_SIZE = 480; // meters square (1 sim px ≈ 1 yd ≈ 0.91 m)
const SEGMENTS = 192;

/** Deterministic 2D value noise (no Math.random, no deps). */
function makeNoise(seed: number) {
  const hash = (x: number, y: number) => {
    let h = seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  const smooth = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number): number => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = smooth(x - xi);
    const yf = smooth(y - yi);
    const a = hash(xi, yi);
    const b = hash(xi + 1, yi);
    const c = hash(xi, yi + 1);
    const d = hash(xi + 1, yi + 1);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
}

const SKIRT_INNER = 200;
const SKIRT_OUTER = 700;

/*
 * Sun-drench injection (round-4 item 2): the ground's albedo grades toward
 * the TOD's groundSunTint in a lobe around the sun azimuth, strongest with
 * distance — Firewatch carries the halo's color DOWN onto the field; the
 * light must not stop at the horizon line. A small emissive term rides the
 * lobe so a low sun reads as light striking the ground, not just paint.
 */
const DRENCH_UNIFORM_DECLS = /* glsl */ `
uniform vec2 uSunXZ;
uniform vec3 uSunTint;
uniform float uSunK;
uniform float uSunEmit;
varying vec3 vWPos;
`;

const DRENCH_FRAG = /* glsl */ `
vec2 gTo = vWPos.xz - cameraPosition.xz;
float gD = length( gTo );
float gAz = clamp( dot( gTo / max( gD, 1e-3 ), uSunXZ ), 0.0, 1.0 );
float gLobe = gAz * gAz * smoothstep( 4.0, 90.0, gD ) * uSunK;
diffuseColor.rgb = mix( diffuseColor.rgb, uSunTint, min( gLobe, 0.8 ) );
`;

export class TerrainSystem implements Subsystem {
  readonly id = 'terrain';
  private noise = makeNoise(1971);
  // The grass system's fertility field (same seed 4127, same octaves): the
  // ground tints toward trodden grass-olive wherever tufts will grow, so
  // dirt reads as patches INSIDE grass instead of grass as ornaments on
  // dirt. Duplicated-noise cross-sampling is the established "one print"
  // pattern (grass already replicates this file's 1971 paint fields).
  private fertNoise = makeNoise(4127);
  private mesh?: THREE.Mesh;
  private skirt?: THREE.Mesh;
  private groundMat?: THREE.MeshLambertMaterial;
  // Drench uniforms (preallocated; shared by plate and skirt material).
  private drench = {
    uSunXZ: { value: new THREE.Vector2(1, 0) },
    uSunTint: { value: new THREE.Color() },
    uSunK: { value: 0 },
    uSunEmit: { value: 0 },
  };

  /** One ground material for plate + skirt, with the sun-drench injection. */
  private makeGroundMat(): THREE.MeshLambertMaterial {
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const uniforms = this.drench;
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
        .replace(
          '#include <worldpos_vertex>',
          '#include <worldpos_vertex>\n\tvWPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;',
        );
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\n' + DRENCH_UNIFORM_DECLS)
        .replace('#include <color_fragment>', '#include <color_fragment>\n' + DRENCH_FRAG)
        .replace(
          '#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += uSunTint * ( gLobe * uSunEmit );',
        );
    };
    return mat;
  }

  private applyTod(tod: TimeOfDay): void {
    const spec = TOD[tod];
    const az = THREE.MathUtils.degToRad(spec.sunAzimuth);
    this.drench.uSunXZ.value.set(Math.sin(az), Math.cos(az));
    this.drench.uSunTint.value.setHex(spec.groundSunTint);
    this.drench.uSunK.value = spec.groundSunK;
    this.drench.uSunEmit.value = spec.groundSunEmit;
  }

  heightAt(x: number, z: number): number {
    const n1 = this.noise(x * 0.006 + 100, z * 0.006 + 100); // broad swells
    const n15 = this.noise(x * 0.016 + 1300, z * 0.016 + 1300); // rolling mid
    const n2 = this.noise(x * 0.05 + 300, z * 0.05 + 300); // local roll
    return (n1 - 0.5) * 18 + (n15 - 0.5) * 6 + (n2 - 0.5) * 1.4 + 6;
  }

  init(ctx: Ctx): void {
    const geo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, SEGMENTS, SEGMENTS);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    // Cool umber soil (item 1): the bare-dirt half of the field leans cool
    // and dark, so the sun drench's warm straw half has something to answer
    // — two hues in the ground, never one tan ramp.
    const soil = new THREE.Color(P.soilBrown).lerp(new THREE.Color(P.soilCool), 0.6);
    const soilDark = new THREE.Color(P.soilDark).lerp(new THREE.Color(P.soilCool), 0.35);
    const khaki = new THREE.Color(P.khaki);
    const pale = new THREE.Color(P.strawPale);
    const olive = new THREE.Color(P.oliveMid);
    // Trodden ground-cover tone under the tuft clumps: straw-olive, clearly
    // a grass hue, a half-step darker than the gold tufts riding it (the
    // first pass at 0.78x read as mud under grazing dawn light).
    // Half a step darker than before: the tufts riding it are gold, and the
    // value gap between sward and tuft is what keeps the lower two-thirds
    // of frame from fusing into one rust mass (round-1/2's core complaint).
    const sward = new THREE.Color(P.grassOlive).lerp(new THREE.Color(P.grassGold), 0.22).multiplyScalar(0.84);
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = this.heightAt(x, z);
      pos.setY(i, y);

      // Soil base: brown, 15-20% darker than round 2's straw ramp, with a
      // patchwork drift toward khaki so it still reads painted.
      const patch = this.noise(x * 0.016 + 700, z * 0.016 + 700);
      tmp.copy(soil).lerp(khaki, Math.min(0.7, patch * 0.8));
      // Dry-dirt patches sink darker and browner, not lighter.
      const dry = this.noise(x * 0.021 + 4200, z * 0.021 + 4200);
      if (dry < 0.45) tmp.lerp(soilDark, Math.min(0.85, (0.45 - dry) * 2.2));
      // Cool olive sweeps — the field's shadowed, damper runs.
      const cool = this.noise(x * 0.011 + 1900, z * 0.011 + 1900);
      if (cool < 0.35) tmp.lerp(olive, Math.min(0.55, (0.35 - cool) * 1.5));
      // Ground cover: wherever the grass fertility field will grow tufts,
      // the ground itself turns grass-toned (a dark sward the gold tufts
      // sit on). Same formula as GrassSystem.fillTile — one print.
      const macro = this.fertNoise(x * 0.055 + 40, z * 0.055 + 40);
      const meso = this.fertNoise(x * 0.16 + 700, z * 0.16 + 700);
      const fertile = macro * 0.62 + meso * 0.38;
      const swardT = THREE.MathUtils.clamp((fertile - 0.36) / 0.2, 0, 1);
      tmp.lerp(sward, swardT * 0.6);
      // Pale crowns on the high swells only where grass thins out.
      const hNorm = THREE.MathUtils.clamp((y - 8) / 8, 0, 1);
      tmp.lerp(pale, hNorm * 0.18 * (1 - swardT * 0.7));
      if (y < 2) tmp.lerp(olive, (2 - y) * 0.05);
      // Mid-scale bands (~30m) so the far field keeps painted texture
      // instead of airbrushing to bare sand at distance.
      const band = this.noise(x * 0.035 + 9000, z * 0.035 + 9000);
      if (band > 0.6) tmp.lerp(khaki, Math.min(0.4, (band - 0.6) * 0.9));
      if (band < 0.35) tmp.lerp(olive, Math.min(0.35, (0.35 - band) * 0.8));
      // Grass-stroke scale (the foreground is a handful of meters — the
      // big patches above never show there): soil-toned strokes at 3-6m
      // so near ground reads painted, not airbrushed.
      const strokeA = this.noise(x * 0.19 + 5000, z * 0.19 + 5000);
      const strokeB = this.noise(x * 0.47 + 8000, z * 0.47 + 8000);
      if (strokeA > 0.58) tmp.lerp(khaki, Math.min(1, (strokeA - 0.58) * 0.9));
      if (strokeA < 0.36) tmp.lerp(soilDark, Math.min(0.8, (0.36 - strokeA) * 0.9));
      // Fine grain: ±11% luminance jitter so nothing reads airbrushed
      // (kept modest — per-vertex jitter aliases into streaks at grazing
      // angles; the grass subsystem will carry the near-field texture).
      const g = 0.89 + strokeB * 0.22;
      tmp.r *= g;
      tmp.g *= g;
      tmp.b *= g;

      colors[i * 3] = tmp.r;
      colors[i * 3 + 1] = tmp.g;
      colors[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    this.groundMat = this.makeGroundMat();
    const mesh = new THREE.Mesh(geo, this.groundMat);
    mesh.receiveShadow = true;
    ctx.scene.add(mesh);
    this.mesh = mesh;

    this.buildSkirt(ctx);

    this.applyTod(ctx.timeOfDay);
    ctx.events.addEventListener('tod', ((e: CustomEvent) => this.applyTod(e.detail)) as EventListener);
  }

  /**
   * Ground skirt: an annulus that tucks under the plate edge and runs flat
   * out beneath the ridge cards, so the world never terminates in a bare
   * plane edge with sky sparkle leaking through the terrain-to-ridge gap.
   */
  private buildSkirt(ctx: Ctx): void {
    const geo = new THREE.RingGeometry(SKIRT_INNER, SKIRT_OUTER, 128, 6);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const soil = new THREE.Color(P.soilBrown);
    const khaki = new THREE.Color(P.khaki);
    const sward = new THREE.Color(P.grassOlive).multiplyScalar(0.85);
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const r = Math.hypot(x, z);
      const t = THREE.MathUtils.clamp((r - SKIRT_INNER) / 150, 0, 1);
      // Follow the heightfield (half a meter under the plate) near the rim,
      // settle to a calm plain further out.
      const y = THREE.MathUtils.lerp(this.heightAt(x, z) - 0.5, 0.8, t * t * (3 - 2 * t));
      pos.setY(i, y);
      // Muted soil-olive — matches the plate's new darker average so the
      // fogged far plain never glows like water at midday.
      const patch = this.noise(x * 0.016 + 700, z * 0.016 + 700);
      tmp.copy(soil).lerp(khaki, 0.2 + patch * 0.35).lerp(sward, 0.35).multiplyScalar(0.95);
      colors[i * 3] = tmp.r;
      colors[i * 3 + 1] = tmp.g;
      colors[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    // Same injected material as the plate: the drench lobe must run out to
    // the horizon, not stop at the plate edge.
    const mesh = new THREE.Mesh(geo, this.groundMat!);
    ctx.scene.add(mesh);
    this.skirt = mesh;
  }

  // Rocks and snags moved to the flora subsystem (src/three/subsystems/
  // flora.ts), which owns all props and midground mass.

  dispose(ctx: Ctx): void {
    if (this.mesh) {
      ctx.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh = undefined;
    }
    if (this.skirt) {
      ctx.scene.remove(this.skirt);
      this.skirt.geometry.dispose();
      this.skirt = undefined;
    }
    // Plate and skirt share the one injected ground material.
    this.groundMat?.dispose();
    this.groundMat = undefined;
  }
}
