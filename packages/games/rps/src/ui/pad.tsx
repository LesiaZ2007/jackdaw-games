'use client';

import { useEffect, useRef } from 'react';
import { Tally, Token, type ScreenPlayer } from '@jackdaw/ui';
import { roundWinners } from '../outcome';
import type { RoundResult, RpsTableView } from '../rules';
import { ThrowDisc } from './throw';
import './ring.css';

function rank(table: RpsTableView, scores: Record<string, number>) {
  return [...table.players].sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0));
}

/** A compact score strip: token, name and points, best first, sideways inside its own box. */
export function ScoreStrip({
  table,
  players,
  me,
  scores,
}: {
  table: RpsTableView;
  players: ScreenPlayer[];
  me?: string;
  scores: Record<string, number>;
}) {
  const byId = new Map(players.map((p) => [p.id, p]));
  return (
    <section className="rps-strip" aria-label="Scores">
      <ol>
        {rank(table, scores).map((id) => {
          const p = byId.get(id);
          const name = p?.name ?? 'Someone';
          return (
            <li key={id} className={id === me ? 'is-me' : undefined}>
              {p && <Token avatar={p.avatar} size={28} away={!p.online} />}
              <span className="rps-strip__name" title={name}>
                {name}
              </span>
              <Tally className="rps-strip__pts" value={scores[id] ?? 0} />
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/**
 * The score pad: a ruled sheet with a row per player (token, name, points) and a column per
 * finished round holding that player's tiny throw disc and the points they made. Newest at the
 * right; it scrolls sideways inside its own box.
 */
export function ScorePad({
  table,
  players,
  me,
  scores,
  history,
  tv,
}: {
  table: RpsTableView;
  players: ScreenPlayer[];
  me?: string;
  scores: Record<string, number>;
  history: RoundResult[];
  tv?: boolean;
}) {
  const byId = new Map(players.map((p) => [p.id, p]));
  const box = useRef<HTMLDivElement>(null);
  const rounds = history.length;
  useEffect(() => {
    const el = box.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [rounds]);

  return (
    <div className={rounds === 0 ? 'rps-pad rps-pad--blank' : 'rps-pad'}>
      <div
        className="rps-pad__scroll"
        ref={box}
        role="region"
        aria-label="Round history"
        tabIndex={0}
      >
        <table>
          <thead>
            <tr>
              <th className="rps-pad__who" scope="col">
                <span className="rps-sr">Player</span>
              </th>
              <th className="rps-pad__tot" scope="col">
                Pts
              </th>
              {history.map((r) => (
                <th key={r.round} scope="col" className="rps-pad__rd">
                  <span className="rps-sr">Round </span>
                  {r.round}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rank(table, scores).map((id) => {
              const p = byId.get(id);
              const name = p?.name ?? 'Someone';
              return (
                <tr key={id} className={id === me ? 'is-me' : undefined}>
                  <th className="rps-pad__who" scope="row">
                    <span className="rps-pad__id">
                      {p && <Token avatar={p.avatar} size={tv ? 52 : 28} away={!p.online} />}
                      <span className="rps-pad__name" title={name}>
                        {name}
                      </span>
                    </span>
                  </th>
                  <td className="rps-pad__tot">
                    <Tally value={scores[id] ?? 0} />
                  </td>
                  {history.map((r) => {
                    const pick = r.picks[id];
                    const won = roundWinners(r).includes(id);
                    return (
                      <td key={r.round} className="rps-pad__cell">
                        {pick ? (
                          <span>
                            <ThrowDisc pick={pick} outcome={won ? 'win' : null} />
                            <b>+{r.points[id] ?? 0}</b>
                          </span>
                        ) : (
                          '–'
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rounds === 0 && (
        <p className="rps-pad__empty">Each round&rsquo;s throws are written here.</p>
      )}
    </div>
  );
}
