'use client';

import type { Reaction } from '@jackdaw/engine';
import { PlayerReaction, Tally, Token, type ScreenPlayer } from '@jackdaw/ui';
import { TEAM_NAME, TEAMS, type Team } from '../teams';
import { Lens } from './art';

/**
 * The two teams side by side: how many words each still has to find, the spymaster (with the
 * lens) and the operatives. The team in play is raised; `me` is marked.
 */
export function TeamFiles({
  teams,
  spymasters,
  left,
  turn,
  players,
  me,
  reactions,
  size = 'phone',
  outcome,
}: {
  teams: Record<string, Team>;
  spymasters: Record<Team, string>;
  left?: Record<Team, number>;
  turn?: Team | null;
  players: ScreenPlayer[];
  me?: string | null;
  reactions?: Reaction[];
  size?: 'phone' | 'tv';
  /** At the end: which team won. */
  outcome?: Team | null;
}) {
  const tok = size === 'tv' ? 72 : 30;
  return (
    <div className={`cn-files cn-files--${size}`}>
      {TEAMS.map((t) => {
        const ids = players.filter((p) => teams[p.id] === t);
        const ordered = [
          ...ids.filter((p) => spymasters[t] === p.id),
          ...ids.filter((p) => spymasters[t] !== p.id),
        ];
        return (
          <section
            key={t}
            className={[
              'cn-file',
              `cn-file--${t}`,
              turn === t && 'is-turn',
              outcome && (outcome === t ? 'is-won' : 'is-lost'),
            ]
              .filter(Boolean)
              .join(' ')}
            aria-label={`${TEAM_NAME[t]} team`}
          >
            <header className="cn-file__tab">
              <h3>{TEAM_NAME[t]}</h3>
              {left && (
                <span className="cn-file__left">
                  <Tally value={left[t]} /> <span>to find</span>
                </span>
              )}
              {outcome && <span className="cn-file__left">{outcome === t ? 'Won' : 'Lost'}</span>}
            </header>
            <ul className="cn-file__people">
              {ordered.map((p) => {
                const spy = spymasters[t] === p.id;
                return (
                  <li key={p.id} className={p.id === me ? 'is-me' : undefined}>
                    <span className="cn-file__tok">
                      <Token avatar={p.avatar} size={tok} away={!p.online} />
                      <PlayerReaction
                        reactions={reactions}
                        playerId={p.id}
                        name={p.name}
                        size={tok}
                      />
                    </span>
                    <span className="cn-file__name">
                      {p.name}
                      {p.id === me && <small> (you)</small>}
                    </span>
                    {spy && (
                      <span className="cn-file__spy" title="Spymaster">
                        <Lens size={size === 'tv' ? 30 : 18} />
                        <span className="sr-only">Spymaster</span>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
