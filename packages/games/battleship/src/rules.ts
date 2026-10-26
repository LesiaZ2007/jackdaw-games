import {
  GameError,
  type Announcement,
  type GameModule,
  type GameResult,
  type RecapEvent,
  type Rng,
} from '@jackdaw/engine';
import { z } from 'zod';
import {
  CELLS,
  fleetError,
  shipOf,
  span,
  cellName,
  dealFleet,
  SHIP_IDS,
  SHIPS,
  type Dir,
  type Placement,
  type ShipId,
} from './fleet';
import { meta } from './meta';
import { battleshipBot } from './bot';

/**
 * Battleship for two. Each player hides the classic fleet (carrier 5, battleship 4, cruiser 3,
 * submarine 3, destroyer 2) on a 10×10 chart. Ships lie horizontal or vertical and may touch,
 * but not overlap. Both fleets are placed in secret. Then the players take turns firing until
 * one fleet is sunk.
 *
 * One shot: a hit, including one that sinks a ship while others remain, earns another shot.
 * A miss ends the turn. The shot that sinks the last ship ends the battle. Salvo is one
 * volley for each ship you still have afloat, then the turn passes even if every shot hit.
 *
 * A hit or a miss is public. A ship is named and drawn only once every square of it has been
 * hit. Any square of a ship that has not been fired at stays off the table view, the opponent's
 * view and the TV.
 */

const FIRING = ['One shot', 'Salvo'] as const;
const CLOCKS = ['Off', '30 seconds', '60 seconds'] as const;

/** How long the winning shot stays on the table before the results screen, so it can land. */
export const SHOW_MS = 3_200;

export const optionsSchema = z.object({
  firing: z.enum(FIRING).describe('Firing'),
  turnTimer: z.enum(CLOCKS).describe('Turn timer'),
});
export type BattleshipOptions = z.infer<typeof optionsSchema>;

const placementSchema = z.object({
  id: z.enum(SHIP_IDS),
  dir: z.enum(['h', 'v']),
  at: z
    .number()
    .int()
    .min(0)
    .max(CELLS - 1),
});

export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('place'), ships: z.array(placementSchema).length(SHIPS.length) }),
  z.object({
    type: z.literal('fire'),
    cells: z
      .array(
        z
          .number()
          .int()
          .min(0)
          .max(CELLS - 1),
      )
      .min(1)
      .max(SHIPS.length),
  }),
]);
export type BattleshipAction = z.infer<typeof actionSchema>;

export type Phase = 'place' | 'fire' | 'show' | 'over';
export type Mark = 'blank' | 'miss' | 'hit' | 'sunk';

export interface LaidShip {
  id: ShipId;
  dir: Dir;
  cells: number[];
}

/** A ship everyone can see, because every square of it has been hit. */
export interface Wreck {
  id: ShipId;
  dir: Dir;
  cells: number[];
}

export interface VolleyShot {
  cell: number;
  result: 'miss' | 'hit' | 'sunk';
  /** Set only when this shot sunk the ship. */
  ship?: ShipId;
}

/** One turn's fire. Public, and what the screens animate. */
export interface Volley {
  seq: number;
  by: string;
  at: string;
  shots: VolleyShot[];
  sunk: Wreck[];
  /** The clock ran out and the table fired for them. */
  late?: boolean;
}

interface FleetState {
  ships: LaidShip[];
  ready: boolean;
}

interface ShotRecord {
  cell: number;
  result: 'miss' | 'hit' | 'sunk';
  ship?: ShipId;
}

export interface BattleshipState {
  players: string[];
  /** 'one' or 'salvo'. */
  firing: 'one' | 'salvo';
  turnSecs: number;
  phase: Phase;
  /** Secret: each fleet, empty until that player locks it in. */
  fleets: Record<string, FleetState>;
  /** Shots fired at each player, in order. */
  shots: Record<string, ShotRecord[]>;
  wrecks: Record<string, Wreck[]>;
  /** Who fires next. Null while placing, and after the game is decided. */
  toAct: string | null;
  /** Who took the first shot, once the battle starts. */
  first: string | null;
  seq: number;
  volleys: Volley[];
  /** Shared deadline for placing, when a turn timer is on. */
  placeBy: number | null;
  /** Deadline for the player to fire. */
  actBy: number | null;
  /** When the winning shot gives way to the results. */
  showBy: number | null;
  winner: string | null;
  recap: RecapEvent[];
}

/** What anyone may know about one fleet. */
export interface BoardView {
  cells: Mark[];
  wrecks: Wreck[];
  afloat: number;
  ready: boolean;
}

export interface OwnShip {
  id: ShipId;
  name: string;
  dir: Dir;
  cells: number[];
  hits: number;
  sunk: boolean;
}

export interface BattleshipTableView {
  players: string[];
  phase: Phase;
  firing: 'one' | 'salvo';
  toAct: string | null;
  first: string | null;
  boards: Record<string, BoardView>;
  /** How many squares the player to act fires. 0 when nobody is firing. */
  salvo: number;
  placeBy: number | null;
  actBy: number | null;
  showBy: number | null;
  last: Volley | null;
  log: Volley[];
  winner: string | null;
}

export interface BattleshipPlayerView extends BattleshipTableView {
  me: string;
  /** Your ships. Never anyone else's. */
  ships: OwnShip[];
  ready: boolean;
}

export interface BattleshipReveal {
  players: string[];
  winner: string | null;
  fleets: Record<string, LaidShip[]>;
  wrecks: Record<string, Wreck[]>;
  shots: Record<string, ShotRecord[]>;
  /** Shots each player fired. */
  fired: Record<string, number>;
}

const LOG = 16;

function secs(clock: BattleshipOptions['turnTimer']): number {
  return clock === 'Off' ? 0 : Number(clock.split(' ')[0]);
}

function foeOf(s: BattleshipState, id: string): string {
  const foe = s.players.find((p) => p !== id);
  if (!foe) throw new GameError('NOT_A_PLAYER', "You're not in this game.");
  return foe;
}

function fresh<T>(ids: string[], make: () => T): Record<string, T> {
  return Object.fromEntries(ids.map((id) => [id, make()]));
}

function lay(placement: Placement): LaidShip {
  const cells = span(placement.at, placement.dir, shipOf(placement.id).len);
  if (!cells) throw new GameError('OFF_CHART', `${shipOf(placement.id).name} hangs off the chart.`);
  return { id: placement.id, dir: placement.dir, cells };
}

/** Salvo: one shot for each of your ships still afloat. One shot: always one. */
function salvoSize(s: BattleshipState, shooter: string): number {
  if (s.firing === 'one') return 1;
  return Math.max(1, SHIPS.length - (s.wrecks[shooter]?.length ?? 0));
}

function boardOf(s: BattleshipState, id: string): BoardView {
  const cells: Mark[] = Array.from({ length: CELLS }, () => 'blank');
  for (const shot of s.shots[id] ?? []) {
    cells[shot.cell] = shot.result === 'miss' ? 'miss' : 'hit';
  }
  const wrecks = s.wrecks[id] ?? [];
  for (const wreck of wrecks) for (const cell of wreck.cells) cells[cell] = 'sunk';
  return {
    cells,
    wrecks,
    afloat: SHIPS.length - wrecks.length,
    ready: s.fleets[id]?.ready ?? false,
  };
}

function ownShips(s: BattleshipState, id: string): OwnShip[] {
  const hits = new Set(
    (s.shots[id] ?? []).filter((shot) => shot.result !== 'miss').map((shot) => shot.cell),
  );
  const sunk = new Set((s.wrecks[id] ?? []).map((w) => w.id));
  return (s.fleets[id]?.ships ?? []).map((ship) => ({
    id: ship.id,
    name: shipOf(ship.id).name,
    dir: ship.dir,
    cells: ship.cells.slice(),
    hits: ship.cells.filter((c) => hits.has(c)).length,
    sunk: sunk.has(ship.id),
  }));
}

function table(s: BattleshipState): BattleshipTableView {
  const last = s.volleys[s.volleys.length - 1] ?? null;
  return {
    players: s.players.slice(),
    phase: s.phase,
    firing: s.firing,
    toAct: s.toAct,
    first: s.first,
    boards: Object.fromEntries(s.players.map((id) => [id, boardOf(s, id)])),
    salvo: s.phase === 'fire' && s.toAct ? salvoSize(s, s.toAct) : 0,
    placeBy: s.placeBy,
    actBy: s.actBy,
    showBy: s.showBy,
    last,
    log: s.volleys.slice(-LOG),
    winner: s.winner,
  };
}

/** Squares of this fleet that nobody has fired at. */
export function unhitCells(s: BattleshipState, id: string): number[] {
  const fired = new Set((s.shots[id] ?? []).map((shot) => shot.cell));
  const hidden: number[] = [];
  for (const ship of s.fleets[id]?.ships ?? []) {
    if ((s.wrecks[id] ?? []).some((w) => w.id === ship.id)) continue;
    for (const cell of ship.cells) if (!fired.has(cell)) hidden.push(cell);
  }
  return hidden;
}

function deadline(s: BattleshipState, now: number): number | null {
  return s.turnSecs ? now + s.turnSecs * 1000 : null;
}

function withClock(s: BattleshipState, now: number): BattleshipState {
  if (s.phase === 'place') return { ...s, actBy: null, showBy: null };
  if (s.phase === 'fire') return { ...s, placeBy: null, actBy: deadline(s, now), showBy: null };
  return { ...s, placeBy: null, actBy: null };
}

function begin(s: BattleshipState, rng: Rng, now: number): BattleshipState {
  const first = rng.pick(s.players);
  return withClock(
    {
      ...s,
      phase: 'fire',
      toAct: first,
      first,
      placeBy: null,
    },
    now,
  );
}

function placeFleet(s: BattleshipState, id: string, ships: readonly Placement[]): BattleshipState {
  const problem = fleetError(ships);
  if (problem) throw new GameError('BAD_FLEET', problem);
  return {
    ...s,
    fleets: { ...s.fleets, [id]: { ships: ships.map(lay), ready: true } },
  };
}

function resolveCell(
  s: BattleshipState,
  defender: string,
  cell: number,
  already: ShotRecord[],
): VolleyShot {
  const fleet = s.fleets[defender]!;
  const ship = fleet.ships.find((laid) => laid.cells.includes(cell));
  if (!ship) return { cell, result: 'miss' };
  const hits = new Set(
    [...(s.shots[defender] ?? []), ...already]
      .filter((shot) => shot.result !== 'miss')
      .map((shot) => shot.cell),
  );
  hits.add(cell);
  if (ship.cells.every((c) => hits.has(c))) return { cell, result: 'sunk', ship: ship.id };
  return { cell, result: 'hit' };
}

function fireAt(
  s: BattleshipState,
  shooter: string,
  cells: readonly number[],
  now: number,
  late = false,
): BattleshipState {
  if (s.phase !== 'fire' || s.toAct !== shooter) {
    throw new GameError(
      'NOT_YOUR_TURN',
      s.phase === 'place' ? 'Place your fleet first.' : "It isn't your shot.",
    );
  }
  const need = salvoSize(s, shooter);
  if (cells.length !== need) {
    throw new GameError(
      'BAD_SALVO',
      need === 1 ? 'Fire one square.' : `Fire ${need} squares, one for each ship you have left.`,
    );
  }
  if (new Set(cells).size !== cells.length)
    throw new GameError('BAD_SHOT', 'Each shot is a different square.');
  const defender = foeOf(s, shooter);
  const used = new Set((s.shots[defender] ?? []).map((shot) => shot.cell));
  for (const cell of cells) {
    if (!Number.isInteger(cell) || cell < 0 || cell >= CELLS) {
      throw new GameError('BAD_SHOT', 'That square is off the chart.');
    }
    if (used.has(cell))
      throw new GameError('BAD_SHOT', `${cellName(cell)} has already been fired at.`);
  }

  const added: ShotRecord[] = [];
  const volleyShots: VolleyShot[] = [];
  const sunk: Wreck[] = [];
  const wrecks = (s.wrecks[defender] ?? []).slice();
  for (const cell of cells) {
    const shot = resolveCell(s, defender, cell, added);
    const record: ShotRecord = {
      cell,
      result: shot.result,
      ...(shot.ship ? { ship: shot.ship } : {}),
    };
    added.push(record);
    volleyShots.push(shot);
    if (shot.result === 'sunk' && shot.ship) {
      const laid = s.fleets[defender]!.ships.find((ship) => ship.id === shot.ship)!;
      const wreck: Wreck = { id: laid.id, dir: laid.dir, cells: laid.cells.slice() };
      wrecks.push(wreck);
      sunk.push(wreck);
    }
  }

  const seq = s.seq + 1;
  const volley: Volley = {
    seq,
    by: shooter,
    at: defender,
    shots: volleyShots,
    sunk,
    ...(late ? { late: true } : {}),
  };
  const lost = wrecks.length === SHIPS.length;
  // One shot keeps the attacker on a clean hit. A miss, a salvo, or the last ship does not.
  const keep = s.firing === 'one' && !lost && volleyShots.every((shot) => shot.result !== 'miss');
  const next: BattleshipState = {
    ...s,
    shots: { ...s.shots, [defender]: [...(s.shots[defender] ?? []), ...added] },
    wrecks: { ...s.wrecks, [defender]: wrecks },
    seq,
    volleys: [...s.volleys, volley],
    recap: [...s.recap, recapWithSecrets(s, volley)],
    winner: lost ? shooter : s.winner,
    phase: lost ? 'show' : 'fire',
    toAct: lost ? null : keep ? shooter : defender,
    showBy: lost ? now + SHOW_MS : null,
  };
  return lost ? { ...next, placeBy: null, actBy: null } : withClock(next, now);
}

function recapFor(volley: Volley): RecapEvent {
  const bits = volley.shots.map((shot) => {
    if (shot.result === 'sunk' && shot.ship) {
      return `${cellName(shot.cell)} sunk the ${shipOf(shot.ship).name.toLowerCase()}`;
    }
    return `${cellName(shot.cell)} ${shot.result}`;
  });
  return { actor: volley.by, text: `{${volley.by}} fired at ${bits.join(', ')}.` };
}

/**
 * Hidden truth for a hit that did not sink: which ship it was. Kept on the recap only. The recap
 * is not part of either view, and the chat line is the public text without this secret.
 */
function recapWithSecrets(s: BattleshipState, volley: Volley): RecapEvent {
  const base = recapFor(volley);
  const names = volley.shots
    .filter((shot) => shot.result === 'hit')
    .map((shot) => s.fleets[volley.at]?.ships.find((ship) => ship.cells.includes(shot.cell)))
    .filter((ship): ship is LaidShip => Boolean(ship))
    .map((ship) => shipOf(ship.id).name.toLowerCase());
  const unique = [...new Set(names)];
  return unique.length ? { ...base, secret: `Hit the ${unique.join(' and the ')}.` } : base;
}

function openCells(s: BattleshipState, defender: string): number[] {
  const used = new Set((s.shots[defender] ?? []).map((shot) => shot.cell));
  const open: number[] = [];
  for (let cell = 0; cell < CELLS; cell++) if (!used.has(cell)) open.push(cell);
  return open;
}

function resultOf(s: BattleshipState, summary: string, winners: string[]): GameResult {
  const fired: Record<string, number> = {};
  for (const id of s.players) fired[id] = s.shots[foeOf(s, id)]?.length ?? 0;
  const sunkBy = (id: string) => s.wrecks[foeOf(s, id)]?.length ?? 0;
  const best = Math.max(...s.players.map(sunkBy));
  const highlight =
    best > 0
      ? {
          award: 'Sharpest eye',
          playerIds: winners.length === 1 ? winners : s.players.filter((id) => sunkBy(id) === best),
          text:
            s.phase === 'over' && winners.length === 1
              ? `Sunk the fleet in ${fired[winners[0]!] ?? 0} shots`
              : `${best} ${best === 1 ? 'ship' : 'ships'} sunk`,
          value:
            s.phase === 'over' && winners.length === 1
              ? 1000 - (fired[winners[0]!] ?? 0)
              : best * 100 +
                (s.shots[foeOf(s, winners[0] ?? s.players[0]!)]?.filter(
                  (shot) => shot.result !== 'miss',
                ).length ?? 0),
        }
      : null;
  return {
    winners,
    summary,
    reveal: {
      players: s.players.slice(),
      winner: s.winner,
      fleets: Object.fromEntries(s.players.map((id) => [id, s.fleets[id]?.ships ?? []])),
      wrecks: s.wrecks,
      shots: s.shots,
      fired,
    } satisfies BattleshipReveal,
    recap: s.recap,
    standings: s.players.map((id) => ({
      playerId: id,
      outcome: winners.length > 1 ? 'draw' : winners.includes(id) ? 'win' : 'loss',
    })),
    ...(highlight ? { highlights: [highlight] } : {}),
  };
}

function leaders(s: BattleshipState): { ids: string[]; sunk: number; hits: number } | null {
  const any = s.players.some((id) => (s.shots[id]?.length ?? 0) > 0);
  if (!any) return null;
  const score = (id: string) => {
    const foe = foeOf(s, id);
    return {
      id,
      sunk: s.wrecks[foe]?.length ?? 0,
      hits: (s.shots[foe] ?? []).filter((shot) => shot.result !== 'miss').length,
    };
  };
  const ranked = s.players.map(score).sort((a, b) => b.sunk - a.sunk || b.hits - a.hits);
  const top = ranked[0]!;
  const ids = ranked
    .filter((row) => row.sunk === top.sunk && row.hits === top.hits)
    .map((row) => row.id);
  return { ids, sunk: top.sunk, hits: top.hits };
}

export const battleship: GameModule<
  BattleshipState,
  BattleshipAction,
  BattleshipPlayerView,
  BattleshipTableView,
  BattleshipOptions
> = {
  meta,
  optionsSchema,
  actionSchema,

  defaultOptions() {
    return { firing: 'One shot', turnTimer: 'Off' };
  },

  validateOptions(_options, playerCount) {
    return playerCount === 2 ? null : 'Battleship needs two players.';
  },

  setup({ playerIds, options, now }) {
    const turnSecs = secs(options.turnTimer);
    return {
      players: playerIds.slice(),
      firing: options.firing === 'Salvo' ? 'salvo' : 'one',
      turnSecs,
      phase: 'place',
      fleets: fresh(playerIds, () => ({ ships: [], ready: false })),
      shots: fresh(playerIds, () => []),
      wrecks: fresh(playerIds, () => []),
      toAct: null,
      first: null,
      seq: 0,
      volleys: [],
      placeBy: turnSecs ? now + turnSecs * 1000 : null,
      actBy: null,
      showBy: null,
      winner: null,
      recap: [],
    };
  },

  getPlayerView(s, playerId) {
    return {
      ...table(s),
      me: playerId,
      ships: ownShips(s, playerId),
      ready: s.fleets[playerId]?.ready ?? false,
    };
  },

  getTableView: table,

  applyAction(s, playerId, action, rng, now) {
    if (s.phase === 'over' || s.phase === 'show')
      throw new GameError('GAME_OVER', 'The battle is over.');
    if (!s.players.includes(playerId))
      throw new GameError('NOT_A_PLAYER', "You're not in this game.");
    if (action.type === 'place') {
      if (s.phase !== 'place') throw new GameError('NOT_NOW', 'The fleets are already placed.');
      if (s.fleets[playerId]?.ready)
        throw new GameError('NOT_NOW', 'Your fleet is already placed.');
      const next = placeFleet(s, playerId, action.ships);
      const both = s.players.every((id) => next.fleets[id]?.ready);
      return both ? begin(next, rng, now) : next;
    }
    return fireAt(s, playerId, action.cells, now);
  },

  getResult(s) {
    if (s.phase !== 'over' || !s.winner) return null;
    const shots = s.shots[foeOf(s, s.winner)]?.length ?? 0;
    return resultOf(s, `The fleet is sunk in ${shots} shots.`, [s.winner]);
  },

  waitingOn(s) {
    if (s.phase === 'place') return s.players.filter((id) => !s.fleets[id]?.ready);
    if (s.phase === 'fire' && s.toAct) return [s.toAct];
    return [];
  },

  announce(prev, next) {
    if (!prev) return [];
    const lines: Announcement[] = [];
    if (prev.phase === 'place' && next.phase === 'fire' && next.first) {
      lines.push(`Both fleets are placed. {${next.first}} fires first.`);
    }
    const prevSeq = prev.seq;
    for (const volley of next.volleys) {
      if (volley.seq <= prevSeq) continue;
      const event = recapWithSecrets(next, volley);
      // The chat is public. The secret (which ship a bare hit found) stays in the recap.
      lines.push(event.text);
    }
    if (prev.phase === 'fire' && next.phase === 'show' && next.winner) {
      lines.push(`{${next.winner}} sunk the fleet.`);
    }
    return lines;
  },

  partialResult(s) {
    if (s.phase === 'over') return battleship.getResult(s);
    const lead = leaders(s);
    if (!lead) return null;
    if (s.phase === 'show' && s.winner) {
      const shots = s.shots[foeOf(s, s.winner)]?.length ?? 0;
      return resultOf(s, `The fleet is sunk in ${shots} shots.`, [s.winner]);
    }
    const summary =
      lead.ids.length > 1
        ? lead.sunk > 0
          ? `Level at ${lead.sunk} ${lead.sunk === 1 ? 'ship' : 'ships'} sunk.`
          : `Level at ${lead.hits} ${lead.hits === 1 ? 'hit' : 'hits'}.`
        : lead.sunk > 0
          ? `Led with ${lead.sunk} ${lead.sunk === 1 ? 'ship' : 'ships'} sunk.`
          : `Led with ${lead.hits} ${lead.hits === 1 ? 'hit' : 'hits'}.`;
    return resultOf(s, summary, lead.ids);
  },

  nextTimer(s) {
    if (s.phase === 'show' && s.showBy) return { id: 'show', at: s.showBy };
    if (!s.turnSecs) return null;
    if (s.phase === 'place' && s.placeBy && s.players.some((id) => !s.fleets[id]?.ready)) {
      return { id: 'place', at: s.placeBy };
    }
    if (s.phase === 'fire' && s.actBy && s.toAct) return { id: 'fire', at: s.actBy };
    return null;
  },

  onTimer(s, id, rng, now) {
    if (id === 'show' && s.phase === 'show') return { ...s, phase: 'over', showBy: null };
    if (id === 'place' && s.phase === 'place') {
      let next = s;
      for (const player of s.players) {
        if (next.fleets[player]?.ready) continue;
        next = placeFleet(next, player, dealFleet(rng));
      }
      return begin(next, rng, now);
    }
    if (id === 'fire' && s.phase === 'fire' && s.toAct) {
      const defender = foeOf(s, s.toAct);
      const cells = rng.shuffle(openCells(s, defender)).slice(0, salvoSize(s, s.toAct));
      return fireAt(s, s.toAct, cells, now, true);
    }
    return s;
  },

  bot: battleshipBot,
};
