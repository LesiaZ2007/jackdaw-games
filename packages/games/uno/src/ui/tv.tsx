'use client';

import { useMoment, VerdictMoment, type GameUi, type ScreenPlayer } from '@jackdaw/ui';
import type { UnoTableView } from '../rules';
import { roundLine, roundMoment, statusLine } from './player';
import { UnoTable } from './table';
import './uno.css';

/** UNO on the TV: the whole table, everyone's card count, and nobody's cards. */
export const TvScreen: GameUi['TvScreen'] = ({ tableView, reactions, ...props }) => {
  const t = tableView as UnoTableView;
  const players = props.players as ScreenPlayer[];
  const byId = new Map(players.map((p) => [p.id, p]));
  const name = (id: string) => byId.get(id)?.name ?? 'Someone';
  const [fresh, dismiss] = useMoment(t.last?.round ?? 0);
  const moment = fresh !== null ? roundMoment(t, null, name) : null;
  return (
    <div className="uno uno--tv">
      <header className="uno__head">
        <h2 className="jd-display">
          {t.phase === 'play' ? statusLine(t, null, name) : 'Round over'}
        </h2>
        <p>{roundLine(t)}</p>
      </header>
      <UnoTable t={t} players={players} reactions={reactions} tv />
      {moment && (
        <VerdictMoment
          key={t.last?.round}
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
