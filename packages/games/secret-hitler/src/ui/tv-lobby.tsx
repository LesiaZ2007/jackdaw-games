'use client';

import type { GameTvLobbyProps } from '@jackdaw/ui';
import { meta } from '../meta';
import Player from './sho/Player';
import { portraitFor } from './sho/assets';
import './sho/sho.css';
import './sho/jackdaw.css';

/**
 * The TV's lobby in secret-hitler.online's look: the lobby code and how to join beside everyone's
 * tile. Public facts only.
 */
export function ShTvLobby({ code, players, hostId, join, status }: GameTvLobbyProps) {
  return (
    <div className="sho sho-page sho-tvlobby">
      <div className="App">
        <header className="App-header">SECRET HITLER</header>
        <div className="sho-tvlobby__body">
          <div className="sho-tvlobby__join">
            <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'center' }}>
              <h2>LOBBY CODE: </h2>
              <h2 style={{ marginLeft: '5px', color: 'var(--textColorHighlight)' }}>{code}</h2>
            </div>
            <div className="sho-jackdaw">{join}</div>
            <p id="lobby-vip-text">{status}</p>
          </div>
          <div className="sho-tvlobby__players">
            <p id="lobby-player-count-text">
              Players ({players.length}/{meta.maxPlayers})
            </p>
            <div id="lobby-player-container">
              {players.map((p) => (
                <Player
                  key={p.id}
                  name={p.id === hostId ? p.name + ' [Host]' : p.name}
                  showRole={false}
                  icon={portraitFor(p.avatar.crest)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
