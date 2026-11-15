import type { PowerKind } from '../sim/powers';

/** One plain line for each power-up: what it does. */
export const POWER_INFO: Record<PowerKind, string> = {
  hunt: 'Ghosts turn edible for you.',
  dash: 'Super speed.',
  phase: 'Pass through ghosts.',
  magnet: 'Pulls pellets in.',
  jinx: 'Sends a ghost after the leader.',
  freeze: 'Slows everyone else.',
  steal: 'Takes points from the leader.',
  fog: "Darkens everyone else's view.",
};

export const POWER_LABEL: Record<PowerKind, string> = {
  hunt: 'Hunt',
  dash: 'Dash',
  phase: 'Phase',
  magnet: 'Magnet',
  jinx: 'Jinx',
  freeze: 'Freeze',
  steal: 'Steal',
  fog: 'Fog',
};

/** Minutes and seconds, as on a clock: 2:07. */
export function clock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
