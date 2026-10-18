'use client';

import { useState } from 'react';
import type { GameResultsProps } from '@jackdaw/ui';
import type { ShReveal } from '../rules';
import { ShFrame } from './frame';
import GamePage from './sho/GamePage';
import { finalGameState, namesFor } from './sho/adapt';
import { recall } from './sho/memory';

/**
 * The end of the game on a phone, as secret-hitler.online ends it: the last move plays out on
 * the board (the vote that elected Hitler, the last policy, or the execution), then the victory
 * popup lists everyone's role, winners first. The host's choices sit under it.
 */
export function Results({
  result,
  players,
  me,
  hostId,
  isHost,
  playAgain,
  backToLobby,
  chat,
}: GameResultsProps) {
  const reveal = result.reveal as ShReveal;
  const [final] = useState(() => finalGameState(reveal, players));
  const [from] = useState(() => recall(final.playerOrder) ?? undefined);
  const { name } = namesFor(reveal.players, players);
  const seated = me !== null && reveal.players.includes(me);
  const host = players.find((p) => p.id === hostId)?.name ?? 'the host';

  return (
    <ShFrame chat={chat} players={players}>
      <GamePage
        gameState={final}
        startFrom={from}
        user={seated ? name(me) : null}
        renderVictoryButtons={() =>
          isHost ? (
            <>
              <button onClick={playAgain}>PLAY AGAIN</button>
              <button onClick={backToLobby}>RETURN TO LOBBY</button>
            </>
          ) : (
            <p className="sho-victory-wait">Waiting for {host} to return to the lobby.</p>
          )
        }
      />
    </ShFrame>
  );
}
