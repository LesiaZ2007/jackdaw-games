'use client';

import { useMoment, useTheme, VerdictMoment, type GameUi, type ScreenPlayer } from '@jackdaw/ui';
import type { MonopolyTableView } from '../rules';
import { Board } from './board';
import { Popups } from './popups';
import { Centre, Clock, People, say, statusLine, Story } from './player';
import './monopoly.css';

/**
 * Monopoly on the TV: the whole board as big as the screen allows, with tokens walking round
 * it, the dice and the card just drawn in the middle; beside it everyone's cash and the story so
 * far. A bankruptcy lands as a moment for the room.
 */
export const TvScreen: GameUi['TvScreen'] = ({ tableView, reactions, now, ...props }) => {
  const t = tableView as MonopolyTableView;
  const look = useTheme();
  const players = props.players as ScreenPlayer[];
  const byId = new Map(players.map((p) => [p.id, p]));
  const name = (id: string) => byId.get(id)?.name ?? 'Someone';
  const lastOut = [...t.log].reverse().find((e) => e.kind === 'out');
  const [moment, dismiss] = useMoment(lastOut?.seq ?? 0);
  const focus = t.phase === 'auction' ? (t.auction?.space ?? null) : t.pendingBuy;

  return (
    <div className="mnp mnp-tv" data-look={look}>
      <div className="mnp-tv__board">
        <div className="mnp-fit">
          <Board t={t} players={players} size="tv" focus={focus}>
            <Centre t={t} size="tv" name={name} />
          </Board>
        </div>
      </div>
      <aside className="mnp-tv__side">
        <header className="mnp-tv__head">
          <p className="mnp-tv__line">{statusLine(t, name)}</p>
          <Clock at={t.phase === 'auction' ? (t.auction?.until ?? null) : t.actBy} now={now} />
        </header>
        {t.phase === 'auction' && t.auction && (
          <p className="mnp-tv__auction">
            Auction · {t.auction.by ? `${name(t.auction.by)} at $${t.auction.high}` : 'no bids yet'}
          </p>
        )}
        <People t={t} players={players} me={null} reactions={reactions} tv />
        <Story t={t} name={name} count={7} />
      </aside>
      <Popups t={t} me={null} players={players} tv />
      {moment !== null && lastOut && (
        <VerdictMoment
          key={lastOut.seq}
          size="tv"
          outcome="reveal"
          title={say(lastOut.text, name)}
          ms={2800}
          onDone={dismiss}
        />
      )}
    </div>
  );
};
