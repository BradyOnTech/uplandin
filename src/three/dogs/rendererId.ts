/** Primary and brace dog presentations share one subsystem naming contract. */
export function dogRendererId(slot = 0): string {
  return slot === 0 ? 'dog' : `dog-${slot + 1}`;
}
