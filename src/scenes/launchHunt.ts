import type Phaser from 'phaser';
import {
  build3DHuntHref,
  loadGameplayMode,
  type HuntLaunch,
} from '../game/gameplayMode';
import type { QuickConfig } from '../game/quick';

/** Thin Phaser adapter at the renderer seam. */
export function launchHunt(
  scene: Phaser.Scene,
  launch: HuntLaunch,
  fieldData: { areaId?: string; quick?: QuickConfig },
): void {
  if (loadGameplayMode() === '3d') {
    location.assign(build3DHuntHref(launch));
    return;
  }
  scene.scene.start('FieldScene', fieldData);
}
