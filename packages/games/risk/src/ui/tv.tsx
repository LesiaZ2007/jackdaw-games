'use client';

import {
  PlayerReaction,
  Token,
  VerdictMoment,
  useCountdown,
  useMoment,
  type GameUi,
  type ScreenPlayer,
} from '@jackdaw/ui';
import { territoriesOf } from '../board';
import { getMap } from '../maps';
import { battleMoment } from '../moments';
import type { RiskTableView } from '../rules';
import { Continents, DiceStrip, PHASE_LABEL, clock, namer } from './common';
import { RiskMap } from './map';
import './risk.css';

/** The TV: the whole map, everyone's strength, the last battle and the continents. */
export const TvScreen: GameUi['TvScreen'] = ({
  tableView,
  players: shellPlayers,
  now,
  reactions,
}) => {
  const t = tableView as RiskTableView;
  const players = shellPlayers as ScreenPlayer[];
  const map = getMap(t.map);
  const name = namer(players);
  const secs = useCountdown(t.actBy, now);
  const [fresh, dismiss] = useMoment(t.battle?.ended ? t.battle.seq : 0);
  const moment = fresh ? battleMoment(t.battle, null, map, name) : null;
  return (
    <div className="rk rk--tv">
      <div className="rk-tv__map">
        <RiskMap
          map={map}
          owner={t.owner}
          armies={t.armies}
          players={players}
          flash={t.battle?.ended ? t.battle.to : null}
          names
          scale={1.6}
        />
      </div>
      <aside className="rk-tv__side">
        <p className="rk-turn rk-turn--tv">
          <span className="rk-turn__who">
            {t.phase === 'draft' ? 'Everyone places armies' : `${name(t.turn)}’s turn`}
          </span>
          <span className="rk-turn__phase">
            {t.phase === 'draft'
              ? `${t.draftDone.length} of ${t.seats.length} done`
              : PHASE_LABEL[t.phase]}
          </span>
          {secs !== null && <span className="rk-turn__clock">{clock(secs)}</span>}
        </p>
        <ol className="rk-seats">
          {t.seats.map((id) => {
            const p = players.find((x) => x.id === id);
            const lands = territoriesOf(t.owner, id);
            const armies = lands.reduce((sum, l) => sum + (t.armies[l] ?? 0), 0);
            const out = t.eliminated.includes(id);
            return (
              <li
                key={id}
                className={`rk-seat ${id === t.turn && t.phase !== 'draft' ? 'is-turn' : ''} ${out ? 'is-out' : ''}`}
              >
                <span className="rk-seat__tok">
                  {p && <Token avatar={p.avatar} away={!p.online} />}
                  <PlayerReaction reactions={reactions} playerId={id} name={name(id)} />
                </span>
                <span className="rk-seat__name">{name(id)}</span>
                <span className="rk-seat__stats">
                  {out ? (
                    'Out'
                  ) : (
                    <>
                      {lands.length} lands · {armies} armies · {t.handCounts[id] ?? 0} cards
                    </>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
        <DiceStrip battle={t.battle} map={map} players={players} />
        <Continents map={map} t={t} players={players} />
      </aside>
      {moment && (
        <VerdictMoment
          key={t.battle?.seq}
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
