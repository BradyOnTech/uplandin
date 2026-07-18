export interface Vec2 {
  x: number;
  y: number;
}

/**
 * Random source returning [0, 1). Every piece of game logic takes one of these
 * so tests (and later, seeded hunts) can be deterministic.
 */
export type RNG = () => number;
