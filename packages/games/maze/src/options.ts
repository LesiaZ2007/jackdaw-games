import { z } from 'zod';
import { ATTACK_POWERS, POWER_KINDS } from './sim/powers';
import type { MazeSize } from './sim/layouts';
import type { PowerKind } from './sim/powers';

export const optionsSchema = z.object({
  mode: z.enum(['Solo', 'Shared', 'Race']).describe('Mode'),
  mazes: z.number().int().min(1).max(5).describe('Mazes'),
  mazeSet: z.enum(['Mix', 'Handmade', 'Random']).describe('Mazes'),
  minutes: z.number().int().min(2).max(4).describe('Minutes'),
  powerUps: z.enum(['Classic', 'Mixed']).describe('Power-ups'),
  hunt: z.boolean().describe('Hunt'),
  dash: z.boolean().describe('Dash'),
  phase: z.boolean().describe('Phase'),
  magnet: z.boolean().describe('Magnet'),
  jinx: z.boolean().describe('Jinx'),
  freeze: z.boolean().describe('Freeze'),
  steal: z.boolean().describe('Steal'),
  fog: z.boolean().describe('Fog'),
  look: z.enum(['Printed', 'Neon', 'Classic', 'Cabinet']).describe('Look'),
  size: z.enum(['Auto', 'Small', 'Medium', 'Large']).describe('Maze size'),
});
export type MazeOptions = z.infer<typeof optionsSchema>;

export function defaultOptions(playerCount: number): MazeOptions {
  return {
    mode: playerCount === 1 ? 'Solo' : 'Shared',
    mazes: 3,
    mazeSet: 'Mix',
    minutes: 3,
    powerUps: 'Mixed',
    hunt: true,
    dash: true,
    phase: true,
    magnet: true,
    jinx: true,
    freeze: true,
    steal: true,
    fog: true,
    look: 'Printed',
    size: 'Auto',
  };
}

/**
 * The maze size to play. Auto is Medium, except a Shared maze with 5 or more players, which gets
 * the Large mazes so everyone has room.
 */
export function resolveSize(o: MazeOptions, playerCount: number): MazeSize {
  if (o.size !== 'Auto') return o.size;
  return o.mode === 'Shared' && playerCount >= 5 ? 'Large' : 'Medium';
}

/** The power-ups this game can hand out. Classic is Hunt only; Solo has no one to attack. */
export function enabledPowers(o: MazeOptions): PowerKind[] {
  if (o.powerUps === 'Classic') return ['hunt'];
  return POWER_KINDS.filter((k) => o[k] && !(o.mode === 'Solo' && ATTACK_POWERS.includes(k)));
}

export function validateOptions(o: MazeOptions, playerCount: number): string | null {
  if (o.mode === 'Solo' && playerCount !== 1) return 'Solo is for exactly 1 player.';
  if (o.mode === 'Shared' && playerCount < 2) return 'Shared maze needs 2 or more players.';
  if (o.mode === 'Race' && playerCount < 2) return 'Race needs 2 or more players.';
  if (enabledPowers(o).length === 0) return 'Turn on at least one power-up, or pick Classic.';
  return null;
}
