import type { AreaConfig } from '../../game/areas';
import { PROPERTY_PX_TO_M } from '../../game/landscape';
import type { Vec2 } from '../../game/types';

export const QUAIL_GATE = Object.freeze({ wingHalfWidth: 8, hingeHalfWidth: 4.2, leafLength: 4.04, openAngle: 1.02 });
export interface QuailEntranceSegment { a: Vec2; b: Vec2 }
export interface QuailParkingPose {
  readonly position: Readonly<Vec2>;
  /** Three.js yaw; the pickup's local -Z front points toward the gate. */
  readonly yaw: number;
}
export interface QuailEntrance {
  id: string;
  dropPointId: string;
  insetGateId: string;
  insetCenter: Vec2;
  boundaryCenter: Vec2;
  dropCenter: Vec2;
  /** Boundary -> existing named gate -> unchanged start of the shared trail. */
  centerline: readonly Vec2[];
  /** Three.js yaw: the gate's local X axis runs along its fence line. */
  yaw: number;
  insetWingPosts: readonly [Vec2, Vec2];
  boundaryGatePosts: readonly [Vec2, Vec2];
  laneFences: readonly [QuailEntranceSegment, QuailEntranceSegment];
  /** Exclude perimeter wires here; a closed service gate occupies this span. */
  boundaryOpening: QuailEntranceSegment;
}

/** Render-only entrance detail derived from unchanged shared property anchors. */
export function deriveQuailEntrances(area: AreaConfig): QuailEntrance[] {
  if (area.id !== 'quail-fields') return [];
  return area.dropPoints.flatMap((drop): QuailEntrance[] => {
    const gate = area.landmarks.find((landmark) => landmark.id === drop.landmarkId && landmark.kind === 'gate');
    if (!gate) return [];
    const insetCenter = { ...gate.position }; const dropCenter = { ...drop.position };
    const dx = insetCenter.x - dropCenter.x; const dy = insetCenter.y - dropCenter.y;
    const length = Math.hypot(dx, dy); if (length === 0) return [];
    const outwardX = dx / length; const outwardY = dy / length;
    const { x, y, w, h } = area.world;
    const distances = [outwardX > 1e-8 ? (x + w - insetCenter.x) / outwardX : outwardX < -1e-8 ? (x - insetCenter.x) / outwardX : Infinity,
      outwardY > 1e-8 ? (y + h - insetCenter.y) / outwardY : outwardY < -1e-8 ? (y - insetCenter.y) / outwardY : Infinity];
    const distance = Math.min(...distances.filter((value) => value >= 0));
    const boundaryCenter = { x: insetCenter.x + outwardX * distance, y: insetCenter.y + outwardY * distance };
    // Preserve the existing south/west gate axes without maintaining a second
    // property-coordinate table. The positive fence axis is reversed at west.
    const yaw = Math.atan2(-outwardX, outwardY);
    const posts = (center: Vec2, halfWidth: number): [Vec2, Vec2] => [-1, 1].map((side) => ({
      x: center.x + Math.cos(yaw) * side * halfWidth / PROPERTY_PX_TO_M,
      y: center.y - Math.sin(yaw) * side * halfWidth / PROPERTY_PX_TO_M,
    })) as [Vec2, Vec2];
    const insetWingPosts = posts(insetCenter, QUAIL_GATE.wingHalfWidth);
    const boundaryGatePosts = posts(boundaryCenter, QUAIL_GATE.hingeHalfWidth);
    return [{ id: `${gate.id}-entrance`, dropPointId: drop.id, insetGateId: gate.id, insetCenter, boundaryCenter, dropCenter,
      centerline: [boundaryCenter, insetCenter, dropCenter], yaw, insetWingPosts, boundaryGatePosts,
      laneFences: [{ a: insetWingPosts[0], b: boundaryGatePosts[0] }, { a: insetWingPosts[1], b: boundaryGatePosts[1] }],
      boundaryOpening: { a: boundaryGatePosts[0], b: boundaryGatePosts[1] } }];
  });
}

const parkingPoses = new WeakMap<AreaConfig, ReadonlyMap<string, QuailParkingPose>>();

/** Roadside presentation only: the drop, field gate and hunt anchors stay fixed. */
export function deriveQuailParkingPose(area: AreaConfig, dropPointId: string): QuailParkingPose | undefined {
  let poses = parkingPoses.get(area);
  if (!poses) {
    const derived = new Map<string, QuailParkingPose>();
    for (const entrance of deriveQuailEntrances(area)) {
      const dx = entrance.dropCenter.x - entrance.insetCenter.x, dy = entrance.dropCenter.y - entrance.insetCenter.y;
      const length = Math.hypot(dx, dy), fx = dx / length, fy = dy / length;
      // Relative to the old six-yard rearward truck position: 2m inward,
      // 4.4m right. The complete vehicle fits the existing drop clearing.
      const behind = 6 * PROPERTY_PX_TO_M - 2;
      derived.set(entrance.dropPointId, Object.freeze({
        position: Object.freeze({ x: entrance.dropCenter.x + (-behind * fx - 4.4 * fy) / PROPERTY_PX_TO_M,
          y: entrance.dropCenter.y + (-behind * fy + 4.4 * fx) / PROPERTY_PX_TO_M }),
        yaw: Math.atan2(fx, fy),
      }));
    }
    poses = derived; parkingPoses.set(area, poses);
  }
  return poses.get(dropPointId);
}
