'use client';

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AddSeat, type GameLobbyProps } from '@jackdaw/ui';
import { HOUSE_TEAM, OFFICIAL_MAX, defaultOptions, optionsSchema, type ShOptions } from '../lineup';
import { meta } from '../meta';
import { ShFrame } from './frame';
import Player from './sho/Player';
import { lookOf } from './sho/adapt';

const noSubscribe = () => () => {};

/** The public address: NEXT_PUBLIC_SITE_URL, or this page's origin (as Jackdaw's share sheet). */
function useSiteUrl(): string {
  const origin = useSyncExternalStore(
    noSubscribe,
    () => window.location.origin,
    () => '',
  );
  return (process.env.NEXT_PUBLIC_SITE_URL || origin).replace(/\/$/, '');
}

/** The tile's height over its width (player-base.png is 443 × 633). */
const TILE_RATIO = 633 / 443;
const TILE_GAP = 8;
const TILE_MIN = 52;
const TILE_MAX = 150;

/**
 * The widest tiles that let everyone fit in the box without scrolling, whatever the number of
 * players: every column count is tried and the one that gives the biggest tiles wins.
 */
function useTileFit(count: number) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const fit = () => {
      const width = el.clientWidth;
      const height = el.clientHeight;
      if (width <= 0) return;
      let best = TILE_MIN;
      for (let cols = 1; cols <= Math.max(count, 1); cols++) {
        const rows = Math.ceil(Math.max(count, 1) / cols);
        const byWidth = (width - (cols - 1) * TILE_GAP) / cols;
        const byHeight = (height - (rows - 1) * TILE_GAP) / rows / TILE_RATIO;
        best = Math.max(best, Math.min(byWidth, byHeight));
      }
      el.style.setProperty('--sho-tile', `${Math.floor(Math.min(best, TILE_MAX))}px`);
    };
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    fit();
    return () => ro.disconnect();
  }, [count]);
  return ref;
}

/**
 * secret-hitler.online's lobby page (App.tsx renderLobbyPage) under Jackdaw's bar, fitted to
 * the screen: the lobby code and invite link, everyone's tile, Change icon, and Start game for
 * the host. Jackdaw adds the house rules past 10 players, the host's way back to the list of
 * games, and table talk. Tiles carry each player's Jackdaw crest, and Change icon opens Jackdaw's
 * own look picker, so a look is the same in every game. The host gets one more tile, a "+"
 * that seats a computer player; computer players are marked [Bot], as the site marks [Host].
 */
export function ShLobby({
  code,
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
  chat,
  onAddBot,
}: GameLobbyProps) {
  const parsed = optionsSchema.safeParse(options);
  const o: ShOptions = parsed.success ? parsed.data : defaultOptions();
  const n = players.length;
  const team = o.fascistTeam > 0 ? o.fascistTeam : (HOUSE_TEAM[n] ?? 0);
  const update = (patch: Partial<ShOptions>) => setOptions({ ...o, ...patch });

  const [busy, setBusy] = useState(false);
  const [snackbar, setSnackbar] = useState({ message: '', shown: 0 });
  const snackTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(snackTimer.current), []);
  const showSnackBar = (message: string) => {
    setSnackbar((s) => ({ message, shown: s.shown + 1 }));
    clearTimeout(snackTimer.current);
    snackTimer.current = setTimeout(() => setSnackbar((s) => ({ ...s, shown: 0 })), 3000);
  };

  const site = useSiteUrl();
  const host = site.replace(/^https?:\/\//, '');
  const link = `${site}/${code}`;
  const tiles = useTileFit(n + (onAddBot ? 1 : 0));

  async function onClickStartGame() {
    setBusy(true);
    try {
      await start();
    } finally {
      setBusy(false);
    }
  }

  async function onClickCopy() {
    try {
      await navigator.clipboard.writeText(link);
      showSnackBar('Copied!');
    } catch {
      showSnackBar('Couldn’t copy. Share the code instead.');
    }
  }

  return (
    <ShFrame chat={chat} players={players} className="sho-lobby">
      <div className="App sho-lobby__page">
        <header className="App-header">SECRET HITLER</header>

        <div className="sho-lobby__body">
          <div className="sho-lobby__invite">
            <div style={{ display: 'flex', flexDirection: 'row' }}>
              <h2>LOBBY CODE: </h2>
              <h2 style={{ marginLeft: '5px', color: 'var(--textColorHighlight)' }}>{code}</h2>
            </div>
            <p className="sho-lobby__how">Join with the code, or share the link:</p>
            <div className="sho-lobby__link">
              <span className="sho-lobby__url" aria-label="Invite link">
                {host}/<span className="highlight">{code}</span>
              </span>
              <button onClick={onClickCopy}>COPY</button>
            </div>
          </div>

          <div id="lobby-player-text-choose-container">
            <p id="lobby-player-count-text">
              Players ({n}/{meta.maxPlayers})
            </p>
            {me && (
              <button id="lobby-change-icon-button" onClick={() => onSeat(me)}>
                CHANGE ICON
              </button>
            )}
          </div>

          <div className="sho-lobby__tiles" ref={tiles}>
            <div id="lobby-player-container">
              {players.map((p) => {
                const tappable = p.id === me || isHost;
                return (
                  <Player
                    key={p.id}
                    name={p.name + (p.id === hostId ? ' [Host]' : p.bot ? ' [Bot]' : '')}
                    showRole={false}
                    icon={lookOf(p.id, p)}
                    seatTransition
                    highlight={p.id === me}
                    onClick={tappable ? () => onSeat(p.id) : undefined}
                  />
                );
              })}
              {onAddBot && (
                <div className="sho-jackdaw sho-addseat">
                  <AddSeat onAdd={onAddBot} />
                </div>
              )}
            </div>
          </div>

          {n > OFFICIAL_MAX && (
            <div id="sho-house">
              <p className="sho-house__title">
                <span className="highlight">HOUSE RULES</span> past {OFFICIAL_MAX} players
              </p>
              <div className="sho-house__rows">
                <div className="sho-house__row">
                  <p>Fascists, with Hitler:</p>
                  {isHost && (
                    <button
                      aria-label="Fewer Fascists"
                      disabled={team <= 2}
                      onClick={() => update({ fascistTeam: team - 1 })}
                    >
                      −
                    </button>
                  )}
                  <p className="highlight" aria-live="polite">
                    {team}
                  </p>
                  {isHost && (
                    <button
                      aria-label="More Fascists"
                      disabled={2 * (team + 1) >= n}
                      onClick={() => update({ fascistTeam: team + 1 })}
                    >
                      +
                    </button>
                  )}
                </div>
                <div className="sho-house__row">
                  <p>Bigger deck:</p>
                  {isHost ? (
                    <button
                      role="switch"
                      aria-checked={o.bigDeck}
                      onClick={() => update({ bigDeck: !o.bigDeck })}
                    >
                      {o.bigDeck ? 'ON' : 'OFF'}
                    </button>
                  ) : (
                    <p className="highlight">{o.bigDeck ? 'ON' : 'OFF'}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          <div id="lobby-button-container">
            {!isHost && <p id="lobby-vip-text">Only the VIP can start the game.</p>}
            {isHost && blocker && <p id="lobby-vip-text">{blocker}</p>}
            <div className="sho-lobby__buttons">
              <button onClick={onClickStartGame} disabled={!isHost || Boolean(blocker) || busy}>
                START GAME
              </button>
              {changeGame && <button onClick={changeGame}>CHANGE GAME</button>}
            </div>
          </div>
        </div>

        <div style={{ textAlign: 'center' }}>
          <div id="snackbar" className={snackbar.shown ? 'show' : ''} key={snackbar.shown}>
            {snackbar.message}
          </div>
        </div>
      </div>
    </ShFrame>
  );
}
