import type { OptionGroup } from './game-ui';

/** One thing the options panel draws: a plain option, or a group of toggles as a grid. */
export type OptionItem =
  { type: 'field'; key: string } | { type: 'group'; group: OptionGroup; keys: string[] };

/**
 * Lays out the options the panel draws (`keys`, in schema order, and `booleans` those that are
 * yes/no). A group takes the place of its first key; its other keys leave their own rows. Keys a
 * group names that aren't yes/no options stay plain. With no groups, every key is a plain row.
 */
export function arrangeOptions(
  keys: string[],
  booleans: ReadonlySet<string>,
  groups: readonly OptionGroup[] | undefined,
): OptionItem[] {
  const claimed = new Map<string, OptionGroup>();
  const members = new Map<OptionGroup, string[]>();
  for (const g of groups ?? []) {
    const ks = g.keys.filter((k) => keys.includes(k) && booleans.has(k) && !claimed.has(k));
    if (ks.length === 0) continue;
    for (const k of ks) claimed.set(k, g);
    members.set(g, ks);
  }
  const out: OptionItem[] = [];
  const placed = new Set<OptionGroup>();
  for (const key of keys) {
    const g = claimed.get(key);
    if (!g) out.push({ type: 'field', key });
    else if (!placed.has(g)) {
      placed.add(g);
      out.push({ type: 'group', group: g, keys: members.get(g)! });
    }
  }
  return out;
}

/** The options after tapping one chip: only that key changes. */
export const toggleKey = (
  options: Record<string, unknown>,
  key: string,
): Record<string, unknown> => ({ ...options, [key]: !options[key] });
