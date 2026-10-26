'use client';

import { useCountdown, useTheme, type GameUi, type ScreenPlayer } from '@jackdaw/ui';
import type { KingsTableView } from '../rules';
import { clock } from '../time';
import { Race } from './race';
import './kings.css';

/** Kings for someone watching on a phone: the race, and how long is left once it's closing. */
export const WatchScreen: NonNullable<GameUi['WatchScreen']> = ({
  tableView,
  players,
  now,
  reactions,
}) => {
  const t = tableView as KingsTableView;
  const look = useTheme();
  const closing = useCountdown(t.closesAt, now);
  return (
    <div className="kg kg--phone kg-watch" data-look={look}>
      <header className="kg-head">
        <p className="kg-head__title">
          {t.count === 1 ? 'One puzzle' : `${t.count} puzzles`}, {t.size}×{t.size}
        </p>
        <span className="kg-clock">{clock(now() - t.startedAt)}</span>
      </header>
      {closing !== null && (
        <p className="kg-closing" role="status">
          The race ends in {clock(closing * 1000)}.
        </p>
      )}
      <Race t={t} players={players as ScreenPlayer[]} now={now} reactions={reactions} />
      <p className="kg-rules">You&rsquo;ll get a seat in the next game.</p>
    </div>
  );
};
