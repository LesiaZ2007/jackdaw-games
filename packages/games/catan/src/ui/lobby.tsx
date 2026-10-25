'use client';

import { createRng, type Reaction } from '@jackdaw/engine';
import {
  AddSeat,
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
      className="ctn-chart"
      viewBox={`${x0 - pad} ${y0 - pad} ${x1 - x0 + 2 * pad} ${y1 - y0 + 2 * pad}`}
      aria-hidden="true"
    >
      {L.tiles.map((_, i) => (
        <polygon key={`s${i}`} points={poly(i, 1.25)} className="ctn-chart__sea" />
      ))}
      {board.tiles.map((t, i) => (
        <polygon
          key={i}
          points={poly(i, 0.93)}
          className={`ctn-chart__tile ctn-fill--${t.terrain}`}
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
  onAddBot,
  tv,
}: {
  seat: Seat | null;
  index: number;
  of: number;
  onSeat?: (id: string) => void;
  reactions?: Reaction[];
  onAddBot?: () => void;
  tv?: boolean;
}) {
  // Round the island, starting top left, clockwise.
  const a = -Math.PI * 0.75 + (Math.PI * 2 * index) / of;
  const place = {
    '--x': `${50 + Math.cos(a) * 41}%`,
    '--y': `${52 + Math.sin(a) * 38}%`,
    '--i': index,
  } as CSSProperties;
  if (!seat && onAddBot)
    return (
      <li className="ctn-ship ctn-ship--open ctn-ship--add" style={place}>
        <span className="ctn-ship__mooring" />
        <span className="ctn-ship__name">Add bot</span>
        <AddSeat onAdd={onAddBot} className="ctn-addseat" />
      </li>
    );
  if (!seat)
    return (
      <li className="ctn-ship ctn-ship--open" style={place} aria-hidden="true">
        <span className="ctn-ship__mooring" />
        <span className="ctn-ship__name">Open</span>
      </li>
    );
  const colour = SEAT_COLOURS[index % SEAT_COLOURS.length]!;
  const size = tv ? 78 : 40;
  return (
    <li
      className={[
        'ctn-ship',
        seat.me && 'ctn-ship--me',
        seat.landing && 'ctn-ship--landing',
        seat.away && 'ctn-ship--away',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ ...place, '--ctn-own': `var(--ctn-pc-${colour})` } as CSSProperties}
      aria-label={`${seat.name}${seat.me ? ' (you)' : ''}${seat.bot ? ', computer player' : ''}${seat.host ? ', host' : ''}${seat.away ? ', away' : ''}, builds in ${SEAT_NAMES[colour].toLowerCase()}`}
    >
      <svg className="ctn-ship__hull" viewBox="-60 -90 120 130" aria-hidden="true">
        <line x1="0" y1="10" x2="0" y2="-84" className="ctn-ship__mast" />
        <path d="M0 -84l24 7-24 7z" className="ctn-ship__pennant" />
        <path d="M-38 -72Q0 -79 38 -72L42 -4Q0 4 -42 -4Z" className="ctn-ship__sail" />
        <path d="M-56 10H56L42 36H-44Z" className="ctn-ship__body" />
        <path d="M-50 18H50" className="ctn-ship__plank" />
      </svg>
      <span className="ctn-ship__tok">
        <Token
          avatar={seat.avatar}
          size={size}
          host={seat.host}
          away={seat.away}
          transitionName={tv ? undefined : seatTransition(seat.id).token}
        />
        <PlayerReaction reactions={reactions} playerId={seat.id} name={seat.name} size={size} />
        {seat.bot && (
          <span className="ctn-ship__bot" aria-hidden="true">
            Bot
          </span>
        )}
      </span>
      <span
        className="ctn-ship__name"
        style={tv ? undefined : { viewTransitionName: seatTransition(seat.id).name }}
      >
        {seat.me ? 'You' : seat.name}
      </span>
      {onSeat && seat.action && (
        <button
          type="button"
          className="ctn-ship__tap"
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
  onAddBot,
  tv,
}: {
  seats: Seat[];
  onSeat?: (id: string) => void;
  reactions?: Reaction[];
  onAddBot?: () => void;
  tv?: boolean;
}) {
  const size: Size = seats.length >= 5 ? 'big' : 'classic';
  const of = size === 'big' ? 6 : 4;
  return (
    <div className={tv ? 'ctn-harbourmap ctn-harbourmap--tv' : 'ctn-harbourmap'}>
      <Chart size={size} />
      <ol className="ctn-ships">
        {Array.from({ length: of }, (_, i) => (
          <Ship
            key={seats[i]?.id ?? `open-${i}`}
            seat={seats[i] ?? null}
            index={i}
            of={of}
            onSeat={onSeat}
            reactions={reactions}
            onAddBot={onAddBot}
            tv={tv}
          />
        ))}
      </ol>
    </div>
  );
}

/** Catan's seats in Jackdaw's lobby: ships bound for the island, one per player. */
export const LobbySeats: NonNullable<GameUi['LobbySeats']> = ({
  seats,
  onSeat,
  reactions,
  onAddBot,
}) => (
  <div className="ctn ctn-muster" aria-label={`${seats.length} of 6 seats taken`}>
    <p className="ctn-muster__title">
      <span>Bound for Catan</span>
      <small>{seats.length >= 5 ? 'The big island · 5 to 6' : 'The classic island · 3 to 4'}</small>
    </p>
    <Harbour seats={seats} onSeat={onSeat} reactions={reactions} onAddBot={onAddBot} />
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
    bot: p.bot,
  }));
  const points = String(options.points ?? '10');
  return (
    <div className="ctn ctn-tvmuster">
      <div className="ctn-tvmuster__sea">
        <Harbour seats={seats} reactions={reactions} tv />
      </div>
      <aside className="ctn-tvmuster__side">
        <h2 className="ctn-tvmuster__title">Catan</h2>
        <p className="ctn-tvmuster__sub">
          Build on the island, trade for what you lack. First to {points} points wins.
        </p>
        {join}
        <p className="ctn-tvmuster__status">{status}</p>
      </aside>
    </div>
  );
}
