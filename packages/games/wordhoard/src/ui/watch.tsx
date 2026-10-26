'use client';

import { useMoment, type GameUi, type ScreenPlayer } from '@jackdaw/ui';
import type { WordhoardTableView } from '../rules';
import { MeaningPopup } from './define';
import { BoardGrid } from './pieces';
import { Scores, TurnClock, moveText, sideName } from './player';
import { DROP_GAP } from './tv';
import './wordhoard.css';

/**
 * Letterhoard for someone watching on a phone: the phone's own heading, scores and board, with the
 * latest plays where the rack would be. A word that lands drops in tile by tile, as on the TV, and
 * then says what it means.
 */
export const WatchScreen: NonNullable<GameUi['WatchScreen']> = ({
  tableView,
  reactions,
  now,
  ...props
}) => {
  const t = tableView as WordhoardTableView;
  const players = props.players as ScreenPlayer[];
  const byId = new Map(players.map((p) => [p.id, p]));
  const name = (id: string) => byId.get(id)?.name ?? 'Someone';
  const last = t.moves[t.moves.length - 1];
  const [fresh, dismiss] = useMoment(t.moves.length);
  const landing = fresh !== null && last?.kind === 'play' ? last : null;

  return (
    <div className="wh wh--phone wh--watch">
      <header className="wh__head">
        <h2 className="jd-display">
          {t.over ? 'Final scores' : `${sideName(t, t.turn, name)}’s turn`}
          {!t.over && <TurnClock at={t.turnBy} now={now} />}
        </h2>
        <p>
          {t.bagCount} tile{t.bagCount === 1 ? '' : 's'} in the bag
        </p>
      </header>
      <Scores t={t} players={players} reactions={reactions} />
      <div className="wh-stage">
        <div className="wh-boardwrap">
          <BoardGrid board={t.board} recent={last?.cells} dropIn={landing ? DROP_GAP : undefined} />
        </div>
      </div>
      <ol className="wh-watch__moves" aria-label="Latest plays">
        {t.moves.length === 0 ? (
          <li>No words yet. The first has to cover the star.</li>
        ) : (
          t.moves
            .slice(-3)
            .reverse()
            .map((m, i) => <li key={t.moves.length - i}>{moveText(m, name)}</li>)
        )}
      </ol>
      {landing && (
        <MeaningPopup
          key={`meaning-${t.moves.length}`}
          move={landing}
          who={name(landing.player)}
          onDone={dismiss}
        />
      )}
    </div>
  );
};
