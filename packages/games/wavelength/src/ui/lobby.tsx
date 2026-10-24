'use client';

import { useEffect, useRef } from 'react';
import {
  AddSeat,
  PlayerReaction,
  SeatTrack,
  Token,
  seatTransition,
  type GameUi,
  type Seat,
} from '@jackdaw/ui';
import { TEAM_NAME, TEAMS, other, type Team } from '../rules';
import './wavelength.css';

/**
 * The Wavelength lobby's seats. With chosen teams it's the two teams side by side, Sun and Moon,
 * and the host moves players between them (anyone not placed yet waits above and joins the
 * smaller team at the start). Otherwise it's Jackdaw's seat track: random teams are dealt when
 * the game starts.
 */
export const LobbySeats: NonNullable<GameUi['LobbySeats']> = ({
  seats,
  max,
  options,
  onSeat,
  reactions,
  setOptions,
  onAddBot,
}) => {
  const chosen = options.mode === 'Teams' && options.teams === 'Chosen';
  const sides = (options.sides ?? {}) as Record<string, Team>;
  const place = (id: string, team: Team | null) => {
    const next = { ...sides };
    if (team) next[id] = team;
    else delete next[id];
    setOptions?.({ ...options, sides: next });
  };

  // A bot added from a team's "+" joins that team as soon as its seat arrives.
  const pending = useRef<{ team: Team; known: Set<string> } | null>(null);
  useEffect(() => {
    const p = pending.current;
    if (!p) return;
    const fresh = seats.find((s) => s.bot && !p.known.has(s.id));
    if (!fresh) return;
    pending.current = null;
    if (!sides[fresh.id]) place(fresh.id, p.team);
  });
  const addTo = (team: Team) => {
    pending.current = { team, known: new Set(seats.map((s) => s.id)) };
    onAddBot?.();
  };

  if (!chosen) {
    return (
      <SeatTrack
        seats={seats}
        spaces={max}
        cols={5}
        onSeat={onSeat}
        onAddBot={onAddBot}
        reactions={reactions}
        transitions
      />
    );
  }

  const unplaced = seats.filter((s) => sides[s.id] !== 'sun' && sides[s.id] !== 'moon');

  const row = (seat: Seat, team: Team | null) => (
    <li key={seat.id} className={seat.me ? 'wl-pick__p is-me' : 'wl-pick__p'}>
      <span className="wl-pick__tok">
        <Token
          avatar={seat.avatar}
          host={seat.host}
          away={seat.away}
          size={44}
          transitionName={seatTransition(seat.id).token}
        />
        <PlayerReaction reactions={reactions} playerId={seat.id} name={seat.name} />
        {onSeat && seat.action && (
          <button
            type="button"
            className="wl-pick__tap"
            aria-label={seat.action}
            onClick={() => onSeat(seat.id)}
          />
        )}
      </span>
      <span className="wl-pick__name" style={{ viewTransitionName: seatTransition(seat.id).name }}>
        {seat.me ? `${seat.name} (you)` : seat.name}
        {seat.bot && <span className="wl-pick__bot">Bot</span>}
      </span>
      {setOptions &&
        (team ? (
          <button
            type="button"
            className={`wl-pick__move wl-pick__move--${other(team)}`}
            onClick={() => place(seat.id, other(team))}
            aria-label={`Move ${seat.name} to ${TEAM_NAME[other(team)]}`}
          >
            To {TEAM_NAME[other(team)]}
          </button>
        ) : (
          <span className="wl-pick__both">
            {TEAMS.map((t) => (
              <button
                key={t}
                type="button"
                className={`wl-pick__move wl-pick__move--${t}`}
                onClick={() => place(seat.id, t)}
                aria-label={`Put ${seat.name} on ${TEAM_NAME[t]}`}
              >
                {TEAM_NAME[t]}
              </button>
            ))}
          </span>
        ))}
    </li>
  );

  return (
    <div className="wl wl-pick" aria-label="Teams">
      {unplaced.length > 0 && (
        <section className="wl-pick__wait" aria-label="Not on a team yet">
          <h3 className="jd-label">
            {setOptions ? 'Put everyone on a team' : 'Waiting for the host to pick teams'}
          </h3>
          <ul className="wl-pick__list">{unplaced.map((s) => row(s, null))}</ul>
        </section>
      )}
      <div className="wl-pick__teams">
        {TEAMS.map((team) => {
          const members = seats.filter((s) => sides[s.id] === team);
          return (
            <section
              key={team}
              className={`wl-pick__team wl-pick__team--${team}`}
              aria-label={`${TEAM_NAME[team]} team`}
            >
              <h3 className="wl-pick__head">
                {TEAM_NAME[team]}
                <span>{members.length}</span>
              </h3>
              <ul className="wl-pick__list">
                {members.map((s) => row(s, team))}
                {onAddBot && seats.length < max && (
                  <li className="wl-pick__p wl-pick__open">
                    <span className="wl-pick__tok">
                      <AddSeat onAdd={() => addTo(team)} className="wl-pick__add" />
                    </span>
                    <span className="wl-pick__name wl-pick__name--open">Add a computer player</span>
                  </li>
                )}
              </ul>
              {members.length < 2 && (
                <p className="wl-pick__note">Under 2 players: someone moves over at the start.</p>
              )}
            </section>
          );
        })}
      </div>
      {unplaced.length > 0 && (
        <p className="wl-pick__note">Anyone left over joins the smaller team at the start.</p>
      )}
    </div>
  );
};
