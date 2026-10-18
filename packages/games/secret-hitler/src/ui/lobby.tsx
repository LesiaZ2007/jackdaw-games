'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { LobbyChatPanel, type GameLobbyProps } from '@jackdaw/ui';
import { HOUSE_TEAM, OFFICIAL_MAX, defaultOptions, optionsSchema, type ShOptions } from '../lineup';
import { meta } from '../meta';
import CustomAlert from './sho/CustomAlert';
import IconSelection from './sho/IconSelection';
import Player from './sho/Player';
import { CREST_FOR_PORTRAIT, portraitFor } from './sho/assets';
import './sho/sho.css';
import './sho/jackdaw.css';

const noSubscribe = () => () => {};

export const ABOUT_URL =
  'https://github.com/ShrimpCryptid/Secret-Hitler-Online/blob/main/README.md';

/**
 * secret-hitler.online's lobby page (App.tsx renderLobbyPage) under Jackdaw's bar: the lobby
 * code and invite link, everyone's tile, Change icon, and Start game for the host. Jackdaw adds
 * the house rules past 10 players, the host's way back to the list of games, and table talk.
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
  setAvatar,
}: GameLobbyProps) {
  const parsed = optionsSchema.safeParse(options);
  const o: ShOptions = parsed.success ? parsed.data : defaultOptions();
  const n = players.length;
  const team = o.fascistTeam > 0 ? o.fascistTeam : (HOUSE_TEAM[n] ?? 0);
  const update = (patch: Partial<ShOptions>) => setOptions({ ...o, ...patch });

  const [showIcons, setShowIcons] = useState(false);
  const [busy, setBusy] = useState(false);
  const [snackbar, setSnackbar] = useState({ message: '', shown: 0 });
  const snackTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(snackTimer.current), []);
  const showSnackBar = (message: string) => {
    setSnackbar((s) => ({ message, shown: s.shown + 1 }));
    clearTimeout(snackTimer.current);
    snackTimer.current = setTimeout(() => setSnackbar((s) => ({ ...s, shown: 0 })), 3000);
  };

  const origin = useSyncExternalStore(
    noSubscribe,
    () => window.location.origin,
    () => '',
  );
  const link = `${origin}/${code}`;

  const names = players.map((p) => p.name);
  const icons = Object.fromEntries(players.map((p) => [p.name, portraitFor(p.avatar.crest)]));
  const mine = players.find((p) => p.id === me);

  async function onClickStartGame() {
    setBusy(true);
    try {
      await start();
    } finally {
      setBusy(false);
    }
  }

  async function onSelectIcon(icon: string) {
    const crest = CREST_FOR_PORTRAIT[icon];
    if (!mine || !crest || !setAvatar) return;
    const ok = await setAvatar({ crest, tint: mine.avatar.tint });
    if (!ok) showSnackBar('Someone else has that look.');
  }

  async function onClickCopy() {
    try {
      await navigator.clipboard.writeText(link);
      showSnackBar('Copied!');
    } catch {
      showSnackBar('Select the link to copy it.');
    }
  }

  return (
    <div className="sho sho-page sho-lobby">
      <div className="App sho-lobby__main">
        <header className="App-header">SECRET HITLER</header>

        <CustomAlert show={showIcons}>
          {showIcons && mine && (
            <IconSelection
              playerToIcon={icons}
              players={names}
              user={mine.name}
              onSelect={onSelectIcon}
              onConfirm={() => setShowIcons(false)}
            />
          )}
        </CustomAlert>

        <div style={{ textAlign: 'left', marginLeft: '20px', marginRight: '20px' }}>
          <div style={{ display: 'flex', flexDirection: 'row' }}>
            <h2>LOBBY CODE: </h2>
            <h2 style={{ marginLeft: '5px', color: 'var(--textColorHighlight)' }}>{code}</h2>
          </div>

          <p style={{ marginBottom: '2px' }}>Copy and share this link to invite other players.</p>
          <div
            style={{
              textAlign: 'left',
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >
            <textarea
              id="linkText"
              readOnly={true}
              value={link}
              aria-label="Invite link"
              onFocus={(e) => e.currentTarget.select()}
            />
            <button onClick={onClickCopy}>COPY</button>
          </div>

          <div id="lobby-lower-container">
            <div id="lobby-player-area-container">
              <div id="lobby-player-text-choose-container">
                <p id="lobby-player-count-text">
                  Players ({n}/{meta.maxPlayers})
                </p>
                {mine && setAvatar && (
                  <button id="lobby-change-icon-button" onClick={() => setShowIcons(true)}>
                    CHANGE ICON
                  </button>
                )}
              </div>
              <div id="lobby-player-container">
                {players.map((p) => {
                  const tappable = p.id === me || isHost;
                  return (
                    <Player
                      key={p.id}
                      name={p.id === hostId ? p.name + ' [Host]' : p.name}
                      showRole={false}
                      icon={icons[p.name]}
                      highlight={p.id === me}
                      onClick={tappable ? () => onSeat(p.id) : undefined}
                    />
                  );
                })}
              </div>
            </div>

            {n > OFFICIAL_MAX && (
              <div id="sho-house">
                <h2>HOUSE RULES</h2>
                <p>
                  The printed game stops at {OFFICIAL_MAX} players. These are suggestions; confirm
                  them with your group.
                </p>
                <div className="sho-house__row">
                  <p>Fascist team, with Hitler:</p>
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
                  <p>Bigger policy deck:</p>
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
            )}

            <div id="lobby-button-container">
              {!isHost && <p id="lobby-vip-text">Only the VIP can start the game.</p>}
              {isHost && blocker && <p id="lobby-vip-text">{blocker}</p>}
              <button onClick={onClickStartGame} disabled={!isHost || Boolean(blocker) || busy}>
                START GAME
              </button>
              {changeGame && <button onClick={changeGame}>CHANGE GAME</button>}
            </div>
            <div id="lobby-text-container">
              <p id="lobby-about-text">
                <a href={ABOUT_URL} target="_blank" rel="noopener noreferrer">
                  About this project
                </a>
              </p>
              <br />
              <p id="lobby-warning-text">
                Secret Hitler Online by ShrimpCryptid, adapted from Secret Hitler by Goat, Wolf
                &amp; Cabbage. CC BY-NC-SA 4.0.
              </p>
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div id="snackbar" className={snackbar.shown ? 'show' : ''} key={snackbar.shown}>
            {snackbar.message}
          </div>
        </div>
      </div>
      <LobbyChatPanel chat={chat} players={players} className="sho-chat" />
    </div>
  );
}
