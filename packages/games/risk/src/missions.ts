import type { Rng } from '@jackdaw/engine';
import { continentsHeld, territoriesOf, type Armies, type Owner } from './board';
import type { MapDef } from './maps';

/** A secret goal. The first player to complete theirs wins. */
export type Mission =
  | { kind: 'continents'; ids: [string, string]; any: boolean }
  | { kind: 'territories'; n: 24 }
  | { kind: 'territories2'; n: 18 }
  | { kind: 'destroy'; target: string };

const HOLD_24: Mission = { kind: 'territories', n: 24 };

/** The map's continent goals, the two territory goals, and (3+ players) a destroy per player. */
export function missionDeck(map: MapDef, playerIds: string[]): Mission[] {
  return [
    ...map.missionPairs.map(([a, b, any]): Mission => ({
      kind: 'continents',
      ids: [a, b],
      any: any === 'any',
    })),
    HOLD_24,
    { kind: 'territories2', n: 18 },
    ...(playerIds.length > 2
      ? playerIds.map((target): Mission => ({ kind: 'destroy', target }))
      : []),
  ];
}

/** One mission each, from a shuffled deck; drawing yourself as a target means 24 territories. */
export function dealMissions(map: MapDef, playerIds: string[], rng: Rng): Record<string, Mission> {
  const deck = rng.shuffle(missionDeck(map, playerIds));
  return Object.fromEntries(
    playerIds.map((pid, i) => {
      const m = deck[i]!;
      return [pid, m.kind === 'destroy' && m.target === pid ? HOLD_24 : m];
    }),
  );
}

/** A destroy mission whose target someone else took out becomes "Hold 24 territories". */
export function fallback(m: Mission, pid: string, eliminatedBy: Record<string, string>): Mission {
  if (m.kind !== 'destroy') return m;
  const by = eliminatedBy[m.target];
  return by && by !== pid ? HOLD_24 : m;
}

export function missionDone(
  m: Mission,
  map: MapDef,
  owner: Owner,
  armies: Armies,
  pid: string,
  eliminatedBy: Record<string, string>,
): boolean {
  switch (m.kind) {
    case 'continents': {
      const held = continentsHeld(map, owner, pid);
      return m.ids.every((c) => held.includes(c)) && (!m.any || held.length >= 3);
    }
    case 'territories':
      return territoriesOf(owner, pid).length >= m.n;
    case 'territories2':
      return territoriesOf(owner, pid).filter((t) => (armies[t] ?? 0) >= 2).length >= m.n;
    case 'destroy':
      return eliminatedBy[m.target] === pid;
  }
}

const continentName = (map: MapDef, id: string) =>
  map.continents.find((c) => c.id === id)?.name.replace(/^The /, 'the ') ?? id;

/** The mission as its holder reads it. */
export function missionText(m: Mission, map: MapDef, nameOf: (pid: string) => string): string {
  switch (m.kind) {
    case 'continents': {
      const [a, b] = m.ids.map((c) => continentName(map, c));
      return m.any ? `Hold ${a}, ${b} and one more continent` : `Hold ${a} and ${b}`;
    }
    case 'territories':
      return `Hold ${m.n} territories`;
    case 'territories2':
      return `Hold ${m.n} territories with at least 2 armies on each`;
    case 'destroy':
      return `Destroy ${nameOf(m.target)}’s army`;
  }
}

/** A short label without names, for the lobby's game stats (`Standing.role`). */
export function missionLabel(m: Mission, map: MapDef): string {
  return m.kind === 'destroy' ? 'Destroy an army' : missionText(m, map, () => '');
}
