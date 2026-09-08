import Phaser from 'phaser';
import type { AreaConfig, TerrainKind } from '../game/areas';
import { LandscapeModel, type GroundSample } from '../game/landscape';

interface MapRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface ReliefStyle {
  low: number;
  high: number;
  rock: number;
  vegetation: number;
  contour: number;
  contourMeters: number;
  water?: number;
  moistureK?: number;
}

const RELIEF_STYLES: Partial<Record<TerrainKind, ReliefStyle>> = {
  prairie: {
    low: 0x626047,
    high: 0xb29c6d,
    rock: 0x817861,
    vegetation: 0x66704f,
    contour: 0xe6d7ad,
    contourMeters: 2.8,
  },
  rimrock: {
    low: 0x6d5943,
    high: 0xb49c71,
    rock: 0x827a70,
    vegetation: 0x66705d,
    contour: 0xeadab7,
    contourMeters: 7,
  },
  wetland: {
    low: 0x706039,
    high: 0xb49b65,
    rock: 0x786d55,
    vegetation: 0x626542,
    contour: 0xefe0bd,
    contourMeters: 1.5,
    water: 0x5f8990,
    moistureK: 0.86,
  },
  woods: {
    low: 0x263b31,
    high: 0x637451,
    rock: 0x5e665d,
    vegetation: 0x385b42,
    contour: 0xb9c49d,
    contourMeters: 3.2,
    moistureK: 0.28,
  },
  desert: {
    low: 0x624b39,
    high: 0xb38a5d,
    rock: 0x927c67,
    vegetation: 0x6f754b,
    contour: 0xe4c68f,
    contourMeters: 4.5,
    moistureK: 0.15,
  },
  canyon: {
    low: 0x593a33,
    high: 0xc1845d,
    rock: 0x926c5a,
    vegetation: 0x65703e,
    contour: 0xf0c497,
    contourMeters: 3.5,
    moistureK: 0.16,
  },
  alpine: {
    low: 0x39463f,
    high: 0x84917c,
    rock: 0x737b78,
    vegetation: 0x4d705a,
    contour: 0xd1d6c5,
    contourMeters: 5.5,
    moistureK: 0.22,
  },
  'oak-savanna': {
    low: 0x5b4b31,
    high: 0xb19455,
    rock: 0x82745c,
    vegetation: 0x5e6f3f,
    contour: 0xe4d0a2,
    contourMeters: 3.8,
    moistureK: 0.18,
  },
};

// This authored property has its own shallow draw and prairie shoulders.
// Keep other prairie maps on their existing presentation until they are authored.
const QUAIL_RELIEF: ReliefStyle = {
  low: 0x62694c,
  high: 0xab9a70,
  rock: 0x817861,
  vegetation: 0x667152,
  contour: 0xe5d8ad,
  contourMeters: 2,
  // A cool vegetated draw, not a permanent river: moisture comes directly
  // from the same LandscapeModel sample that depresses the 3D drainage bed.
  water: 0x466e67,
  moistureK: 0.86,
};

function mixColor(from: number, to: number, amount: number): number {
  const a = Phaser.Display.Color.IntegerToRGB(from);
  const b = Phaser.Display.Color.IntegerToRGB(to);
  const t = Phaser.Math.Clamp(amount, 0, 1);
  return Phaser.Display.Color.GetColor(
    Math.round(a.r + (b.r - a.r) * t),
    Math.round(a.g + (b.g - a.g) * t),
    Math.round(a.b + (b.b - a.b) * t),
  );
}

function contourPoint(
  edge: 0 | 1 | 2 | 3,
  x: number,
  y: number,
  w: number,
  h: number,
  tl: number,
  tr: number,
  br: number,
  bl: number,
  level: number,
): [number, number] {
  const ratio = (a: number, b: number) => {
    const delta = b - a;
    return Phaser.Math.Clamp((level - a) / (Math.abs(delta) < 0.0001 ? 0.0001 : delta), 0, 1);
  };
  if (edge === 0) return [x + w * ratio(tl, tr), y];
  if (edge === 1) return [x + w, y + h * ratio(tr, br)];
  if (edge === 2) return [x + w * ratio(bl, br), y + h];
  return [x, y + h * ratio(tl, bl)];
}

function drawContourCell(
  gfx: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  tl: number,
  tr: number,
  br: number,
  bl: number,
  level: number,
): void {
  const code = (tl >= level ? 1 : 0)
    | (tr >= level ? 2 : 0)
    | (br >= level ? 4 : 0)
    | (bl >= level ? 8 : 0);
  const segments: Partial<Record<number, [number, number][]>> = {
    1: [[0, 3]], 2: [[0, 1]], 3: [[3, 1]], 4: [[1, 2]],
    5: [[0, 3], [1, 2]], 6: [[0, 2]], 7: [[3, 2]], 8: [[3, 2]],
    9: [[0, 2]], 10: [[0, 1], [3, 2]], 11: [[1, 2]], 12: [[3, 1]],
    13: [[0, 1]], 14: [[0, 3]],
  };
  for (const [fromEdge, toEdge] of segments[code] ?? []) {
    const from = contourPoint(fromEdge as 0 | 1 | 2 | 3, x, y, w, h, tl, tr, br, bl, level);
    const to = contourPoint(toEdge as 0 | 1 | 2 | 3, x, y, w, h, tl, tr, br, bl, level);
    gfx.lineBetween(from[0], from[1], to[0], to[1]);
  }
}

/**
 * Paints a terrain-kind-specific shaded relief from the same fixed property
 * model used by the 3D hunt. Returns false only if a future terrain kind has
 * not received a map adapter yet.
 */
export function drawPropertyRelief(
  gfx: Phaser.GameObjects.Graphics,
  area: AreaConfig,
  rect: MapRect,
): boolean {
  const style = area.id === 'quail-fields' ? QUAIL_RELIEF : RELIEF_STYLES[area.terrain.kind];
  if (!style) return false;

  const landscape = new LandscapeModel(area);
  const cols = 72;
  const rows = 38;
  const sampleW = cols + 1;
  const heights = new Float32Array(sampleW * (rows + 1));
  let minHeight = Infinity;
  let maxHeight = -Infinity;
  for (let row = 0; row <= rows; row++) {
    const py = area.world.y + area.world.h * row / rows;
    for (let col = 0; col <= cols; col++) {
      const px = area.world.x + area.world.w * col / cols;
      const height = landscape.heightAtProperty(px, py);
      heights[row * sampleW + col] = height;
      minHeight = Math.min(minHeight, height);
      maxHeight = Math.max(maxHeight, height);
    }
  }

  const range = Math.max(1, maxHeight - minHeight);
  const cellW = rect.w / cols;
  const cellH = rect.h / rows;
  const surface: GroundSample = { height: 0, slope: 0, gradeX: 0, gradeZ: 0, rockiness: 0, vegetation: 0, moisture: 0 };
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const index = row * sampleW + col;
      const height = heights[index];
      const left = heights[row * sampleW + Math.max(0, col - 1)];
      const right = heights[row * sampleW + Math.min(cols, col + 1)];
      const up = heights[Math.max(0, row - 1) * sampleW + col];
      const down = heights[Math.min(rows, row + 1) * sampleW + col];
      const px = area.world.x + area.world.w * (col + 0.5) / cols;
      const py = area.world.y + area.world.h * (row + 0.5) / rows;
      landscape.surfaceAtProperty(px, py, surface);

      const elevation = (height - minHeight) / range;
      let color = mixColor(style.low, style.high, 0.12 + elevation * 0.76);
      color = mixColor(color, style.rock, surface.rockiness * 0.72);
      color = mixColor(color, style.vegetation, surface.vegetation * 0.18);
      if (style.water !== undefined) {
        color = mixColor(color, style.water, surface.moisture * (style.moistureK ?? 0.7));
      }
      // Northwest survey light: folds read immediately without turning the
      // map into a satellite texture or changing the underlying elevation.
      const hillshade = Phaser.Math.Clamp(0.5 + (left - right) * 0.035 + (down - up) * 0.024, 0, 1);
      color = hillshade < 0.5
        ? mixColor(color, 0x17201c, (0.5 - hillshade) * 0.7)
        : mixColor(color, 0xe9d8ad, (hillshade - 0.5) * 0.36);
      gfx.fillStyle(color, 1).fillRect(
        rect.x + col * cellW,
        rect.y + row * cellH,
        cellW + 0.45,
        cellH + 0.45,
      );
    }
  }

  // Interpolated isolines, rather than cell-edge stairs, preserve the folded
  // topography while retaining the game's hand-drawn survey-map language.
  gfx.lineStyle(0.55, style.contour, 0.12);
  const firstContour = Math.ceil(minHeight / style.contourMeters) * style.contourMeters;
  for (let level = firstContour; level < maxHeight; level += style.contourMeters) {
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const index = row * sampleW + col;
        drawContourCell(
          gfx,
          rect.x + col * cellW,
          rect.y + row * cellH,
          cellW,
          cellH,
          heights[index],
          heights[index + 1],
          heights[index + sampleW + 1],
          heights[index + sampleW],
          level,
        );
      }
    }
  }
  return true;
}
