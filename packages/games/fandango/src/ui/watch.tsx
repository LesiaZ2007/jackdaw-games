'use client';

import { useCountdown, useTheme, type GameUi, type ScreenPlayer } from '@jackdaw/ui';
import { ranking, type FandangoTableView } from '../rules';
import { clock } from '../time';
import { PlayerCard, Spectate } from './card';
import { useTick } from './race';
import './fandango.css';

/** Fandango for someone watching on a phone: everyone's card, and the countdown once it's closing. */
export const WatchScreen: NonNullable<GameUi['WatchScreen']> = ({
  tableView,
  players,
  now,
  reactions,
}) => {
  const t = tableView as FandangoTableView;
  const look = useTheme();
  useTick();
  const closing = useCountdown(t.closesAt, now);
  const byId = new Map((players as ScreenPlayer[]).map((p) => [p.id, p]));
  return (
    <div className="fd fd--phone fd-watch" data-look={look}>
      <header className="fd-head">
        <p className="fd-head__title">Watching</p>
        <span className="fd-clock">{clock(now() - t.startedAt)}</span>
      </header>
      {closing !== null && (
        <p className="fd-closing" role="status">
          The race ends in {clock(closing * 1000)}.
        </p>
      )}
      <Spectate count={t.players.length}>
        {ranking(t).map((id, i) => (
          <PlayerCard
            key={id}
            id={id}
            t={t}
            player={byId.get(id)}
            rank={i}
            cells={t.players.length === 1 ? (t.live?.[id] ?? []) : undefined}
            now={now}
            reactions={reactions}
          />
        ))}
      </Spectate>
      <p className="fd-rules">You&rsquo;ll get a seat in the next game.</p>
    </div>
  );
};
