'use client';

import type { GameUi, ScreenPlayer } from '@jackdaw/ui';
import type { WordhoardTableView } from '../rules';
import { BoardGrid } from './pieces';
import { Scores, moveText } from './player';
import './wordhoard.css';

/** Wordhoard on the TV: the board large, the scores and the last few plays beside it. */
export const TvScreen: GameUi['TvScreen'] = ({ tableView, reactions, ...props }) => {
  const t = tableView as WordhoardTableView;
  const players = props.players as ScreenPlayer[];
  const byId = new Map(players.map((p) => [p.id, p]));
  const name = (id: string) => byId.get(id)?.name ?? 'Someone';
  const last = t.moves[t.moves.length - 1];
  return (
    <div className="wh wh--tv">
      <div className="wh-tv__board">
        <BoardGrid board={t.board} recent={last?.cells} />
      </div>
      <aside className="wh-tv__side">
        <h2 className="jd-display">{t.over ? 'Final scores' : `${name(t.turn)} to play`}</h2>
        <Scores t={t} players={players} reactions={reactions} />
        <p className="wh-tv__bag">
          {t.bagCount} tile{t.bagCount === 1 ? '' : 's'} in the bag
        </p>
        <ol className="wh-tv__moves" aria-label="Latest plays">
          {t.moves
            .slice(-6)
            .reverse()
            .map((m, i) => (
              <li key={t.moves.length - i}>{moveText(m, name)}</li>
            ))}
        </ol>
      </aside>
    </div>
  );
};
