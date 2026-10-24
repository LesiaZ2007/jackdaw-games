'use client';

import { createRng, type Reaction } from '@jackdaw/engine';
import {
  PlayerReaction,
  Token,
  seatTransition,
  type GameTvLobbyProps,
  type GameUi,
  type Seat,
} from '@jackdaw/ui';
import type { CSSProperties } from 'react';
import { makeBoard } from '../board';
import { layout } from '../geometry';
import type { Board, Size } from '../types';
import { SEAT_COLOURS, SEAT_NAMES } from './palette';
import './catan.css';
import './lobby.css';

/** The island drawn faint, as on a chart: the classic one, or the big one from five players. */
const ISLANDS: Record<Size, Board> = {
  classic: makeBoard('classic', 'Beginner', createRng(1)),
  big: makeBoard('big', 'Balanced', createRng(23)),
};

function Chart({ size }: { size: Size }) {
  const L = layout(size);
  const board = ISLANDS[size];
  const [x0, y0, x1, y1] = L.bounds;
  const pad = 0.6;
  const poly = (i: number, k: number) => {
    const t = L.tiles[i]!;
    return t.corners
      .map((c) => {
        const p = L.corners[c]!;
        return `${t.x + (p.x - t.x) * k},${t.y + (p.y - t.y) * k}`;
      })
      .join(' ');
  };
  return (
    <svg
      className="cn-chart"
      viewBox={`${x0 - pad} ${y0 - pad} ${x1 - x0 + 2 * pad} ${y1 - y0 + 2 * pad}`}
      aria-hidden="true"
    >
      {L.tiles.map((_, i) => (
        <polygon key={`s${i}`} points={poly(i, 1.25)} className="cn-chart__sea" />
      ))}
      {board.tiles.map((t, i) => (
        <polygon
          key={i}
          points={poly(i, 0.93)}
          className={`cn-chart__tile cn-fill--${t.terrain}`}
        />
      ))}
    </svg>
  );
}

/** A ship at its mooring: the sail in the colour this seat will build in, the crest on it. */
function Ship({
  seat,
  index,
  of,
  onSeat,
  reactions,
  tv,
}: {
  seat: Seat | null;
  index: number;
  of: number;
  onSeat?: (id: string) => void;
  reactions?: Reaction[];
  tv?: boolean;
}) {
  // Round the island, starting top left, clockwise.
  const a = -Math.PI * 0.75 + (Math.PI * 2 * index) / of;
  const place = {
    '--x': `${50 + Math.cos(a) * 41}%`,
    '--y': `${52 + Math.sin(a) * 38}%`,
    '--i': index,
  } as CSSProperties;
  if (!seat)
    return (
      <li className="cn-ship cn-ship--open" style={place} aria-hidden="true">
        <span className="cn-ship__mooring" />
        <span className="cn-ship__name">Open</span>
      </li>
    );
  const colour = SEAT_COLOURS[index % SEAT_COLOURS.length]!;
  const size = tv ? 78 : 40;
  return (
    <li
      className={[
        'cn-ship',
        seat.me && 'cn-ship--me',
        seat.landing && 'cn-ship--landing',
        seat.away && 'cn-ship--away',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ ...place, '--cn-own': `var(--cn-pc-${colour})` } as CSSProperties}
      aria-label={`${seat.name}${seat.me ? ' (you)' : ''}${seat.host ? ', host' : ''}${seat.away ? ', away' : ''}, builds in ${SEAT_NAMES[colour].toLowerCase()}`}
    >
      <svg className="cn-ship__hull" viewBox="-60 -90 120 130" aria-hidden="true">
        <line x1="0" y1="10" x2="0" y2="-84" className="cn-ship__mast" />
        <path d="M0 -84l24 7-24 7z" className="cn-ship__pennant" />
        <path d="M-38 -72Q0 -79 38 -72L42 -4Q0 4 -42 -4Z" className="cn-ship__sail" />
        <path d="M-56 10H56L42 36H-44Z" className="cn-ship__body" />
        <path d="M-50 18H50" className="cn-ship__plank" />
      </svg>
      <span className="cn-ship__tok">
        <Token
          avatar={seat.avatar}
          size={size}
          host={seat.host}
          away={seat.away}
          transitionName={tv ? undefined : seatTransition(seat.id).token}
        />
        <PlayerReaction reactions={reactions} playerId={seat.id} name={seat.name} size={size} />
      </span>
      <span
        className="cn-ship__name"
        style={tv ? undefined : { viewTransitionName: seatTransition(seat.id).name }}
      >
        {seat.me ? 'You' : seat.name}
      </span>
      {onSeat && seat.action && (
        <button
          type="button"
          className="cn-ship__tap"
          aria-label={seat.action}
          onClick={() => onSeat(seat.id)}
        />
      )}
    </li>
  );
}

function Harbour({
  seats,
  onSeat,
  reactions,
  tv,
}: {
  seats: Seat[];
  onSeat?: (id: string) => void;
  reactions?: Reaction[];
  tv?: boolean;
}) {
  const size: Size = seats.length >= 5 ? 'big' : 'classic';
  const of = size === 'big' ? 6 : 4;
  return (
    <div className={tv ? 'cn-harbourmap cn-harbourmap--tv' : 'cn-harbourmap'}>
      <Chart size={size} />
      <ol className="cn-ships">
        {Array.from({ length: of }, (_, i) => (
          <Ship
            key={seats[i]?.id ?? `open-${i}`}
            seat={seats[i] ?? null}
            index={i}
            of={of}
            onSeat={onSeat}
            reactions={reactions}
            tv={tv}
          />
        ))}
      </ol>
    </div>
  );
}

/** Catan's seats in Jackdaw's lobby: ships bound for the island, one per player. */
export const LobbySeats: NonNullable<GameUi['LobbySeats']> = ({ seats, onSeat, reactions }) => (
  <div className="cn cn-muster" aria-label={`${seats.length} of 6 seats taken`}>
    <p className="cn-muster__title">
      <span>Bound for Catan</span>
      <small>{seats.length >= 5 ? 'The big island · 5 to 6' : 'The classic island · 3 to 4'}</small>
    </p>
    <Harbour seats={seats} onSeat={onSeat} reactions={reactions} />
  </div>
);

/** The TV's lobby: the island large with the ships round it, how to join beside it. */
export function CatanTvLobby({
  players,
  hostId,
  options,
  reactions,
  join,
  status,
}: GameTvLobbyProps) {
  const seats: Seat[] = players.map((p) => ({
    id: p.id,
    name: p.name,
    avatar: p.avatar,
    host: p.id === hostId,
    away: !p.online,
  }));
  const points = String(options.points ?? '10');
  return (
    <div className="cn cn-tvmuster">
      <div className="cn-tvmuster__sea">
        <Harbour seats={seats} reactions={reactions} tv />
      </div>
      <aside className="cn-tvmuster__side">
        <h2 className="cn-tvmuster__title">Catan</h2>
        <p className="cn-tvmuster__sub">
          Build on the island, trade for what you lack. First to {points} points wins.
        </p>
        {join}
        <p className="cn-tvmuster__status">{status}</p>
      </aside>
    </div>
  );
}
