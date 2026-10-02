import * as THREE from 'three';
import type { Ctx } from '../engine';

/** What the review hooks read from the dog presentation each call. */
export interface DogReviewSource {
  root: THREE.Object3D;
  heightAt(x: number, z: number): number;
  state(): {
    state: string; gait: string; breed: string;
    scent: { stage: string; progress: number };
    paws: { i: number; x: number; y: number; z: number; gap: number }[];
  };
}

/** The capture-only review hooks staged captures drive (window.__dogAudit). */
export interface DogReviewHooks {
  /** A longer lens for staged asset review; never outside ?capture. */
  setFov(deg: number): void;
  /** Hide only the dog, for with/without light comparisons. */
  setBodyVisible(visible: boolean): void;
  /** Hide the world (not the dog or the lights) on a plain backdrop. */
  setIsolated(isolated: boolean): void;
  /** World point to screen pixels through the live camera. */
  project(x: number, y: number, z: number): { x: number; y: number };
  heightAt(x: number, z: number): number;
  /** Ground grade (rise over run) round a point. */
  slopeAt(x: number, z: number): number;
  modelStats(): { drawCalls: number; triangles: number };
  state(): ReturnType<DogReviewSource['state']> & { root: { x: number; y: number; z: number }; yaw: number };
}

type ReviewScope = { __dogAudit?: DogReviewHooks };

/**
 * Install the primary dog's review hooks for staged captures. Tooling only:
 * nothing here runs in gameplay frames. Returns the uninstall.
 */
export function installDogReview(ctx: Ctx, source: DogReviewSource): () => void {
  const hidden = new Map<THREE.Object3D, boolean>();
  const normalBackground = ctx.scene.background, reviewBackground = new THREE.Color(0x363a3a);
  const point = new THREE.Vector3();
  const hooks: DogReviewHooks = {
    setFov(deg) { ctx.camera.fov = deg; ctx.camera.updateProjectionMatrix(); },
    setBodyVisible(visible) { source.root.visible = visible; },
    setIsolated(isolated) {
      if (isolated) {
        if (hidden.size) return;
        for (const child of ctx.scene.children) {
          if (child === source.root || child instanceof THREE.Light) continue;
          hidden.set(child, child.visible); child.visible = false;
        }
        ctx.scene.background = reviewBackground;
      } else {
        for (const [child, visible] of hidden) child.visible = visible;
        hidden.clear(); ctx.scene.background = normalBackground;
      }
    },
    project(x, y, z) {
      point.set(x, y, z).project(ctx.camera);
      const canvas = ctx.renderer.domElement;
      return { x: (point.x * .5 + .5) * canvas.clientWidth, y: (.5 - point.y * .5) * canvas.clientHeight };
    },
    heightAt: (x, z) => source.heightAt(x, z),
    slopeAt(x, z) {
      const s = .6;
      const dx = source.heightAt(x + s, z) - source.heightAt(x - s, z), dz = source.heightAt(x, z + s) - source.heightAt(x, z - s);
      return Math.hypot(dx, dz) / (2 * s);
    },
    modelStats() {
      let drawCalls = 0, triangles = 0;
      source.root.traverse(object => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        drawCalls++;
        triangles += (mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count) / 3;
      });
      return { drawCalls, triangles };
    },
    state() {
      source.root.updateMatrixWorld(true);
      const { x, y, z } = source.root.position;
      return { ...source.state(), root: { x, y, z }, yaw: source.root.rotation.y };
    },
  };
  const scope = window as unknown as ReviewScope;
  scope.__dogAudit = hooks;
  return () => {
    hooks.setIsolated(false);
    if (scope.__dogAudit === hooks) delete scope.__dogAudit;
  };
}
