'use client';

import type { CSSProperties } from 'react';
import { PlayerReaction, Token, seatTransition, type GameUi } from '@jackdaw/ui';
import { chips } from './pieces';
import './poker.css';

/**
 * The poker lobby's seats: the same card table as the game, with everyone round the rail in seat
 * order (you at the bottom, as you'll sit) and the empty seats waiting. The felt shows the stakes.
 */
export const LobbySeats: NonNullable<GameUi['LobbySeats']> = ({
  seats,
  max,
  options,
  onSeat,
  reactions,
}) => {
  const n = Math.max(max, seats.length);
  const mine = seats.findIndex((s) => s.me);
  // Rotate so you're at the bottom; empty seats follow the last player round the table.
  const start = mine >= 0 ? mine : 0;
  const order = Array.from({ length: n }, (_, k) => seats[(start + k) % n] ?? null);
  const stack = Number(options.stack ?? 1000);
  const blinds = String(options.blinds ?? '10/20');

  return (
    <div
      className="pk-table pk-table--lobby"
      data-count={n}
      aria-label={`${seats.length} of ${max} seats taken`}
    >
      <div className="pk-rail" aria-hidden="true" />
      <div className="pk-felt">
        <p className="pk-pot">
          <span className="jd-label">Texas Hold&rsquo;em</span>
          <b>{chips(stack)} chips each</b>
          <small className="pk-lobby__blinds">Blinds {blinds}</small>
        </p>
      </div>
      {order.map((seat, k) => {
        const angle = Math.PI + (k / n) * Math.PI * 2;
        const style = {
          left: `${50 + 46 * Math.sin(angle)}%`,
          top: `${50 - 45 * Math.cos(angle)}%`,
        } as CSSProperties;
        if (!seat) {
          return (
            <div key={`open-${k}`} className="pk-seat pk-seat--open" style={style} aria-hidden>
              <span className="pk-seat__tok">
                <span className="pk-open" />
              </span>
            </div>
          );
        }
        return (
          <div
            key={seat.id}
            className={['pk-seat', seat.me && 'pk-seat--me', seat.landing && 'pk-seat--landing']
              .filter(Boolean)
              .join(' ')}
            style={style}
            aria-label={`${seat.name}${seat.me ? ' (you)' : ''}${seat.host ? ', host' : ''}${seat.away ? ', away' : ''}`}
          >
            <span className="pk-seat__tok">
              <Token
                avatar={seat.avatar}
                host={seat.host}
                away={seat.away}
                transitionName={seatTransition(seat.id).token}
              />
              <PlayerReaction reactions={reactions} playerId={seat.id} name={seat.name} />
            </span>
            <span
              className="pk-seat__name"
              style={{ viewTransitionName: seatTransition(seat.id).name }}
            >
              {seat.me ? 'You' : seat.name}
            </span>
            {onSeat && seat.action && (
              <button
                type="button"
                className="pk-seat__tap"
                aria-label={seat.action}
                onClick={() => onSeat(seat.id)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};
