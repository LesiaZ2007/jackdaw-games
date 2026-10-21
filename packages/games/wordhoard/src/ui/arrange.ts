/**
 * Your own order for the tiles on your rack, kept from turn to turn. The rack itself comes from
 * the server in its own order; the arrangement is the letters as you last left them.
 */

/**
 * Rack indexes in the order to show them: tiles you still have keep the places you gave them,
 * and new tiles go on the end.
 */
export function arrange(rack: readonly string[], arranged: readonly string[]): number[] {
  const free = rack.map((_, i) => i);
  const order: number[] = [];
  for (const letter of arranged) {
    const k = free.findIndex((i) => rack[i] === letter);
    if (k >= 0) order.push(...free.splice(k, 1));
  }
  return [...order, ...free];
}

/** The order with the tile at `from` moved to sit where `to` was. */
export function moveTo(order: readonly number[], from: number, to: number): number[] {
  const at = order.indexOf(from);
  const dest = order.indexOf(to);
  if (at < 0 || dest < 0 || at === dest) return [...order];
  const next = order.filter((i) => i !== from);
  next.splice(dest, 0, from);
  return next;
}
