'use client';

import type { ClientMessage, LobbySnapshot, Standing } from '@jackdaw/engine';
import {
  Lid,
  OutcomeChip,
  Plaque,
  RecapTimeline,
  Token,
  Verdict,
  useTheme,
  type Outcome,
  type ScreenPlayer,
} from '@jackdaw/ui';
import { catalogEntry } from '@/lib/catalog';
import '../results.css';

const OUTCOME: Record<Standing['outcome'], string> = { win: 'Won', loss: 'Lost', draw: 'Draw' };

/** "Bran", "Bran and Cerys", "Bran, Cerys and Dai". */
const joinNames = (names: string[]) =>
  names.length <= 1
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

/**
 * The end of a game: this player's own verdict (won, lost, draw, or who won for someone who
 * watched), the winners' tokens, everyone's standing, then the host picks what's next.
 */
export function Results({
  snapshot: s,
  players,
  isHost,
  send,
}: {
  snapshot: LobbySnapshot;
  players: ScreenPlayer[];
  isHost: boolean;
  send: (m: ClientMessage) => Promise<LobbySnapshot | null>;
}) {
  const look = useTheme();
  const result = s.results;
  if (!result) return null;
  const entry = catalogEntry(result.gameId);
  const latest = s.history[0]?.gameId === result.gameId ? s.history[0] : undefined;
  const names = Object.fromEntries(players.map((p) => [p.id, p.name]));
  // Fall back to the names recorded with the game, for anyone who has since left.
  for (const h of s.history) for (const [id, n] of Object.entries(h.names)) names[id] ??= n;
  const byId = new Map(players.map((p) => [p.id, p]));
  const host = players.find((p) => p.id === s.hostId);
  const Reveal = entry?.ui?.Reveal;
  const standings: Standing[] = result.standings ?? latest?.standings ?? [];
  const mine = standings.find((st) => st.playerId === s.me);
  const winnerNames = result.winners.map((id) => names[id] ?? 'Someone');
  const me = s.me ? byId.get(s.me) : undefined;

  // A game with its own end screen draws all of it (Secret Hitler's victory popup).
  const OwnResults = entry?.ui?.Results;
  if (OwnResults) {
    return (
      <OwnResults
        result={result}
        players={players}
        me={s.me}
        hostId={s.hostId}
        isHost={isHost}
        playAgain={() => void send({ type: 'playAgain', look })}
        backToLobby={() => void send({ type: 'backToLobby' })}
      />
    );
  }

  // Seated players get their own result; anyone who watched is told who won.
  let outcome: Outcome;
  let title: string;
  if (mine) {
    outcome = mine.outcome;
    title =
      mine.outcome === 'win'
        ? result.winners.length > 1
          ? 'You share the win'
          : 'You won'
        : mine.outcome === 'loss'
          ? 'You lost'
          : 'A draw';
  } else {
    outcome = result.winners.length ? 'reveal' : 'draw';
    title =
      result.winners.length === 0
        ? 'No winner'
        : result.winners.length === 1
          ? `${winnerNames[0]} won`
          : 'A shared win';
  }
  const lostTo = mine?.outcome === 'loss' && winnerNames.length > 0;
  // A lone winner already pressed into the seal doesn't need a second token below it.
  const soleInSeal = result.winners.length === 1 && (mine ? result.winners[0] === s.me : true);
  const sealAvatar = mine
    ? me?.avatar
    : result.winners.length === 1
      ? byId.get(result.winners[0]!)?.avatar
      : undefined;

  return (
    <div className="results">
      <Lid className="results__head">
        <span className="jd-label">{entry?.meta.name ?? 'Game'} is over</span>
        <Verdict
          outcome={outcome}
          title={title}
          avatar={sealAvatar}
          detail={lostTo ? `${joinNames(winnerNames)} won. ${result.summary}.` : result.summary}
        />
        {result.winners.length > 0 && !soleInSeal && (
          <div className="results__winners-wrap">
            <span className="jd-label">{result.winners.length === 1 ? 'Winner' : 'Winners'}</span>
            <ul className="results__winners" aria-label="Winners">
              {result.winners.map((id, i) => {
                const p = byId.get(id);
                return (
                  <li key={id} style={{ animationDelay: `${900 + i * 140}ms` }}>
                    {p && <Token avatar={p.avatar} size={56} />}
                    <span>{names[id] ?? 'Someone'}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {/* With the one winner already in the seal, screen readers still get the list. */}
        {soleInSeal && (
          <ul className="sr-only" aria-label="Winners">
            <li>{winnerNames[0]}</li>
          </ul>
        )}
      </Lid>

      {Reveal ? (
        <Reveal result={result} players={players} me={s.me} />
      ) : (
        <>
          {standings.length > 0 && (
            <section className="results__standings" aria-label="How everyone finished">
              <h3 className="jd-display">Standings</h3>
              <ol>
                {standings.map((st, i) => {
                  const p = byId.get(st.playerId);
                  return (
                    <li
                      key={st.playerId}
                      data-outcome={st.outcome}
                      data-me={st.playerId === s.me || undefined}
                      style={{ animationDelay: `${1100 + i * 70}ms` }}
                    >
                      {p ? (
                        <Token avatar={p.avatar} size={36} />
                      ) : (
                        <span className="results__gone" />
                      )}
                      <span className="results__who">
                        <span className="results__name">
                          {names[st.playerId] ?? 'Someone'}
                          {st.playerId === s.me && <small> (you)</small>}
                        </span>
                        {(st.team || st.role) && (
                          <span className="results__role">
                            {[st.team, st.role].filter(Boolean).join(', ')}
                          </span>
                        )}
                      </span>
                      <OutcomeChip outcome={st.outcome}>{OUTCOME[st.outcome]}</OutcomeChip>
                    </li>
                  );
                })}
              </ol>
            </section>
          )}
          <RecapTimeline events={result.recap} names={names} />
        </>
      )}

      <div className="dock">
        {isHost ? (
          <>
            <Plaque go onClick={() => send({ type: 'playAgain', look })}>
              Play {entry?.meta.name ?? 'it'} again
            </Plaque>
            <Plaque onClick={() => send({ type: 'backToLobby' })}>Back to lobby</Plaque>
          </>
        ) : (
          <p className="dock__wait">
            Waiting for {host?.name ?? 'the host'} to choose what&rsquo;s next
          </p>
        )}
      </div>
    </div>
  );
}
