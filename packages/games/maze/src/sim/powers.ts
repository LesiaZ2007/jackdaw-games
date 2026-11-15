export type PowerKind = 'hunt' | 'dash' | 'phase' | 'magnet' | 'jinx' | 'freeze' | 'steal' | 'fog';

export const POWER_KINDS: readonly PowerKind[] = [
  'hunt',
  'dash',
  'phase',
  'magnet',
  'jinx',
  'freeze',
  'steal',
  'fog',
];
/** Power-ups that work on other players; multiplayer only. */
export const ATTACK_POWERS: readonly PowerKind[] = ['jinx', 'freeze', 'steal', 'fog'];

/** How long each power-up lasts at level 1. Steal is instant. */
export const POWER_MS: Record<PowerKind, number> = {
  hunt: 7000,
  dash: 5000,
  phase: 5000,
  magnet: 6000,
  jinx: 8000,
  freeze: 2500,
  steal: 0,
  fog: 4000,
};

export const POINTS = {
  pellet: 10,
  power: 50,
  ghost: [200, 400, 800, 1600],
  caught: -200,
  mazeClear: 500,
  raceFinish: 1500,
} as const;

export const FRUIT = [
  { kind: 'cherry', pts: 100 },
  { kind: 'berry', pts: 300 },
  { kind: 'lemon', pts: 500 },
] as const;

/** Speeds in tiles per second. Ghosts get faster each level. */
export function speeds(level: number) {
  return {
    chomper: 7.8,
    dash: 11.5,
    ghost: 6.8 + 0.55 * (level - 1),
    frightened: 4.4,
    eyes: 16,
    house: 3.5,
  };
}

/** A power-up's length at a level: 600 ms shorter per level, never below 1.5 s (or its base). */
export function powerMs(kind: PowerKind, level: number): number {
  const base = POWER_MS[kind];
  if (base === 0) return 0;
  return Math.max(Math.min(base, 1500), base - 600 * (level - 1));
}
