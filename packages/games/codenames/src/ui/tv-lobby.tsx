'use client';

import { PlayerReaction, Token, useTheme, type GameTvLobbyProps } from '@jackdaw/ui';
import { defaultOptions, optionsSchema } from '../rules';
import type { Team } from '../teams';
import { CardMark } from './art';
import { arrangementFor } from './lobby';
import { TeamFiles } from './teams';
import './codenames.css';

/**
 * The TV's lobby once Codenames is chosen: the two case files as the host is arranging them,
 * anyone not yet on a team, and beside them how to join. Public facts only; nobody acts here.
 */
export function CodenamesTvLobby({
  code,
  players,
  options: raw,
  reactions,
  join,
  status,
}: GameTvLobbyProps) {
  const look = useTheme();
  const parsed = optionsSchema.safeParse({ ...defaultOptions(), ...raw });
  const opts = parsed.success ? parsed.data : defaultOptions();
  const { teams, spymasters } = arrangementFor(opts, players);
  const unplaced = players.filter((p) => !teams[p.id]);

  return (
    <div className="cn cn-tvlobby" data-look={look}>
      <div className="cn-tvlobby__main">
        <header className="cn-lobby__head">
          <span className="cn-lobby__mark" aria-hidden="true">
            <CardMark card="red" size={64} />
          </span>
          <div>
            <h2 className="cn-lobby__title">Codenames</h2>
            <p className="cn-lobby__sub">
              Case file {code}. {players.length} agent{players.length === 1 ? '' : 's'} at the
              table.
            </p>
          </div>
        </header>
        <TeamFiles
          teams={teams}
          spymasters={spymasters as Record<Team, string>}
          players={players}
          reactions={reactions}
          size="tv"
        />
        {unplaced.length > 0 && (
          <section className="cn-tray cn-tray--tv" aria-label="Not on a team yet">
            <h3 className="cn-tray__title">Not on a team yet</h3>
            <div className="cn-tray__people">
              {unplaced.map((p) => (
                <span key={p.id} className="cn-tray__agent">
                  <span className="cn-file__tok">
                    <Token avatar={p.avatar} size={56} away={!p.online} />
                    <PlayerReaction reactions={reactions} playerId={p.id} name={p.name} size={56} />
                  </span>
                  {p.name}
                </span>
              ))}
            </div>
          </section>
        )}
      </div>
      <aside className="cn-tvlobby__side">
        <div className="cn-tvlobby__join">{join}</div>
        <p className="cn-tvlobby__status">{status}</p>
        <p className="cn-tvlobby__rules">
          Two spymasters, 25 words, one assassin. Red and Blue race to uncover their agents from
          one-word clues.
        </p>
      </aside>
    </div>
  );
}
