/**
 * Shared shader pieces for the ground kit's vegetation bands.
 *
 * Bands hand over with an ordered (Bayer) dither instead of a scale collapse
 * or an alpha blend: each instance's fragments drop out on a fixed screen
 * pattern as it crosses its band edge, with the edge jittered per instance,
 * so the handover reads as the next band's texture, never as a ring.
 */

/** Ordered 4x4 dither threshold in [0, 1). */
export const KIT_BAYER_GLSL = /* glsl */ `
float kitBayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(.5, a.y * .75))); }
float kitBayer4(vec2 a) { return kitBayer2(.5 * a) * .25 + kitBayer2(a); }
`;

/** Band visibility: x..y fades in, z..w fades out (metres from the camera). */
export const KIT_FADE_GLSL = /* glsl */ `
float kitFade(float d, vec4 band) {
  return smoothstep(band.x, band.y, d) * (1.0 - smoothstep(band.z, band.w, d));
}
float kitHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
`;

/** Discard a fading fragment on the dither pattern. */
export const KIT_DITHER_DISCARD_GLSL = /* glsl */ `
if (vKitFade < .999 && vKitFade <= kitBayer4(gl_FragCoord.xy) * .96 + .02) discard;
`;

/** Travelling wind sheen: broad bands of laid-over grass catch the light as
 * they roll downwind. The same field in every band and in the terrain. */
export const KIT_SHEEN_GLSL = /* glsl */ `
float kitSheen(vec2 world, vec2 wind, float strength, float time) {
  vec2 axis = normalize(wind + vec2(1e-4));
  float phase = dot(world, axis) * .045 - time * (1.0 + strength * .8);
  float swell = sin(dot(world, vec2(-axis.y, axis.x)) * .021 + time * .15) * .22;
  return smoothstep(.62, 1.0, sin(phase) * .5 + .5 + swell) * clamp(strength, 0.0, 1.6);
}
`;
