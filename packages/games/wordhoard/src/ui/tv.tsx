'use client';

import { Token, useMoment, type GameUi, type ScreenPlayer } from '@jackdaw/ui';
import type { Move, WordhoardTableView } from '../rules';
import { MeaningCard } from './define';
import { BoardGrid, Tile } from './pieces';
import { Scores, TurnClock, moveText, sideName } from './player';
import './wordhoard.css';

/** Milliseconds between one new tile dropping onto the board and the next. */
export const DROP_GAP = 140;

/**
 * Letterhoard on the TV: the board large, the scores and the last few plays beside it. When a word
 * is played its tiles drop onto the board one by one, then the word rises over the board with who
 * played it and the score; a pass or a swap gets a quieter card.
 */
export const TvScreen: GameUi['TvScreen'] = ({ tableView, reactions, now, ...props }) => {
  const t = tableView as WordhoardTableView;
  const players = props.players as ScreenPlayer[];
  const byId = new Map(players.map((p) => [p.id, p]));
  const name = (id: string) => byId.get(id)?.name ?? 'Someone';
  const last = t.moves[t.moves.length - 1];
  const lastPlay = [...t.moves].reverse().find((m) => m.kind === 'play');
  // Only a move that lands while the TV is watching animates; a refresh just shows the board.
  const [fresh, dismiss] = useMoment(t.moves.length);
  const landing = fresh !== null && last ? last : null;
  return (
    <div className="wh wh--tv">
      <div className="wh-tv__board">
        <BoardGrid
          board={t.board}
          recent={last?.cells}
          dropIn={landing?.kind === 'play' ? DROP_GAP : undefined}
        />
        {landing && (
          <MoveCard
            key={t.moves.length}
            move={landing}
            player={byId.get(landing.player)}
            text={
              landing.kind === 'play'
                ? [
                    name(landing.player),
                    ...(landing.words ?? [])
                      .slice(1)
                      .map((w, i) => `${i === 0 ? 'also ' : ''}${w.word}`),
                  ].join(', ')
                : moveText(landing, name)
            }
            onDone={dismiss}
          />
        )}
      </div>
      <aside className="wh-tv__side">
        <h2 className="jd-display">
          {t.over ? 'Final scores' : `${sideName(t, t.turn, name)} to play`}
          {!t.over && <TurnClock at={t.turnBy} now={now} />}
        </h2>
        <Scores t={t} players={players} reactions={reactions} />
        <p className="wh-tv__bag">
          {t.bagCount} tile{t.bagCount === 1 ? '' : 's'} in the bag
        </p>
        <MeaningCard move={lastPlay} who={lastPlay ? name(lastPlay.player) : ''} />
        <ol className="wh-tv__moves" aria-label="Latest plays">
          {t.moves
            .slice(-4)
            .reverse()
            .map((m, i) => (
              <li key={t.moves.length - i}>{moveText(m, name)}</li>
            ))}
        </ol>
      </aside>
    </div>
  );
};

/** The move just made, over the board for a few seconds: the word in tiles, who, and the score. */
function MoveCard({
  move,
  player,
  text,
  onDone,
}: {
  move: Move;
  player?: ScreenPlayer;
  text: string;
  onDone: () => void;
}) {
  const word = move.kind === 'play' ? (move.words?.[0]?.word ?? '') : '';
  // A played word waits for its tiles to land first.
  const wait = move.kind === 'play' ? (move.cells?.length ?? 1) * DROP_GAP + 260 : 0;
  return (
    <div
      className={move.kind === 'play' ? 'wh-landing' : 'wh-landing wh-landing--quiet'}
      style={{ animationDelay: `${wait}ms` }}
      onAnimationEnd={(e) => e.target === e.currentTarget && onDone()}
      role="status"
    >
      {word && (
        <span className="wh-landing__word" aria-hidden="true">
          {[...word].map((l, i) => (
            <Tile key={i} letter={l} style={{ animationDelay: `${wait + 160 + i * 60}ms` }} />
          ))}
        </span>
      )}
      <span className="wh-landing__who">
        {player && <Token avatar={player.avatar} size={56} />}
        <span>{text}</span>
      </span>
      {move.kind === 'play' && (
        <span className="wh-landing__score" style={{ animationDelay: `${wait + 520}ms` }}>
          +{move.score}
          {move.bingo && <small>All seven tiles</small>}
        </span>
      )}
    </div>
  );
}
