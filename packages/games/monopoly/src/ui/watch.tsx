'use client';

import { useState } from 'react';
import {
  Sheet,
  useMoment,
  useTheme,
  VerdictMoment,
  type GameUi,
  type ScreenPlayer,
} from '@jackdaw/ui';
import { deedAt, spaceName } from '../board';
import type { MonopolyTableView } from '../rules';
import { Board, money } from './board';
import { DeedCard } from './panels';
import { Popups } from './popups';
import { Centre, Clock, People, say, statusLine, Story, waitingLine } from './player';
import './monopoly.css';

/**
 * Monopoly for someone watching on a phone: the phone's own board (tap a space for its deed),
 * everyone's cash beneath, and in place of the dock what the table waits on and the last few
 * things that happened. A bankruptcy lands as a moment, as on the TV.
 */
export const WatchScreen: NonNullable<GameUi['WatchScreen']> = ({
  tableView,
  reactions,
  now,
  ...props
}) => {
  const t = tableView as MonopolyTableView;
  const look = useTheme();
  const players = props.players as ScreenPlayer[];
  const byId = new Map(players.map((p) => [p.id, p]));
  const name = (id: string) => byId.get(id)?.name ?? 'Someone';
  const [deed, setDeed] = useState<number | null>(null);
  const lastOut = [...t.log].reverse().find((e) => e.kind === 'out');
  const [moment, dismiss] = useMoment(lastOut?.seq ?? 0);
  const focus = t.phase === 'auction' ? (t.auction?.space ?? null) : t.pendingBuy;

  return (
    <div className="mnp mnp--phone mnp--watch" data-look={look}>
      <header className="mnp-bar">
        <h2 className="mnp-bar__status">{statusLine(t, name)}</h2>
        <Clock at={t.phase === 'auction' ? (t.auction?.until ?? null) : t.actBy} now={now} />
      </header>

      <div className="mnp-main">
        <div className="mnp-stage">
          <div className="mnp-fit">
            <Board t={t} players={players} size="phone" focus={focus} onSpace={setDeed}>
              <Centre t={t} size="phone" name={name} />
            </Board>
          </div>
        </div>
        <People t={t} players={players} me={null} reactions={reactions} />
      </div>

      <footer className="mnp-dock mnp-watch">
        <p className="mnp-watch__now" role="status">
          {nowLine(t, name)}
        </p>
        <Story t={t} name={name} count={12} />
      </footer>

      <Sheet open={deed !== null} onClose={() => setDeed(null)} title="Deed" className="mnp-sheet">
        {deed !== null && <DeedCard t={t} space={deed} players={players} />}
      </Sheet>

      <Popups t={t} me={null} players={players} />

      {moment !== null && lastOut && (
        <VerdictMoment
          key={lastOut.seq}
          outcome="reveal"
          title={say(lastOut.text, name)}
          ms={2600}
          onDone={dismiss}
        />
      )}
    </div>
  );
};

/** What the table is waiting on, in a line: the roll, a deed, the auction, a debt. */
function nowLine(t: MonopolyTableView, name: (id: string) => string): string {
  if (t.phase === 'show' || t.phase === 'over') return 'The game is over.';
  const head = t.debts[0];
  if (t.phase === 'debt' && head) return `${name(head.from)} must raise ${money(head.amount)}.`;
  const au = t.auction;
  if (t.phase === 'auction' && au) {
    const price = deedAt(au.space)?.price;
    const lead = au.by ? `${name(au.by)} leads at ${money(au.high)}` : 'no bids yet';
    return `Auction for ${spaceName(au.space, t.names)}${price ? ` (${money(price)})` : ''}: ${lead}.`;
  }
  return waitingLine(t, name);
}
