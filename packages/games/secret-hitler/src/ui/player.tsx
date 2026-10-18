'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { PlayerScreenProps } from '@jackdaw/engine';
import type { ScreenExtras } from '@jackdaw/ui';
import type { Policy } from '../lineup';
import type { ShAction, ShPlayerView, ShTableView } from '../rules';
import { ShFrame } from './frame';
import GamePage, { type Investigation } from './sho/GamePage';
import { namesFor, toGameState } from './sho/adapt';
import { remember } from './sho/memory';
import { WSCommandType, type GameState, type ServerRequestPayload } from './sho/types';

/** The same object until the content changes, so the game page only reacts to real changes. */
function useStable<T>(value: T): T {
  const key = JSON.stringify(value);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => value, [key]);
}

/** secret-hitler.online's command, as a Jackdaw move. */
function toAction(
  p: ServerRequestPayload,
  gs: GameState,
  idOf: (name: string) => string,
): ShAction | null {
  const policy = (c: string | undefined) => c?.toLowerCase() as Policy | undefined;
  switch (p.command) {
    case WSCommandType.NOMINATE_CHANCELLOR:
      return { type: 'nominate', chancellor: idOf(p.target) };
    case WSCommandType.REGISTER_VOTE:
      return { type: 'vote', ja: p.vote };
    case WSCommandType.REGISTER_PRESIDENT_CHOICE: {
      const c = policy(gs.presidentChoices?.[p.choice]);
      return c ? { type: 'discard', policy: c } : null;
    }
    case WSCommandType.REGISTER_CHANCELLOR_CHOICE: {
      const c = policy(gs.chancellorChoices?.[p.choice]);
      return c ? { type: 'enact', policy: c } : null;
    }
    case WSCommandType.REGISTER_CHANCELLOR_VETO:
      return { type: 'veto' };
    case WSCommandType.REGISTER_PRESIDENT_VETO:
      return { type: 'vetoReply', accept: p.veto };
    case WSCommandType.REGISTER_PEEK:
      return { type: 'power' };
    case WSCommandType.GET_INVESTIGATION:
    case WSCommandType.REGISTER_EXECUTION:
    case WSCommandType.REGISTER_SPECIAL_ELECTION:
      return { type: 'power', target: idOf(p.target) };
    case WSCommandType.END_TERM:
      return { type: 'endTerm' };
    default:
      return null;
  }
}

/** A seated player's phone: secret-hitler.online's game page. */
export function PlayerScreen({
  view,
  tableView,
  players,
  sendAction,
  chat,
}: PlayerScreenProps<ShPlayerView, ShTableView, ShAction> & ScreenExtras) {
  const gameState = useStable(toGameState(tableView, view, players));
  const { name, idOf } = namesFor(tableView.players, players);
  const investigations = useStable<Investigation[]>(
    view.investigations.map((i) => ({ target: name(i.target), party: i.team.toUpperCase() })),
  );
  const latest = useRef(gameState);
  useEffect(() => {
    latest.current = gameState;
    remember(gameState);
  }, [gameState]);

  const idOfRef = useRef(idOf);
  useEffect(() => {
    idOfRef.current = idOf;
  });
  const send = useCallback(
    async (payload: ServerRequestPayload) => {
      const action = toAction(payload, latest.current, idOfRef.current);
      return action ? sendAction(action) : false;
    },
    [sendAction],
  );

  return (
    <ShFrame chat={chat} players={players}>
      <GamePage
        gameState={gameState}
        user={name(view.me)}
        send={send}
        investigations={investigations}
      />
    </ShFrame>
  );
}
