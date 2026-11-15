'use client';

import type { GameTvLobbyProps } from '@jackdaw/ui';
import { defaultOptions, optionsSchema } from '../options';
import { lookOf } from './attract';
import { AttractStage, Lineup } from './lobby';
import './maze.css';

/**
 * The TV's lobby: the attract maze fills the screen in the look the host picked, with the room
 * code and how to join beside it, and everyone lined up as chompers.
 */
export function MazeTvLobby({
  players,
  hostId,
  options: raw,
  reactions,
  join,
  status,
  code,
}: GameTvLobbyProps) {
  const parsed = optionsSchema.safeParse({ ...defaultOptions(players.length), ...raw });
  const opts = parsed.success ? parsed.data : defaultOptions(players.length);
  const look = lookOf(opts as unknown as Record<string, unknown>);
  return (
    <div className="mz-tvlobby" data-look={look}>
      <AttractStage look={look} players={players} seed={code} className="mz-tvlobby__stage" />
      <aside className="mz-tvlobby__side">
        <h2 className="mz-lobby__title">Pac Man</h2>
        <div className="mz-tvlobby__join">{join}</div>
        <p className="mz-tvlobby__status">{status}</p>
        <Lineup players={players} me={null} hostId={hostId} look={look} reactions={reactions} tv />
      </aside>
    </div>
  );
}
