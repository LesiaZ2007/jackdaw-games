'use client';

import { useRef } from 'react';
import {
  useCountdown,
  useMoment,
  VerdictMoment,
  type GameUi,
  type ScreenPlayer,
} from '@jackdaw/ui';
import { lastRoundPlayed, type CambioTableView } from '../rules';
import { useAfter, useSwapFlight } from './hooks';
import {
  dropLine,
  houseRules,
  rankRound,
  roundLine,
  roundMoment,
  ruleLine,
  statusLine,
} from './logic';
import { HouseContext } from './pieces';
import {
  CambioBand,
  CambioTable,
  HandsList,
  HouseRules,
  HIDDEN,
  PlayByPlay,
  Scores,
  TurnClock,
  type SlotFn,
} from './table';
import './cambio.css';

/** The public table only: a face shows once the round is over and every grid is turned up. */
export const publicSlots =
  (t: CambioTableView): SlotFn =>
  (owner, slot) => {
    const c = t.hands?.[owner]?.[slot];
    return c === undefined ? HIDDEN : { id: c, up: true, note: null };
  };

/** After a round, the countdown to the next deal. */
export function BetweenRounds({ t, now }: { t: CambioTableView; now: () => number }) {
  const left = useCountdown(t.nextAt, now);
  const final = lastRoundPlayed(t);
  if (left === null || t.phase !== 'scoring') return null;
  return (
    <p className="cmb-dock__count" role="status">
      {left > 0 ? `${final ? 'The result' : 'Next round'} in ${left}…` : 'Dealing…'}
    </p>
  );
}

/**
 * Cambio on the TV, read from the sofa: the felt fills the stage with everyone's token, name and
 * four cards in front of them, the stock and discard large in the middle, a rubber stamp across
 * the table for each power and a printed band when Cambio is called. The ranked scores and the
 * play by play run down the right. No card is ever shown face up until a round is scored.
 */
export const TvScreen: GameUi['TvScreen'] = ({ tableView, reactions, now, ...props }) => {
  const t = tableView as CambioTableView;
  const players = props.players as ScreenPlayer[];
  const byId = new Map(players.map((p) => [p.id, p]));
  const name = (id: string) => byId.get(id)?.name ?? 'Someone';
  const root = useRef<HTMLDivElement>(null);
  useSwapFlight(root, t.moves);
  const [fresh, dismiss] = useMoment(t.last?.round ?? 0);
  const settled = useAfter(fresh !== null, 1600);
  const moment = fresh !== null && settled ? roundMoment(t, null, name) : null;
  const scoring = t.phase === 'scoring' || t.phase === 'over';

  return (
    <HouseContext.Provider value={t.house}>
      <div className="cmb cmb-tv" ref={root}>
        <header className="cmb-tv__head">
          <h2 className="jd-display">{statusLine(t, null, name)}</h2>
          <TurnClock t={t} now={now} />
          <p>{roundLine(t)}</p>
        </header>

        <div className="cmb-tv__table">
          {scoring && t.last ? (
            <div className="cmb-tv__results">
              <p className="cmb-rule cmb-rule--tv">{ruleLine(t.last, name, null, t.house)}</p>
              {dropLine(t.last, name) && (
                <p className="cmb-rule cmb-rule--tv">{dropLine(t.last, name)}</p>
              )}
              <HandsList
                key={t.round}
                order={rankRound(t.last)}
                hands={t.hands ?? t.last.hands}
                players={players}
                caller={t.last.caller}
                flip
                size="tv"
              />
              <BetweenRounds t={t} now={now} />
            </div>
          ) : (
            <CambioTable
              t={t}
              players={players}
              slots={publicSlots(t)}
              reactions={reactions}
              oval
              tv
            />
          )}
        </div>

        <aside className="cmb-tv__side">
          <Scores t={t} players={players} tv />
          <HouseRules house={t.house} mode="tv" />
          <section className="cmb-tv__feed">
            <h3 className="jd-label">Play by play</h3>
            <PlayByPlay moves={t.moves} name={name} limit={houseRules(t.house).length ? 3 : 5} />
          </section>
        </aside>

        <CambioBand t={t} name={name} />
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
    </HouseContext.Provider>
  );
};
