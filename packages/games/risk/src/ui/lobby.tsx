'use client';

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
import type { Reaction } from '@jackdaw/engine';
import { getMap, type MapDef } from '../maps';
import { MAPS_BY_NAME } from '../rules';
import { ARMY_NAME, armyOf } from './armies';
import './risk.css';

/** The chosen board (the options store its name: "World", "Twin Crowns"…). */
const mapFor = (options: Record<string, unknown>): MapDef =>
  getMap(MAPS_BY_NAME[String(options.map) as keyof typeof MAPS_BY_NAME] ?? 'world');

/** The board as a faint engraving behind the banners: land, continents and coast, no armies. */
function Engraving({ map }: { map: MapDef }) {
  return (
    <svg
      className="rk-muster__map"
      viewBox={`0 0 ${map.viewBox[0]} ${map.viewBox[1]}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      {map.territories.map((t) => (
        <path key={t.id} d={t.path} className="rk-muster__land" />
      ))}
      {Object.entries(map.regions ?? {}).map(([id, d]) => (
        <path key={id} d={d} className="rk-muster__region" />
      ))}
    </svg>
  );
}

/**
 * One seat as a banner hung from a pole: the cloth in the army colour this seat will march under
 * (seat order sets it), the player's crest on it, their name on a ribbon. An empty seat is a
 * banner still furled; the host can tap its "+" to raise it for a computer general.
 */
function Banner({
  seat,
  index,
  seats,
  onSeat,
  onAddBot,
  reactions,
  tv,
}: {
  seat: Seat | null;
  index: number;
  seats: string[];
  onSeat?: (id: string) => void;
  onAddBot?: () => void;
  reactions?: Reaction[];
  tv?: boolean;
}) {
  if (!seat) {
    return (
      <li className="rk-banner rk-banner--furled" aria-hidden={onAddBot ? undefined : true}>
        <span className="rk-banner__pole" />
        <span className="rk-banner__furl" />
        <span className="rk-banner__name">Open</span>
        {onAddBot && <AddSeat onAdd={onAddBot} className="rk-banner__add" />}
      </li>
    );
  }
  const army = armyOf(seat.id, seats);
  const size = tv ? 96 : 52;
  return (
    <li
      className={[
        'rk-banner',
        seat.me && 'rk-banner--me',
        seat.landing && 'rk-banner--landing',
        seat.away && 'rk-banner--away',
        seat.bot && 'rk-banner--bot',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ '--rk-own': army ? `var(--${army})` : 'var(--rule)', '--i': index } as CSSProperties}
      aria-label={`${seat.name}${seat.me ? ' (you)' : ''}${seat.bot ? ', computer' : ''}${seat.host ? ', host' : ''}${
        seat.away ? ', away' : ''
      }${army ? `, ${ARMY_NAME[army]} armies` : ''}`}
    >
      <span className="rk-banner__pole" />
      <span className="rk-banner__cloth">
        <span className="rk-banner__tok">
          <Token
            avatar={seat.avatar}
            size={size}
            host={seat.host}
            away={seat.away}
            transitionName={tv ? undefined : seatTransition(seat.id).token}
          />
        </span>
        {army && <span className="rk-banner__army">{ARMY_NAME[army]}</span>}
      </span>
      {/* outside the cloth, whose swallowtail would clip it */}
      <span className="rk-banner__react">
        <PlayerReaction reactions={reactions} playerId={seat.id} name={seat.name} size={size} />
      </span>
      <span
        className="rk-banner__name"
        style={tv ? undefined : { viewTransitionName: seatTransition(seat.id).name }}
      >
        {seat.bot && <span className="rk-banner__bot">Bot</span>}
        {seat.me ? 'You' : seat.name}
      </span>
      {onSeat && seat.action && (
        <button
          type="button"
          className="rk-banner__tap"
          aria-label={seat.action}
          onClick={() => onSeat(seat.id)}
        />
      )}
    </li>
  );
}

function Muster({
  seats,
  max,
  onSeat,
  onAddBot,
  reactions,
  tv,
}: {
  seats: Seat[];
  max: number;
  onSeat?: (id: string) => void;
  onAddBot?: () => void;
  reactions?: Reaction[];
  tv?: boolean;
}) {
  const n = Math.max(max, seats.length);
  const ids = seats.map((s) => s.id);
  return (
    <ol className={`rk-muster__banners${tv ? ' rk-muster__banners--tv' : ''}`} data-count={n}>
      {Array.from({ length: n }, (_, i) => (
        <Banner
          key={seats[i]?.id ?? `open-${i}`}
          seat={seats[i] ?? null}
          index={i}
          seats={ids}
          onSeat={onSeat}
          onAddBot={onAddBot}
          reactions={reactions}
          tv={tv}
        />
      ))}
    </ol>
  );
}

/**
 * Risk's seats in Jackdaw's lobby: the war council. Each player's banner hangs over a faint
 * engraving of the chosen board, in the colour their armies will be; open seats are furled.
 */
export const LobbySeats: NonNullable<GameUi['LobbySeats']> = ({
  seats,
  max,
  options,
  onSeat,
  onAddBot,
  reactions,
}) => {
  const map = mapFor(options);
  return (
    <div className="rk rk-muster" aria-label={`${seats.length} of ${max} seats taken`}>
      <Engraving map={map} />
      <p className="rk-muster__title">
        <span>The war council</span>
        <small>{map.name}</small>
      </p>
      <Muster seats={seats} max={max} onSeat={onSeat} onAddBot={onAddBot} reactions={reactions} />
    </div>
  );
};

/** The goal and setup in a line, for the TV. */
function orders(options: Record<string, unknown>) {
  const goal = String(options.goal ?? 'Secret missions');
  const line =
    goal === 'World domination'
      ? 'World domination: the last army standing wins.'
      : 'Secret missions: each general gets a hidden goal. First to finish wins.';
  return options.fog === true ? `${line} In the fog of war.` : line;
}

/**
 * The TV's lobby once Risk is chosen: the board large and faint behind everything, the generals'
 * banners hung across it, and how to join on a cartouche. Public facts only.
 */
export function RiskTvLobby({
  players,
  hostId,
  options,
  reactions,
  join,
  status,
}: GameTvLobbyProps) {
  const map = mapFor(options);
  const seats: Seat[] = players.map((p) => ({
    id: p.id,
    name: p.name,
    avatar: p.avatar,
    host: p.id === hostId,
    away: !p.online,
    bot: p.bot,
  }));
  return (
    <div className="rk rk-tvmuster">
      <Engraving map={map} />
      <div className="rk-tvmuster__main">
        <header className="rk-tvmuster__head">
          <h2 className="rk-tvmuster__title">Risk</h2>
          <p className="rk-tvmuster__sub">
            {map.name} · {orders(options)}
          </p>
        </header>
        <Muster seats={seats} max={6} reactions={reactions} tv />
        <p className="rk-tvmuster__status">{status}</p>
      </div>
      <aside className="rk-tvmuster__join">{join}</aside>
    </div>
  );
}
