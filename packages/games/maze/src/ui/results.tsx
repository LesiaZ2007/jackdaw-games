'use client';

import { useEffect, useState } from 'react';
import { Lid, Plaque, type GameResultsProps } from '@jackdaw/ui';
import { LOOKS } from './render/core';
import { colorOf } from './render/look';
import { readBest, useConfetti, useCountUp, writeBest } from './use-maze';
import './maze.css';

interface Reveal {
  order: string[];
  mode: 'Solo' | 'Shared' | 'Race';
  scores: Record<string, number>;
}

/**
 * The end of the round on a phone: a printed panel with the winner, your score counting up, the
 * ranking rising in one row at a time, and what each player did. Confetti for a win.
 */
export function Results({ result, players, me, isHost, playAgain, backToLobby }: GameResultsProps) {
  const reveal = result.reveal as Reveal;
  const fx = useConfetti();
  const name = (id: string) => players.find((p) => p.id === id)?.name ?? 'Someone';
  const solo = reveal.mode === 'Solo';
  const mine = me ? (reveal.scores[me] ?? 0) : (reveal.scores[reveal.order[0] ?? ''] ?? 0);
  const total = useCountUp(mine);
  const winner = result.winners[0] ?? reveal.order[0] ?? '';
  const iWon = me !== null && result.winners.includes(me);
  const [best] = useState(() => readBest());
  const newBest = me !== null && mine > best && mine > 0;
  useEffect(() => {
    if (newBest) writeBest(mine);
    if (iWon || newBest) fx.fire(iWon ? 220 : 120);
  }, [newBest, iWon, mine, fx]);

  const palette = LOOKS.Printed.players;
  const cols = result.stats?.columns ?? [];
  const rows = result.stats?.rows ?? [];
  const title = solo
    ? iWon
      ? 'Splendid!'
      : 'Game over'
    : iWon
      ? 'You win!'
      : `${name(winner)} wins`;

  return (
    <div className="mz mz-results">
      <Lid className="mz-lid">
        <div className="mz-kicker">{result.summary.replace(/[{}]/g, '')}</div>
        <h2 className="mz-lid__title">{title}</h2>
        {me !== null ? (
          <div className="mz-big" aria-label="Your score">
            {total}
          </div>
        ) : null}
        <p className="mz-lid__p">
          {newBest ? <b className="mz-best">New best!</b> : best > 0 ? `Best ${best}` : ''}
        </p>
        {!solo ? (
          <ol className="mz-rank">
            {reveal.order.map((id, i) => (
              <li
                key={id}
                className={id === me ? 'is-you' : ''}
                style={{ animationDelay: `${0.25 + i * 0.15}s` }}
              >
                <span className="mz-rank__n">{i + 1}</span>
                <i
                  className="mz-card__dot"
                  style={{
                    background: colorOf(
                      palette,
                      players.findIndex((p) => p.id === id),
                    ),
                  }}
                  aria-hidden
                />
                <span className="mz-rank__name">{name(id)}</span>
                <span className="mz-rank__s">{reveal.scores[id] ?? 0}</span>
              </li>
            ))}
          </ol>
        ) : null}
        {rows.length ? (
          <table className="mz-stats">
            <thead>
              <tr>
                <th scope="col">Player</th>
                {cols.map((c) => (
                  <th key={c} scope="col">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.playerId}>
                  <th scope="row">{name(r.playerId)}</th>
                  {r.values.map((v, i) => (
                    <td key={i}>{v}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        {isHost ? (
          <div className="mz-btns">
            <Plaque go onClick={playAgain}>
              Play again
            </Plaque>
            <Plaque onClick={backToLobby}>Back to lobby</Plaque>
          </div>
        ) : (
          <p className="mz-lid__p">Waiting for the host.</p>
        )}
      </Lid>
    </div>
  );
}
