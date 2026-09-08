import * as THREE from 'three';
import type { GroundSample, LandscapeModel } from '../../game/landscape';
import type { Ctx, Subsystem } from '../engine';
import { P, TOD, type TimeOfDay } from '../palette';
import { QuailTerrain } from './quailTerrain';
import { ChukarTerrain } from './chukarTerrain';
import { PropertyTerrain } from './propertyTerrain';

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
// 1000, was 700 (item 12): at noon's thin fog a 700 m rim was only ~80%
// fogged where the dome below-horizon is 100% — a visible seam band. At
// 1000 m the exp2 integral closes to ~95% and the haze gradient reads
// continuous. Same vertex count; the outer rings just stretch.
const SKIRT_OUTER = 1000;

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
uniform vec2 uSunRange;
uniform vec3 uCoolTint;
uniform float uCoolK;
uniform float uCloudShK;
uniform float uCloudT;
uniform vec3 uDetailDark;
uniform vec3 uDetailLight;
uniform float uDetailK;
uniform float uStoneK;
uniform float uWetK;
uniform float uWetLine;
varying vec3 vWPos;

float groundHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float groundNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(groundHash(i), groundHash(i + vec2(1.0, 0.0)), f.x),
             mix(groundHash(i + vec2(0.0, 1.0)), groundHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
`;

// Round 5: the lobe is two-term — a broad wash plus a TIGHT bloom wedge
// under the disc (pow 8) so a low sun visibly pools on the ground along
// its azimuth instead of a uniform warm filter. The cool-mass term is the
// complement: everything the lobe does NOT claim grades toward the sky's
// ambient (the lastlight violet shadow mass; ~0 in daylight).
const DRENCH_FRAG = /* glsl */ `
float gFine = groundNoise(vWPos.xz * 0.72);
float gMeso = groundNoise(vWPos.xz * 0.105 + vec2(18.0, 41.0));
float gMacro = groundNoise(vWPos.xz * 0.026 + vec2(73.0, 12.0));
float gFibers = 0.5 + 0.5 * sin(vWPos.x * 2.4 + groundNoise(vWPos.xz * 0.18) * 5.0);
float gDetail = clamp(gFine * 0.42 + gMeso * 0.38 + gMacro * 0.2, 0.0, 1.0);
diffuseColor.rgb = mix(diffuseColor.rgb, mix(uDetailDark, uDetailLight, gDetail), uDetailK * (0.16 + 0.24 * gMeso));
diffuseColor.rgb *= 0.91 + gFine * 0.16 + gFibers * 0.035 * uDetailK;
float gStone = smoothstep(0.64, 0.9, gMeso * 0.72 + gFine * 0.28) * uStoneK;
diffuseColor.rgb = mix(diffuseColor.rgb, uDetailLight, gStone * 0.22);
float gWet = smoothstep(uWetLine + 1.4, uWetLine - 1.2, vWPos.y) * uWetK;
diffuseColor.rgb = mix(diffuseColor.rgb, uDetailDark * vec3(0.72, 0.82, 0.78), gWet * (0.2 + gMeso * 0.16));
vec2 gTo = vWPos.xz - cameraPosition.xz;
float gD = length( gTo );
float gAz = clamp( dot( gTo / max( gD, 1e-3 ), uSunXZ ), 0.0, 1.0 );
float gAz4 = gAz * gAz * gAz * gAz;
// Round 6 (item 5): the tight bloom under the disc is its own term so the
// emissive can ride it alone — a bright warm wedge pooling on the ground
// directly below the sun, falling off toward the camera with the same
// distance ramp, instead of one broad wash that never reads as A wedge.
float gDist = smoothstep( uSunRange.x, uSunRange.y, gD );
float gBloom = gAz4 * gAz4 * gDist * uSunK;
float gLobe = min( gAz * gAz * 0.6 * gDist * uSunK + gBloom * 0.7, 0.85 );
// Albedo takes only HALF the lobe (a hue grade, not red paint); the
// emissive bloom below carries the heat of the wedge.
diffuseColor.rgb = mix( diffuseColor.rgb, uSunTint, gLobe * 0.55 );
float gCool = uCoolK * ( 1.0 - min( gLobe * 2.2, 1.0 ) );
diffuseColor.rgb = mix( diffuseColor.rgb, uCoolTint, gCool );
// Round-6 drifting cloud shade (verdict item 1's cheap option): a slow
// scrolling soft mask — two crossed sines make ~35-55 m dapples that
// drift with the wind. GrassSystem runs the IDENTICAL formula off the
// same clock so tufts and ground darken as one mass. Full-cover noon
// only (uCloudShK gates by cloudAmount and sun height in applyTod).
float gCs = sin( vWPos.x * 0.085 + uCloudT ) * sin( vWPos.z * 0.058 + 1.7 + uCloudT * 0.73 );
diffuseColor.rgb *= 1.0 - 0.2 * smoothstep( 0.3, 0.75, gCs ) * uCloudShK;
`;

export class TerrainSystem implements Subsystem {
  readonly id = 'terrain';
  private quail?: QuailTerrain;
  private chukar?: ChukarTerrain;
  private property?: PropertyTerrain;
  private noise: ReturnType<typeof makeNoise>;
  // The grass system's fertility field (same seed 4127, same octaves): the
  // ground tints toward trodden grass-olive wherever tufts will grow, so
  // dirt reads as patches INSIDE grass instead of grass as ornaments on
  // dirt. Duplicated-noise cross-sampling is the established "one print"
  // pattern (grass already replicates this file's 1971 paint fields).
  private fertNoise = makeNoise(4127);
  private mesh?: THREE.Mesh;
  private skirt?: THREE.Mesh;
  private groundMat?: THREE.MeshLambertMaterial;
  private surface: GroundSample = { height: 0, slope: 0, gradeX: 0, gradeZ: 0, rockiness: 0, vegetation: 0, moisture: 0 };
  // Drench uniforms (preallocated; shared by plate and skirt material).
  private drench = {
    uSunXZ: { value: new THREE.Vector2(1, 0) },
    uSunTint: { value: new THREE.Color() },
    uSunK: { value: 0 },
    uSunEmit: { value: 0 },
    uSunRange: { value: new THREE.Vector2(10, 80) },
    uCoolTint: { value: new THREE.Color() },
    uCoolK: { value: 0 },
    uCloudShK: { value: 0 },
    uCloudT: { value: 0 },
    uDetailDark: { value: new THREE.Color(0x625038) },
    uDetailLight: { value: new THREE.Color(0xb9a475) },
    uDetailK: { value: 0.14 },
    uStoneK: { value: 0 },
    uWetK: { value: 0 },
    uWetLine: { value: 0 },
  };

  constructor(private readonly landscape: LandscapeModel) {
    this.noise = makeNoise(landscape.area.terrain.seed);
    if (landscape.area.id === 'chukar-ridge') {
      this.drench.uDetailDark.value.setHex(0x584637);
      this.drench.uDetailLight.value.setHex(0xc1aa7e);
      this.drench.uDetailK.value = 0.48;
      this.drench.uStoneK.value = 0.72;
    } else if (landscape.area.id === 'pheasant-coverts') {
      this.drench.uDetailDark.value.setHex(0x554625);
      this.drench.uDetailLight.value.setHex(0xc8ae74);
      this.drench.uDetailK.value = 0.52;
      this.drench.uWetK.value = 0.78;
      this.drench.uWetLine.value = landscape.area.terrain.baseHeight - 0.9;
    }
  }

  /** Grass samples the identical paint field so ground and tufts agree. */
  paintSeed(): number {
    return this.landscape.area.terrain.seed;
  }

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
          '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += uSunTint * ( ( gLobe + gBloom * 0.9 ) * uSunEmit );',
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
    this.drench.uSunRange.value.set(spec.groundSunNear, spec.groundSunFar);
    this.drench.uCoolTint.value.setHex(spec.groundCoolTint);
    this.drench.uCoolK.value = spec.groundCoolK;
    // Cloud dapples only under a committed cumulus deck with the sun high
    // enough that a cloud's shadow lands near the cloud (golden hours
    // throw them out of frame anyway — and their long prop shadows are
    // the hero there).
    this.drench.uCloudShK.value =
      spec.cloudAmount * THREE.MathUtils.clamp((spec.sunElevation - 15) / 20, 0, 1);
  }

  heightAt(x: number, z: number): number {
    return this.landscape.heightAtWorld(x, z);
  }

  init(ctx: Ctx): void | Promise<void> {
    if(this.landscape.area.id==='chukar-ridge'){
      this.chukar=new ChukarTerrain(this.landscape);this.chukar.init(ctx);return;
    }
    if (this.landscape.area.id === 'quail-fields') {
      this.quail = new QuailTerrain(this.landscape);
      return this.quail.init(ctx);
    }
    // Every other property receives the full authored heightfield. The old
    // generic branch below is retained for its mature palette recipe, but the
    // tiled property terrain is the runtime path for maps outside the two
    // bespoke worlds above.
    this.property = new PropertyTerrain(this.landscape);
    return this.property.init(ctx);
    const geo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, SEGMENTS, SEGMENTS);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    // Round-4 soil agreement: the ground between tufts is DEAD THATCH —
    // duff in grass-adjacent straw-browns — so ground and grass read as one
    // dry meadow with dirt showing through, never grass stapled onto mud.
    // True dirt (cool, darker) is confined to the bare patches the grass
    // fertility field carves out — dirt is the exception, not the default.
    // Round-5 hue pull (item 4): duff leans INTO the grass band — dead
    // thatch with a green-gold undertone, a half stop darker than before —
    // so soil glimpsed between clumps reads as earth under a meadow, and
    // the whole floor sits closer to the tufts riding it.
    // Khaki pull reduced (0.35 -> 0.24): khaki's H36/S0.72 dragged the
    // cooled soil straight back into the tuft hue band.
    const duff = new THREE.Color(P.soilBrown)
      .lerp(new THREE.Color(P.khaki), 0.24)
      .lerp(new THREE.Color(P.grassOlive), 0.22)
      .multiplyScalar(0.93);
    const soilBare = new THREE.Color(P.soilBrown).lerp(new THREE.Color(P.soilCool), 0.45);
    const soilDark = new THREE.Color(P.soilDark).lerp(new THREE.Color(P.soilCool), 0.3);
    // Mottle-dip tone: deep olive pulled toward the grass band — dark
    // enough to survive noon tone mapping, still reading as denser grass.
    const oliveDeepMix = new THREE.Color(P.olive).lerp(new THREE.Color(P.grassOlive), 0.35);
    const khaki = new THREE.Color(P.khaki);
    const pale = new THREE.Color(P.strawPale);
    const olive = new THREE.Color(P.oliveMid);
    // Trodden ground-cover tone under the tuft mass: straw-olive, clearly a
    // grass hue, a half-step darker than the gold tufts riding it so the
    // sward-vs-tuft value gap survives, but no darker — the body mass now
    // covers most of it, and what shows through must read thatch.
    // Matched to GrassSystem.swardTone (the tuft haze target): the painted
    // meadow band past the fade line must be the same print the dissolving
    // tufts land on — mid-distance reads as texture, never as static.
    const sward = new THREE.Color(P.grassOlive).lerp(new THREE.Color(P.grassGold), 0.42).multiplyScalar(0.97);
    const rimDust = new THREE.Color(P.rimrockDust);
    const rimSoil = new THREE.Color(P.rimrockSoil);
    const rimStone = new THREE.Color(P.rimrockStone);
    const rimStoneLight = new THREE.Color(P.rimrockStoneLight);
    const rimShade = new THREE.Color(P.rimrockShade);
    const rimSage = new THREE.Color(P.rimrockSage);
    const rimLichen = new THREE.Color(P.rimrockLichen);
    const rimrock = this.landscape.area.terrain.kind === 'rimrock';
    const pheasant = this.landscape.area.id === 'pheasant-coverts';
    const prairieDry = new THREE.Color(0x9b7d48);
    const prairiePale = new THREE.Color(0xc3aa75);
    const prairieThatch = new THREE.Color(0x705a30);
    const prairieWet = new THREE.Color(0x404832);
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = this.heightAt(x, z);
      pos.setY(i, y);

      if (rimrock) {
        const surface = this.landscape.surfaceAtWorld(x, z, this.surface);
        const geology = this.noise(x * 0.018 + 7100, z * 0.018 + 7100);
        const scree = this.noise(x * 0.085 + 9300, z * 0.085 + 9300);
        const dryGrass = this.noise(x * 0.038 + 3300, z * 0.038 + 3300);
        tmp.copy(rimSoil).lerp(rimDust, 0.3 + dryGrass * 0.42);
        tmp.lerp(rimSage, surface.vegetation * 0.2 * (1 - surface.rockiness));
        if (scree > 0.55) {
          tmp.lerp(rimStoneLight, (scree - 0.55) * 0.65 * (0.35 + surface.rockiness));
        }
        tmp.lerp(rimStone, surface.rockiness * (0.58 + geology * 0.3));
        if (surface.slope > 0.42) {
          tmp.lerp(rimShade, Math.min(0.38, (surface.slope - 0.42) * 0.3));
        }
        const lichen = this.noise(x * 0.12 + 12100, z * 0.12 + 12100);
        if (surface.rockiness > 0.56 && lichen > 0.74) {
          tmp.lerp(rimLichen, (lichen - 0.74) * 0.85);
        }
        tmp.multiplyScalar(0.9 + geology * 0.18);
        colors[i * 3] = tmp.r;
        colors[i * 3 + 1] = tmp.g;
        colors[i * 3 + 2] = tmp.b;
        continue;
      }

      if (pheasant) {
        const surface = this.landscape.surfaceAtWorld(x, z, this.surface);
        const sweep = this.noise(x * 0.014 + 3100, z * 0.014 + 3100);
        const litter = this.noise(x * 0.095 + 7400, z * 0.095 + 7400);
        const stubble = this.noise(x * 0.31 + 12400, z * 0.12 + 12400);
        tmp.copy(prairieDry).lerp(prairiePale, 0.12 + sweep * 0.34);
        tmp.lerp(prairieThatch, (1 - litter) * 0.22);
        tmp.lerp(prairieWet, surface.moisture * (0.28 + litter * 0.3));
        if (stubble > 0.64 && surface.moisture < 0.45) {
          tmp.lerp(prairiePale, (stubble - 0.64) * 0.34);
        }
        tmp.multiplyScalar(0.9 + sweep * 0.16 + litter * 0.08);
        colors[i * 3] = tmp.r;
        colors[i * 3 + 1] = tmp.g;
        colors[i * 3 + 2] = tmp.b;
        continue;
      }

      // Duff base: dead-thatch straw-brown with a patchwork drift toward
      // khaki — grass-adjacent everywhere, so tufts and soil are one field.
      const patch = this.noise(x * 0.016 + 700, z * 0.016 + 700);
      tmp.copy(duff).lerp(khaki, Math.min(0.4, patch * 0.5));
      // Dry-dirt sinks stay, but tighter and shallower — accents, not the
      // floor's identity.
      const dry = this.noise(x * 0.021 + 4200, z * 0.021 + 4200);
      if (dry < 0.34) tmp.lerp(soilDark, Math.min(0.5, (0.34 - dry) * 1.6));
      // Cool olive sweeps — the field's shadowed, damper runs.
      const cool = this.noise(x * 0.011 + 1900, z * 0.011 + 1900);
      if (cool < 0.35) tmp.lerp(olive, Math.min(0.55, (0.35 - cool) * 1.5));
      // Ground cover: wherever the grass fertility field grows the tuft
      // mass, the ground turns grass-toned sward; where it carves a BARE
      // patch, real dirt shows through. Same formula as
      // GrassSystem.fillTile — one print, dirt as the exception.
      const macro = this.fertNoise(x * 0.055 + 40, z * 0.055 + 40);
      const meso = this.fertNoise(x * 0.16 + 700, z * 0.16 + 700);
      const fertile = macro * 0.62 + meso * 0.38;
      // Aligned with the grass bald threshold (0.17): dirt paints only
      // where tufts genuinely stop; the runt fringe stays sward-toned.
      // 0.72, was 0.85 (round 5): full sward coverage hid every square
      // meter of umber — the measured fg hue range was 8 deg vs the ref's
      // 16. Duff must breathe through the grass paint.
      const swardT = THREE.MathUtils.clamp((fertile - 0.2) / 0.24, 0, 1);
      tmp.lerp(sward, swardT * 0.72);
      if (fertile < 0.19) tmp.lerp(soilBare, Math.min(0.75, (0.19 - fertile) * 5));
      // Pale crowns on the high swells only where grass thins out (kept
      // shy — crown bleach was a third of the noon bone-pale wash).
      const hNorm = THREE.MathUtils.clamp((y - 8) / 8, 0, 1);
      tmp.lerp(pale, hNorm * 0.08 * (1 - swardT * 0.7));
      if (y < 2) tmp.lerp(olive, (2 - y) * 0.05);
      // Mid-scale bands (~30m), STRONGER than round 3: past the tuft draw
      // distance these are what keep the field from airbrushing to one
      // mustard ramp under flat noon light. Dips go to DEEP olive — the
      // shallow oliveMid dips vanished inside ACES at noon.
      const band = this.noise(x * 0.035 + 9000, z * 0.035 + 9000);
      if (band > 0.58) tmp.lerp(khaki, Math.min(0.5, (band - 0.58) * 1.1));
      if (band < 0.4) tmp.lerp(oliveDeepMix, Math.min(0.5, (0.4 - band) * 1.3));
      // Macro mottle (~70-110m): broad meadow-scale drifts between pale
      // bleached sweeps and olive runs, so the 40m-to-horizon band carries
      // scale under any light — the noon dead-band killer.
      const mot = this.noise(x * 0.009 + 15000, z * 0.009 + 15000);
      if (mot > 0.55) tmp.lerp(pale, Math.min(0.26, (mot - 0.55) * 0.7));
      else if (mot < 0.44) tmp.lerp(oliveDeepMix, Math.min(0.5, (0.44 - mot) * 1.25));
      // Grass-stroke scale (the foreground is a handful of meters — the
      // big patches above never show there): soil-toned strokes at 3-6m
      // so near ground reads painted, not airbrushed.
      const strokeA = this.noise(x * 0.19 + 5000, z * 0.19 + 5000);
      const strokeB = this.noise(x * 0.47 + 8000, z * 0.47 + 8000);
      if (strokeA > 0.58) tmp.lerp(khaki, Math.min(1, (strokeA - 0.58) * 0.9));
      // Litter/thatch strokes (item 4): the dark runs are dead grass in
      // shade — olive-thatch, not mud — so the near floor reads duff.
      if (strokeA < 0.36) tmp.lerp(oliveDeepMix, Math.min(0.55, (0.36 - strokeA) * 0.9));
      // Soil strokes carry the fg's cool-umber floor (round 5: wider and
      // stronger — these are the H17 pixels the ref meadow shows as dirt).
      if (strokeB < 0.34) tmp.lerp(soilDark, Math.min(0.5, (0.34 - strokeB) * 1.1));
      // Fine grain plus band- and meadow-scale luminance swings: ±10%
      // blade-scale jitter riding a ±12% 30m wave riding a ±13% 110m wave.
      // ACES at noon compresses mid-tone differences ~3:1 — the input
      // amplitude must be this loud for ANY texture to survive flat light.
      const g = (0.9 + strokeB * 0.2) * (0.88 + band * 0.24) * (0.87 + mot * 0.26);
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
    // 24 radial rings (was 6): the far plain needs enough vertex density to
    // carry the same mid-distance mottle as the plate — a 6-ring skirt
    // interpolates any paint into one smooth mustard band by 300m out.
    const geo = new THREE.RingGeometry(SKIRT_INNER, SKIRT_OUTER, 128, 24);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const duff = new THREE.Color(P.soilBrown)
      .lerp(new THREE.Color(P.khaki), 0.22)
      .lerp(new THREE.Color(P.grassOlive), 0.22)
      .multiplyScalar(0.93);
    const khaki = new THREE.Color(P.khaki);
    // Same sward print as the plate (slightly dimmed with distance).
    const sward = new THREE.Color(P.grassOlive).lerp(new THREE.Color(P.grassGold), 0.42).multiplyScalar(0.92);
    const oliveDeepMix = new THREE.Color(P.olive).lerp(new THREE.Color(P.grassOlive), 0.35);
    const pale = new THREE.Color(P.strawPale);
    const rimrock = this.landscape.area.terrain.kind === 'rimrock';
    const rimDust = new THREE.Color(P.rimrockDust);
    const rimSoil = new THREE.Color(P.rimrockSoil);
    const rimStone = new THREE.Color(P.rimrockStone);
    const rimShade = new THREE.Color(P.rimrockShade);
    const pheasant = this.landscape.area.id === 'pheasant-coverts';
    const prairieDry = new THREE.Color(0x927544);
    const prairiePale = new THREE.Color(0xb99f6b);
    const prairieWet = new THREE.Color(0x46503a);
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const r = Math.hypot(x, z);
      const t = THREE.MathUtils.clamp((r - SKIRT_INNER) / 150, 0, 1);
      // Follow the heightfield (half a meter under the plate) near the rim,
      // settle to a calm plain further out.
      // Prairie settles into a calm fog plain. Rimrock must keep folding to
      // the horizon or the canyon collapses into horizontal color bands.
      const y = rimrock
        ? this.heightAt(x, z) - 0.5
        : THREE.MathUtils.lerp(this.heightAt(x, z) - 0.5, 0.8, t * t * (3 - 2 * t));
      pos.setY(i, y);
      if (rimrock) {
        const surface = this.landscape.surfaceAtWorld(x, z, this.surface);
        const geology = this.noise(x * 0.018 + 7100, z * 0.018 + 7100);
        tmp.copy(rimSoil).lerp(rimDust, 0.32 + geology * 0.38);
        tmp.lerp(rimStone, surface.rockiness * 0.65);
        tmp.lerp(rimShade, Math.min(0.28, surface.slope * 0.14));
        tmp.multiplyScalar(0.86 + geology * 0.18);
        colors[i * 3] = tmp.r;
        colors[i * 3 + 1] = tmp.g;
        colors[i * 3 + 2] = tmp.b;
        continue;
      }
      if (pheasant) {
        const surface = this.landscape.surfaceAtWorld(x, z, this.surface);
        const sweep = this.noise(x * 0.014 + 3100, z * 0.014 + 3100);
        tmp.copy(prairieDry).lerp(prairiePale, 0.16 + sweep * 0.38);
        tmp.lerp(prairieWet, surface.moisture * 0.42);
        tmp.multiplyScalar(0.88 + sweep * 0.2);
        colors[i * 3] = tmp.r;
        colors[i * 3 + 1] = tmp.g;
        colors[i * 3 + 2] = tmp.b;
        continue;
      }
      // Same duff-meadow print as the plate: sward where the fertility
      // field runs fertile, khaki/olive band mottle, meadow-scale
      // luminance drift — the horizon band mottles like the field it
      // extends instead of going one smooth mustard.
      const patch = this.noise(x * 0.016 + 700, z * 0.016 + 700);
      tmp.copy(duff).lerp(khaki, 0.15 + patch * 0.4);
      const macro = this.fertNoise(x * 0.055 + 40, z * 0.055 + 40);
      const meso = this.fertNoise(x * 0.16 + 700, z * 0.16 + 700);
      const fertile = macro * 0.62 + meso * 0.38;
      const swardT = THREE.MathUtils.clamp((fertile - 0.2) / 0.24, 0, 1);
      tmp.lerp(sward, 0.3 + swardT * 0.5);
      const band = this.noise(x * 0.035 + 9000, z * 0.035 + 9000);
      if (band > 0.58) tmp.lerp(khaki, Math.min(0.5, (band - 0.58) * 1.1));
      if (band < 0.4) tmp.lerp(oliveDeepMix, Math.min(0.48, (0.4 - band) * 1.25));
      const mot = this.noise(x * 0.009 + 15000, z * 0.009 + 15000);
      if (mot > 0.55) tmp.lerp(pale, Math.min(0.22, (mot - 0.55) * 0.6));
      else if (mot < 0.44) tmp.lerp(oliveDeepMix, Math.min(0.48, (0.44 - mot) * 1.2));
      tmp.multiplyScalar(0.95 * (0.88 + band * 0.24) * (0.87 + mot * 0.26));
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

  /** One uniform write per frame: the cloud-shade mask drifts with time. */
  update(ctx: Ctx): void {
    this.quail?.update(ctx);
    this.chukar?.update(ctx);
    this.property?.update(ctx);
    this.drench.uCloudT.value = ctx.time * 0.14;
  }

  // Rocks and snags moved to the flora subsystem (src/three/subsystems/
  // flora.ts), which owns all props and midground mass.

  dispose(ctx: Ctx): void {
    this.quail?.dispose(ctx);
    this.quail = undefined;
    this.chukar?.dispose(ctx);this.chukar=undefined;
    this.property?.dispose(ctx);this.property=undefined;
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
