'use client';

import { Token, type GameUi, type ScreenPlayer } from '@jackdaw/ui';
import type { Move, WordhoardReveal } from '../rules';
import { BoardGrid, Tile } from './pieces';
import { moveText } from './player';
import './wordhoard.css';

/** Sides in final order (highest score first), from a reveal. Older results have no sides. */
function finalSides(r: WordhoardReveal) {
  const sides = r.sides ?? Object.keys(r.scores).map((id) => [id]);
  return sides
    .map((ids) => ({ key: ids[0]!, ids, score: r.scores[ids[0]!] ?? 0 }))
    .sort((a, b) => b.score - a.score);
}

/** The highest-scoring play, to pick out on the board. */
function bestPlay(moves: Move[]): Move | null {
  return moves
    .filter((m) => m.kind === 'play')
    .reduce<Move | null>((a, m) => (!a || m.score > a.score ? m : a), null);
}

/**
 * The end of a game on phones: the final scores (with what the last tiles were worth), the
 * finished board with the best play picked out, and every move in order.
 */
export const Reveal: NonNullable<GameUi['Reveal']> = ({ result, players, me }) => {
  const r = result.reveal as WordhoardReveal;
  const byId = new Map(players.map((p) => [p.id, p]));
  const name = (id: string) => (id === me ? 'You' : (byId.get(id)?.name ?? 'Someone'));
  const best = bestPlay(r.moves);

  return (
    <div className="wh wh-final">
      <section aria-label="Final scores">
        <h3 className="jd-display wh-final__title">Final scores</h3>
        <FinalScores r={r} players={players} name={name} />
      </section>
      <section aria-label="The finished board">
        <h3 className="jd-display wh-final__title">The board</h3>
        {best && (
          <p className="wh-final__note">
            Best play: {best.words?.[0]?.word} for {best.score}, by{' '}
            {best.player === me ? 'you' : name(best.player)}.
          </p>
        )}
        <div className="wh-boardwrap">
          <BoardGrid board={r.board} recent={best?.cells} label="The finished board" />
        </div>
      </section>
      <section aria-label="Every move">
        <h3 className="jd-display wh-final__title">Every move</h3>
        <ol className="wh-final__moves">
          {r.moves.map((m, i) => (
            <li key={i}>{moveText(m, name)}</li>
          ))}
        </ol>
      </section>
    </div>
  );
};

function FinalScores({
  r,
  players,
  name,
}: {
  r: WordhoardReveal;
  players: ScreenPlayer[];
  name: (id: string) => string;
}) {
  const byId = new Map(players.map((p) => [p.id, p]));
  return (
    <ol className="wh-final__scores">
      {finalSides(r).map(({ key, ids, score }) => {
        const bonus = r.endBonus[key] ?? 0;
        const left = r.racks[key] ?? [];
        return (
          <li key={key}>
            <span className="wh-scores__toks">
              {ids.map((id) => {
                const p = byId.get(id);
                return (
                  <span key={id} className="wh-scores__tok">
                    {p && <Token avatar={p.avatar} size={ids.length > 1 ? 28 : 34} />}
                  </span>
                );
              })}
            </span>
            <span className="wh-final__who">
              <span className="wh-final__name">{ids.map(name).join(' & ')}</span>
              {bonus !== 0 && (
                <small>
                  {bonus > 0 ? `+${bonus} for going out` : `${bonus} for the tiles left`}
                </small>
              )}
            </span>
            {left.length > 0 && (
              <span className="wh-final__left" aria-label={`Left on the rack: ${left.join(' ')}`}>
                {left.map((t, i) => (
                  <Tile key={i} letter={t} />
                ))}
              </span>
            )}
            <span className="wh-final__n">{score}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** The TV's results: the finished board, as big as the space beside the standings allows. */
export const TvReveal: NonNullable<GameUi['TvReveal']> = ({ result }) => {
  const r = result.reveal as WordhoardReveal;
  const best = bestPlay(r.moves);
  return (
    <div className="wh wh-final wh-final--tv">
      <div className="wh-boardwrap">
        <BoardGrid board={r.board} recent={best?.cells} label="The finished board" />
      </div>
    </div>
  );
};
