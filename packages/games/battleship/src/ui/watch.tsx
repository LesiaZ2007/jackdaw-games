'use client';

import { useState } from 'react';
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
import { tvStatus } from './tv';
import './battleship.css';

/**
 * Battleship for someone watching on a phone: the phone's own chart, one sea at a time, turning to
 * whichever sea was just fired at. Like the TV, it shows only what has been fired at, plus a ship
 * once it has sunk.
 */
export const WatchScreen: NonNullable<GameUi['WatchScreen']> = ({
  tableView,
  reactions,
  now,
  ...props
}) => {
  const t = tableView as BattleshipTableView;
  const look = useTheme();
  const players = props.players as ScreenPlayer[];
  const byId = new Map(players.map((p) => [p.id, p]));
  const name = (id: string) => byId.get(id)?.name ?? 'Someone';
  const seq = t.last?.seq ?? 0;
  const arrived = useArrival(seq);
  const fresh = arrived != null && t.last?.seq === arrived ? t.last : null;
  const [moment, dismiss] = useDelayedFelt(seq, tableMoment(t.last));

  // The sea just fired at comes to the front; a tab turns to the other until the next shot.
  const first = t.players[0] ?? '';
  const [shown, setShown] = useState(t.last?.at ?? first);
  const [tracked, setTracked] = useState(seq);
  if (tracked !== seq) {
    setTracked(seq);
    if (t.last) setShown(t.last.at);
  }
  const focus = t.players.includes(shown) ? shown : first;

  return (
    <div className="bs bs--phone bs--watch" data-look={look}>
      <header className="bs-bar">
        <h2 className="bs-bar__status">{tvStatus(t, name)}</h2>
        <Clock at={t.phase === 'place' ? t.placeBy : t.actBy} now={now} />
      </header>

      <div className="bs-names">
        {t.players.map((id) => {
          const p = byId.get(id);
          const turn = t.toAct === id || (t.phase === 'place' && !t.boards[id]?.ready);
          return (
            <span key={id} className={`bs-name${turn ? ' is-turn' : ''}`}>
              <span className="bs-name__tok">
                {p && <Token avatar={p.avatar} size={36} />}
                <PlayerReaction reactions={reactions} playerId={id} />
              </span>
              <span className="bs-name__text">
                <b>{name(id)}</b>
              </span>
            </span>
          );
        })}
      </div>

      <div className="bs-switch" role="tablist" aria-label="Which chart">
        {t.players.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={focus === id}
            onClick={() => setShown(id)}
          >
            {name(id)}&rsquo;s sea
          </button>
        ))}
      </div>

      <div className="bs-stage">
        <div className="bs-boards">
          {t.players.map((id) => {
            const board = t.boards[id];
            const shotHere = fresh?.at === id ? fresh : null;
            return (
              <div key={id} className={focus === id ? '' : 'is-back'}>
                <Chart
                  label={`${name(id)}'s sea`}
                  size="phone"
                  cells={board?.cells ?? []}
                  hulls={hullsFromWrecks(board?.wrecks ?? [])}
                  fresh={shotHere}
                  sinking={shotHere ? shotHere.sunk.map((w) => w.id) : []}
                  settling={null}
                  tally={{ afloat: board?.afloat ?? 5, sunk: board?.wrecks.length ?? 0 }}
                  interactive={false}
                />
              </div>
            );
          })}
        </div>
      </div>

      <footer className="bs-dock">
        <p className="bs-watch__last" role="status">
          {t.last ? lastLine(t.last, name) : t.phase === 'place' ? 'Fleets going out' : ''}
        </p>
      </footer>

      {moment && (
        <VerdictMoment
          key={`${t.last?.seq ?? 0}-${moment.title}`}
          outcome={moment.outcome}
          title={moment.title}
          detail={moment.detail}
          ms={1600}
          onDone={dismiss}
        />
      )}
    </div>
  );
};

/** The last volley in a line: who fired at whom, and what each shot found. */
function lastLine(volley: Volley, name: (id: string) => string): string {
  const shots = volley.shots
    .map((shot) => {
      const kind =
        shot.result === 'sunk' && shot.ship ? `sunk the ${shipOf(shot.ship).name}` : shot.result;
      return `${cellName(shot.cell)} ${kind}`;
    })
    .join(', ');
  return `${name(volley.by)} at ${name(volley.at)}: ${shots}`;
}
