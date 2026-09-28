/** The west entrance opens onto a shallow branching draw with a stone-bearing
 * shoulder. Property yards / height metres; continuous physical ground, not
 * separate scenery placed over the walking surface. */
const forms = [
  { x: 115, y: 515, rx: 84, ry: 44, yaw: -.48, bend: -.20, height: 2.3, kind: 'brow' },
  { x: 65, y: 584, rx: 148, ry: 48, yaw: -.56, bend: .28, height: -3.4, kind: 'draw' },
  { x: -10, y: 655, rx: 135, ry: 52, yaw: -.32, bend: -.22, height: 4.2, kind: 'brow' },
].map(shape => ({ ...shape, cos: Math.cos(shape.yaw), sin: Math.sin(shape.yaw) }));

function weight(x: number, y: number, form: typeof forms[number]): number {
  const dx = x - form.x, dy = y - form.y;
  const u = (dx * form.cos + dy * form.sin) / form.rx;
  const v = (-dx * form.sin + dy * form.cos) / form.ry - form.bend * (1 - u * u);
  if (Math.abs(u) >= 1 || Math.abs(v) >= 1) return 0;
  return (1 - u * u) ** 2 * (1 - v * v) ** 2;
}

export function sharptailWestDrawHeight(x: number, y: number): number {
  let height = 0;
  for (const form of forms) height += weight(x, y, form) * form.height;
  return height;
}

/** Same shapes carry dry short grass on the brow and sheltered rank growth
 * along its base. This does not introduce or relocate bird habitat. */
export function sharptailWestDrawGrowth(x: number, y: number, out: { crown: number; hollow: number }): void {
  out.crown = 0; out.hollow = 0;
  for (const form of forms) {
    const amount = weight(x, y, form);
    if (form.kind === 'draw') out.hollow = Math.max(out.hollow, amount);
    else out.crown = Math.max(out.crown, amount);
  }
}
