'use client';

import type { Reaction } from '@jackdaw/engine';
import { PlayerReaction, Token, useCountdown, useMoment, type ScreenPlayer } from '@jackdaw/ui';
import { pool, type Side } from '../board';
import { KIND_NAME, type BackgammonTableView, type GameEnd, type TurnLog } from '../rules';
import { CheckerIcon, DieIcon, flightsOf, notation, type Flight } from './table';
import { useArrival } from './motion';

export type Name = (id: string) => string;

/** One player's name plate: token, checker colour, pips to go and points won. */
export function Plate({
  t,
  side,
  player,
  reactions,
  name,
  you,
  size = 'phone',
}: {
  t: BackgammonTableView;
  side: Side;
  player: ScreenPlayer | undefined;
  reactions: Reaction[];
  name: Name;
  you?: boolean;
  size?: 'phone' | 'tv';
}) {
  const id = t.players[side];
  const turn = t.toAct === id;
  const tok = size === 'tv' ? 72 : 36;
  return (
    <div className={`bgm-plate${turn ? ' is-turn' : ''}${size === 'tv' ? ' bgm-plate--tv' : ''}`}>
      <span className="bgm-plate__tok">
        {player && <Token avatar={player.avatar} size={tok} />}
        <PlayerReaction reactions={reactions} playerId={id} />
      </span>
      <span className="bgm-plate__who">
        <b>{you ? 'You' : name(id)}</b>
        <span>
          <CheckerIcon side={side} size={size === 'tv' ? 30 : 16} />
          {t.pips[side]} pips
        </span>
      </span>
      <span className="bgm-plate__score" aria-label={`${t.score[side]} points`}>
        {t.score[side]}
      </span>
    </div>
  );
}

/** "Match to 3 · Game 2", with the Crawford game marked. */
export function MatchLine({ t }: { t: BackgammonTableView }) {
  return (
    <p className="bgm-match">
      {t.matchTo === 1 ? 'One game' : `Match to ${t.matchTo}`}
      <span aria-hidden="true"> · </span>Game {t.game}
      {t.crawford && <span className="bgm-match__tag">Crawford: no cube</span>}
    </p>
  );
}

export function Clock({ at, now }: { at: number | null; now: () => number }) {
  const left = useCountdown(at, now);
  if (left === null) return null;
  const m = Math.floor(left / 60);
  const s = String(left % 60).padStart(2, '0');
  return (
    <span className={left <= 10 ? 'bgm-clock is-low' : 'bgm-clock'} role="timer">
      {m}:{s}
    </span>
  );
}

/** What the last thing on the table was, in a line. */
export function lastLine(entry: TurnLog | null, name: Name): string {
  if (!entry) return '';
  const who = name(entry.by);
  const d = entry.dice ? `${entry.dice[0]}–${entry.dice[1]}` : '';
  switch (entry.kind) {
    case 'open':
      return `${who} opens with ${d}`;
    case 'move':
      return `${who} ${d}: ${notation(entry.steps ?? [])}`;
    case 'blocked':
      return `${who} rolled ${d} and cannot move`;
    case 'double':
      return `${who} doubles to ${entry.cube}`;
    case 'take':
      return `${who} takes at ${entry.cube}`;
    case 'drop':
      return `${who} drops`;
  }
}

export function endLine(end: GameEnd): string {
  const how = end.dropped ? 'cube dropped' : KIND_NAME[end.kind];
  const cube = end.cube > 1 ? ` · cube ${end.cube}` : '';
  return `${how[0]!.toUpperCase()}${how.slice(1)}${cube} · ${end.points} ${end.points === 1 ? 'point' : 'points'} · ${end.score[0]}–${end.score[1]}`;
}

/** The status line for someone who is not moving (the TV, a watcher, the other player). */
export function tableStatus(t: BackgammonTableView, name: Name): string {
  if (t.phase === 'show' || t.phase === 'over') {
    return t.winner ? `${name(t.winner)} wins${t.matchTo > 1 ? ' the match' : ''}` : 'Over';
  }
  if (t.phase === 'between' && t.lastEnd)
    return `${name(t.lastEnd.winner)} wins game ${t.lastEnd.game}`;
  if (!t.toAct) return 'Hold on';
  if (t.phase === 'double') return `${name(t.toAct)} to take or drop at ${t.cube * 2}`;
  if (t.phase === 'roll') return `${name(t.toAct)} to roll`;
  return `${name(t.toAct)} to move ${diceWords(t.dice)}`;
}

export function diceWords(dice: readonly [number, number] | null): string {
  if (!dice) return '';
  return dice[0] === dice[1] ? `four ${dice[0]}s` : `${dice[0]} and ${dice[1]}`;
}

/** The dice of the turn in play, for the board: four for a doublet. */
export function boardDice(t: BackgammonTableView): { dice: number[] | null; side: Side | null } {
  if (!t.dice || t.turn === null || t.phase !== 'move') return { dice: null, side: null };
  return { dice: pool(t.dice), side: t.turn };
}

/** The latest log entry's checkers in flight, once, when it arrives (not someone's own move). */
export function useFlights(
  t: BackgammonTableView,
  skip?: Side | null,
): { flights: Flight[]; key: number } {
  const seq = t.last?.seq ?? 0;
  const arrived = useArrival(seq);
  const fresh = arrived != null && t.last?.seq === arrived ? t.last : null;
  if (!fresh || (skip != null && fresh.side === skip)) return { flights: [], key: seq };
  return { flights: flightsOf(fresh), key: seq };
}

/** A finished game, felt once when it lands. */
export function useGameEnd(t: BackgammonTableView): [GameEnd | null, () => void] {
  const [fresh, dismiss] = useMoment(t.lastEnd ? t.lastEnd.game : 0);
  return [fresh && t.lastEnd && fresh === t.lastEnd.game ? t.lastEnd : null, dismiss];
}

/** The last few things that happened, newest first. */
export function Log({ t, name, rows = 5 }: { t: BackgammonTableView; name: Name; rows?: number }) {
  const lines = t.log
    .filter((e) => e.game === t.game)
    .slice(-rows)
    .reverse();
  if (lines.length === 0) return null;
  return (
    <ol className="bgm-log" aria-label="Last moves">
      {lines.map((e) => (
        <li key={e.seq}>
          <CheckerIcon side={e.side} size={16} />
          {e.dice && e.kind !== 'open' && (
            <span className="bgm-log__dice">
              <DieIcon value={e.dice[0]} side={e.side} size={20} />
              <DieIcon value={e.dice[1]} side={e.side} size={20} />
            </span>
          )}
          <span>{lastLine(e, name)}</span>
        </li>
      ))}
    </ol>
  );
}
