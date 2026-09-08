interface ShotPoint { x: number; y: number; z: number }

/** Sample the shared heightfield along a candidate pellet path. This runs
 * only for in-pattern targets when firing, independently of terrain LOD.
 * Half-metre intervals are finer than the rendered terrain grid; the small
 * tolerance avoids rejecting a path that only grazes its approximation.
 */
export function terrainBlocksShot(origin: ShotPoint, target: ShotPoint, heightAt: (x: number, z: number) => number): boolean {
  const dx = target.x - origin.x, dy = target.y - origin.y, dz = target.z - origin.z;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / .5));
  for (let step = 1; step <= steps; step++) {
    const t = step / steps;
    if (heightAt(origin.x + dx * t, origin.z + dz * t) > origin.y + dy * t + .04) return true;
  }
  return false;
}
