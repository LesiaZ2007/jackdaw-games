'use client';

import { Plaque, Token, type ScreenPlayer } from '@jackdaw/ui';
import { useEffect, useState } from 'react';
import { territoriesOf } from '../board';
import type { MapDef } from '../maps';
import { missionText, type Mission } from '../missions';
import type { RiskTableView } from '../rules';
import { ARMY_NAME, armyColour, armyOf } from './armies';

/** This deal, for remembering that its orders were read (it doesn't change before a battle). */
function dealKey(t: RiskTableView, me: string) {
  const owners = t.seats.map((p) => territoriesOf(t.owner, p).length).join('.');
  const first = Object.keys(t.owner)
    .filter((x) => t.owner[x] === me)
    .slice(0, 4)
    .join('.');
  return `jackdaw:risk:orders:${t.map}:${t.seats.join('.')}:${owners}:${first}`;
}

function wasRead(key: string) {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

/**
 * Whether to open with your orders: at the very start of a game (round one, before any battle),
 * until you've read them on this device.
 */
export function useOrders(t: RiskTableView, me: string | null): [boolean, () => void] {
  const atStart = !!me && t.seats.includes(me) && t.round === 1 && !t.battle && t.phase !== 'over';
  const key = me ? dealKey(t, me) : '';
  const [closed, setClosed] = useState<string | null>(null);
  // Game screens draw only once the lobby's snapshot has arrived, so storage is there to read.
  const open = atStart && closed !== key && !wasRead(key);
  const close = () => {
    setClosed(key);
    try {
      localStorage.setItem(key, '1');
    } catch {
      // Private windows can refuse; it just shows again next time.
    }
  };
  return [open, close];
}

/**
 * The opening screen: your orders under a wax seal in your army's colour. Tap to break the seal
 * and read your secret mission (or, in world domination, the one order everyone has), then go to
 * battle. It's on the Mission button afterwards.
 */
export function Orders({
  t,
  me,
  mission,
  map,
  players,
  nameOf,
  onClose,
}: {
  t: RiskTableView;
  me: string;
  mission: Mission | null;
  map: MapDef;
  players: ScreenPlayer[];
  nameOf: (pid: string) => string;
  onClose: () => void;
}) {
  const [opened, setOpened] = useState(false);
  const army = armyOf(me, t.seats);
  const meP = players.find((p) => p.id === me);
  const lands = territoriesOf(t.owner, me).length;
  const secret = t.goal === 'missions' && mission;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="rk-orders" role="dialog" aria-modal="true" aria-labelledby="rk-orders-title">
      <div
        className={`rk-orders__letter${opened ? ' is-open' : ''}`}
        style={{ '--rk-own': armyColour(me, t.seats) } as React.CSSProperties}
      >
        <p className="rk-orders__kicker">{secret ? 'Secret orders' : 'Orders'}</p>
        <h2 id="rk-orders-title" className="rk-orders__title">
          {opened ? 'Your mission' : `For ${meP?.name ?? 'you'}`}
        </h2>
        {opened ? (
          <>
            <p className="rk-orders__mission">
              {secret ? missionText(mission, map, nameOf) : 'Conquer the world'}
            </p>
            <p className="rk-orders__note">
              {secret
                ? 'Keep it to yourself. Complete it on your turn and you win at once. It’s under Mission whenever you need it.'
                : 'Take every territory on the map. The last army standing wins.'}
            </p>
          </>
        ) : (
          <button
            type="button"
            className="rk-orders__seal"
            onClick={() => setOpened(true)}
            aria-label="Break the seal and read your orders"
          >
            <span className="rk-orders__wax" aria-hidden="true">
              {meP && <Token avatar={meP.avatar} size={64} />}
            </span>
            <span className="rk-orders__tap">Tap to break the seal</span>
          </button>
        )}
        <dl className="rk-orders__facts">
          <div>
            <dt>Your armies</dt>
            <dd>
              <span className="rk-orders__swatch" aria-hidden="true" />
              {army ? ARMY_NAME[army] : '—'}
            </dd>
          </div>
          <div>
            <dt>You hold</dt>
            <dd>
              {lands} {lands === 1 ? 'territory' : 'territories'}
            </dd>
          </div>
          <div>
            <dt>Map</dt>
            <dd>{map.name}</dd>
          </div>
        </dl>
        {opened && (
          <Plaque go className="rk-orders__go" onClick={onClose}>
            To battle
          </Plaque>
        )}
      </div>
    </div>
  );
}
