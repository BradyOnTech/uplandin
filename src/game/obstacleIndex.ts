export interface CircleObstacle { x: number; y: number; radius: number }

/** Static scenery broad phase. Obstacles must not be mutated after indexing. */
export class ObstacleIndex {
  private cells = new Map<string, CircleObstacle[]>();
  constructor(obstacles: readonly CircleObstacle[], private readonly cellSize = 8) {
    for (const obstacle of obstacles) {
      const { x, y, radius } = obstacle;
      this.visit(x, y, radius, key => {
        const cell = this.cells.get(key) ?? [];
        cell.push(obstacle); this.cells.set(key, cell);
      });
    }
  }

  nearby(x: number, y: number, reach: number): readonly CircleObstacle[] {
    const found = new Set<CircleObstacle>();
    this.visit(x, y, reach, key => {
      for (const obstacle of this.cells.get(key) ?? []) found.add(obstacle);
    });
    return [...found];
  }

  private visit(x: number, y: number, radius: number, visit: (key: string) => void): void {
    for (let cx = Math.floor((x - radius) / this.cellSize); cx <= Math.floor((x + radius) / this.cellSize); cx++) {
      for (let cy = Math.floor((y - radius) / this.cellSize); cy <= Math.floor((y + radius) / this.cellSize); cy++) visit(`${cx},${cy}`);
    }
  }
}
