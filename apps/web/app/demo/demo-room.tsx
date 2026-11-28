'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { Lobby, Standing } from '@jackdaw/engine';
import {
  BirdMark,
  Lid,
  OutcomeChip,
  Plaque,
  RecapStatsTable,
  RecapTimeline,
  Token,
  Verdict,
  setTheme,
  useTheme,
  withNames,
  type Outcome,
  type ScreenPlayer,
} from '@jackdaw/ui';
import { catalogEntry, gameUis } from '../../lib/catalog';
import { games } from '../../lib/registry';
import {
  DEMO_GAMES,
  DEMO_ME_ID,
  applyDemoAction,
  createDemoLobby,
  nextDemoAt,
  resolveDemoGameId,
  tickDemoLobby,
} from './demo-engine';
import './demo.css';

const noopSubscribe = () => () => {};

const OUTCOME_LABEL: Record<Standing['outcome'], string> = {
  win: 'Won',
  loss: 'Lost',
  draw: 'Draw',
};

function DemoSession({ initialGame }: { initialGame: string }) {
  const theme = useTheme();
  const [gameId, setGameId] = useState(() => resolveDemoGameId(initialGame));
  const [lobby, setLobby] = useState<Lobby>(() => createDemoLobby(gameId));

  const switchGame = useCallback((nextId: string) => {
    const id = resolveDemoGameId(nextId);
    setGameId(id);
    setLobby(createDemoLobby(id));
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('game', id);
      window.history.replaceState(null, '', url.pathname + url.search);
    }
  }, []);

  const newDeal = useCallback(() => {
    setLobby(createDemoLobby(gameId));
  }, [gameId]);

  const sendAction = useCallback(async (action: unknown): Promise<boolean> => {
    let accepted = false;
    setLobby((cur) => {
      const next = applyDemoAction(cur, action);
      accepted = next !== cur;
      return next;
    });
    return accepted;
  }, []);

  useEffect(() => {
    const at = nextDemoAt(lobby);
    if (at === null) return;
    const waitMs = Math.max(80, at - Date.now());
    const id = window.setTimeout(() => {
      setLobby((cur) => tickDemoLobby(cur));
    }, waitMs);
    return () => window.clearTimeout(id);
  }, [lobby]);

  const mod = games[gameId];
  const ui = gameUis[gameId];
  const gameName = catalogEntry(gameId)?.meta.name ?? mod?.meta.name ?? 'Demo';
  const session = lobby.session;
  const result = lobby.results;
  const PlayerScreen = ui?.PlayerScreen;

  const players: ScreenPlayer[] = lobby.players.map((p) => ({
    id: p.id,
    name: p.name,
    avatar: p.avatar,
    online: true,
    bot: p.bot,
  }));
  const names = Object.fromEntries(players.map((p) => [p.id, p.name]));
  const byId = new Map(players.map((p) => [p.id, p]));

  const playerView = session && mod ? mod.getPlayerView(session.state, DEMO_ME_ID) : null;
  const tableView = session && mod ? mod.getTableView(session.state) : null;

  const standings = result?.standings ?? [];
  const mine = standings.find((st) => st.playerId === DEMO_ME_ID);
  const me = byId.get(DEMO_ME_ID);

  let outcome: Outcome = 'draw';
  let resultTitle = 'Game over';
  if (result && mine) {
    outcome = mine.outcome;
    resultTitle =
      mine.outcome === 'win'
        ? result.winners.length > 1
          ? 'You share the win'
          : 'You won'
        : mine.outcome === 'loss'
          ? 'You lost'
          : 'A draw';
  }

  const pageClass = result ? 'lobby-page demo-page' : 'lobby-page demo-page lobby-page--fit';

  return (
    <div className={pageClass}>
      <header className="lobby-bar">
        <h1 className="sr-only">{gameName} demo</h1>
        <Link href="/" className="lobby-bar__home" aria-label="Jackdaw home">
          <BirdMark width={40} height={40} weight={3} />
        </Link>
        <div className="demo-bar__title">
          <label className="demo-bar__picker">
            <span className="sr-only">Choose demo game</span>
            <select
              className="demo-bar__select"
              value={gameId}
              onChange={(e) => switchGame(e.target.value)}
              aria-label="Choose demo game"
            >
              {DEMO_GAMES.map((g) => (
                <option key={g.meta.id} value={g.meta.id}>
                  {g.meta.name}
                </option>
              ))}
            </select>
          </label>
          <span className="demo-bar__tag">Demo · vs bots</span>
        </div>
        <div className="lobby-bar__actions">
          <button
            type="button"
            className="demo-bar__btn"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
          <button type="button" className="demo-bar__btn" onClick={newDeal}>
            New deal
          </button>
          <Link href="/" className="demo-bar__btn demo-bar__btn--go">
            Open lobby
          </Link>
        </div>
      </header>

      <div className="lobby-layout">
        <main className="lobby-main">
          {!result && PlayerScreen && playerView != null && tableView != null ? (
            <div className="game-shell game-shell--fit">
              <PlayerScreen
                view={playerView}
                tableView={tableView}
                me={DEMO_ME_ID}
                players={players}
                sendAction={sendAction}
                now={() => Date.now()}
                reactions={[]}
              />
            </div>
          ) : result ? (
            <div className="results">
              <Lid className="results__head">
                <span className="jd-label">{gameName} demo complete</span>
                <Verdict
                  outcome={outcome}
                  title={resultTitle}
                  avatar={me?.avatar}
                  detail={withNames(result.summary, names)}
                />
              </Lid>
              {standings.length > 0 && (
                <section className="results__standings" aria-label="How everyone finished">
                  <h2 className="jd-h2">Standings</h2>
                  <ol>
                    {standings.map((st, i) => {
                      const p = byId.get(st.playerId);
                      return (
                        <li
                          key={st.playerId}
                          data-outcome={st.outcome}
                          data-me={st.playerId === DEMO_ME_ID || undefined}
                          style={{ animationDelay: `${200 + i * 70}ms` }}
                        >
                          {p ? (
                            <Token avatar={p.avatar} size={36} />
                          ) : (
                            <span className="results__gone" />
                          )}
                          <span className="results__who">
                            <span className="results__name">
                              {names[st.playerId] ?? 'Someone'}
                              {st.playerId === DEMO_ME_ID && <small> (you)</small>}
                            </span>
                            {st.role && <span className="results__role">{st.role}</span>}
                          </span>
                          <OutcomeChip outcome={st.outcome}>
                            {OUTCOME_LABEL[st.outcome]}
                          </OutcomeChip>
                        </li>
                      );
                    })}
                  </ol>
                </section>
              )}
              <RecapStatsTable stats={result.stats} names={names} me={DEMO_ME_ID} />
              <RecapTimeline events={result.recap} names={names} roundName={result.roundName} />
              <div className="dock">
                <Plaque go onClick={newDeal}>
                  Play {gameName} again
                </Plaque>
                <Link href="/" className="demo-bar__btn">
                  Start a live lobby for friends
                </Link>
                <a href="https://lastivka.dev/guide/jackdaw/" className="jd-link" rel="noopener">
                  Back to Lastivka field guide ↗
                </a>
              </div>
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
}

/** Local-only multi-game demo against bird bots; never opens or mutates server lobbies. */
export function DemoRoom({
  initialGame,
  initialName = 'UNO',
}: {
  initialGame: string;
  initialName?: string;
}) {
  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  if (!mounted) {
    return (
      <div className="lobby-page demo-page lobby-page--fit">
        <header className="lobby-bar">
          <h1 className="sr-only">{initialName} demo</h1>
          <Link href="/" className="lobby-bar__home" aria-label="Jackdaw home">
            <BirdMark width={40} height={40} weight={3} />
          </Link>
          <div className="demo-bar__title">
            <span className="demo-bar__game">{initialName}</span>
            <span className="demo-bar__tag">Demo · vs bots</span>
          </div>
        </header>
      </div>
    );
  }

  return <DemoSession initialGame={initialGame} />;
}
