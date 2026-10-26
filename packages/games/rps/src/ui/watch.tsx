'use client';

import { useMoment, VerdictMoment, type GameUi, type ScreenPlayer } from '@jackdaw/ui';
import { roundWinners } from '../outcome';
import type { RpsTableView } from '../rules';
import { RpsTable } from './player';
import { roundDetail, roundTitle } from './tv';

/**
 * Rock Paper Scissors for someone watching on a phone: the phone's own table (round, who has
 * thrown, scores, the last reveal) without the throw buttons. Each reveal shows as the TV's moment.
 */
export const WatchScreen: NonNullable<GameUi['WatchScreen']> = ({
  tableView,
  players,
  reactions,
}) => {
  const t = tableView as RpsTableView;
  const byId = new Map((players as ScreenPlayer[]).map((p) => [p.id, p]));
  const name = (id: string) => byId.get(id)?.name ?? 'Someone';
  const last = t.history[t.history.length - 1];
  const won = last ? roundWinners(last) : [];
  const [fresh, dismiss] = useMoment(t.history.length);

  return (
    <div className="rps-watch">
      <RpsTable table={t} players={players as ScreenPlayer[]} reactions={reactions} />
      {!last && (
        <p className="rps-watch__empty">
          Everyone&rsquo;s throws are shown here together once the last pick is in.
        </p>
      )}
      {fresh !== null && last && t.round <= t.rounds && (
        <VerdictMoment
          key={last.round}
          outcome="reveal"
          title={roundTitle(last, won, name)}
          detail={roundDetail(last, won, name)}
          avatar={won.length === 1 ? byId.get(won[0]!)?.avatar : undefined}
          onDone={dismiss}
        />
      )}
    </div>
  );
};
