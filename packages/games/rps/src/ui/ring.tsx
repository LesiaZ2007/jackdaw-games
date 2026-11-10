'use client';

import { useId, type CSSProperties } from 'react';
import { PlayerReaction, Token, type ScreenPlayer } from '@jackdaw/ui';
import type { Reaction } from '@jackdaw/engine';
import { roundWinners } from '../outcome';
import type { Pick, RoundResult, RpsTableView } from '../rules';
import { flipped, revealing } from './beat';
import { THROW_NAME, ThrowDisc, type DiscOutcome } from './throw';
import './ring.css';

/** How the round just played went for one player: a win, a loss, or a stand-off. */
export function outcomeOf(last: RoundResult, id: string): DiscOutcome {
  const won = roundWinners(last);
  return won.length === 0 ? 'draw' : won.includes(id) ? 'win' : 'loss';
}

/**
 * The scores as shown: while the three-beat count runs they stay as they were, so the points
 * pop only when the discs turn over.
 */
export function shownScores(table: RpsTableView, step: number): Record<string, number> {
  const last = table.history[table.history.length - 1];
  if (!last || step < 1 || step > 3) return table.scores;
  return Object.fromEntries(
    table.players.map((id) => [id, (table.scores[id] ?? 0) - (last.points[id] ?? 0)]),
  );
}

/** The round history as shown: the round being counted in is not written down yet. */
export function shownHistory(table: RpsTableView, step: number): RoundResult[] {
  return step >= 1 && step <= 3 ? table.history.slice(0, -1) : table.history;
}

/** The result line for a round, from the public throws only. */
export function resultLine(last: RoundResult): string {
  const winners = roundWinners(last);
  if (winners.length === 0) return 'Stand-off';
  const first = last.picks[winners[0]!]!;
  return winners.every((id) => last.picks[id] === first)
    ? `${THROW_NAME[first]} wins`
    : 'Top score shared';
}

/** Seat and disc sizes, in percent of the ring's width, by how many sit round it. */
function sizes(n: number) {
  if (n <= 3) return { t: 12, d: 13 };
  if (n <= 6) return { t: 11.5, d: 12.5 };
  if (n <= 8) return { t: 10.5, d: 11.5 };
  return { t: 9.5, d: 10.5 };
}

/** Where the seats sit, as a percent of the ring's width. */
const RIM = 37;

const CYCLE: Pick[] = ['rock', 'scissors', 'paper'];
const SPOT: Record<Pick, [number, number]> = {
  rock: [50, 19],
  scissors: [81, 73],
  paper: [19, 73],
};

/** The printed "what beats what" triangle: rock → scissors → paper → rock. */
function BeatsDiagram() {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const r = 16;
  return (
    <div
      className="rps-beats"
      role="img"
      aria-label="Rock beats scissors, scissors beats paper, paper beats rock."
    >
      <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
        <defs>
          <marker
            id={`rps-arrow-${id}`}
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerUnits="userSpaceOnUse"
            markerWidth="8"
            markerHeight="8"
            orient="auto"
          >
            <path d="M1 1L9 5L1 9z" fill="currentColor" />
          </marker>
        </defs>
        {CYCLE.map((from, i) => {
          const to = CYCLE[(i + 1) % 3]!;
          const [ax, ay] = SPOT[from];
          const [bx, by] = SPOT[to];
          const len = Math.hypot(bx - ax, by - ay);
          const ux = (bx - ax) / len;
          const uy = (by - ay) / len;
          return (
            <line
              key={from}
              x1={ax + ux * (r + 2)}
              y1={ay + uy * (r + 2)}
              x2={bx - ux * (r + 4)}
              y2={by - uy * (r + 4)}
              markerEnd={`url(#rps-arrow-${id})`}
            />
          );
        })}
      </svg>
      {CYCLE.map((p) => (
        <span
          key={p}
          className="rps-beats__disc"
          style={{ left: `${SPOT[p][0]}%`, top: `${SPOT[p][1]}%` }}
        >
          <ThrowDisc pick={p} />
        </span>
      ))}
    </div>
  );
}

/** What fills the middle of the ring: the diagram, the count, then the round's result line. */
function Middle({
  table,
  step,
  last,
}: {
  table: RpsTableView;
  step: number;
  last: RoundResult | undefined;
}) {
  const finished = table.round > table.rounds;
  if (step >= 1 && step <= 3) {
    return (
      <div className="rps-count">
        <span className="rps-count__chits" aria-hidden="true">
          {[1, 2, 3].map((n) => (
            <i key={n} className={n <= step ? 'is-on' : undefined} />
          ))}
        </span>
        <b key={step} className="rps-count__word jd-display">
          {['One', 'Two', 'Three'][step - 1]}
        </b>
      </div>
    );
  }
  if (last && flipped(step)) {
    return (
      <div className="rps-result">
        <b className="rps-result__line jd-display">{resultLine(last)}</b>
        <span className="rps-result__round">Round {last.round}</span>
      </div>
    );
  }
  if (finished) return <p className="rps-mid__note">Final tally</p>;
  return <BeatsDiagram />;
}

/**
 * The ring: a printed duelling ring on the table with everyone seated round it (you at the
 * bottom). In front of each player, toward the middle, lies their disc: an empty dashed circle
 * while they think, a face-down disc once they have thrown, their throw once the round turns over.
 */
export function Ring({
  table,
  players,
  me,
  step,
  reactions,
  tv,
}: {
  table: RpsTableView;
  players: ScreenPlayer[];
  me?: string;
  step: number;
  reactions?: Reaction[];
  tv?: boolean;
}) {
  const byId = new Map(players.map((p) => [p.id, p]));
  const name = (id: string) => byId.get(id)?.name ?? 'Someone';
  const n = table.players.length;
  const { t, d } = sizes(n);
  const inward = t / 2 + d / 2 + 1.2;
  const start = me ? Math.max(0, table.players.indexOf(me)) : 0;
  const order = [...table.players.slice(start), ...table.players.slice(0, start)];
  const last = table.history[table.history.length - 1];
  const onRing = last !== undefined && revealing(step);
  const up = flipped(step);
  const picked = new Set(table.picked);

  return (
    <div className="rps-ringbox">
      <div
        className={tv ? 'rps-ring rps-ring--tv' : 'rps-ring'}
        data-n={n}
        style={{ '--rt': t, '--rd': d } as CSSProperties}
      >
        <div className="rps-ring__table" aria-hidden="true" />
        <div className="rps-ring__mid">
          <Middle table={table} step={step} last={last} />
        </div>
        <ul className="rps-ring__seats" aria-label="The ring">
          {order.map((id, k) => {
            const angle = Math.PI + (k / n) * Math.PI * 2;
            const sx = Math.sin(angle);
            const cy = Math.cos(angle);
            const p = byId.get(id);
            const pick = onRing ? (last.picks[id] ?? null) : null;
            const state = pick
              ? `threw ${THROW_NAME[pick]}`
              : picked.has(id)
                ? 'has thrown'
                : 'is thinking';
            const pts = onRing && up ? (last.points[id] ?? 0) : 0;
            const slot = pick || picked.has(id);
            return (
              <li key={id} style={{ display: 'contents' }}>
                <span
                  className={id === me ? 'rps-seat rps-seat--me' : 'rps-seat'}
                  data-plate={cy > 0.3 ? 'above' : 'below'}
                  style={{ left: `${50 + RIM * sx}%`, top: `${50 - RIM * cy}%` }}
                >
                  <span className="rps-seat__tok">
                    {p && <Token avatar={p.avatar} away={!p.online} />}
                    <PlayerReaction reactions={reactions} playerId={id} name={name(id)} />
                  </span>
                  <span className="rps-seat__plate" title={name(id)} aria-hidden="true">
                    {id === me ? 'You' : name(id)}
                  </span>
                  <span className="rps-sr">
                    {name(id)}
                    {id === me ? ' (you)' : ''} {state}.
                  </span>
                </span>
                <span
                  className="rps-slot"
                  style={{
                    left: `${50 + (RIM - inward) * sx}%`,
                    top: `${50 - (RIM - inward) * cy}%`,
                  }}
                >
                  {slot ? (
                    <ThrowDisc
                      pick={pick}
                      up={up && onRing}
                      outcome={onRing && up ? outcomeOf(last, id) : null}
                    />
                  ) : (
                    <span className="rps-slot__empty" />
                  )}
                  {last && pts > 0 && (
                    <b key={last.round} className="rps-slot__gain" aria-hidden="true">
                      +{pts}
                    </b>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
