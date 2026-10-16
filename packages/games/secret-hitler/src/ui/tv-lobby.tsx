'use client';

import type { GameTvLobbyProps } from '@jackdaw/ui';
import { defaultOptions, lineupFor, optionsSchema, type ShOptions } from '../lineup';
import { meta } from '../meta';
import { POWER_LABEL } from '../moments';
import { PowerIcon, RoleEmblem } from './art';
import { ShFrame } from './board';
import { Cabinet } from './lobby';

/**
 * The TV's lobby once Secret Hitler is chosen: the cabinet table big, and beside it how to join,
 * the deal for the current count and the powers on the Fascist track. Public facts only.
 */
export function ShTvLobby({
  code,
  players,
  hostId,
  options: raw,
  reactions,
  join,
  status,
}: GameTvLobbyProps) {
  const parsed = optionsSchema.safeParse({ ...defaultOptions(), ...raw });
  const o: ShOptions = parsed.success ? parsed.data : defaultOptions();
  const n = players.length;
  const shown = Math.min(Math.max(n, meta.minPlayers), meta.maxPlayers);
  const deal = lineupFor(shown, o);
  const needed = Math.max(0, meta.minPlayers - n);

  return (
    <ShFrame className="sh-tvlobby">
      <div className="sh-tvlobby__table">
        <Cabinet code={code} players={players} me={null} hostId={hostId} reactions={reactions} tv />
      </div>
      <aside className="sh-tvlobby__side">
        <div className="sh-tvlobby__join">{join}</div>
        <section className="sh-dossier sh-dossier--tv" aria-label="Secret Hitler">
          <p className="sh-dossier__kicker">The cabinet is gathering</p>
          <h2 className="sh-dossier__title">{needed ? `Waiting for ${needed} more` : status}</h2>
          <ul className="sh-deal" aria-label={`The deal for ${shown} players`}>
            <li className="sh-deal__card sh-deal__card--liberal">
              <RoleEmblem role="liberal" size={52} />
              <b>{deal.liberals}</b>
              <span>Liberals</span>
            </li>
            <li className="sh-deal__card sh-deal__card--fascist">
              <RoleEmblem role="fascist" size={52} />
              <b>{deal.fascists}</b>
              <span>{deal.fascists === 1 ? 'Fascist' : 'Fascists'}</span>
            </li>
            <li className="sh-deal__card sh-deal__card--hitler">
              <RoleEmblem role="hitler" size={52} />
              <b>1</b>
              <span>Hitler</span>
            </li>
          </ul>
          <ol className="sh-powers" aria-label="Powers on the Fascist track">
            {deal.board.map((power, i) =>
              power ? (
                <li key={i} className="has-power">
                  <span className="sh-powers__n">{i + 1}</span>
                  <PowerIcon power={power} size={30} />
                  <span>{POWER_LABEL[power]}</span>
                </li>
              ) : null,
            )}
          </ol>
          {deal.house && <p className="sh-dossier__small">House rules past ten players.</p>}
        </section>
      </aside>
    </ShFrame>
  );
}
