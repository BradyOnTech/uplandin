import Phaser from 'phaser';

/*
 * The hand-authored hunter: a 3×3 directional sheet (rows: toward camera,
 * away, side; cols: stand, step A, step B) drawn crisp at native size —
 * the same craft as pixelFont.ts, applied to the player character.
 *
 * Why hand pixels here: two AI deliveries in a row failed on this asset
 * (unkeyed backing block, then a half-cell mushy figure). Tiny iconic
 * characters are where hand-authoring beats generation — a GBA walker is
 * formulaic: cap, face, vest, alternating boots, 1px outline. Organic
 * subjects (dogs, birds, plates) stay with the generation pipeline.
 *
 * Cell 20×28, figure ~12×22, feet on y26. A future painted sheet that
 * passes ART.md acceptance ships as `hunter-dirs-v2` and wins in
 * FieldScene; this sheet is the floor, not the ceiling.
 */

export const HUNTER_GEN_SHEET = 'hunter-gen-dirs';

const OUT = 0x101410; // outline
const CAP = 0xd6551e; // blaze orange
const CAP_D = 0xa03c12;
const SKIN = 0xd8a878;
const SKIN_D = 0xb8875f;
const VEST = 0x55532e;
const VEST_D = 0x3a3820;
const PANT = 0x9a7f50;
const BOOT = 0x2b241e;
const GUN = 0x23272b;
const WOOD = 0x5a3c22;
const EYE = 0x1a1410;

type Rect = [number, number, number, number, number]; // x, y, w, h, color

/** Rects for one frame, in cell-local px. `bob` lifts the body 1px on steps;
 * `legA` picks which leg is extended (steps alternate; stand is even). */
function downFrame(bob: number, leg: 0 | 1 | 2): Rect[] {
  const y = -bob;
  const r: Rect[] = [
    // Cap: crown + brim.
    [7, y + 4, 6, 1, CAP],
    [6, y + 5, 8, 2, CAP],
    [5, y + 7, 10, 1, CAP_D],
    // Face with eyes.
    [7, y + 8, 6, 3, SKIN],
    [8, y + 9, 1, 1, EYE],
    [11, y + 9, 1, 1, EYE],
    [8, y + 11, 4, 1, SKIN_D],
    // Vest torso + arms (skin hands at the hem).
    [6, y + 12, 8, 5, VEST],
    [5, y + 13, 1, 3, VEST_D],
    [14, y + 13, 1, 3, VEST_D],
    [5, y + 16, 1, 1, SKIN],
    [14, y + 16, 1, 1, SKIN],
    [6, y + 17, 8, 1, VEST_D],
    // Hips.
    [7, y + 18, 6, 1, PANT],
  ];
  // Legs: stand = even; A = left extended; B = right extended.
  const leftLong = leg === 1 ? 1 : 0;
  const rightLong = leg === 2 ? 1 : 0;
  r.push([7, y + 19, 2, 4 + leftLong, PANT]);
  r.push([11, y + 19, 2, 4 + rightLong, PANT]);
  r.push([7, y + 23 + leftLong, 2, 3 - leftLong + bob, BOOT]);
  r.push([11, y + 23 + rightLong, 2, 3 - rightLong + bob, BOOT]);
  return r;
}

function upFrame(bob: number, leg: 0 | 1 | 2): Rect[] {
  const y = -bob;
  const r: Rect[] = [
    // Back of the cap covers the whole head.
    [7, y + 4, 6, 1, CAP],
    [6, y + 5, 8, 3, CAP],
    [5, y + 8, 10, 1, CAP_D],
    [8, y + 9, 4, 2, SKIN_D], // neck
    // Vest back, plain, with the slung gun crossing it.
    [6, y + 11, 8, 6, VEST],
    [5, y + 12, 1, 3, VEST_D],
    [14, y + 12, 1, 3, VEST_D],
    [6, y + 17, 8, 1, VEST_D],
    // Slung gun: barrel rises beside the head from the shoulder line.
    [14, y + 6, 1, 4, GUN],
    [14, y + 5, 1, 1, WOOD],
    [7, y + 12, 1, 1, WOOD],
    [8, y + 13, 1, 1, WOOD],
    [9, y + 14, 1, 1, WOOD],
    [10, y + 15, 1, 1, WOOD],
    [7, y + 18, 6, 1, PANT],
  ];
  const leftLong = leg === 1 ? 1 : 0;
  const rightLong = leg === 2 ? 1 : 0;
  r.push([7, y + 19, 2, 4 + leftLong, PANT]);
  r.push([11, y + 19, 2, 4 + rightLong, PANT]);
  r.push([7, y + 23 + leftLong, 2, 3 - leftLong + bob, BOOT]);
  r.push([11, y + 23 + rightLong, 2, 3 - rightLong + bob, BOOT]);
  return r;
}

function sideFrame(bob: number, leg: 0 | 1 | 2): Rect[] {
  const y = -bob;
  const r: Rect[] = [
    // Cap with a forward brim (faces right; the scene mirrors for left).
    [7, y + 4, 6, 1, CAP],
    [6, y + 5, 7, 2, CAP],
    [9, y + 7, 6, 1, CAP_D], // brim juts forward
    // Profile: compact face forward, the rest of the head stays under the cap.
    [6, y + 8, 4, 2, CAP],
    [6, y + 10, 3, 1, CAP_D],
    [10, y + 8, 3, 3, SKIN],
    [12, y + 9, 1, 1, EYE],
    [9, y + 11, 3, 1, SKIN_D],
    // Torso, slimmer than front view; swinging arm as a darker sleeve.
    [7, y + 12, 6, 5, VEST],
    [9, y + 13, 2, 3, VEST_D],
    [9, y + 16, 2, 1, SKIN],
    [7, y + 17, 6, 1, VEST_D],
    // Gun over the shoulder pointing up-behind: 45° barrel + butt at the shoulder.
    [6, y + 12, 1, 1, WOOD],
    [5, y + 11, 1, 1, WOOD],
    [4, y + 10, 1, 1, GUN],
    [3, y + 9, 1, 1, GUN],
    [2, y + 8, 1, 1, GUN],
    [7, y + 18, 6, 1, PANT],
  ];
  // Side gait: stand = legs together; steps scissor front/back.
  if (leg === 0) {
    r.push([8, y + 19, 2, 4, PANT], [10, y + 19, 2, 4, PANT]);
    r.push([8, y + 23, 2, 3 + bob, BOOT], [10, y + 23, 2, 3 + bob, BOOT]);
  } else {
    const front = leg === 1;
    // Front leg reaches, back leg trails — a real scissor, not a shuffle.
    r.push([front ? 11 : 10, y + 19, 2, 4, PANT]);
    r.push([front ? 7 : 8, y + 19, 2, 3, PANT]);
    r.push([front ? 12 : 11, y + 22, 2, 4 + bob, BOOT]);
    r.push([front ? 6 : 7, y + 22, 2, 3 + bob, BOOT]);
  }
  return r;
}

/** Build the sheet once per game: silhouette pass in OUT (expanded 1px),
 * then the fills — every frame gets the GBA 1px dark outline for free. */
export function ensureHunterGenSheet(scene: Phaser.Scene): void {
  if (scene.textures.exists(HUNTER_GEN_SHEET)) return;
  const g = scene.add.graphics();
  const rows = [downFrame, upFrame, sideFrame];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const bob = col === 0 ? 0 : 1;
      const leg = col as 0 | 1 | 2;
      const rects = rows[row](bob, leg);
      const ox = col * 20;
      const oy = row * 28;
      for (const [x, y, w, h] of rects) {
        g.fillStyle(OUT, 1).fillRect(ox + x - 1, oy + y - 1, w + 2, h + 2);
      }
      for (const [x, y, w, h, c] of rects) {
        g.fillStyle(c, 1).fillRect(ox + x, oy + y, w, h);
      }
    }
  }
  g.generateTexture(HUNTER_GEN_SHEET, 60, 84);
  g.destroy();
  // Register the 3×3 frame grid on the generated texture.
  const tex = scene.textures.get(HUNTER_GEN_SHEET);
  let idx = 0;
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      tex.add(idx++, 0, col * 20, row * 28, 20, 28);
    }
  }
}
