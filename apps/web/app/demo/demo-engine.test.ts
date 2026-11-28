import { describe, expect, it } from 'vitest';
import {
  DEMO_GAMES,
  DEMO_ME_ID,
  createDemoLobby,
  nextDemoAt,
  resolveDemoGameId,
  tickDemoLobby,
} from './demo-engine';
import { gameUis } from '../../lib/catalog';
import { games } from '../../lib/registry';

describe('demo engine', () => {
  it('defaults unknown ids to uno', () => {
    expect(resolveDemoGameId()).toBe('uno');
    expect(resolveDemoGameId('not-a-game')).toBe('uno');
    expect(resolveDemoGameId('rps')).toBe('rps');
  });

  it('starts every bot-supported demo game and builds valid views', () => {
    expect(DEMO_GAMES.length).toBeGreaterThan(10);
    for (const entry of DEMO_GAMES) {
      const id = entry.meta.id;
      const lobby = createDemoLobby(id, 1_700_000_000_000);
      expect(lobby.status, id).toBe('in_game');
      expect(lobby.session?.gameId, id).toBe(id);

      const mod = games[id]!;
      const ui = gameUis[id]!;
      expect(ui.PlayerScreen, id).toBeDefined();
      expect(() => mod.getTableView(lobby.session!.state)).not.toThrow();
      expect(() => mod.getPlayerView(lobby.session!.state, DEMO_ME_ID)).not.toThrow();

      // Advance at least once if a timer or opening bot turn is scheduled.
      const at = nextDemoAt(lobby, 1_700_000_000_000);
      if (at !== null) {
        const next = tickDemoLobby(lobby, at);
        expect(next.session || next.results).toBeTruthy();
      }
    }
  });
});
