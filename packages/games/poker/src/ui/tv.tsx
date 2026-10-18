'use client';

import { useMoment, VerdictMoment, type GameUi, type ScreenPlayer } from '@jackdaw/ui';
import type { PokerTableView } from '../rules';
import { handLine, handMoment } from './player';
import { PokerTable } from './table';
import './poker.css';

/** Poker on the TV: the whole table, nobody's cards until a showdown. */
export const TvScreen: GameUi['TvScreen'] = ({ tableView, reactions, ...props }) => {
  const t = tableView as PokerTableView;
  const players = props.players as ScreenPlayer[];
  const byId = new Map(players.map((p) => [p.id, p]));
  const name = (id: string) => byId.get(id)?.name ?? 'Someone';
  const [fresh, dismiss] = useMoment(t.last?.hand ?? 0);
  const moment = fresh !== null ? handMoment(t, null, name) : null;
  return (
    <div className="pk pk--tv">
      <header className="pk__head">
        <p>
          {handLine(t)}
          {t.toAct ? ` · ${name(t.toAct)} to act` : ''}
        </p>
      </header>
      <PokerTable t={t} players={players} reactions={reactions} tv />
      {moment && (
        <VerdictMoment
          key={t.last?.hand}
          size="tv"
          outcome="reveal"
          title={moment.title}
          detail={moment.detail}
          onDone={dismiss}
        />
      )}
    </div>
  );
};
