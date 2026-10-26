'use client';

import {
  PlayerReaction,
  Sheet,
  Token,
  VerdictMoment,
  useMoment,
  type GameUi,
  type ScreenPlayer,
} from '@jackdaw/ui';
import { useState, type CSSProperties } from 'react';
import { getMap } from '../maps';
import { battleMoment } from '../moments';
import type { RiskTableView } from '../rules';
import { armyColour } from './armies';
import { Continents, DiceStrip, PHASE_LABEL, TurnClock, namer, strength } from './common';
import { RiskMap } from './map';
import './risk.css';

/**
 * Risk for someone watching on a phone: the phone's own turn line, dice and map (pinch or drag to
 * look round), with everyone's strength where the dock would be. Like the TV it shows only the
 * table, so in the fog the watcher sees what the TV sees.
 */
export const WatchScreen: NonNullable<GameUi['WatchScreen']> = ({
  tableView,
  players: shellPlayers,
  now,
  reactions,
}) => {
  const t = tableView as RiskTableView;
  const players = shellPlayers as ScreenPlayer[];
  const map = getMap(t.map);
  const name = namer(players);
  const turnP = players.find((x) => x.id === t.turn);
  const [continents, setContinents] = useState(false);
  const [fresh, dismiss] = useMoment(t.battle?.ended ? t.battle.seq : 0);
  const moment = fresh ? battleMoment(t.battle, null, map, name) : null;

  return (
    <div className="rk rk--phone rk--watch">
      <header className="rk__head">
        <p className="rk-turn">
          {t.phase === 'draft' ? (
            <>
              <span className="rk-turn__who">Everyone places armies</span>
              <span className="rk-turn__phase">
                {t.draftDone.length} of {t.seats.length} done
              </span>
            </>
          ) : (
            <>
              {turnP && <Token avatar={turnP.avatar} size={26} />}
              <span
                className="rk-turn__army"
                aria-hidden="true"
                style={{ background: armyColour(t.turn, t.seats) }}
              />
              <span className="rk-turn__who">{name(t.turn)}’s turn</span>
              <span className="rk-turn__phase">{PHASE_LABEL[t.phase]}</span>
            </>
          )}
          <TurnClock at={t.actBy} now={now} />
        </p>
      </header>
      <DiceStrip battle={t.battle} map={map} players={players} seats={t.seats} />
      <div className="rk-stage">
        <RiskMap
          map={map}
          owner={t.owner}
          armies={t.armies}
          seats={t.seats}
          flash={t.battle?.ended ? t.battle.to : null}
          fog={t.fog}
          zoomable
        />
        <button
          type="button"
          className="rk-map__whole rk-watch__continents"
          onClick={() => setContinents(true)}
        >
          Continents
        </button>
      </div>
      {/* Everyone's strength as a ledger, a row a general, each edged in their army's colour. */}
      <table className="rk-ledger">
        <thead>
          <tr>
            <th scope="col">General</th>
            <th scope="col">Lands</th>
            {!t.fog && <th scope="col">Armies</th>}
            <th scope="col">Cards</th>
          </tr>
        </thead>
        <tbody>
          {t.seats.map((id) => {
            const p = players.find((x) => x.id === id);
            const { lands, armies, cards } = strength(t, id);
            const out = t.eliminated.includes(id);
            const turn = id === t.turn && t.phase !== 'draft' && t.phase !== 'over';
            return (
              <tr
                key={id}
                className={`${turn ? 'is-turn' : ''}${out ? ' is-out' : ''}`}
                style={{ '--rk-own': armyColour(id, t.seats) } as CSSProperties}
              >
                <th scope="row">
                  <span className="rk-ledger__tok">
                    {p && <Token avatar={p.avatar} size={26} away={!p.online} />}
                    <PlayerReaction reactions={reactions} playerId={id} name={name(id)} size={26} />
                  </span>
                  <span className="rk-ledger__name">{name(id)}</span>
                </th>
                {out ? (
                  <td colSpan={t.fog ? 2 : 3} className="rk-ledger__out">
                    Out
                  </td>
                ) : (
                  <>
                    <td>{lands}</td>
                    {armies !== null && <td>{armies}</td>}
                    <td>{cards}</td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      <Sheet
        open={continents}
        onClose={() => setContinents(false)}
        title="Continents"
        className="rk-sheet"
      >
        <p className="rk-sheet__note">
          Hold every territory in one to get its bonus each turn.
          {t.fog ? ' In the fog of war each general sees only their own borders.' : ''}
        </p>
        <Continents map={map} t={t} players={players} />
      </Sheet>
      {moment && (
        <VerdictMoment
          key={t.battle?.seq}
          outcome="reveal"
          title={moment.title}
          detail={moment.detail}
          onDone={dismiss}
        />
      )}
    </div>
  );
};
