import Phaser from 'phaser';
import { playShot, playThud, unlockAudio } from '../audio';
import { dist } from '../game/math';
import { escapeVelocity, hitTest } from '../game/shot';
import type { HuntState } from '../game/state';
import type { Vec2 } from '../game/types';

const GROUND_Y = 205;
const SPREAD_RADIUS = 14; // how forgiving the shot pattern is
const SHELLS = 2;
const TOUCH_AIM_OFFSET = 56; // crosshair rides above your finger on touch
const LAUNCH_STAGGER_MS = 130; // covey birds get airborne one after another

interface FlyingBird {
  id: number;
  sprite: Phaser.GameObjects.Sprite;
  vel: Vec2;
  wobble: number;
  status: 'waiting' | 'flying' | 'falling' | 'done';
}

/**
 * Duck Hunt-style shooting view. A whole covey can rise at once; two shells,
 * one bird per shell. Returns to FieldScene with outcomes folded into the
 * shared HuntState.
 */
export class FlushScene extends Phaser.Scene {
  private hunt!: HuntState;
  private birds: FlyingBird[] = [];
  private resolved = false;

  private crosshair!: Phaser.GameObjects.Sprite;
  private shells = SHELLS;
  private shellPips: Phaser.GameObjects.Rectangle[] = [];
  private hud!: Phaser.GameObjects.Text;

  constructor() {
    super('FlushScene');
  }

  create(data: { hunt: HuntState; birdIds: number[] }): void {
    this.hunt = data.hunt;
    this.shells = SHELLS;
    this.resolved = false;
    this.birds = [];

    this.drawSky();
    this.makeTextures();

    data.birdIds.forEach((id, i) => {
      const fieldBird = this.hunt.birds.find((b) => b.id === id)!;
      const vel = escapeVelocity();
      // Steer back toward the middle of the screen so edge flushes stay shootable.
      if ((fieldBird.pos.x < 240 && vel.x < 0) || (fieldBird.pos.x > 240 && vel.x > 0)) {
        vel.x *= -1;
      }
      const sprite = this.add.sprite(fieldBird.pos.x, GROUND_Y - 6, 'bird');
      sprite.setFlipX(vel.x < 0);
      sprite.setVisible(i === 0);
      const bird: FlyingBird = { id, sprite, vel, wobble: i * 2.1, status: 'waiting' };
      this.birds.push(bird);
      this.time.delayedCall(i * LAUNCH_STAGGER_MS, () => {
        if (bird.status === 'waiting') {
          bird.status = 'flying';
          sprite.setVisible(true);
        }
      });
    });

    this.crosshair = this.add.sprite(240, 120, 'crosshair').setDepth(10);
    this.input.setDefaultCursor('none');

    this.shellPips = [];
    for (let i = 0; i < SHELLS; i++) {
      this.shellPips.push(this.add.rectangle(6 + i * 8, 252, 5, 10, 0xd6402c).setOrigin(0, 0.5));
    }
    this.hud = this.add.text(
      4,
      4,
      data.birdIds.length > 1 ? `covey rise! ${data.birdIds.length} birds` : 'lead the bird!',
      { fontFamily: 'monospace', fontSize: '8px', color: '#ffffff' },
    );

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      unlockAudio();
      this.shoot(p);
    });
  }

  update(_time: number, delta: number): void {
    const dt = delta / 1000;

    const p = this.input.activePointer;
    const yOff = p.wasTouch ? TOUCH_AIM_OFFSET : 0;
    this.crosshair.setPosition(p.worldX, p.worldY - yOff);

    for (const b of this.birds) {
      if (b.status === 'flying') {
        b.wobble += dt * 9;
        b.sprite.x += b.vel.x * dt + Math.sin(b.wobble) * 24 * dt;
        b.sprite.y += b.vel.y * dt;
        if (b.sprite.y < -16 || b.sprite.x < -16 || b.sprite.x > 496) {
          this.escapeBird(b);
        }
      } else if (b.status === 'falling') {
        b.sprite.y += 170 * dt;
        b.sprite.angle += 540 * dt;
        if (b.sprite.y >= GROUND_Y) {
          b.sprite.y = GROUND_Y;
          b.status = 'done';
          playThud();
        }
      }
    }

    // Once nothing is left in the air, call it.
    if (!this.resolved && this.birds.every((b) => b.status === 'falling' || b.status === 'done')) {
      this.finish();
    }
  }

  private shoot(p: Phaser.Input.Pointer): void {
    if (this.resolved || this.shells <= 0) return;
    this.shells--;
    this.shellPips[this.shells].setFillStyle(0x333333);
    playShot();

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

    // One shell, one bird: the nearest flying bird inside the pattern.
    let best: FlyingBird | null = null;
    let bestDist = SPREAD_RADIUS;
    for (const b of this.birds) {
      if (b.status !== 'flying') continue;
      const d = dist(aim, b.sprite);
      if (d <= bestDist) {
        best = b;
        bestDist = d;
      }
    }
    if (best) {
      best.status = 'falling';
      const fieldBird = this.hunt.birds.find((x) => x.id === best!.id)!;
      fieldBird.state = 'downed';
      this.hunt.downed++;
    }
  }

  private escapeBird(b: FlyingBird): void {
    b.status = 'done';
    b.sprite.setVisible(false);
    const fieldBird = this.hunt.birds.find((x) => x.id === b.id)!;
    fieldBird.state = 'escaped';
    this.hunt.escaped++;
  }

  private finish(): void {
    if (this.resolved) return;
    this.resolved = true;

    const total = this.birds.length;
    const downedHere = this.birds.filter(
      (b) => this.hunt.birds.find((x) => x.id === b.id)!.state === 'downed',
    ).length;

    if (downedHere === 0) {
      this.hud.setText(total > 1 ? 'they all got away...' : 'it got away...');
    } else if (total > 1) {
      this.hud.setText(`${downedHere} of ${total} down!`);
    } else {
      this.hud.setText('nice shot!');
    }

    this.time.delayedCall(1500, () => {
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
