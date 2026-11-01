'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientMessage, LobbySnapshot } from '@jackdaw/engine';
import { gameUis } from './catalog';
import { getDeviceToken, getDisplayId } from './identity';
import { PollingTransport, TransportError } from './transport';

export interface LobbyState {
  /** Latest snapshot for this device, or null until the first poll lands. */
  snapshot: LobbySnapshot | null;
  /** The last transport or rule error (e.g. NOT_YOUR_TURN), for a toast. Cleared on success. */
  error: TransportError | null;
  /** True once the server says the lobby doesn't exist (404). */
  missing: boolean;
  /** Send one message; resolves with the fresh snapshot, or null if the server refused it. */
  send: (message: ClientMessage) => Promise<LobbySnapshot | null>;
  clearError: () => void;
}

/**
 * One lobby's live state for this device. Players poll with their device token; TV displays
 * poll with a display id and never get a private view.
 */
export function useLobby(code: string, role: 'player' | 'display'): LobbyState {
  const [snapshot, setSnapshot] = useState<LobbySnapshot | null>(null);
  const [error, setError] = useState<TransportError | null>(null);
  const [missing, setMissing] = useState(false);
  const transport = useRef<PollingTransport | null>(null);

  useEffect(() => {
    const t = new PollingTransport(
      role === 'player' ? { code, token: getDeviceToken() } : { code, displayId: getDisplayId() },
    );
    transport.current = t;
    const stop = t.subscribe(
      (s) => {
        const game = s.session ? gameUis[s.session.gameId] : undefined;
        t.setLivePoll(s.status === 'in_game' ? (game?.livePollMs ?? null) : null);
        setSnapshot(s);
        setMissing(false);
      },
      (e) => {
        if (e.status === 404) setMissing(true);
        else setError(e);
      },
    );
    return () => {
      stop();
      t.close();
      transport.current = null;
    };
  }, [code, role]);

  const send = useCallback(async (message: ClientMessage) => {
    const t = transport.current;
    if (!t) return null;
    try {
      const s = await t.send(message);
      setError(null);
      return s;
    } catch (e) {
      setError(
        e instanceof TransportError
          ? e
          : new TransportError(0, 'NETWORK', 'Could not reach the lobby. Check your connection.'),
      );
      return null;
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);
  return { snapshot, error, missing, send, clearError };
}

/** Create a lobby as this device and return its code. Throws TransportError on failure. */
export async function createLobby(input: {
  name: string;
  avatar?: { crest: string; tint: string };
  gameId?: string;
}): Promise<string> {
  const res = await fetch('/api/lobby', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-player-token': getDeviceToken() },
    body: JSON.stringify(input),
  });
  const body = (await res.json().catch(() => null)) as {
    code?: string;
    error?: { code: string; message: string };
  } | null;
  if (!res.ok || !body?.code) {
    throw new TransportError(
      res.status,
      body?.error?.code ?? 'HTTP_' + res.status,
      body?.error?.message ?? 'Could not create a lobby. Try again.',
    );
  }
  return body.code;
}
