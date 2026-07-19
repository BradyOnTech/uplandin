import Phaser from 'phaser';
import type { Condition } from '../game/conditions';

/**
 * Weather you can see: a subtle atmosphere tint per condition, plus falling
 * snow or rain streaks. Pure presentation — the sim effects live in
 * conditions.ts. Depths sit above the world and below the HUD.
 */

const TINTS: Partial<Record<Condition, { color: number; alpha: number }>> = {
  hot: { color: 0xe8a050, alpha: 0.05 },
  frost: { color: 0xb8d0e0, alpha: 0.05 },
  rain: { color: 0x2a3440, alpha: 0.12 },
  snow: { color: 0xdce8f0, alpha: 0.06 },
};

/**
 * @param depthBase Tint renders at depthBase, particles at depthBase + 1 —
 * pick values that sit above the scene's world and below its HUD.
 */
export function addWeatherFx(
  scene: Phaser.Scene,
  condition: Condition,
  fixedToCamera: boolean,
  depthBase: number,
): void {
  ensureFxTextures(scene);
  const tint = TINTS[condition];
  if (tint) {
    const wash = scene.add
      .rectangle(240, 135, 480, 270, tint.color, tint.alpha)
      .setDepth(depthBase);
    if (fixedToCamera) wash.setScrollFactor(0);
  }
  if (condition === 'snow') {
    const snow = scene.add
      .particles(0, 0, 'fx-snow', {
        x: { min: 0, max: 480 },
        y: -4,
        lifespan: 12000,
        frequency: 130,
        speedY: { min: 20, max: 42 },
        speedX: { min: -14, max: 14 },
        alpha: { start: 0.9, end: 0.4 },
      })
      .setDepth(depthBase + 1);
    if (fixedToCamera) snow.setScrollFactor(0);
  } else if (condition === 'rain') {
    const rain = scene.add
      .particles(0, 0, 'fx-rain', {
        x: { min: -30, max: 480 },
        y: -6,
        lifespan: 1500,
        frequency: 45,
        speedY: { min: 230, max: 310 },
        speedX: { min: 25, max: 45 },
        alpha: { start: 0.45, end: 0.25 },
      })
      .setDepth(depthBase + 1);
    if (fixedToCamera) rain.setScrollFactor(0);
  }
}

function ensureFxTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists('fx-snow')) return;
  const g = scene.add.graphics();
  g.fillStyle(0xf4f6f8).fillRect(0, 0, 2, 2);
  g.generateTexture('fx-snow', 2, 2);
  g.clear();
  g.fillStyle(0x9fb4c8).fillRect(0, 0, 1, 5);
  g.generateTexture('fx-rain', 1, 5);
  g.destroy();
}
