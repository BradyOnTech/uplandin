import Phaser from 'phaser';
import { playBlip, unlockAudio } from '../audio';
import { getArea, type AreaConfig, type DropPoint, type LandmarkKind } from '../game/areas';
import type { HuntLaunch } from '../game/gameplayMode';
import { regionOfArea } from '../game/regions';
import { getSpecies } from '../game/species';
import { beginHunt, type HuntFieldData } from './launchHunt';
import { configureLogicalViewport } from './logicalViewport';
import { drawPropertyRelief } from './dropMapTerrain';
import {
  MENU,
  addImageFrame,
  addMenuBackdrop,
  addMenuPanel,
  addRuleHeading,
  menuCopy,
  menuTitle,
  preloadMenuArt,
  setMenuFocus,
  type MenuText,
} from './menuUi';

const MAP = { x: 41, y: 75, w: 267, h: 143 };
const MAP_CENTER = { x: MAP.x + MAP.w / 2, y: MAP.y + MAP.h / 2 };

interface MapPoint {
  x: number;
  y: number;
}

function mixColor(from: number, to: number, amount: number): number {
  const a = Phaser.Display.Color.IntegerToRGB(from);
  const b = Phaser.Display.Color.IntegerToRGB(to);
  const mix = (start: number, end: number) => Math.round(start + (end - start) * amount);
  return Phaser.Display.Color.GetColor(mix(a.r, b.r), mix(a.g, b.g), mix(a.b, b.b));
}

function headingLabel(heading: number): string {
  const labels = ['EAST', 'SOUTHEAST', 'SOUTH', 'SOUTHWEST', 'WEST', 'NORTHWEST', 'NORTH', 'NORTHEAST'];
  const index = (Math.round(heading / (Math.PI / 4)) + labels.length) % labels.length;
  return labels[index];
}

/** High-resolution pre-hunt projection of the exact covert geography. */
export class DropScene extends Phaser.Scene {
  private selected!: DropPoint;
  private selectedIndex = 0;
  private markerRings: Phaser.GameObjects.Arc[] = [];
  private drops: DropPoint[] = [];
  private beaconGfx!: Phaser.GameObjects.Graphics;
  private dropCountText!: MenuText;
  private dropNameText!: MenuText;
  private approachText!: MenuText;
  private safetyText!: MenuText;
  private startText!: MenuText;
  private beaconText!: MenuText;
  private startBox!: Phaser.GameObjects.Rectangle;
  private area!: AreaConfig;
  private launchData!: { launch: HuntLaunch; fieldData: HuntFieldData };

  constructor() {
    super('DropScene');
  }

  preload(): void {
    preloadMenuArt(this);
  }

  create(data: { launch: HuntLaunch; fieldData: HuntFieldData }): void {
    configureLogicalViewport(this);
    this.launchData = data;
    const areaId = data.launch.kind === 'career'
      ? data.launch.areaId
      : data.fieldData.quick?.areaId ?? data.fieldData.areaId;
    this.area = getArea(areaId ?? 'quail-fields');
    this.drops = this.area.dropPoints;
    this.selectedIndex = 0;
    this.selected = this.drops[0];

    addMenuBackdrop(this, 0.29);
    menuTitle(this, 240, 23, this.area.name, 24, 420);
    menuCopy(this, 240, 42, '—  CHOOSE YOUR TRUCK DROP AND HUNT INTO THE COVERT.  —', MENU.sage, 7)
      .setOrigin(0.5);
    addMenuPanel(this, 240, 149, 422, 198, 0.97);
    addRuleHeading(this, MAP_CENTER.x, 62, 'PROPERTY MAP', MAP.w - 4);
    addRuleHeading(this, 380, 62, 'DROP POINT', 126);

    this.drawMap(this.area);
    this.drawDetails(this.area);

    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      if (event.key === 'Escape') this.goBack();
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') this.cycleDrop(-1);
      else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') this.cycleDrop(1);
      else if (event.key === 'Enter' || event.key === ' ') this.beginSelectedHunt();
    });

    this.select(this.selected);
  }

  private project(x: number, y: number): MapPoint {
    return {
      x: MAP.x + (x - this.area.world.x) / this.area.world.w * MAP.w,
      y: MAP.y + (y - this.area.world.y) / this.area.world.h * MAP.h,
    };
  }

  private drawMap(area: AreaConfig): void {
    const gfx = this.add.graphics();
    const mapGround = mixColor(area.grass, MENU.ink, 0.48);
    const mapCover = mixColor(area.cover, MENU.olive, 0.22);
    gfx.fillStyle(0x070c0b, 0.72).fillRoundedRect(MAP.x - 3, MAP.y - 3, MAP.w + 6, MAP.h + 6, 2);
    if (!drawPropertyRelief(gfx, area, MAP)) {
      gfx.fillStyle(mapGround, 0.98).fillRoundedRect(MAP.x, MAP.y, MAP.w, MAP.h, 2);
    }
    // Cartographic wash: muted survey-paper bands over the area's own palette.
    gfx.fillStyle(0xd7c38d, 0.08).fillRect(MAP.x, MAP.y, MAP.w, MAP.h / 3);
    gfx.fillStyle(0x10231d, 0.13).fillRect(MAP.x, MAP.y + MAP.h * 0.62, MAP.w, MAP.h * 0.38);

    // Subtle survey grid provides scale without pretending to be a satellite plate.
    gfx.lineStyle(1, 0xf2e5c5, 0.08);
    for (let i = 1; i < 6; i++) {
      const x = MAP.x + MAP.w * i / 6;
      gfx.lineBetween(x, MAP.y, x, MAP.y + MAP.h);
    }
    for (let i = 1; i < 4; i++) {
      const y = MAP.y + MAP.h * i / 4;
      gfx.lineBetween(MAP.x, y, MAP.x + MAP.w, y);
    }

    // Cover is gameplay cover: these shapes are where scent and birds really live.
    for (const patch of area.patches) {
      const p = this.project(patch.x, patch.y);
      const width = Math.max(3, patch.w / area.world.w * MAP.w);
      const height = Math.max(2, patch.h / area.world.h * MAP.h);
      gfx.fillStyle(0x08100b, 0.2).fillRoundedRect(p.x + 1, p.y + 1, width, height, 2);
      gfx.fillStyle(mapCover, 0.88).fillRoundedRect(p.x, p.y, width, height, 2);
      gfx.lineStyle(1, 0xe1d2a8, 0.12).strokeRoundedRect(p.x, p.y, width, height, 2);
    }

    // Tracks get a dark casing and cream center so they remain legible over cover.
    for (const trail of area.trails) {
      const points = trail.points.map((point) => this.project(point.x, point.y));
      gfx.lineStyle(4, 0x111713, 0.38);
      this.strokePath(gfx, points);
      gfx.lineStyle(1.5, 0xd4bd82, 0.86);
      this.strokePath(gfx, points);
    }

    const glyph: Record<LandmarkKind, string> = {
      gate: 'Ⅱ',
      windmill: '✣',
      barn: '■',
      pond: '≈',
      fence: '╫',
    };
    for (const landmark of area.landmarks) {
      const p = this.project(landmark.position.x, landmark.position.y);
      const color = landmark.kind === 'pond' ? '#9ed1de' : MENU.cream;
      menuCopy(this, p.x, p.y - 2, glyph[landmark.kind], color, 7).setOrigin(0.5);
      if (landmark.kind !== 'gate') {
        const label = menuCopy(this, p.x, p.y + 5, landmark.name, MENU.cream, 4.5).setOrigin(0.5, 0);
        label.setAlpha(0.86);
      }
    }

    this.beaconGfx = this.add.graphics().setDepth(7);
    this.markerRings = area.dropPoints.map((drop, index) => {
      const p = this.project(drop.position.x, drop.position.y);
      const hit = this.add.circle(p.x, p.y, 11, 0x000000, 0.01)
        .setDepth(8)
        .setInteractive({ useHandCursor: true })
        .on('pointerover', () => this.select(drop))
        .on('pointerdown', () => {
          unlockAudio();
          playBlip();
          this.select(drop);
        });
      const ring = this.add.circle(p.x, p.y, 7, MENU.ink, 0.82)
        .setDepth(8)
        .setStrokeStyle(1.5, 0xf2e5c5);
      menuCopy(this, p.x, p.y, String(index + 1), MENU.cream, 6).setOrigin(0.5).setDepth(9);
      // Retain the hit object through Phaser's display list; it intentionally has no visual body.
      hit.setName(`drop-hit-${drop.id}`);
      return ring;
    });

    gfx.lineStyle(1, MENU.line, 1).strokeRoundedRect(MAP.x, MAP.y, MAP.w, MAP.h, 2);
    gfx.lineStyle(1, 0xf2e5c5, 0.28).strokeRoundedRect(MAP.x + 2, MAP.y + 2, MAP.w - 4, MAP.h - 4, 1);
    const speciesLegend = area.speciesMix.length === 1
      ? getSpecies(area.speciesMix[0].speciesId).name
      : `${area.speciesMix.length} BIRD SPECIES · COVER · TRACKS`;
    const legend = menuCopy(this, MAP.x + 5, MAP.y + MAP.h - 5, speciesLegend, MENU.cream, 5).setOrigin(0, 1);
    legend.setAlpha(0.84).setDepth(6);
  }

  private strokePath(gfx: Phaser.GameObjects.Graphics, points: MapPoint[]): void {
    if (points.length === 0) return;
    gfx.beginPath().moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) gfx.lineTo(points[i].x, points[i].y);
    gfx.strokePath();
  }

  private drawDetails(area: AreaConfig): void {
    const region = regionOfArea(area.id);
    addImageFrame(this, 380, 84, 128, 38, MENU.line);
    this.add.image(380, 84, `menu-region-${region.id}`).setDisplaySize(126, 36);
    this.add.rectangle(380, 84, 126, 36, MENU.ink, 0.34);
    menuCopy(this, 380, 84, region.name, MENU.cream, 7).setOrigin(0.5);

    this.dropCountText = menuCopy(this, 380, 109, '', MENU.amberText, 6).setOrigin(0.5);
    this.dropNameText = menuTitle(this, 380, 124, '', 14, 126);
    this.approachText = menuCopy(this, 380, 144, '', MENU.sage, 6).setOrigin(0.5);
    this.safetyText = menuCopy(this, 380, 157, '', MENU.cream, 5.5).setOrigin(0.5);

    this.add.rectangle(380, 180, 126, 24, MENU.olive, 0.58).setStrokeStyle(1, MENU.lineSoft);
    menuCopy(this, 380, 175, 'LOCATION BEACON', MENU.sage, 5).setOrigin(0.5);
    this.beaconText = menuCopy(this, 380, 185, '', MENU.cream, 5.5).setOrigin(0.5);

    this.startBox = this.add.rectangle(380, 219, 128, 24, MENU.olive, 1)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.beginSelectedHunt());
    this.startText = menuCopy(this, 380, 219, '', MENU.cream, 7).setOrigin(0.5);
    setMenuFocus(this.startBox, true, true);

    this.add.rectangle(78, 237, 66, 20, MENU.panelAlt, 0.98)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.goBack());
    menuCopy(this, 78, 237, 'ESC  BACK', MENU.cream, 7).setOrigin(0.5);
    menuCopy(this, 240, 260, '←→ CHOOSE DROP  ·  ENTER START HUNT', MENU.muted, 7).setOrigin(0.5);
  }

  private cycleDrop(direction: number): void {
    this.selectedIndex = (this.selectedIndex + direction + this.drops.length) % this.drops.length;
    playBlip();
    this.select(this.drops[this.selectedIndex]);
  }

  private select(drop: DropPoint): void {
    this.selected = drop;
    this.selectedIndex = this.drops.indexOf(drop);
    this.markerRings.forEach((ring, index) => {
      this.tweens.killTweensOf(ring);
      const active = index === this.selectedIndex;
      ring.setScale(1).setAlpha(1).setStrokeStyle(active ? 2 : 1, active ? MENU.amber : 0xf2e5c5);
      if (active) {
        this.tweens.add({
          targets: ring,
          scale: 1.42,
          alpha: 0.55,
          duration: 760,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.InOut',
        });
      }
    });
    this.drawBeacon(drop);

    const landmark = this.area.landmarks.find((candidate) => candidate.id === drop.landmarkId);
    this.dropCountText.setText(`DROP ${this.selectedIndex + 1} OF ${this.drops.length}`);
    this.dropNameText.setText(drop.name);
    this.dropNameText.setScale(1);
    if (this.dropNameText.width > 124) this.dropNameText.setScale(124 / this.dropNameText.width);
    this.approachText.setText(landmark ? `ENTRY AT ${landmark.name}` : 'ROAD-SIDE ENTRY');
    this.safetyText.setText(`${drop.safetyRadius} YD UNLOADED SAFETY ZONE`);
    this.beaconText.setText(`AMBER · HUNT ${headingLabel(drop.heading)}`);
    this.startText.setText(`START AT ${drop.name}`);
    this.startText.setScale(1);
    if (this.startText.width > 116) this.startText.setScale(116 / this.startText.width, 1);
  }

  private drawBeacon(drop: DropPoint): void {
    const p = this.project(drop.position.x, drop.position.y);
    const rx = Math.max(4, drop.safetyRadius / this.area.world.w * MAP.w);
    const ry = Math.max(4, drop.safetyRadius / this.area.world.h * MAP.h);
    const arrow = this.project(
      drop.position.x + Math.cos(drop.heading) * 70,
      drop.position.y + Math.sin(drop.heading) * 70,
    );
    const angle = Math.atan2(arrow.y - p.y, arrow.x - p.x);
    this.beaconGfx.clear();
    this.beaconGfx.fillStyle(MENU.amber, 0.08).fillEllipse(p.x, p.y, rx * 2, ry * 2);
    this.beaconGfx.lineStyle(1, MENU.amber, 0.7).strokeEllipse(p.x, p.y, rx * 2, ry * 2);
    this.beaconGfx.lineStyle(2, MENU.amber, 0.95).lineBetween(p.x, p.y, arrow.x, arrow.y);
    const size = 4;
    const backX = arrow.x - Math.cos(angle) * size;
    const backY = arrow.y - Math.sin(angle) * size;
    this.beaconGfx.fillStyle(MENU.amber, 1).fillTriangle(
      arrow.x,
      arrow.y,
      backX + Math.cos(angle + Math.PI / 2) * size * 0.65,
      backY + Math.sin(angle + Math.PI / 2) * size * 0.65,
      backX + Math.cos(angle - Math.PI / 2) * size * 0.65,
      backY + Math.sin(angle - Math.PI / 2) * size * 0.65,
    );
  }

  private beginSelectedHunt(): void {
    unlockAudio();
    playBlip();
    beginHunt(this, this.launchData.launch, this.launchData.fieldData, this.selected.id);
  }

  private goBack(): void {
    unlockAudio();
    playBlip();
    this.scene.start(this.launchData.launch.kind === 'quick' ? 'QuickScene' : 'MapScene');
  }
}
