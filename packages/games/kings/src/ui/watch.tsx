'use client';

import { useCountdown, useTheme, type GameUi, type ScreenPlayer } from '@jackdaw/ui';
import { ranking, type KingsTableView } from '../rules';
import { clock } from '../time';
import { PlayerCard } from './card';
import { useTick } from './race';
import './kings.css';

/** Kings for someone watching on a phone: everyone's card, and the countdown once it's closing. */
export const WatchScreen: NonNullable<GameUi['WatchScreen']> = ({
  tableView,
  players,
  now,
  reactions,
}) => {
  const t = tableView as KingsTableView;
  const look = useTheme();
  useTick();
  const closing = useCountdown(t.closesAt, now);
  const byId = new Map((players as ScreenPlayer[]).map((p) => [p.id, p]));
  return (
    <div className="kg kg--phone kg-watch" data-look={look}>
      <header className="kg-head">
        <p className="kg-head__title">Watching</p>
        <span className="kg-clock">{clock(now() - t.startedAt)}</span>
      </header>
      {closing !== null && (
        <p className="kg-closing" role="status">
          The race ends in {clock(closing * 1000)}.
        </p>
      )}
      <div className="kg-spectate">
        {ranking(t).map((id, i) => (
          <PlayerCard
            key={id}
            id={id}
            t={t}
            player={byId.get(id)}
            rank={i}
            kings={t.players.length === 1 ? (t.live?.[id] ?? []) : undefined}
            now={now}
            reactions={reactions}
          />
        ))}
      </div>
      <p className="kg-rules">You&rsquo;ll get a seat in the next game.</p>
    </div>
  );
};
