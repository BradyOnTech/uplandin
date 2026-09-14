import type Phaser from 'phaser';
import {
  build3DHuntHref,
  loadGameplayMode,
  type HuntLaunch,
} from '../game/gameplayMode';
import type { QuickConfig } from '../game/quick';

export interface HuntFieldData {
  areaId?: string;
  quick?: QuickConfig;
  dropPointId?: string;
}

/** Thin Phaser adapter at the renderer seam. */
export function launchHunt(
  scene: Phaser.Scene,
  launch: HuntLaunch,
  fieldData: HuntFieldData,
): void {
  scene.scene.start('DropScene', { launch, fieldData });
}

/** Called by the shared covert map after the player chooses a truck. */
export function beginHunt(
  scene: Phaser.Scene,
  launch: HuntLaunch,
  fieldData: HuntFieldData,
  dropPointId: string,
): void {
  if (loadGameplayMode() === '3d' || (launch.kind === 'quick' && launch.method === 'goshawk')) {
    location.assign(build3DHuntHref(launch, dropPointId));
    return;
  }
  scene.scene.start('FieldScene', { ...fieldData, dropPointId });
}
