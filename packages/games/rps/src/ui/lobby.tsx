'use client';

import type { CSSProperties } from 'react';
import { Plaque, Token, type GameLobbyProps } from '@jackdaw/ui';
import { PICKS } from '../rules';
import { Throw } from './player';
import './rps-lobby.css';

const vars = (v: Record<string, string | number>) => v as CSSProperties;

/**
 * Rock Paper Scissors' own lobby: everyone stands round a chalk ring in the schoolyard, fists
 * shaking through rock, paper, scissors, until the host calls "Shoot!". Jackdaw's frame (code,
 * chat, stats, TV) stays around it; only the centre is the game's.
 */
export function RpsLobby({
  players,
  me,
  hostId,
  isHost,
  options,
  setOptions,
  blocker,
  start,
  onSeat,
  changeGame,
}: GameLobbyProps) {
  const rounds = typeof options.rounds === 'number' ? options.rounds : 3;
  const n = players.length;
  const host = players.find((p) => p.id === hostId);
  const setRounds = (r: number) => setOptions({ ...options, rounds: Math.min(9, Math.max(1, r)) });

  return (
    <div className="rps-lobby">
      <p className="rps-lobby__chant" aria-hidden="true">
        Rock <span>·</span> Paper <span>·</span> Scissors <span>·</span> <b>Shoot!</b>
      </p>

      <div className="rps-ring" data-count={n}>
        <div className="rps-ring__chalk" aria-hidden="true" />
        <div className="rps-ring__middle" role="group" aria-label="Rounds">
          <span className="jd-label">Rounds</span>
          {isHost ? (
            <span className="rps-ring__stepper">
              <button
                type="button"
                className="jd-iconbtn"
                aria-label="Fewer rounds"
                disabled={rounds <= 1}
                onClick={() => setRounds(rounds - 1)}
              >
                −
              </button>
              <b aria-live="polite">{rounds}</b>
              <button
                type="button"
                className="jd-iconbtn"
                aria-label="More rounds"
                disabled={rounds >= 9}
                onClick={() => setRounds(rounds + 1)}
              >
                +
              </button>
            </span>
          ) : (
            <b className="rps-ring__rounds">{rounds}</b>
          )}
          <span className="rps-ring__note">
            {n < 2 ? 'Needs one more player' : `${n} in the ring`}
          </span>
        </div>
        {players.map((p, i) => {
          const angle = (i / Math.max(n, 1)) * Math.PI * 2;
          const tappable = p.id === me || isHost;
          return (
            <button
              key={p.id}
              type="button"
              className={`rps-ring__seat${p.id === me ? ' is-me' : ''}`}
              disabled={!tappable}
              onClick={tappable ? () => onSeat(p.id) : undefined}
              aria-label={
                p.id === me
                  ? `${p.name} (you): change your name, crest or colour`
                  : tappable
                    ? `${p.name}: remove or make host`
                    : p.name
              }
              style={vars({
                left: `${50 + 40 * Math.sin(angle)}%`,
                top: `${50 - 40 * Math.cos(angle)}%`,
                '--i': i,
              })}
            >
              <Token avatar={p.avatar} host={p.id === hostId} away={!p.online} />
              <span className="rps-ring__fist" aria-hidden="true">
                {PICKS.map((pick) => (
                  <span key={pick} className={`rps-ring__throw rps-ring__throw--${pick}`}>
                    <Throw pick={pick} size={22} />
                  </span>
                ))}
              </span>
              <span className="rps-ring__name">{p.id === me ? 'You' : p.name}</span>
            </button>
          );
        })}
      </div>

      <div className="rps-lobby__go">
        {isHost ? (
          <>
            <Plaque
              go
              disabled={Boolean(blocker)}
              aria-disabled={Boolean(blocker)}
              onClick={start}
              aria-label="Shoot! Start Rock Paper Scissors"
            >
              Shoot!
            </Plaque>
            {blocker && <p className="rps-lobby__note">{blocker}</p>}
          </>
        ) : (
          <p className="rps-lobby__wait">Waiting for {host?.name ?? 'the host'} to call it</p>
        )}
        {changeGame && (
          <button type="button" className="home-link" onClick={changeGame}>
            Play a different game
          </button>
        )}
      </div>
    </div>
  );
}
