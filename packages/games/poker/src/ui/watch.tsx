'use client';

import {
  useCountdown,
  useMoment,
  VerdictMoment,
  type GameUi,
  type ScreenPlayer,
} from '@jackdaw/ui';
import { lastHandPlayed, type ActionLine, type PokerTableView } from '../rules';
import { STREET_NAME, TurnClock, handLine, handMoment } from './player';
import { chips } from './pieces';
import { PokerTable } from './table';
import './poker.css';

/**
 * Poker for someone watching on a phone: the phone's own table, nobody's cards until a showdown,
 * and where a player's cards and betting dock would be, who the table waits on and the last few
 * bets of the hand.
 */
export const WatchScreen: NonNullable<GameUi['WatchScreen']> = ({
  tableView,
  reactions,
  now,
  ...props
}) => {
  const t = tableView as PokerTableView;
  const players = props.players as ScreenPlayer[];
  const byId = new Map(players.map((p) => [p.id, p]));
  const name = (id: string) => byId.get(id)?.name ?? 'Someone';
  const [fresh, dismiss] = useMoment(t.last?.hand ?? 0);
  const moment = fresh !== null ? handMoment(t, null, name) : null;
  const done = t.phase === 'done' || t.phase === 'over';
  const lines = t.log.slice(-3).reverse();

  return (
    <div className="pk pk--phone pk--watch">
      <header className="pk__head">
        <h2 className="jd-display">{t.toAct ? `${name(t.toAct)} to act` : STREET_NAME[t.phase]}</h2>
        <p>{handLine(t)}</p>
      </header>

      <div className="pk-stage">
        <PokerTable t={t} players={players} reactions={reactions} />
      </div>

      <section className="pk-dock pk-watch" aria-label="The betting">
        {done ? (
          <Between key={t.hand} t={t} now={now} />
        ) : (
          <>
            <p className="pk-dock__wait" role="status">
              <span>{STREET_NAME[t.phase]}</span>
              <TurnClock t={t} now={now} />
            </p>
            <ol className="pk-watch__log">
              {lines.map((l, i) => (
                <li key={t.log.length - i} className={i === 0 ? 'is-new' : undefined}>
                  {betLine(l, name)}
                </li>
              ))}
            </ol>
          </>
        )}
      </section>

      {moment && (
        <VerdictMoment
          key={t.last?.hand}
          outcome="reveal"
          title={moment.title}
          detail={moment.detail}
          onDone={dismiss}
        />
      )}
    </div>
  );
};

/** One bet in words: "Wren raised to 400". */
function betLine(l: ActionLine, name: (id: string) => string): string {
  const who = name(l.player);
  const amount = l.amount !== undefined ? chips(l.amount) : '';
  switch (l.kind) {
    case 'fold':
      return `${who} folded`;
    case 'check':
      return `${who} checked`;
    case 'call':
      return `${who} called${amount && ` ${amount}`}`;
    case 'bet':
      return `${who} bet ${amount}`;
    case 'raise':
      return `${who} raised to ${amount}`;
    case 'allIn':
      return `${who} went all in${amount && `, ${amount}`}`;
    case 'blind':
      return `${who} put in the blind, ${amount}`;
    default:
      return who;
  }
}

/** Between hands: the countdown to the next deal, or to who won after the last hand. */
function Between({ t, now }: { t: PokerTableView; now: () => number }) {
  const final = lastHandPlayed(t);
  const left = useCountdown(t.dealAt, now);
  return (
    <>
      <p className="pk-dock__wait">{STREET_NAME[t.phase]}</p>
      {left !== null && (
        <p className="pk-dock__count" role="status">
          {left > 0
            ? `${final ? 'The winner' : 'Next hand'} in ${left}…`
            : final
              ? 'Counting the chips…'
              : 'Dealing…'}
        </p>
      )}
    </>
  );
}
