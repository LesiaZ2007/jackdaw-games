'use client';

import type { CSSProperties } from 'react';
import { AddSeat, PlayerReaction, Token, seatTransition, type GameUi } from '@jackdaw/ui';
import { GameCard } from './pieces';
import './uno.css';

/**
 * The UNO lobby's seats: the same play mat as the game, with everyone round it in seat order (you
 * at the bottom, as you'll sit) and the empty places waiting. The middle shows the game length.
 */
export const LobbySeats: NonNullable<GameUi['LobbySeats']> = ({
  seats,
  max,
  options,
  onSeat,
  reactions,
  onAddBot,
}) => {
  const n = Math.max(max, seats.length);
  const mine = seats.findIndex((s) => s.me);
  const start = mine >= 0 ? mine : 0;
  const order = Array.from({ length: n }, (_, k) => seats[(start + k) % n] ?? null);
  const length = String(options.length ?? 'To 200 points');

  return (
    <div
      className="uno-table uno-table--lobby"
      data-count={n}
      style={{ '--uno-now': 'var(--uno-r)' } as CSSProperties}
      aria-label={`${seats.length} of ${max} seats taken`}
    >
      <div className="uno-mat" aria-hidden="true" />
      <div className="uno-middle">
        <div className="uno-piles" aria-hidden="true">
          <GameCard down />
          <GameCard id={104} />
        </div>
        <p className="uno-now">
          {length === 'One round' ? 'One round' : length.replace('To', 'First to')}
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
            <div
              key={`open-${k}`}
              className="uno-seat uno-seat--open"
              style={style}
              aria-hidden={onAddBot ? undefined : true}
            >
              <span className="uno-seat__tok">
                <span className="uno-open" />
                {onAddBot && <AddSeat onAdd={onAddBot} className="uno-addseat" />}
              </span>
            </div>
          );
        }
        return (
          <div
            key={seat.id}
            className={['uno-seat', seat.me && 'uno-seat--me', seat.landing && 'uno-seat--landing']
              .filter(Boolean)
              .join(' ')}
            style={style}
            aria-label={`${seat.name}${seat.me ? ' (you)' : ''}${seat.bot ? ', computer player' : ''}${seat.host ? ', host' : ''}${seat.away ? ', away' : ''}`}
          >
            <span className="uno-seat__tok">
              <Token
                avatar={seat.avatar}
                host={seat.host}
                away={seat.away}
                transitionName={seatTransition(seat.id).token}
              />
              <PlayerReaction reactions={reactions} playerId={seat.id} name={seat.name} />
              {seat.bot && (
                <span className="uno-seat__bot" aria-hidden="true">
                  Bot
                </span>
              )}
            </span>
            <span
              className="uno-seat__name"
              style={{ viewTransitionName: seatTransition(seat.id).name }}
            >
              {seat.me ? 'You' : seat.name}
            </span>
            {onSeat && seat.action && (
              <button
                type="button"
                className="uno-seat__tap"
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
