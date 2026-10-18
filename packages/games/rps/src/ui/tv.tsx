'use client';

import type { ReactNode } from 'react';
import {
  Tally,
  PlayerReaction,
  Token,
  useMoment,
  VerdictMoment,
  type GameUi,
  type ScreenPlayer,
} from '@jackdaw/ui';
import { listNames, roundWinners } from '../outcome';
import { beats, type Pick, type RoundResult, type RpsTableView } from '../rules';
import './tv.css';

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 3.4,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

/** The three throws, in the house line style (64×64). */
const THROW_ART: Record<Pick, ReactNode> = {
  rock: (
    <g {...stroke}>
      <path d="M10 42c-2-10 4-20 14-23 7-2 11 1 17 0 8-1 14 6 13 15-1 11-10 17-23 17-11 0-19-3-21-9z" />
      <path d="M24 19l4 11 12 1M28 30l-6 12M40 31l10 8" strokeWidth="2.4" />
    </g>
  ),
  paper: (
    <g {...stroke}>
      <path d="M17 7h22l11 11v39H17z" />
      <path d="M39 7v11h11M24 29h19M24 37h19M24 45h12" strokeWidth="2.6" />
    </g>
  ),
  scissors: (
    <g {...stroke}>
      <circle cx="17" cy="20" r="7" />
      <circle cx="17" cy="44" r="7" />
      <path d="M23 24l33 20M23 40l33-20" />
      <circle cx="33" cy="32" r="1.8" fill="currentColor" />
    </g>
  ),
};

const THROW_NAME: Record<Pick, string> = { rock: 'Rock', paper: 'Paper', scissors: 'Scissors' };

function Throw({ pick, size = 64 }: { pick: Pick; size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
      {THROW_ART[pick]}
    </svg>
  );
}

/**
 * Rock Paper Scissors on the TV: the round, who has picked (never what), the last round's
 * throws once everyone revealed, and the scoreboard. Readable from across a room.
 */
export const TvScreen: GameUi['TvScreen'] = ({ tableView, players, reactions }) => {
  const view = tableView as RpsTableView;
  const byId = new Map((players as ScreenPlayer[]).map((p) => [p.id, p] as const));
  const name = (id: string) => byId.get(id)?.name ?? 'Left the lobby';
  const picked = new Set(view.picked);
  const waiting = view.players.length - picked.size;
  const last = view.history[view.history.length - 1];
  const board = [...view.players].sort((a, b) => (view.scores[b] ?? 0) - (view.scores[a] ?? 0));
  const top = Math.max(1, ...view.players.map((id) => view.scores[id] ?? 0));
  const [fresh, dismiss] = useMoment(view.history.length);
  const roundWon = last ? roundWinners(last) : [];
  const finished = view.round > view.rounds;

  return (
    <div className="rps-tv">
      <section className="rps-tv__round" aria-label="Round">
        <span className="rps-tv__label">Round</span>
        <span className="rps-tv__num">{view.round}</span>
        <span className="rps-tv__of">of {view.rounds}</span>
        <p className="rps-tv__status">
          {waiting === 0
            ? 'Everyone has picked'
            : `Waiting on ${waiting} ${waiting === 1 ? 'player' : 'players'}`}
        </p>
      </section>

      <section className="rps-tv__board" aria-label="Scores">
        <h2 className="rps-tv__heading">Scores</h2>
        <ol>
          {board.map((id) => {
            const p = byId.get(id);
            const score = view.scores[id] ?? 0;
            return (
              <li key={id}>
                {p && <Token avatar={p.avatar} size={40} />}
                <span className="rps-tv__who">{name(id)}</span>
                <span className="rps-tv__bar" aria-hidden="true">
                  <i style={{ width: `${(score / top) * 100}%` }} />
                </span>
                <Tally value={score} />
              </li>
            );
          })}
        </ol>
      </section>

      <section className="rps-tv__now" aria-label="This round">
        <h2 className="rps-tv__heading">This round</h2>
        <ul
          className="rps-tv__seats"
          style={{
            gridTemplateColumns: `repeat(${view.players.length <= 5 ? Math.max(view.players.length, 3) : Math.ceil(view.players.length / 2)}, 1fr)`,
          }}
        >
          {view.players.map((id) => {
            const p = byId.get(id);
            const done = picked.has(id);
            return (
              <li key={id} className={done ? 'is-picked' : 'is-thinking'}>
                <span className="rps-tv__tok">
                  {p && <Token avatar={p.avatar} size={92} away={!p.online} />}
                  <PlayerReaction reactions={reactions} playerId={id} name={name(id)} size={64} />
                </span>
                <span className="rps-tv__seat-name">{name(id)}</span>
                <span className="rps-tv__state">{done ? 'Picked' : 'Thinking'}</span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="rps-tv__last" aria-label="Last round">
        <h2 className="rps-tv__heading">{last ? `Round ${last.round} throws` : 'Throws'}</h2>
        {last ? (
          <ul className="rps-tv__throws" key={last.round}>
            {view.players.map((id, i) => {
              const pick = last.picks[id];
              const pts = last.points[id] ?? 0;
              const outcome =
                roundWon.length === 0 ? 'draw' : roundWon.includes(id) ? 'win' : 'loss';
              return (
                <li
                  key={id}
                  className={`rps-tv__card rps-tv__card--${outcome}`}
                  style={{ animationDelay: `${i * 110}ms` }}
                >
                  {pick && <Throw pick={pick} size={72} />}
                  <span className="rps-tv__throw-name">{pick ? THROW_NAME[pick] : 'No throw'}</span>
                  <span className="rps-tv__seat-name">{name(id)}</span>
                  <b className={pts > 0 ? 'rps-tv__pts rps-tv__pts--won' : 'rps-tv__pts'}>+{pts}</b>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="rps-tv__empty">
            Everyone&apos;s throws appear here together once the last pick is in.
          </p>
        )}
      </section>

      {fresh !== null && last && !finished && (
        <VerdictMoment
          key={last.round}
          size="tv"
          ms={4200}
          outcome={roundWon.length ? 'win' : 'draw'}
          title={roundTitle(last, roundWon, name)}
          detail={roundDetail(last, roundWon, name)}
          avatar={roundWon.length === 1 ? byId.get(roundWon[0]!)?.avatar : undefined}
          onDone={dismiss}
        />
      )}
    </div>
  );
};

function roundTitle(last: RoundResult, winners: string[], name: (id: string) => string) {
  if (winners.length === 0) return `Round ${last.round} is a stand-off`;
  if (winners.length === 1) return `${name(winners[0]!)} takes round ${last.round}`;
  return `${listNames(winners, name)} share round ${last.round}`;
}

/** "Rock beat Lark and Magpie", from the public throws only. */
function roundDetail(last: RoundResult, winners: string[], name: (id: string) => string) {
  if (winners.length === 0) return 'Nobody got ahead this round.';
  const pick = last.picks[winners[0]!]!;
  const beaten = Object.keys(last.picks).filter((id) => beats(pick, last.picks[id]!));
  const sameThrow = winners.every((id) => last.picks[id] === pick);
  if (!sameThrow) return 'Everyone at the top scored the same.';
  return `${THROW_NAME[pick]} beat ${listNames(beaten, name, 3)}.`;
}
