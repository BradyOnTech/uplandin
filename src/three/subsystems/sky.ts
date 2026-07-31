import * as THREE from 'three';
import type { Ctx, Subsystem } from '../engine';
import { TOD, type TimeOfDay } from '../palette';

/*
 * SKY subsystem: gradient dome, sun, hemisphere ambient, and fog — all
 * keyed off the TimeOfDay presets in palette.ts. Firewatch's skies are
 * two-color gradients with a hot horizon band at dawn/dusk; this dome
 * shader does exactly that (top → horizon lerp with a tightening band).
 */

const VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAG = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform float uBand; // horizon band tightness
varying vec3 vWorld;
void main() {
  float h = normalize(vWorld).y;               // -1..1
  float t = pow(clamp(h, 0.0, 1.0), uBand);    // hug the horizon
  vec3 col = mix(uHorizon, uTop, t);
  // Below the horizon, settle toward the horizon tone (ground haze).
  if (h < 0.0) col = uHorizon;
  gl_FragColor = vec4(col, 1.0);
}
`;

export class SkySystem implements Subsystem {
  readonly id = 'sky';
  private dome!: THREE.Mesh;
  private mat!: THREE.ShaderMaterial;
  private sun!: THREE.DirectionalLight;
  private hemi!: THREE.HemisphereLight;

  init(ctx: Ctx): void {
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTop: { value: new THREE.Color() },
        uHorizon: { value: new THREE.Color() },
        uBand: { value: 0.6 },
      },
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(800, 24, 16), this.mat);
    this.dome.frustumCulled = false;
    ctx.scene.add(this.dome);

    this.sun = new THREE.DirectionalLight(0xffffff, 1);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 400;
    const s = 90;
    this.sun.shadow.camera.left = -s;
    this.sun.shadow.camera.right = s;
    this.sun.shadow.camera.top = s;
    this.sun.shadow.camera.bottom = -s;
    this.sun.shadow.bias = -0.0004;
    ctx.scene.add(this.sun);
    ctx.scene.add(this.sun.target);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
    ctx.scene.add(this.hemi);

    ctx.scene.fog = new THREE.FogExp2(0xffffff, 0.005);

    this.apply(ctx, ctx.timeOfDay);
    ctx.events.addEventListener('tod', ((e: CustomEvent) => this.apply(ctx, e.detail)) as EventListener);
  }

  private apply(ctx: Ctx, tod: TimeOfDay): void {
    const spec = TOD[tod];
    (this.mat.uniforms.uTop.value as THREE.Color).setHex(spec.skyTop);
    (this.mat.uniforms.uHorizon.value as THREE.Color).setHex(spec.skyHorizon);
    // Low sun hugs the horizon band tighter — the dawn/dusk glow.
    this.mat.uniforms.uBand.value = spec.sunElevation < 15 ? 0.45 : 0.7;

    const el = THREE.MathUtils.degToRad(spec.sunElevation);
    const az = THREE.MathUtils.degToRad(spec.sunAzimuth);
    this.sun.position.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(300);
    this.sun.color.setHex(spec.sunColor);
    this.sun.intensity = spec.sunIntensity;

    this.hemi.color.setHex(spec.ambientSky);
    this.hemi.groundColor.setHex(spec.ambientGround);
    this.hemi.intensity = spec.ambientIntensity;

    const fog = ctx.scene.fog as THREE.FogExp2;
    fog.color.setHex(spec.fogColor);
    fog.density = spec.fogDensity;
  }

  update(ctx: Ctx): void {
    // The dome rides the camera so the horizon never recedes.
    this.dome.position.copy(ctx.camera.position);
  }
}
