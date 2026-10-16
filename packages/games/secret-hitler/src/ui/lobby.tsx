'use client';

import { useState, type CSSProperties } from 'react';
import {
  LobbyChatPanel,
  PlayerReaction,
  ReactionBar,
  seatTransition,
  Token,
  type GameLobbyProps,
  type ScreenPlayer,
} from '@jackdaw/ui';
import type { Reaction } from '@jackdaw/engine';
import {
  HOUSE_TEAM,
  OFFICIAL_MAX,
  defaultOptions,
  lineupFor,
  optionsSchema,
  type ShOptions,
} from '../lineup';
import { meta } from '../meta';
import { POWER_LABEL } from '../moments';
import { PowerIcon, RoleEmblem } from './art';
import { ShFrame } from './board';

const vars = (v: Record<string, string | number>) => v as CSSProperties;

/**
 * The long cabinet table, seen from above, with everyone's placard round it, clockwise from the
 * head. The lobby makes seats tappable (your own, or anyone's for the host); the TV doesn't.
 */
export function Cabinet({
  code,
  players,
  me,
  hostId,
  isHost = false,
  onSeat,
  reactions,
  tv = false,
}: {
  code: string;
  players: ScreenPlayer[];
  me: string | null;
  hostId: string;
  isHost?: boolean;
  onSeat?: (id: string) => void;
  reactions: Reaction[];
  tv?: boolean;
}) {
  const n = players.length;
  const needed = Math.max(0, meta.minPlayers - n);
  const seat = (i: number) => {
    const a = (i / Math.max(n, 1)) * Math.PI * 2;
    return { left: `${50 + 41 * Math.sin(a)}%`, top: `${50 - 43 * Math.cos(a)}%` };
  };
  return (
    <div className={`sh-cabinet__room${tv ? ' sh-cabinet__room--tv' : ''}`} data-count={n}>
      <div className="sh-cabinet__table">
        <span className="sh-cabinet__kicker">Lobby</span>
        <span className="sh-cabinet__code">{code}</span>
        <span className="sh-cabinet__line">
          {n} of {meta.maxPlayers} seated
          {needed ? `, ${needed} more needed` : ''}
        </span>
      </div>
      {players.map((p, i) => {
        const you = p.id === me;
        const tappable = Boolean(onSeat) && (you || isHost);
        return (
          <button
            key={p.id}
            type="button"
            className={`sh-seat${you ? ' is-you' : ''}${p.online ? '' : ' is-away'}`}
            style={vars(seat(i))}
            disabled={!tappable}
            onClick={tappable ? () => onSeat!(p.id) : undefined}
            aria-label={
              !tappable
                ? p.name
                : you
                  ? `${p.name} (you): change your name, crest or colour`
                  : `${p.name}: remove or make host`
            }
          >
            <span className="sh-seat__tok">
              <Token
                avatar={p.avatar}
                host={p.id === hostId}
                away={!p.online}
                transitionName={tv ? undefined : seatTransition(p.id).token}
              />
              <PlayerReaction reactions={reactions} playerId={p.id} name={p.name} />
            </span>
            <span
              className="sh-seat__name"
              style={tv ? undefined : { viewTransitionName: seatTransition(p.id).name }}
            >
              {p.name}
              {you && <small> (you)</small>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Secret Hitler's own lobby: the players as name placards around a long cabinet table (seen from
 * above, in 1930s print), and beside it the deal for this many players, the power board, the
 * host's house rules for 11 or more, and Start. Chat is the kit's Table talk in the game's look.
 */
export function ShLobby({
  code,
  players,
  me,
  hostId,
  isHost,
  options: raw,
  setOptions,
  blocker,
  start,
  onSeat,
  changeGame,
  reactions,
  react,
  chat,
}: GameLobbyProps) {
  const parsed = optionsSchema.safeParse({ ...defaultOptions(), ...raw });
  const o: ShOptions = parsed.success ? parsed.data : defaultOptions();
  const n = players.length;
  const shown = Math.min(Math.max(n, meta.minPlayers), meta.maxPlayers);
  const deal = lineupFor(shown, o);
  const needed = Math.max(0, meta.minPlayers - n);
  const [busy, setBusy] = useState(false);
  const update = (patch: Partial<ShOptions>) => setOptions({ ...o, ...patch });

  async function deal_() {
    setBusy(true);
    try {
      await start();
    } finally {
      setBusy(false);
    }
  }

  const team = deal.fascists + 1;

  return (
    <ShFrame className="sh-lobby">
      <div className="sh-lobby__frame">
        <div className="sh-lobby__stage">
          <section className="sh-cabinet" aria-label="The table">
            <Cabinet
              code={code}
              players={players}
              me={me}
              hostId={hostId}
              isHost={isHost}
              onSeat={onSeat}
              reactions={reactions}
            />
            {me && <ReactionBar className="sh-react" onReact={react} />}
          </section>

          <section className="sh-dossier" aria-label="Secret Hitler lobby">
            <p className="sh-dossier__kicker">The cabinet is gathering</p>
            <h2 className="sh-dossier__title">
              {needed
                ? `Waiting for ${needed} more`
                : isHost
                  ? 'Ready when you are'
                  : 'Waiting for the host'}
            </h2>
            <p className="sh-dossier__text">
              {needed
                ? `Secret Hitler needs at least ${meta.minPlayers}. Share lobby code ${code}.`
                : 'Everyone gets a secret party card when you start. Only the Fascists know who is who.'}
            </p>

            <ul className="sh-deal" aria-label={`The deal for ${shown} players`}>
              <li className="sh-deal__card sh-deal__card--liberal">
                <RoleEmblem role="liberal" size={44} />
                <b>{deal.liberals}</b>
                <span>{deal.liberals === 1 ? 'Liberal' : 'Liberals'}</span>
              </li>
              <li className="sh-deal__card sh-deal__card--fascist">
                <RoleEmblem role="fascist" size={44} />
                <b>{deal.fascists}</b>
                <span>{deal.fascists === 1 ? 'Fascist' : 'Fascists'}</span>
              </li>
              <li className="sh-deal__card sh-deal__card--hitler">
                <RoleEmblem role="hitler" size={44} />
                <b>1</b>
                <span>Hitler</span>
              </li>
            </ul>
            <p className="sh-dossier__small">
              {n >= meta.minPlayers ? `The deal for ${n}.` : `Preview for ${shown}.`}{' '}
              {deal.hitlerKnows
                ? 'Hitler knows the Fascists.'
                : "Hitler doesn't know who the Fascists are."}{' '}
              Deck of {deal.deck.liberal} Liberal and {deal.deck.fascist} Fascist policies.
            </p>

            <ol className="sh-powers" aria-label="Powers on the Fascist track">
              {deal.board.map((power, i) => (
                <li key={i} className={power ? 'has-power' : undefined}>
                  <span className="sh-powers__n">{i + 1}</span>
                  {power ? (
                    <>
                      <PowerIcon power={power} size={20} />
                      <span>{POWER_LABEL[power]}</span>
                    </>
                  ) : (
                    <span>No power</span>
                  )}
                </li>
              ))}
              <li className="has-power">
                <span className="sh-powers__n">6</span>
                <PowerIcon power="win" size={20} />
                <span>Fascists win</span>
              </li>
            </ol>

            {deal.house && (
              <div className="sh-house">
                <p className="sh-house__note">
                  House rules: the printed game stops at {OFFICIAL_MAX}. These are suggestions;
                  confirm them with your group.
                </p>
                <div className="sh-setting">
                  <span className="sh-setting__label">Fascist team, with Hitler</span>
                  {isHost ? (
                    <span className="sh-stepper">
                      <button
                        type="button"
                        aria-label="Fewer Fascists"
                        disabled={team <= 2}
                        onClick={() => update({ fascistTeam: team - 1 })}
                      >
                        −
                      </button>
                      <b aria-live="polite">{team}</b>
                      <button
                        type="button"
                        aria-label="More Fascists"
                        disabled={2 * (team + 1) >= n}
                        onClick={() => update({ fascistTeam: team + 1 })}
                      >
                        +
                      </button>
                    </span>
                  ) : (
                    <b>{team}</b>
                  )}
                </div>
                {isHost && o.fascistTeam > 0 && o.fascistTeam !== HOUSE_TEAM[n] && (
                  <button
                    type="button"
                    className="sh-link"
                    onClick={() => update({ fascistTeam: 0 })}
                  >
                    Use the suggested {HOUSE_TEAM[n]}
                  </button>
                )}
                <div className="sh-setting">
                  <span className="sh-setting__label">Bigger policy deck</span>
                  {isHost ? (
                    <button
                      type="button"
                      role="switch"
                      aria-checked={o.bigDeck}
                      aria-label="Bigger policy deck"
                      className="sh-switch"
                      onClick={() => update({ bigDeck: !o.bigDeck })}
                    >
                      <span className="sh-switch__knob" aria-hidden="true" />
                      {o.bigDeck ? 'On' : 'Off'}
                    </button>
                  ) : (
                    <b>{o.bigDeck ? 'On' : 'Off'}</b>
                  )}
                </div>
              </div>
            )}

            {isHost && (
              <button
                type="button"
                className="sh-btn sh-btn--go sh-btn--big"
                disabled={busy || Boolean(blocker)}
                onClick={deal_}
                aria-label="Deal the roles: start Secret Hitler"
              >
                {busy ? 'Dealing…' : 'Deal the roles'}
              </button>
            )}
            {isHost && blocker && n >= meta.minPlayers && (
              <p className="sh-blocker" role="status">
                {blocker}
              </p>
            )}
            <p className="sh-dossier__small">
              {isHost && n > 1
                ? 'Tap a player’s placard to remove them, or your own to change your name and crest.'
                : 'Tap your placard to change your name and crest.'}
            </p>
            {changeGame && (
              <button type="button" className="sh-link" onClick={changeGame}>
                Play a different game
              </button>
            )}
          </section>
        </div>
      </div>
      <LobbyChatPanel chat={chat} players={players} className="sh-chat" />
    </ShFrame>
  );
}
