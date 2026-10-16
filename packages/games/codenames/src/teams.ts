import type { Rng } from '@jackdaw/engine';

export const TEAMS = ['red', 'blue'] as const;
export type Team = (typeof TEAMS)[number];

export const other = (team: Team): Team => (team === 'red' ? 'blue' : 'red');
export const TEAM_NAME: Record<Team, string> = { red: 'Red', blue: 'Blue' };

/** How the host arranged the table in the lobby (part of the game's options). */
export interface Arrangement {
  /** Player id -> team. Players missing here are placed when the game starts. */
  teams: Record<string, Team>;
  /** Each team's chosen spymaster, if any. */
  spymasters: Partial<Record<Team, string>>;
}

export interface Placement {
  teams: Record<string, Team>;
  spymasters: Record<Team, string>;
}

/**
 * Who plays on which team, for the players actually seated. The host's arrangement is kept where
 * it can be: ids of players who left are ignored, unplaced players join the smaller team, and
 * with `balance` the teams are evened out (the larger team gives up operatives, never its chosen
 * spymaster). Every team ends with at least two players, so each has a spymaster and someone to
 * guess. Spymasters are the host's picks unless `fresh` (or the pick is missing or moved), in
 * which case one is drawn at random from the team.
 */
export function place(
  playerIds: string[],
  arrangement: Arrangement,
  opts: { balance: boolean; fresh: boolean },
  rng: Rng,
): Placement {
  const teams: Record<string, Team> = {};
  const unplaced: string[] = [];
  for (const id of playerIds) {
    const t = arrangement.teams[id];
    if (t === 'red' || t === 'blue') teams[id] = t;
    else unplaced.push(id);
  }
  const members = (t: Team) => playerIds.filter((id) => teams[id] === t);
  for (const id of rng.shuffle(unplaced)) {
    const r = members('red').length;
    const b = members('blue').length;
    teams[id] = r < b ? 'red' : b < r ? 'blue' : rng.pick(TEAMS);
  }

  const pinned = new Set(
    TEAMS.map((t) => arrangement.spymasters[t]).filter((id): id is string => Boolean(id)),
  );
  // Move one player from the larger team, preferring someone who isn't a chosen spymaster.
  const move = (from: Team) => {
    const pool = members(from);
    const movable = pool.filter((id) => !pinned.has(id));
    const id = rng.pick(movable.length > 0 ? movable : pool);
    teams[id] = other(from);
  };
  for (let guard = 0; guard < playerIds.length; guard++) {
    const r = members('red').length;
    const b = members('blue').length;
    const tooFew = r < 2 || b < 2;
    const uneven = Math.abs(r - b) > 1;
    if (!tooFew && !(opts.balance && uneven)) break;
    move(r > b ? 'red' : 'blue');
  }

  const spymasters = {} as Record<Team, string>;
  for (const t of TEAMS) {
    const chosen = arrangement.spymasters[t];
    spymasters[t] = !opts.fresh && chosen && teams[chosen] === t ? chosen : rng.pick(members(t));
  }
  return { teams, spymasters };
}
