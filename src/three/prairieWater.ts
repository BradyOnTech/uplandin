import * as THREE from 'three';
import type { Ctx } from './engine';

/**
 * Prairie slough water in the low-poly style: flat-shaded wind facets that
 * each catch the light, the real sky reflected by angle (horizon to zenith),
 * the dark band of the far bank mirrored just above the waterline, a sharp
 * sun glint, peat-dark depth over olive shallows and a wet rim where it
 * meets the mud. Uses the pond's radial uv (0 at the centre, 1 at the edge).
 */
export interface PrairieWater {
  material: THREE.MeshStandardMaterial;
  update(ctx: Ctx): void;
}

export function createPrairieWater(): PrairieWater {
  const uniforms = {
    uWaterTime: { value: 0 },
    uSkyHorizon: { value: new THREE.Color(0xc9cfc6) },
    uSkyMid: { value: new THREE.Color(0x9fb6c6) },
    uSkyTop: { value: new THREE.Color(0x5f84a8) },
    uSunDir: { value: new THREE.Vector3(.3, .5, .2).normalize() },
    uSunColor: { value: new THREE.Color(0xfff1d6) },
    uDeep: { value: new THREE.Color(0x14282b) },
    uShallow: { value: new THREE.Color(0x4d4d33) },
    uBank: { value: new THREE.Color(0x3b3a24) },
  };
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: .3, metalness: 0, transparent: true, opacity: 1, depthWrite: false, flatShading: true,
  });
  material.customProgramCacheKey = () => 'prairie-water-v3';
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vPondUV;\nvarying vec3 vWaterWorld;\nuniform float uWaterTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vPondUV = uv;
        vec3 pondWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        // Wind chop across the facets, stilled toward the reeds.
        float calm = 1.0 - smoothstep(.62, .98, length(uv * 2.0 - 1.0));
        float chop = sin(pondWorld.x * .9 + uWaterTime * 1.3) * .45
          + sin(pondWorld.z * 1.3 - uWaterTime * 1.05 + pondWorld.x * .4) * .35
          + sin((pondWorld.x + pondWorld.z) * 2.1 + uWaterTime * 2.2) * .2;
        transformed.y += chop * .05 * calm;`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vWaterWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec2 vPondUV;
        varying vec3 vWaterWorld;
        uniform vec3 uSkyHorizon, uSkyMid, uSkyTop, uSunDir, uSunColor, uDeep, uShallow, uBank;`)
      .replace('#include <opaque_fragment>', `
        {
          float shore = length(vPondUV * 2.0 - 1.0);
          // Faceted world normal from the displaced surface: the low-poly look.
          vec3 facet = normalize(cross(dFdx(vWaterWorld), dFdy(vWaterWorld)));
          if (facet.y < 0.0) facet = -facet;
          vec3 toEye = normalize(cameraPosition - vWaterWorld);
          // Reflections read the broad swell; glints read every facet.
          vec3 swell = normalize(mix(vec3(0.0, 1.0, 0.0), facet, .28));
          vec3 mirror = reflect(-toEye, facet);
          vec3 image = reflect(-toEye, swell);
          float fresnel = .02 + .98 * pow(1.0 - max(dot(swell, toEye), 0.0), 5.0);
          // The sky by the reflected ray's elevation, and the far bank of reeds,
          // mud and trees mirrored as a dark band above the waterline.
          float elevation = image.y;
          vec3 sky = mix(uSkyHorizon, uSkyMid, smoothstep(0.0, .2, elevation));
          sky = mix(sky, uSkyTop, smoothstep(.15, .6, elevation));
          float bankBand = 1.0 - smoothstep(.02, .085, elevation + (facet.x + facet.z) * .02);
          sky = mix(sky, uBank, bankBand * .88);
          // The water body takes the scene's light (and cloud and tree shadow).
          float lit = clamp(dot(outgoingLight, vec3(.2126, .7152, .0722)), .25, 1.4);
          vec3 body = mix(uDeep, uShallow, smoothstep(.3, .96, shore)) * lit;
          vec3 water = mix(body, sky, clamp(fresnel * .85 + .06, 0.0, 1.0));
          // Sun: a hard glint on the facets facing it, with a soft sheen around.
          float toSun = max(dot(mirror, normalize(uSunDir)), 0.0);
          water += uSunColor * (pow(toSun, 260.0) * 5.0 + pow(toSun, 30.0) * .18) * step(0.0, uSunDir.y);
          // A wet, lighter rim where the water thins over the mud.
          water = mix(water, uShallow * 1.35 * lit + sky * .15, smoothstep(.88, .975, shore) * .45);
          outgoingLight = water;
          diffuseColor.a = 1.0 - smoothstep(.965, 1.0, shore);
        }
        #include <opaque_fragment>`);
  };

  let sky: THREE.ShaderMaterial | null | undefined;
  let sun: THREE.DirectionalLight | null | undefined;
  const direction = new THREE.Vector3();
  return {
    material,
    update(ctx: Ctx) {
      uniforms.uWaterTime.value = ctx.time;
      // The sky dome and key light are found once; their colours follow the hour.
      if (sky === undefined || sun === undefined) {
        sky = null; sun = null;
        ctx.scene.traverse(object => {
          const mat = (object as THREE.Mesh).material as THREE.ShaderMaterial | undefined;
          if (!sky && mat && (mat as THREE.ShaderMaterial).uniforms?.uTop && mat.uniforms.uHorizon) sky = mat;
          if (!sun && (object as THREE.DirectionalLight).isDirectionalLight && (object as THREE.DirectionalLight).castShadow) sun = object as THREE.DirectionalLight;
        });
      }
      if (sky) {
        uniforms.uSkyTop.value.copy(sky.uniforms.uTop.value as THREE.Color);
        uniforms.uSkyMid.value.copy(sky.uniforms.uMid.value as THREE.Color);
        uniforms.uSkyHorizon.value.copy(sky.uniforms.uHorizon.value as THREE.Color);
      } else {
        const fog = ctx.scene.fog as THREE.Fog | THREE.FogExp2 | null;
        if (fog) { uniforms.uSkyHorizon.value.copy(fog.color); uniforms.uSkyMid.value.copy(fog.color).lerp(new THREE.Color(0x7d9ec0), .4); }
      }
      if (sun) {
        direction.copy(sun.position).sub(sun.target.position).normalize();
        uniforms.uSunDir.value.copy(direction);
        uniforms.uSunColor.value.copy(sun.color).multiplyScalar(Math.min(1.6, sun.intensity));
      }
    },
  };
}
