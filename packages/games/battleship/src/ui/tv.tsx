'use client';

import type { Reaction } from '@jackdaw/engine';
import {
  PlayerReaction,
  Token,
  useTheme,
  VerdictMoment,
  type GameUi,
  type ScreenPlayer,
} from '@jackdaw/ui';
import { cellName, shipOf } from '../fleet';
import type { BattleshipTableView, Volley } from '../rules';
import { Chart, hullsFromWrecks } from './chart';
import { Clock } from './player';
import { tableMoment, useArrival, useDelayedFelt } from './motion';
import './battleship.css';

/**
 * Battleship on the TV, read from the sofa. Both charts show only what has been fired at, plus
 * a ship once it has sunk. The last shot is stamped large across the chart it landed on, and
 * that ship goes down if the volley finished it.
 */
export const TvScreen: GameUi['TvScreen'] = ({ tableView, reactions, now, ...props }) => {
  const t = tableView as BattleshipTableView;
  const look = useTheme();
  const players = props.players as ScreenPlayer[];
  const byId = new Map(players.map((p) => [p.id, p]));
  const name = (id: string) => byId.get(id)?.name ?? 'Someone';
  const seq = t.last?.seq ?? 0;
  const arrived = useArrival(seq);
  const fresh = arrived != null && t.last?.seq === arrived ? t.last : null;
  const [moment, dismiss] = useDelayedFelt(seq, tableMoment(t.last));

  return (
    <div className="bs bs-tv" data-look={look}>
      <header className="bs-tv__head">
        <p className="bs-tv__line">{tvStatus(t, name)}</p>
        <Clock at={t.phase === 'place' ? t.placeBy : t.actBy} now={now} />
      </header>

      <div className="bs-tv__charts">
        {t.players.map((id) => {
          const board = t.boards[id];
          const shotHere = fresh?.at === id ? fresh : null;
          return (
            <section key={id} className={`bs-tv__seat${t.last?.at === id ? ' is-target' : ''}`}>
              <Seat id={id} t={t} players={byId} reactions={reactions} name={name} />
              <div className="bs-tv__board">
                <Chart
                  label={`${name(id)}'s sea`}
                  size="tv"
                  cells={board?.cells ?? []}
                  hulls={hullsFromWrecks(board?.wrecks ?? [])}
                  fresh={shotHere}
                  sinking={shotHere ? shotHere.sunk.map((w) => w.id) : []}
                  settling={null}
                  interactive={false}
                />
                {t.last?.at === id && <Stamp volley={t.last} fresh={fresh?.seq === t.last.seq} />}
              </div>
            </section>
          );
        })}
      </div>

      {moment && (
        <VerdictMoment
          key={`${t.last?.seq ?? 0}-${moment.title}`}
          size="tv"
          outcome={moment.outcome}
          title={moment.title}
          detail={moment.detail}
          ms={2600}
          onDone={dismiss}
        />
      )}
    </div>
  );
};

function Stamp({ volley, fresh }: { volley: Volley; fresh: boolean }) {
  const sunk = volley.sunk.length > 0;
  const hit = volley.shots.some((shot) => shot.result === 'hit' || shot.result === 'sunk');
  const word = sunk ? 'Sunk' : hit ? 'Hit' : 'Miss';
  const where = volley.shots
    .map((shot) => {
      const kind = shot.result === 'sunk' && shot.ship ? shipOf(shot.ship).name : shot.result;
      return `${cellName(shot.cell)} ${kind}`;
    })
    .join('  ·  ');
  return (
    <p
      className={`bs-stamp bs-stamp--${word.toLowerCase()}${fresh ? ' is-fresh' : ''}`}
      role="status"
    >
      <span className="bs-stamp__word">{word}</span>
      <span className="bs-stamp__where">{where}</span>
    </p>
  );
}

function Seat({
  id,
  t,
  players,
  reactions,
  name,
}: {
  id: string;
  t: BattleshipTableView;
  players: Map<string, ScreenPlayer>;
  reactions: Reaction[];
  name: (id: string) => string;
}) {
  const p = players.get(id);
  const turn = t.toAct === id || (t.phase === 'place' && !t.boards[id]?.ready);
  return (
    <h3 className={`bs-tv__who${turn ? ' is-turn' : ''}`}>
      <span className="bs-tv__tok">
        {p && <Token avatar={p.avatar} size={72} />}
        <PlayerReaction reactions={reactions} playerId={id} />
      </span>
      <span className="bs-tv__id">
        <span className="bs-tv__name">{name(id)}</span>
        <span className="bs-tv__afloat">
          {t.phase === 'place'
            ? t.boards[id]?.ready
              ? 'Fleet placed'
              : 'Placing'
            : `${t.boards[id]?.afloat ?? 0} afloat`}
        </span>
      </span>
    </h3>
  );
}

function tvStatus(t: BattleshipTableView, name: (id: string) => string): string {
  if (t.phase === 'show' || t.phase === 'over') {
    return t.winner ? `${name(t.winner)} sunk the fleet` : 'The battle is over';
  }
  if (t.phase === 'place') {
    const waiting = t.players.filter((id) => !t.boards[id]?.ready).map(name);
    return waiting.length ? `${waiting.join(' and ')} still placing` : 'Both fleets are placed';
  }
  if (!t.toAct) return 'Hold on';
  return t.salvo > 1 ? `${name(t.toAct)} fires ${t.salvo}` : `${name(t.toAct)}'s shot`;
}
