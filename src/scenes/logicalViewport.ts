import Phaser from 'phaser';

/** Gameplay continues to use the original 480×270 coordinate system. */
export const LOGICAL_WIDTH = 480;
export const LOGICAL_HEIGHT = 270;

/** A 2× backing buffer keeps illustrated menus and text sharp on modern displays. */
export const RENDER_SCALE = 2;
export const RENDER_WIDTH = LOGICAL_WIDTH * RENDER_SCALE;
export const RENDER_HEIGHT = LOGICAL_HEIGHT * RENDER_SCALE;

export type CanvasTreatment = 'smooth' | 'pixel';

/**
 * Present every Phaser scene through the original logical viewport while the
 * renderer works at twice the resolution. The CSS sampling mode is switched
 * by scene so front-end illustration stays smooth and field pixel art keeps
 * its deliberate hard edges.
 */
export function configureLogicalViewport(
  scene: Phaser.Scene,
  treatment: CanvasTreatment = 'smooth',
): void {
  const smooth = treatment === 'smooth';
  const width = smooth ? RENDER_WIDTH : LOGICAL_WIDTH;
  const height = smooth ? RENDER_HEIGHT : LOGICAL_HEIGHT;
  const zoom = smooth ? RENDER_SCALE : 1;

  scene.scale.resize(width, height);
  scene.cameras.main
    .setViewport(0, 0, width, height)
    .setZoom(zoom)
    .setRoundPixels(true)
    .centerOn(LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2);
  scene.game.canvas.style.imageRendering = smooth ? 'auto' : 'pixelated';
}
