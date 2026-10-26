'use client';

import type { CSSProperties } from 'react';
import {
  useCountdown,
  useMoment,
  VerdictMoment,
  type GameUi,
  type ScreenPlayer,
} from '@jackdaw/ui';
import { lastRoundPlayed, type UnoTableView } from '../rules';
import { roundLine, roundMoment, statusLine, TurnClock } from './player';
import { GameCard } from './pieces';
import { UnoTable } from './table';
import { feedLine } from './tv';
import './uno.css';

/**
 * UNO for someone watching on a phone: the phone's own table with everyone round the mat and their
 * card counts, and where a player's hand and dock would be, the last few moves as the TV's play by
 * play. Nobody's cards are ever shown.
 */
export const WatchScreen: NonNullable<GameUi['WatchScreen']> = ({
  tableView,
  reactions,
  now,
  ...props
}) => {
  const t = tableView as UnoTableView;
  const players = props.players as ScreenPlayer[];
  const byId = new Map(players.map((p) => [p.id, p]));
  const name = (id: string) => byId.get(id)?.name ?? 'Someone';
  const [fresh, dismiss] = useMoment(t.last?.round ?? 0);
  const moment = fresh !== null ? roundMoment(t, null, name) : null;
  const done = t.phase !== 'play';

  return (
    <div
      className="uno uno--phone uno--watch"
      style={{ '--uno-now': `var(--uno-${t.colour})` } as CSSProperties}
    >
      <header className="uno__head uno-watch__head">
        <h2 className="jd-display">
          {done
            ? `${t.last ? name(t.last.winner) : 'Someone'} went out`
            : statusLine(t, null, name)}
        </h2>
        {!done && <TurnClock t={t} now={now} />}
        <p>{roundLine(t)}</p>
      </header>

      <div className="uno-stage">
        <UnoTable t={t} players={players} reactions={reactions} />
      </div>

      <section className="uno-watch" aria-label="Play by play">
        {done ? (
          <Between key={t.round} t={t} now={now} />
        ) : t.moves.length === 0 ? (
          <p className="uno-watch__quiet">The first card is down.</p>
        ) : (
          <ol>
            {t.moves
              .slice(-3)
              .reverse()
              .map((m, i) => (
                <li key={m.seq} className={i === 0 ? 'is-new' : undefined}>
                  <span className="uno-watch__mini" aria-hidden="true">
                    {m.kind === 'play' && m.card !== undefined ? (
                      <GameCard id={m.card} called={m.colour} />
                    ) : m.kind === 'draw' || m.kind === 'take' ? (
                      <GameCard down />
                    ) : null}
                  </span>
                  <span>{feedLine(m, name)}</span>
                </li>
              ))}
          </ol>
        )}
      </section>

      {moment && (
        <VerdictMoment
          key={t.last?.round}
          outcome="reveal"
          title={moment.title}
          detail={moment.detail}
          onDone={dismiss}
        />
      )}
    </div>
  );
};

/** Between rounds: what the round was worth, and the countdown to the next deal. */
function Between({ t, now }: { t: UnoTableView; now: () => number }) {
  const final = lastRoundPlayed(t);
  const left = useCountdown(t.dealAt, now);
  return (
    <>
      {t.last && <p className="uno-watch__quiet">{t.last.points} points for the round.</p>}
      {left !== null && (
        <p className="uno-dock__count" role="status">
          {left > 0
            ? `${final ? 'The winner' : 'Next round'} in ${left}…`
            : final
              ? 'Adding up…'
              : 'Dealing…'}
        </p>
      )}
    </>
  );
}
