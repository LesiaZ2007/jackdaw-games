'use client';

import { useEffect, useState, type ReactNode } from 'react';
import type { LobbySnapshot, RecapEvent, Standing } from '@jackdaw/engine';
import {
  BirdMark,
  OutcomeChip,
  StoryBarsView,
  StoryChartView,
  StoryFacts,
  StoryHeadlines,
  Token,
  Verdict,
  recapLine,
  withNames,
  type ScreenPlayer,
  type StoryContext,
} from '@jackdaw/ui';
import { catalogEntry } from '@/lib/catalog';

const RECAP_ROWS = 6;
/** The winner gets the screen to themselves this long before the stats begin. */
const REVEAL_MS = 8_000;
const PANEL_MS = 12_000;
const FACTS_PER_PANEL = 4;
/** Short names for the panel tabs, so they fit one line. */
const TABS: Record<string, string> = {
  'How it ended': 'The end',
  'Big numbers': 'Numbers',
  'Fun facts': 'Facts',
  'More facts': 'More',
  'By the numbers': 'Table',
  'What happened': 'Recap',
};
const OUTCOME: Record<Standing['outcome'], string> = { win: 'Won', loss: 'Lost', draw: 'Draw' };

interface Panel {
  id: string;
  title: string;
  node: ReactNode;
}

/**
 * The big reveal on the TV. First the winners rise with everyone's standing; then the screen
 * turns into a stats show: the standings move to a column and the rest of the screen takes
 * turns through the game's own picture of the end, its big numbers, charts, fun facts,
 * comparisons and the recap. Phones show the same stats in one scroll.
 */
export function TvResults({
  snapshot,
  players,
  hostName,
  startAt = 'reveal',
  startPanel = 0,
}: {
  snapshot: LobbySnapshot;
  players: ScreenPlayer[];
  hostName: string;
  /** Where the screen starts: the winner's moment, or straight into the stats (previews). */
  startAt?: 'reveal' | 'stats';
  /** Which stats panel to open on (previews). */
  startPanel?: number;
}) {
  const result = snapshot.results!;
  const game = catalogEntry(result.gameId)?.meta.name ?? 'The game';
  const TvReveal = catalogEntry(result.gameId)?.ui?.TvReveal;
  const latest = snapshot.history[0];
  // Names as they were when the game ended (people may have left or renamed since).
  const names: Record<string, string> = Object.fromEntries([
    ...players.map((p) => [p.id, p.name] as const),
    ...Object.entries(latest?.gameId === result.gameId ? (latest.names ?? {}) : {}),
  ]);
  const byId = new Map(players.map((p) => [p.id, p]));
  const standings: Standing[] =
    result.standings ??
    (latest?.players ?? players.map((p) => p.id)).map((playerId) => ({
      playerId,
      outcome: result.winners.includes(playerId) ? 'win' : 'loss',
    }));
  const recap: RecapEvent[] = result.recap;
  // Turning points first, in game order, then the rest fill any room left.
  const shown = [...recap.filter((e) => e.key), ...recap.filter((e) => !e.key)]
    .slice(0, RECAP_ROWS)
    .sort((a, b) => recap.indexOf(a) - recap.indexOf(b));
  const roundName = result.roundName ?? 'Round';
  const more = recap.length - shown.length;
  const story = result.story;
  const ctx: StoryContext = {
    names,
    players,
    order: [
      ...new Set([
        ...result.winners,
        ...standings.map((s) => s.playerId),
        ...players.map((p) => p.id),
      ]),
    ],
    winners: result.winners,
    tv: true,
  };

  const panels: Panel[] = [];
  if (TvReveal) {
    panels.push({
      id: 'reveal',
      title: 'How it ended',
      node: (
        <section className="tv-reveal" aria-label="How it ended">
          <TvReveal result={result} players={players} />
        </section>
      ),
    });
  }
  if (story?.headlines?.length) {
    panels.push({
      id: 'heads',
      title: 'Big numbers',
      node: <StoryHeadlines items={story.headlines} ctx={ctx} />,
    });
  }
  for (const c of story?.charts ?? []) {
    panels.push({
      id: `chart-${c.title}`,
      title: c.title,
      node: <StoryChartView chart={c} ctx={ctx} />,
    });
  }
  const facts = story?.facts ?? [];
  // Two panels of facts at most; phones have the rest.
  for (let i = 0; i < Math.min(facts.length, FACTS_PER_PANEL * 2); i += FACTS_PER_PANEL) {
    panels.push({
      id: `facts-${i}`,
      title: i === 0 ? 'Fun facts' : 'More facts',
      node: <StoryFacts facts={facts.slice(i, i + FACTS_PER_PANEL)} ctx={ctx} />,
    });
  }
  for (const b of story?.bars ?? []) {
    panels.push({
      id: `bars-${b.title}`,
      title: b.title,
      node: <StoryBarsView bars={b} ctx={ctx} />,
    });
  }
  const stats = result.stats;
  if (stats?.rows.length && stats.columns.length) {
    panels.push({
      id: 'table',
      title: 'By the numbers',
      node: (
        <table className="tv-table">
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">Player</span>
              </th>
              {stats.columns.map((c) => (
                <th key={c} scope="col">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {stats.rows.map((r) => {
              const p = byId.get(r.playerId);
              return (
                <tr key={r.playerId} data-won={result.winners.includes(r.playerId) || undefined}>
                  <th scope="row">
                    <span className="tv-table__who">
                      {p && <Token avatar={p.avatar} size={40} />}
                      <span>{names[r.playerId] ?? 'Someone'}</span>
                    </span>
                  </th>
                  {stats.columns.map((c, i) => (
                    <td key={c}>{r.values[i] ?? ''}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      ),
    });
  }
  if (shown.length) {
    panels.push({
      id: 'recap',
      title: 'What happened',
      node: (
        <section className="tv-recap" aria-label="What happened">
          <ol>
            {shown.map((e, i) => {
              const line = recapLine(e, names);
              return (
                <li key={i} className="tv-recap__event" data-tone={e.tone}>
                  {e.round !== undefined && (
                    <span className="tv-recap__round" title={`${roundName} ${e.round}`}>
                      {e.round}
                    </span>
                  )}
                  <span className="tv-recap__text">
                    <span>
                      {line.actor && <b>{line.actor}: </b>}
                      {line.text}
                      {e.tag && <span className="tv-recap__tag">{withNames(e.tag, names)}</span>}
                    </span>
                    {line.secret && <span className="tv-recap__secret">{line.secret}</span>}
                  </span>
                </li>
              );
            })}
          </ol>
          {more > 0 && <p className="tv-recap__more">And {more} more on everyone&apos;s phones.</p>}
        </section>
      ),
    });
  }

  // First the winner's moment, then the stats show, one panel after another.
  const [stage, setStage] = useState<'reveal' | 'stats'>(startAt);
  const [at, setAt] = useState(startPanel);
  const count = panels.length;
  useEffect(() => {
    if (!count) return;
    const t = setTimeout(() => setStage('stats'), REVEAL_MS);
    return () => clearTimeout(t);
  }, [count]);
  useEffect(() => {
    if (stage !== 'stats' || count < 2) return;
    const t = setInterval(() => setAt((i) => (i + 1) % count), PANEL_MS);
    return () => clearInterval(t);
  }, [stage, count]);
  const panel = panels[at % Math.max(1, count)];

  const winnerNames = result.winners.map((id) => names[id] ?? 'A player who left');
  const title =
    winnerNames.length === 0
      ? 'No winner this time'
      : winnerNames.length === 1
        ? `${winnerNames[0]} wins`
        : winnerNames.length === 2
          ? `${winnerNames[0]} and ${winnerNames[1]} share the win`
          : // Three or more names wrap the ribbon to three lines and crowd out the standings;
            // the winners' tokens and names stand in a row just below anyway.
            `${winnerNames.length} players share the win`;
  // A row of several winners is drawn smaller, so the standings keep their room.
  const crowd = result.winners.length > 2;
  const showing = stage === 'stats' && panel;

  return (
    <div className={`tv-results${showing ? ' tv-results--stats' : ''}`}>
      <header className="tv-results__top">
        <div className="tv-brand">
          <BirdMark width={72} height={72} weight={2.8} />
          <span className="jd-display tv-results__game">{game}</span>
        </div>
        {showing && (
          <div className="tv-results__champ">
            <span className="tv-results__champ-tokens" aria-hidden>
              {result.winners.slice(0, 4).map((id) => {
                const p = byId.get(id);
                return p ? <Token key={id} avatar={p.avatar} size={56} /> : null;
              })}
            </span>
            <span className="tv-results__champ-text">
              <b>{title}</b>
              <span>{withNames(result.summary, names)}</span>
            </span>
          </div>
        )}
        <span className="tv-count">Lobby {snapshot.code}</span>
      </header>

      {!showing && (
        <section className="tv-winners">
          <Verdict
            size="tv"
            outcome={result.winners.length ? 'win' : 'draw'}
            title={title}
            detail={withNames(result.summary, names)}
            avatar={result.winners.length === 1 ? byId.get(result.winners[0]!)?.avatar : undefined}
          />
          <ol
            className={
              result.winners.length > 1
                ? `tv-winners__row${crowd ? ' tv-winners__row--crowd' : ''}`
                : 'sr-only'
            }
            aria-label="Winners"
          >
            {result.winners.map((id, i) => {
              const p = byId.get(id);
              return (
                <li key={id} className="tv-winner" style={{ animationDelay: `${900 + i * 160}ms` }}>
                  {p ? <Token avatar={p.avatar} size={crowd ? 64 : 96} /> : null}
                  <span className="tv-winner__name">{names[id] ?? 'A player who left'}</span>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      <section
        className="tv-standings"
        aria-label="Everyone's result"
        data-many={standings.length > 10 || undefined}
        data-few={standings.length <= 6 || undefined}
      >
        <h2 className="jd-display tv-section-title">Standings</h2>
        <ol>
          {standings.map((s) => {
            const p = byId.get(s.playerId);
            return (
              <li key={s.playerId} className={`tv-standing tv-standing--${s.outcome}`}>
                {p ? <Token avatar={p.avatar} size={48} /> : <span className="tv-standing__gone" />}
                <span className="tv-standing__name">{names[s.playerId] ?? 'Left the lobby'}</span>
                {(s.team || s.role) && (
                  <span className="tv-standing__role">
                    {[s.team, s.role !== s.team ? s.role : null].filter(Boolean).join(', ')}
                  </span>
                )}
                <OutcomeChip outcome={s.outcome} className="tv-standing__outcome">
                  {OUTCOME[s.outcome]}
                </OutcomeChip>
              </li>
            );
          })}
        </ol>
      </section>

      {showing && (
        <section className="tv-show" aria-live="polite">
          {count > 1 && (
            <ol
              className="tv-show__tabs"
              data-many={
                count > 7 ||
                panels.reduce((n, p) => n + (TABS[p.title] ?? p.title).length, 0) > 56 ||
                undefined
              }
              aria-hidden
            >
              {panels.map((p, i) => (
                <li key={p.id} data-on={i === at % count || undefined}>
                  {TABS[p.title] ?? p.title}
                  {i === at % count && (
                    <span
                      className="tv-show__clock"
                      style={{ animationDuration: `${PANEL_MS}ms` }}
                    />
                  )}
                </li>
              ))}
            </ol>
          )}
          <h2 className="jd-display tv-section-title tv-show__title">{panel.title}</h2>
          <div key={panel.id} className="tv-show__body jd-story jd-story--tv">
            {panel.node}
          </div>
        </section>
      )}

      <p className="tv-waiting tv-results__waiting">
        Waiting for {hostName} to play again or go back to the lobby
      </p>
    </div>
  );
}
