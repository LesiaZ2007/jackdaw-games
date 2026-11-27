'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  BOT_DELAY_MS,
  createRng,
  mixSeed,
  randomSeed,
  type RngState,
  type Standing,
} from '@jackdaw/engine';
import { uno, type UnoAction } from '@jackdaw/game-uno';
import { unoUi } from '@jackdaw/game-uno/ui';
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
import './demo.css';

const ME_ID = 'you';

const DEMO_PLAYERS: ScreenPlayer[] = [
  { id: ME_ID, name: 'You', avatar: { crest: 'fleur', tint: 'lagoon' }, online: true },
  { id: 'bot-1', name: 'Rook', avatar: { crest: 'raven', tint: 'plum' }, online: true, bot: true },
  { id: 'bot-2', name: 'Magpie', avatar: { crest: 'owl', tint: 'pine' }, online: true, bot: true },
  { id: 'bot-3', name: 'Swift', avatar: { crest: 'fox', tint: 'rust' }, online: true, bot: true },
];
const DEMO_PLAYER_IDS = DEMO_PLAYERS.map((p) => p.id);

const OUTCOME_LABEL: Record<Standing['outcome'], string> = {
  win: 'Won',
  loss: 'Lost',
  draw: 'Draw',
};

interface DemoGame {
  state: ReturnType<typeof uno.setup>;
  rngState: RngState;
}

function createDemoGame(): DemoGame {
  const rng = createRng(randomSeed());
  const state = uno.setup({
    playerIds: DEMO_PLAYER_IDS,
    options: {
      length: 'One round',
      drawing: 'Draw one',
      stacking: 'No',
      turnTimer: 'Off',
    },
    rng,
    now: Date.now(),
  });
  return { state, rngState: rng.state };
}

/** Local-only single-player UNO round against three bots; never calls the server. */
export function DemoRoom() {
  const theme = useTheme();
  const [game, setGame] = useState<DemoGame | null>(null);

  useEffect(() => {
    setGame(createDemoGame());
  }, []);

  const state = game?.state ?? null;
  const result = state ? uno.getResult(state) : null;

  const newGame = useCallback(() => {
    setGame(createDemoGame());
  }, []);

  const sendAction = useCallback(async (action: UnoAction): Promise<boolean> => {
    setGame((cur) => {
      if (!cur) return cur;
      try {
        const timer = uno.nextTimer?.(cur.state);
        if (action.type === 'deal' && timer?.id === 'deal' && uno.onTimer) {
          const rng = createRng(cur.rngState);
          const next = uno.onTimer(cur.state, timer.id, rng, Date.now());
          return { state: next, rngState: rng.state };
        }
        const rng = createRng(cur.rngState);
        const next = uno.applyAction(cur.state, ME_ID, action, rng, Date.now());
        return { state: next, rngState: rng.state };
      } catch {
        return cur;
      }
    });
    return true;
  }, []);

  useEffect(() => {
    if (!game || !state || uno.getResult(state)) return;

    const timer = uno.nextTimer?.(state);
    if (state.phase === 'done' && timer && uno.onTimer) {
      const waitMs = Math.max(250, timer.at - Date.now());
      const id = window.setTimeout(() => {
        setGame((cur) => {
          if (!cur) return cur;
          const t = uno.nextTimer?.(cur.state);
          if (cur.state.phase !== 'done' || !t || !uno.onTimer) return cur;
          const rng = createRng(cur.rngState);
          const next = uno.onTimer(cur.state, t.id, rng, Date.now());
          return { state: next, rngState: rng.state };
        });
      }, waitMs);
      return () => window.clearTimeout(id);
    }

    if (state.phase !== 'play' || !uno.bot) return;

    const tableView = uno.getTableView(state);
    const probeRng = createRng(mixSeed(game.rngState, state.seq + 1));
    const readyBot = DEMO_PLAYERS.filter((p) => p.bot).find((bot) =>
      Boolean(
        uno.bot!({
          playerId: bot.id,
          playerIds: DEMO_PLAYER_IDS,
          view: uno.getPlayerView(state, bot.id),
          tableView,
          rng: probeRng,
          level: 'normal',
          now: Date.now(),
        }),
      ),
    );
    if (!readyBot) return;

    const pace = uno.botDelayMs;
    const base = typeof pace === 'function' ? pace(state) : (pace ?? BOT_DELAY_MS);
    const delayMs = Math.round(
      base * (0.8 + createRng(mixSeed(game.rngState, state.seq + 1)).next()),
    );

    const id = window.setTimeout(() => {
      setGame((cur) => {
        if (!cur || cur.state.phase !== 'play' || !uno.bot) return cur;
        const tView = uno.getTableView(cur.state);
        const evalRng = createRng(mixSeed(cur.rngState, cur.state.seq + 1));
        for (const bot of DEMO_PLAYERS) {
          if (!bot.bot) continue;
          const act = uno.bot({
            playerId: bot.id,
            playerIds: DEMO_PLAYER_IDS,
            view: uno.getPlayerView(cur.state, bot.id),
            tableView: tView,
            rng: evalRng,
            level: 'normal',
            now: Date.now(),
          });
          if (!act) continue;
          const rng = createRng(cur.rngState);
          const next = uno.applyAction(cur.state, bot.id, act, rng, Date.now());
          return { state: next, rngState: rng.state };
        }
        return cur;
      });
    }, delayMs);
    return () => window.clearTimeout(id);
  }, [game, state]);

  const PlayerScreen = unoUi.PlayerScreen;
  const playerView = state ? uno.getPlayerView(state, ME_ID) : null;
  const tableView = state ? uno.getTableView(state) : null;
  const names = Object.fromEntries(DEMO_PLAYERS.map((p) => [p.id, p.name]));
  const byId = new Map(DEMO_PLAYERS.map((p) => [p.id, p]));
  const standings = result?.standings ?? [];
  const mine = standings.find((st) => st.playerId === ME_ID);
  const me = byId.get(ME_ID);

  const pageClass = result ? 'lobby-page demo-page' : 'lobby-page demo-page lobby-page--fit';

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

  return (
    <div className={pageClass}>
      <header className="lobby-bar">
        <h1 className="sr-only">UNO demo</h1>
        <Link href="/" className="lobby-bar__home" aria-label="Jackdaw home">
          <BirdMark width={40} height={40} weight={3} />
        </Link>
        <div className="demo-bar__title">
          <span className="demo-bar__game">UNO</span>
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
          <button type="button" className="demo-bar__btn" onClick={newGame}>
            New deal
          </button>
          <Link href="/" className="demo-bar__btn demo-bar__btn--go">
            Open lobby
          </Link>
        </div>
      </header>

      <div className="lobby-layout">
        <main className="lobby-main">
          {!result && PlayerScreen && playerView && tableView ? (
            <div className="game-shell game-shell--fit">
              <PlayerScreen
                view={playerView}
                tableView={tableView}
                me={ME_ID}
                players={DEMO_PLAYERS}
                sendAction={sendAction}
                now={() => Date.now()}
                reactions={[]}
              />
            </div>
          ) : result ? (
            <div className="results">
              <Lid className="results__head">
                <span className="jd-label">UNO demo complete</span>
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
                          data-me={st.playerId === ME_ID || undefined}
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
                              {st.playerId === ME_ID && <small> (you)</small>}
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
              <RecapStatsTable stats={result.stats} names={names} me={ME_ID} />
              <RecapTimeline events={result.recap} names={names} roundName={result.roundName} />
              <div className="dock">
                <Plaque go onClick={newGame}>
                  Play UNO again
                </Plaque>
                <Link href="/" className="demo-bar__btn">
                  Start a live lobby for friends
                </Link>
              </div>
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
}
