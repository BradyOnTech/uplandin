import Phaser from 'phaser';
import { playBlip, unlockAudio } from '../audio';
import { getArea, type AreaConfig, type DropPoint, type LandmarkKind } from '../game/areas';
import type { HuntLaunch } from '../game/gameplayMode';
import { getSpecies } from '../game/species';
import { beginHunt, type HuntFieldData } from './launchHunt';
import { pixelText, type PixelText } from './pixelFont';
import { configureLogicalViewport } from './logicalViewport';

const MAP = { x: 46, y: 43, w: 388, h: 143 };

/** Pre-hunt projection of the same covert geography used in the field. */
export class DropScene extends Phaser.Scene {
  private selected!: DropPoint;
  private selectedText!: PixelText;
  private markerRings: Phaser.GameObjects.Arc[] = [];
  private drops: DropPoint[] = [];

  constructor() {
    super('DropScene');
  }

  create(data: { launch: HuntLaunch; fieldData: HuntFieldData }): void {
    configureLogicalViewport(this);
    const areaId = data.launch.kind === 'career'
      ? data.launch.areaId
      : data.fieldData.quick?.areaId ?? data.fieldData.areaId;
    const area = getArea(areaId ?? 'quail-fields');
    this.drops = area.dropPoints;
    this.selected = area.dropPoints[0];
    this.add.rectangle(240, 135, 480, 270, 0x111a15);
    pixelText(this, 240, 12, area.name, 2, '#ffd23f').setOrigin(0.5).setDepth(10);
    pixelText(this, 240, 29, 'choose where to park and hunt into the covert', 1, '#b6caaa').setOrigin(0.5).setDepth(10);
    this.drawMap(area, (drop) => this.select(drop));

    this.selectedText = pixelText(this, 240, 210, '', 1, '#ffffff').setOrigin(0.5).setDepth(10);
    const go = this.add.rectangle(240, 237, 190, 24, 0x3d7429).setInteractive().setDepth(10);
    go.setStrokeStyle(1, 0x9fd88f).on('pointerdown', () => {
      unlockAudio();
      playBlip();
      beginHunt(this, data.launch, data.fieldData, this.selected.id);
    });
    pixelText(this, 240, 237, 'unload dogs and hunt', 1, '#ffffff').setOrigin(0.5).setDepth(11);

    pixelText(this, 10, 252, '< back', 1, '#9fb896').setInteractive().setDepth(10).on('pointerdown', () => {
      unlockAudio();
      playBlip();
      this.scene.start(data.launch.kind === 'quick' ? 'QuickScene' : 'MapScene');
    });
    this.select(this.selected);
  }

  private drawMap(area: AreaConfig, choose: (drop: DropPoint) => void): void {
    const gfx = this.add.graphics();
    gfx.fillStyle(area.grass).fillRoundedRect(MAP.x, MAP.y, MAP.w, MAP.h, 3);
    gfx.lineStyle(1, 0xc9dcc0, 0.35).strokeRoundedRect(MAP.x, MAP.y, MAP.w, MAP.h, 3);
    const point = (x: number, y: number) => ({
      x: MAP.x + (x - area.world.x) / area.world.w * MAP.w,
      y: MAP.y + (y - area.world.y) / area.world.h * MAP.h,
    });
    for (const patch of area.patches) {
      const p = point(patch.x, patch.y);
      gfx.fillStyle(area.cover, 0.78).fillRect(p.x, p.y, patch.w / area.world.w * MAP.w, patch.h / area.world.h * MAP.h);
    }
    gfx.lineStyle(2, 0xc8b27b, 0.6);
    for (const trail of area.trails) {
      const points = trail.points.map((p) => point(p.x, p.y));
      gfx.beginPath().moveTo(points[0].x, points[0].y);
      for (const p of points.slice(1)) gfx.lineTo(p.x, p.y);
      gfx.strokePath();
    }
    const glyph: Record<LandmarkKind, string> = { gate: '=', windmill: '+', barn: '#', pond: '~', fence: '|' };
    for (const landmark of area.landmarks) {
      const p = point(landmark.position.x, landmark.position.y);
      pixelText(this, p.x, p.y - 4, glyph[landmark.kind], 1, landmark.kind === 'pond' ? '#8fc7ff' : '#f1dec1').setOrigin(0.5);
      if (landmark.kind !== 'gate') {
        pixelText(this, p.x, p.y + 5, landmark.name, 1, '#ffffff').setOrigin(0.5).setScale(0.72);
      }
    }
    this.markerRings = area.dropPoints.map((drop, index) => {
      const p = point(drop.position.x, drop.position.y);
      const hit = this.add.circle(p.x, p.y, 10, 0x101410, 0.8).setInteractive();
      const ring = this.add.circle(p.x, p.y, 8).setStrokeStyle(2, 0xffffff);
      pixelText(this, p.x, p.y - 5, String(index + 1), 1, '#ffffff').setOrigin(0.5);
      const arrow = point(
        drop.position.x + Math.cos(drop.heading) * 35,
        drop.position.y + Math.sin(drop.heading) * 35,
      );
      gfx.lineStyle(2, 0xffd23f, 0.9).lineBetween(p.x, p.y, arrow.x, arrow.y);
      hit.on('pointerdown', () => { playBlip(); choose(drop); });
      return ring;
    });
    const speciesLegend = area.speciesMix.length === 1
      ? getSpecies(area.speciesMix[0].speciesId).name
      : `${area.speciesMix.length} species`;
    pixelText(this, 52, 191, `cover · trails · ${speciesLegend}`, 1, '#e6f0df');
  }

  private select(drop: DropPoint): void {
    this.selected = drop;
    const index = this.drops.indexOf(drop);
    this.markerRings.forEach((ring, i) => ring.setStrokeStyle(i === index ? 3 : 1, i === index ? 0xffd23f : 0xffffff));
    this.selectedText?.setText(`${drop.name} · bird-free safety zone ${drop.safetyRadius} yd`);
  }
}
