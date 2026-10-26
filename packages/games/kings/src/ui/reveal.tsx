'use client';

import { useTheme, type GameUi, type ScreenPlayer } from '@jackdaw/ui';
import type { KingsReveal } from '../rules';
import { clock } from '../time';
import { answerMarks, Board } from './board';
import { place } from './race';
import './kings.css';

/** Everyone's time on each puzzle, best finisher first, under every puzzle's answer. */
function Splits({ rv, players }: { rv: KingsReveal; players: ScreenPlayer[] }) {
  const name = (id: string) => players.find((p) => p.id === id)?.name ?? 'Someone';
  const split = (id: string, i: number) => {
    const times = rv.times[id] ?? [];
    const at = times[i];
    if (at === undefined) return '–';
    return clock(at - (i === 0 ? rv.startedAt : times[i - 1]!));
  };
  return (
    <div className="kg-splits-wrap">
      <table className="kg-splits">
        <thead>
          <tr>
            <th scope="col">Player</th>
            {rv.puzzles.map((_, i) => (
              <th key={i} scope="col">
                {i + 1}
              </th>
            ))}
            <th scope="col">Total</th>
          </tr>
        </thead>
        <tbody>
          {rv.order.map((id, k) => {
            const times = rv.times[id] ?? [];
            return (
              <tr key={id}>
                <th scope="row">
                  {place(k)} {name(id)}
                </th>
                {rv.puzzles.map((_, i) => (
                  <td key={i}>{split(id, i)}</td>
                ))}
                <td>
                  {times.length}/{rv.count}
                  {times.length ? ` · ${clock(times.at(-1)! - rv.startedAt)}` : ''}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Answers({ rv }: { rv: KingsReveal }) {
  return (
    <div className="kg-answers">
      {rv.puzzles.map((p, i) => (
        <figure key={i} className="kg-answer">
          <Board puzzle={p} marks={answerMarks(p, p.answer)} label={`Puzzle ${i + 1}, solved`} />
          <figcaption>Puzzle {i + 1}</figcaption>
        </figure>
      ))}
    </div>
  );
}

export const Reveal: NonNullable<GameUi['Reveal']> = ({ result, players }) => {
  const rv = result.reveal as KingsReveal;
  const look = useTheme();
  return (
    <div className="kg kg-reveal" data-look={look}>
      {rv.order.length > 1 && <Splits rv={rv} players={players} />}
      <Answers rv={rv} />
    </div>
  );
};

export const TvReveal: NonNullable<GameUi['TvReveal']> = ({ result }) => {
  const rv = result.reveal as KingsReveal;
  const look = useTheme();
  return (
    <div className="kg kg-tv-end" data-look={look}>
      <Answers rv={rv} />
    </div>
  );
};
