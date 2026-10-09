import type * as THREE from 'three';
import type { LandscapeModel } from '../../game/landscape';
import type { Ctx, Subsystem } from '../engine';

/** Layer numbers a review tool can read back. */
export interface KitReviewStats { chunks: number; instances: number; triangles: number }

/**
 * Capture-only review hooks for the ground kit (window.__groundKit): a
 * stand-in pointing dog placed anywhere on the ground, and layer numbers.
 * Also runs beside the legacy vegetation (?cover=legacy) so before/after
 * frames carry the same dog. Nothing here runs outside ?capture.
 */
export class KitReviewSystem implements Subsystem {
  readonly id = 'ground-kit-review';
  private dog?: THREE.Object3D;

  constructor(private readonly landscape: LandscapeModel, private readonly style: string,
    private readonly stats: () => KitReviewStats[] = () => []) {}

  init(ctx: Ctx): void {
    if (typeof window === 'undefined' || !new URLSearchParams(location.search).has('capture')) return;
    const scope = window as unknown as { __groundKit?: unknown };
    scope.__groundKit = {
      style: this.style,
      stats: () => this.stats(),
      placeDog: async (x: number, z: number, yawDeg: number) => {
        if (!this.dog) {
          // The real generated GSP, posed on point: the readability subject.
          const { createGeneratedGsp } = await import('../dogs/generatedGsp');
          const asset = createGeneratedGsp(ctx.quality, false, 'liver-white');
          asset.setPose('point', 1); asset.liftPointingPaw(1);
          this.dog = asset.root;
          ctx.scene.add(this.dog);
        }
        this.dog.position.set(x, this.landscape.heightAtWorld(x, z), z);
        this.dog.rotation.set(0, yawDeg * Math.PI / 180, 0);
        this.dog.visible = true;
      },
      hideDog: () => { if (this.dog) this.dog.visible = false; },
    };
  }

  dispose(ctx: Ctx): void {
    if (this.dog) ctx.scene.remove(this.dog);
    const scope = window as unknown as { __groundKit?: unknown };
    delete scope.__groundKit;
  }
}
