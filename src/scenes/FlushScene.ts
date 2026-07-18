import Phaser from 'phaser';
import { escapeVelocity, hitTest } from '../game/shot';
import type { HuntState } from '../game/state';
import type { Vec2 } from '../game/types';

const GROUND_Y = 205;
const SPREAD_RADIUS = 14; // how forgiving the shot pattern is
const SHELLS = 2;
const TOUCH_AIM_OFFSET = 56; // crosshair rides above your finger on touch

/**
 * Duck Hunt-style shooting view. Two shells, one bird, lead the shot.
 * Returns to FieldScene with the outcome folded into the shared HuntState.
 */
export class FlushScene extends Phaser.Scene {
  private hunt!: HuntState;
  private birdId!: number;

  private bird!: Phaser.GameObjects.Sprite;
  private vel!: Vec2;
  private wobble = 0;
  private falling = false;
  private resolved = false;

  private crosshair!: Phaser.GameObjects.Sprite;
  private shells = SHELLS;
  private shellPips: Phaser.GameObjects.Rectangle[] = [];
  private hud!: Phaser.GameObjects.Text;

  constructor() {
    super('FlushScene');
  }

  create(data: { hunt: HuntState; birdId: number }): void {
    this.hunt = data.hunt;
    this.birdId = data.birdId;
    this.shells = SHELLS;
    this.resolved = false;
    this.falling = false;

    this.drawSky();
    this.makeTextures();

    const fieldBird = this.hunt.birds.find((b) => b.id === this.birdId)!;
    this.vel = escapeVelocity();
    // Steer back toward the middle of the screen so edge flushes stay shootable.
    if ((fieldBird.pos.x < 240 && this.vel.x < 0) || (fieldBird.pos.x > 240 && this.vel.x > 0)) {
      this.vel.x *= -1;
    }
    this.bird = this.add.sprite(fieldBird.pos.x, GROUND_Y - 6, 'bird');
    this.bird.setFlipX(this.vel.x < 0);

    this.crosshair = this.add.sprite(240, 120, 'crosshair').setDepth(10);
    this.input.setDefaultCursor('none');

    this.shellPips = [];
    for (let i = 0; i < SHELLS; i++) {
      this.shellPips.push(this.add.rectangle(6 + i * 8, 252, 5, 10, 0xd6402c).setOrigin(0, 0.5));
    }
    this.hud = this.add.text(4, 4, 'lead the bird!', {
      fontFamily: 'monospace',
      fontSize: '8px',
      color: '#ffffff',
    });

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.shoot(p));
  }

  update(_time: number, delta: number): void {
    const dt = delta / 1000;

    const p = this.input.activePointer;
    const yOff = p.wasTouch ? TOUCH_AIM_OFFSET : 0;
    this.crosshair.setPosition(p.worldX, p.worldY - yOff);

    if (this.falling) {
      this.bird.y += 170 * dt;
      this.bird.angle += 540 * dt;
      if (this.bird.y >= GROUND_Y) {
        this.bird.y = GROUND_Y;
        this.falling = false;
      }
      return;
    }

    if (this.bird.visible) {
      this.wobble += dt * 9;
      this.bird.x += this.vel.x * dt + Math.sin(this.wobble) * 24 * dt;
      this.bird.y += this.vel.y * dt;
      if (this.bird.y < -16 || this.bird.x < -16 || this.bird.x > 496) {
        this.finish(false);
      }
    }
  }

  private shoot(p: Phaser.Input.Pointer): void {
    if (this.resolved || this.shells <= 0) return;
    this.shells--;
    this.shellPips[this.shells].setFillStyle(0x333333);

    const aim = { x: p.worldX, y: p.worldY - (p.wasTouch ? TOUCH_AIM_OFFSET : 0) };
    this.cameras.main.shake(70, 0.004);
    const flash = this.add.circle(aim.x, aim.y, 3, 0xfff2c9).setDepth(9);
    this.tweens.add({
      targets: flash,
      scale: 5,
      alpha: 0,
      duration: 160,
      onComplete: () => flash.destroy(),
    });

    if (this.bird.visible && hitTest(aim, { x: this.bird.x, y: this.bird.y }, SPREAD_RADIUS)) {
      this.finish(true);
    } else if (this.shells === 0) {
      // Out of shells — a beat to watch it go, then call it.
      this.time.delayedCall(1300, () => {
        if (!this.resolved) this.finish(false);
      });
    }
  }

  private finish(hit: boolean): void {
    if (this.resolved) return;
    this.resolved = true;

    const fieldBird = this.hunt.birds.find((b) => b.id === this.birdId)!;
    if (hit) {
      fieldBird.state = 'downed';
      this.hunt.downed++;
      this.falling = true;
      this.hud.setText('nice shot!');
    } else {
      fieldBird.state = 'escaped';
      this.hunt.escaped++;
      this.bird.setVisible(false);
      this.hud.setText('it got away...');
    }

    this.time.delayedCall(hit ? 1500 : 1200, () => {
      this.input.setDefaultCursor('default');
      this.scene.start('FieldScene', { hunt: this.hunt });
    });
  }

  private drawSky(): void {
    const g = this.add.graphics();
    g.fillStyle(0x63a4ff).fillRect(0, 0, 480, GROUND_Y);
    g.fillStyle(0x3e8e2f).fillRect(0, GROUND_Y, 480, 270 - GROUND_Y);
    g.fillStyle(0xffffff, 0.8);
    g.fillRect(60, 40, 34, 8);
    g.fillRect(70, 32, 18, 8);
    g.fillRect(300, 70, 40, 8);
    g.fillRect(314, 62, 20, 8);
  }

  private makeTextures(): void {
    if (this.textures.exists('bird')) return;
    const g = this.add.graphics();
    g.fillStyle(0x5a3a22).fillRect(2, 2, 8, 5); // body
    g.fillStyle(0x8a5a2b).fillRect(9, 0, 4, 4); // head
    g.fillStyle(0x3a3a3a).fillRect(0, 3, 3, 2); // tail
    g.generateTexture('bird', 13, 8);
    g.clear();
    g.lineStyle(1, 0xffffff);
    g.strokeCircle(8, 8, 7);
    g.lineBetween(8, 0, 8, 16);
    g.lineBetween(0, 8, 16, 8);
    g.generateTexture('crosshair', 17, 17);
    g.destroy();
  }
}
