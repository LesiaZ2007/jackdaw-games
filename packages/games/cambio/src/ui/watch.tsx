'use client';

import { useRef } from 'react';
import { useMoment, VerdictMoment, type GameUi, type ScreenPlayer } from '@jackdaw/ui';
import type { CambioTableView } from '../rules';
import { useAfter, useSwapFlight } from './hooks';
import { rankRound, roundLine, roundMoment, ruleLine, statusLine } from './logic';
import { HouseContext } from './pieces';
import {
  CambioBand,
  CambioTable,
  HandsList,
  HouseRules,
  PlayByPlay,
  Scores,
  TurnClock,
} from './table';
import { BetweenRounds, publicSlots } from './tv';
import './cambio.css';

/**
 * Cambio for someone watching on a phone: the table without a hand, everyone round the felt with
 * their cards face down, and the last few moves where a hand would be. No card is ever shown
 * until a round is scored.
 */
export const WatchScreen: NonNullable<GameUi['WatchScreen']> = ({
  tableView,
  reactions,
  now,
  ...props
}) => {
  const t = tableView as CambioTableView;
  const players = props.players as ScreenPlayer[];
  const byId = new Map(players.map((p) => [p.id, p]));
  const name = (id: string) => byId.get(id)?.name ?? 'Someone';
  const root = useRef<HTMLDivElement>(null);
  useSwapFlight(root, t.moves);
  const [fresh, dismiss] = useMoment(t.last?.round ?? 0);
  const settled = useAfter(fresh !== null, 1500);
  const moment = fresh !== null && settled ? roundMoment(t, null, name) : null;
  const scoring = t.phase === 'scoring' || t.phase === 'over';

  return (
    <HouseContext.Provider value={t.house}>
      <div className="cmb cmb--phone cmb--watch" ref={root} data-count={t.players.length}>
        <header className="cmb__head">
          <h2 className="jd-display">{statusLine(t, null, name)}</h2>
          <div className="cmb__sub">
            <span>{scoring ? 'Lowest wins' : roundLine(t)}</span>
            <TurnClock t={t} now={now} />
          </div>
        </header>

        {scoring && t.last ? (
          <div className="cmb-main cmb-main--hands">
            <HandsList
              key={t.round}
              order={rankRound(t.last)}
              hands={t.hands ?? t.last.hands}
              players={players}
              caller={t.last.caller}
              flip
              size="phone"
            />
          </div>
        ) : (
          <div className="cmb-main">
            <CambioTable
              t={t}
              players={players}
              slots={publicSlots(t)}
              reactions={reactions}
              oval
            />
          </div>
        )}

        <section className="cmb-watch" aria-label="What just happened">
          {scoring && t.last ? (
            <>
              <p className="cmb-rule">{ruleLine(t.last, name, null, t.house)}</p>
              <Scores t={t} players={players} />
              <BetweenRounds t={t} now={now} />
            </>
          ) : (
            <PlayByPlay moves={t.moves} name={name} limit={3} />
          )}
          <HouseRules house={t.house} mode="plaque" />
        </section>

        <CambioBand t={t} name={name} />
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
    </HouseContext.Provider>
  );
};
