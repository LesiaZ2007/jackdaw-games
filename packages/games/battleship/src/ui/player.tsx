'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import {
  Plaque,
  PlayerReaction,
  Token,
  useCountdown,
  useTheme,
  VerdictMoment,
  type GameUi,
  type ScreenPlayer,
} from '@jackdaw/ui';
import {
  aimSquares,
  SHIPS,
  shipOf,
  span,
  touchesFleet,
  type Dir,
  type Placement,
  type ShipId,
} from '../fleet';
import type { BattleshipAction, BattleshipPlayerView, OwnShip } from '../rules';
import { Chart, hullsFromShips, hullsFromWrecks, HULL } from './chart';
import { feltMoment, useArrival, useDelayedFelt } from './motion';
import './battleship.css';

const CODE: Record<ShipId, string> = {
  carrier: 'CV',
  battleship: 'BB',
  cruiser: 'CA',
  submarine: 'SS',
  destroyer: 'DD',
};

type Draft = Partial<Record<ShipId, { dir: Dir; at: number }>>;

/**
 * Battleship on a phone: one printed chart at a time (both, side by side, on a laptop), the
 * ships in the dock while you place, and a shot that flies into the square you named.
 */
export const PlayerScreen: GameUi['PlayerScreen'] = ({
  view,
  sendAction,
  now,
  reactions,
  ...props
}) => {
  const v = view as BattleshipPlayerView;
  const look = useTheme();
  const players = props.players as ScreenPlayer[];
  const byId = new Map(players.map((p) => [p.id, p]));
  const name = (id: string) => byId.get(id)?.name ?? 'Someone';
  const foe = v.players.find((id) => id !== v.me) ?? v.me;

  const [focus, setFocus] = useState<'fleet' | 'sea'>(v.phase === 'place' ? 'fleet' : 'sea');
  const [dir, setDir] = useState<Dir>('h');
  const [picked, setPicked] = useState<ShipId>('carrier');
  const [draft, setDraft] = useState<Draft>({});
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [salvo, setSalvo] = useState<number[]>([]);
  const [settling, setSettling] = useState<ShipId | null>(null);
  const [aim, setAim] = useState<number | null>(null);

  const seq = v.last?.seq ?? 0;
  const arrived = useArrival(seq);
  const fresh = arrived != null && v.last?.seq === arrived ? v.last : null;
  const [moment, dismiss] = useDelayedFelt(seq, feltMoment(v.last, v.me));

  useEffect(() => {
    if (!settling) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const t = window.setTimeout(() => setSettling(null), reduce ? 0 : 680);
    return () => window.clearTimeout(t);
  }, [settling]);

  const landedAt = v.last?.at;
  // A shot at you opens your chart; your own shot stays on theirs. Placement keeps yours.
  const focusKey = `${v.phase}:${seq}:${landedAt ?? ''}`;
  const [trackedFocus, setTrackedFocus] = useState(focusKey);
  if (trackedFocus !== focusKey) {
    setTrackedFocus(focusKey);
    if (v.phase === 'place') setFocus('fleet');
    else if (!landedAt) setFocus(v.toAct === v.me ? 'sea' : 'fleet');
    else {
      setFocus(landedAt === v.me ? 'fleet' : 'sea');
      setSalvo([]);
    }
  }

  const placing = v.phase === 'place' && !v.ready;
  // The preview is local. Leaving placement drops it, and it is never part of a view.
  if (!placing && aim !== null) setAim(null);
  const firing = v.phase === 'fire' && v.toAct === v.me && !busy;
  const mine = placing ? draftShips(draft) : v.ships;
  const sinking = fresh?.at === v.me ? fresh.sunk.map((w) => w.id) : [];
  const theirSinking = fresh?.at === foe ? fresh.sunk.map((w) => w.id) : [];

  const lay = (cell: number) => {
    const spec = shipOf(picked);
    const cells = span(cell, dir, spec.len);
    if (!cells) {
      setNote(`${spec.name} hangs off the chart.`);
      return;
    }
    const taken = takenExcept(draft, picked);
    if (cells.some((square) => taken.has(square))) {
      setNote("Ships can't share a square.");
      return;
    }
    if (cells.some((square) => touchesFleet(square, taken))) {
      setNote('Leave a water square between ships.');
      return;
    }
    setDraft({ ...draft, [picked]: { dir, at: cell } });
    setSettling(picked);
    setNote(null);
    const next = SHIPS.find((ship) => ship.id !== picked && !draft[ship.id]);
    if (next) setPicked(next.id);
  };

  const lock = async () => {
    const ships: Placement[] = [];
    for (const spec of SHIPS) {
      const laid = draft[spec.id];
      if (!laid) return;
      ships.push({ id: spec.id, dir: laid.dir, at: laid.at });
    }
    setBusy(true);
    const ok = await sendAction({ type: 'place', ships } satisfies BattleshipAction);
    setBusy(false);
    if (!ok) setNote('That fleet was refused. Move a ship and try again.');
  };

  const fire = async (cell: number) => {
    if (!firing) return;
    if (v.boards[foe]!.cells[cell] !== 'blank') return;
    if (v.salvo <= 1) {
      setBusy(true);
      await sendAction({ type: 'fire', cells: [cell] });
      setBusy(false);
      return;
    }
    setSalvo((prev) => {
      if (prev.includes(cell)) return prev.filter((square) => square !== cell);
      if (prev.length >= v.salvo) return prev;
      return [...prev, cell];
    });
    setNote(null);
  };

  const sendSalvo = async () => {
    if (salvo.length !== v.salvo) return;
    setBusy(true);
    const ok = await sendAction({ type: 'fire', cells: salvo });
    setBusy(false);
    if (ok) setSalvo([]);
  };

  const ready = SHIPS.every((ship) => draft[ship.id]);
  const showFleet = focus === 'fleet';
  const spec = shipOf(picked);
  const preview =
    placing && aim !== null ? aimSquares(aim, dir, spec.len, takenExcept(draft, picked)) : null;
  const ghost = preview
    ? { id: picked, dir, cells: preview.cells, illegal: preview.illegal }
    : null;

  return (
    <div className="bs bs--phone" data-look={look}>
      <header className="bs-bar">
        <h2 className="bs-bar__status">{statusLine(v, name)}</h2>
        <Clock at={v.phase === 'place' ? v.placeBy : v.actBy} now={now} />
      </header>

      <div className="bs-names">
        {v.players.map((id) => {
          const p = byId.get(id);
          const turn = v.toAct === id || (v.phase === 'place' && !v.boards[id]?.ready);
          return (
            <span
              key={id}
              className={`bs-name${turn ? ' is-turn' : ''}${id === v.me ? ' is-me' : ''}`}
            >
              <span className="bs-name__tok">
                {p && <Token avatar={p.avatar} size={36} />}
                <PlayerReaction reactions={reactions} playerId={id} />
              </span>
              <span className="bs-name__text">
                <b>{id === v.me ? 'You' : name(id)}</b>
              </span>
            </span>
          );
        })}
      </div>

      <div className="bs-switch" role="tablist" aria-label="Which chart">
        <button
          type="button"
          role="tab"
          aria-selected={showFleet}
          onClick={() => setFocus('fleet')}
        >
          Your fleet
        </button>
        <button type="button" role="tab" aria-selected={!showFleet} onClick={() => setFocus('sea')}>
          Their sea
        </button>
      </div>

      <div className="bs-stage">
        <div className="bs-boards">
          <div className={showFleet ? '' : 'is-back'}>
            <Chart
              label="Your fleet"
              size="phone"
              cells={v.boards[v.me]?.cells ?? []}
              hulls={hullsFromShips(mine)}
              fresh={fresh?.at === v.me ? fresh : null}
              sinking={sinking}
              settling={settling}
              tally={tallyOf(v.boards[v.me])}
              ghost={ghost}
              onAim={placing ? setAim : undefined}
              interactive={placing}
              onCell={placing ? lay : undefined}
            />
          </div>
          <div className={showFleet ? 'is-back' : ''}>
            <Chart
              label="Their sea"
              size="phone"
              cells={v.boards[foe]?.cells ?? []}
              hulls={hullsFromWrecks(v.boards[foe]?.wrecks ?? [])}
              fresh={fresh?.at === foe ? fresh : null}
              sinking={theirSinking}
              settling={null}
              tally={tallyOf(v.boards[foe])}
              selected={salvo}
              interactive={firing}
              onCell={firing ? (cell) => void fire(cell) : undefined}
            />
          </div>
        </div>
      </div>

      {note && (
        <p className="bs-note" role="status">
          {note}
        </p>
      )}

      <footer className="bs-dock">
        {placing ? (
          <>
            <div className="bs-ships" role="list" aria-label="Your ships">
              {SHIPS.map((spec) => {
                const laid = Boolean(draft[spec.id]);
                return (
                  <button
                    key={spec.id}
                    type="button"
                    role="listitem"
                    className={`bs-shipbtn${picked === spec.id ? ' is-on' : ''}${laid ? ' is-laid' : ''}`}
                    style={{ '--hull': HULL[spec.id] } as CSSProperties}
                    aria-pressed={picked === spec.id}
                    aria-label={`${spec.name}, ${spec.len} squares${laid ? ', placed' : ''}`}
                    onClick={() => {
                      setPicked(spec.id);
                      const laidShip = draft[spec.id];
                      if (laidShip) setDir(laidShip.dir);
                    }}
                  >
                    <span>{CODE[spec.id]}</span>
                    <span className="bs-shipbtn__len">{spec.len}</span>
                  </button>
                );
              })}
            </div>
            <div className="bs-actions">
              <button
                type="button"
                className="bs-dir"
                aria-pressed={dir === 'h'}
                onClick={() => setDir((d) => (d === 'h' ? 'v' : 'h'))}
              >
                {dir === 'h' ? 'Horizontal' : 'Vertical'}
              </button>
              <Plaque go disabled={!ready || busy} onClick={() => void lock()}>
                Fleet ready
              </Plaque>
            </div>
          </>
        ) : firing && v.salvo > 1 ? (
          <div className="bs-actions">
            <p className="bs-salvo">
              {salvo.length} of {v.salvo} chosen
            </p>
            <Plaque go disabled={salvo.length !== v.salvo || busy} onClick={() => void sendSalvo()}>
              Fire salvo
            </Plaque>
          </div>
        ) : (
          <FleetStrip ships={v.ships} />
        )}
      </footer>

      {moment && (
        <VerdictMoment
          key={`${v.last?.seq ?? 0}-${moment.title}`}
          outcome={moment.outcome}
          title={moment.title}
          detail={moment.detail}
          ms={moment.outcome === 'reveal' ? 1600 : 2800}
          onDone={dismiss}
        />
      )}
    </div>
  );
};

function tallyOf(board: { afloat: number; wrecks: readonly unknown[] } | undefined) {
  return { afloat: board?.afloat ?? 5, sunk: board?.wrecks.length ?? 0 };
}

function takenExcept(draft: Draft, picked: ShipId): Set<number> {
  const taken = new Set<number>();
  for (const spec of SHIPS) {
    if (spec.id === picked) continue;
    const laid = draft[spec.id];
    if (!laid) continue;
    for (const square of span(laid.at, laid.dir, spec.len) ?? []) taken.add(square);
  }
  return taken;
}

function draftShips(draft: Draft): OwnShip[] {
  const ships: OwnShip[] = [];
  for (const spec of SHIPS) {
    const laid = draft[spec.id];
    if (!laid) continue;
    const cells = span(laid.at, laid.dir, spec.len);
    if (!cells) continue;
    ships.push({ id: spec.id, name: spec.name, dir: laid.dir, cells, hits: 0, sunk: false });
  }
  return ships;
}

function statusLine(v: BattleshipPlayerView, name: (id: string) => string): string {
  const foe = v.players.find((id) => id !== v.me);
  if (v.phase === 'show' || v.phase === 'over') {
    return v.winner === v.me ? 'You sunk the fleet' : `${name(v.winner ?? '')} sunk the fleet`;
  }
  if (v.phase === 'place') {
    if (!v.ready) return 'Lay your fleet';
    return foe && !v.boards[foe]?.ready ? `Waiting for ${name(foe)}` : 'Both fleets are placed';
  }
  if (v.toAct === v.me) return v.salvo > 1 ? `Choose ${v.salvo} squares` : 'Your shot';
  return v.toAct ? `${name(v.toAct)} is aiming` : 'Hold on';
}

function Clock({ at, now }: { at: number | null; now: () => number }) {
  const left = useCountdown(at, now);
  if (left === null) return null;
  const m = Math.floor(left / 60);
  const s = String(left % 60).padStart(2, '0');
  return (
    <span className={left <= 10 ? 'bs-clock is-low' : 'bs-clock'} role="timer">
      {m}:{s}
    </span>
  );
}

export { Clock };

function FleetStrip({ ships }: { ships: OwnShip[] }) {
  if (ships.length === 0) return null;
  return (
    <ul className="bs-strip" aria-label="Your ships">
      {ships.map((ship) => (
        <li
          key={ship.id}
          className={ship.sunk ? 'is-sunk' : ''}
          style={{ '--hull': HULL[ship.id] } as CSSProperties}
        >
          <span>{ship.name}</span>
          <span>{ship.sunk ? 'sunk' : ship.hits ? `${ship.hits} hit` : 'afloat'}</span>
        </li>
      ))}
    </ul>
  );
}
