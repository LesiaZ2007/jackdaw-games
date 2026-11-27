import type { MazeTableView } from '../rules';
import { resolveMaze } from '../sim/generate';
import type { LiveSetup } from './pass';
import type { LiveRoundOptions } from './round';

/**
 * A Contact round's setup, from the public table view and the lobby's players (for names and
 * bots); null when the game isn't a Contact round in play or counting down.
 */
export function liveSetupFrom(
  tv: MazeTableView,
  players: readonly { id: string; name: string; bot?: boolean }[],
): LiveSetup | null {
  if (tv.mode !== 'Contact' || tv.endAt === null) return null;
  if (tv.phase !== 'countdown' && tv.phase !== 'play') return null;
  return {
    round: tv.round,
    seed: tv.seed,
    layouts: tv.layouts,
    powers: tv.powers,
    mixed: tv.options.powerUps === 'Mixed',
    startAt: tv.startAt,
    endAt: tv.endAt,
    seats: tv.players.map((p) => {
      const who = players.find((x) => x.id === p.id);
      return { id: p.id, name: who?.name ?? 'Player', ...(who?.bot ? { bot: true } : {}) };
    }),
  };
}

/** The live round's options for a setup: ghosts and fruit on, the bell on the round clock. */
export function roundOptionsFrom(setup: LiveSetup): LiveRoundOptions {
  return {
    layouts: setup.layouts.map(resolveMaze),
    startedAt: setup.startAt,
    seed: setup.seed,
    powers: setup.powers,
    mixed: setup.mixed,
    ghosts: true,
    fruit: true,
    endMs: setup.endAt - setup.startAt,
  };
}
