'use client';

import type { CSSProperties } from 'react';
import { AddSeat, PlayerReaction, Token, seatTransition, type GameUi } from '@jackdaw/ui';
import { GameCard } from './pieces';
import './cambio.css';

/**
 * The Cambio lobby's seats: the purpure felt of the game with everyone round it in seat order (you
 * at the bottom, as you'll sit) and the empty places waiting. The middle shows the stock and the
 * game length. The host gets a "+" on each empty seat to seat a computer player.
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
  const goal = String(options.goal ?? 'First to 100');
  const notes = options.memory === 'Keep notes';

  return (
    <div
      className="cmb cmb-lobby"
      data-count={n}
      aria-label={`${seats.length} of ${max} seats taken`}
    >
      <div className="cmb-lobby__felt" aria-hidden="true" />
      <div className="cmb-lobby__mid" aria-hidden="true">
        <span className="cmb-lobby__stock">
          <GameCard className="cmb-pile__under cmb-pile__under--1" />
          <GameCard />
        </span>
        <p>
          {goal}
          <small>{notes ? 'Keep notes' : 'Remember it yourself'}</small>
        </p>
      </div>
      {order.map((seat, k) => {
        const angle = Math.PI + (k / n) * Math.PI * 2;
        const style = {
          left: `${50 + 45 * Math.sin(angle)}%`,
          top: `${50 - 43 * Math.cos(angle)}%`,
        } as CSSProperties;
        if (!seat) {
          return (
            <div
              key={`open-${k}`}
              className="cmb-lseat cmb-lseat--open"
              style={style}
              aria-hidden={onAddBot ? undefined : true}
            >
              <span className="cmb-lseat__tok">
                <span className="cmb-lseat__open" />
                {onAddBot && <AddSeat onAdd={onAddBot} className="cmb-addseat" />}
              </span>
            </div>
          );
        }
        return (
          <div
            key={seat.id}
            className={['cmb-lseat', seat.me && 'is-me', seat.landing && 'is-landing']
              .filter(Boolean)
              .join(' ')}
            style={style}
            aria-label={`${seat.name}${seat.me ? ' (you)' : ''}${seat.bot ? ', computer player' : ''}${seat.host ? ', host' : ''}${seat.away ? ', away' : ''}`}
          >
            <span className="cmb-lseat__tok">
              <Token
                avatar={seat.avatar}
                host={seat.host}
                away={seat.away}
                transitionName={seatTransition(seat.id).token}
              />
              <PlayerReaction reactions={reactions} playerId={seat.id} name={seat.name} />
              {seat.bot && (
                <span className="cmb-lseat__bot" aria-hidden="true">
                  Bot
                </span>
              )}
            </span>
            <span
              className="cmb-lseat__name"
              title={seat.name}
              style={{ viewTransitionName: seatTransition(seat.id).name }}
            >
              {seat.me ? 'You' : seat.name}
            </span>
            {onSeat && seat.action && (
              <button
                type="button"
                className="cmb-lseat__tap"
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
