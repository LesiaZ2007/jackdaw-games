'use client';

import type { CSSProperties } from 'react';
import { Token, useTheme, type GameUi, type ScreenPlayer } from '@jackdaw/ui';
import type { CodenamesReveal } from '../rules';
import { other, TEAM_NAME, TEAMS, type Team } from '../teams';
import { CardMark, Lens } from './art';
import './codenames.css';
import './tv-reveal.css';

const vars = (v: Record<string, string | number>) => v as CSSProperties;

/** One plain line on how the file was closed. */
function endLine(r: CodenamesReveal): string {
  if (!r.winner) return 'The host closed the file with both teams level.';
  if (r.how === 'assassin')
    return `${TEAM_NAME[other(r.winner)]} found the assassin, so ${TEAM_NAME[r.winner]} wins.`;
  if (r.how === 'words') return `${TEAM_NAME[r.winner]} found all of its words.`;
  return `The host closed the file early. ${TEAM_NAME[r.winner]} was ahead.`;
}

/** A team's folder: the spymaster first, then the operatives, and the rubber stamp if it has one. */
function Folder({
  team,
  players,
  r,
  stamp,
}: {
  team: Team;
  players: ScreenPlayer[];
  r: CodenamesReveal;
  stamp: string | null;
}) {
  const ids = players.filter((p) => r.teams[p.id] === team);
  const ordered = [
    ...ids.filter((p) => r.spymasters[team] === p.id),
    ...ids.filter((p) => r.spymasters[team] !== p.id),
  ];
  return (
    <section
      className={`cn-rv__file cn-file--${team}${stamp ? ' is-stamped' : ''}`}
      aria-label={`${TEAM_NAME[team]} team`}
    >
      <header className="cn-rv__tab">
        <h3>{TEAM_NAME[team]}</h3>
        {stamp && <span className="cn-rv__rubber">{stamp}</span>}
      </header>
      <ul className="cn-rv__people">
        {ordered.map((p) => (
          <li key={p.id}>
            <Token avatar={p.avatar} size={40} />
            <span className="cn-rv__name">{p.name}</span>
            {r.spymasters[team] === p.id && (
              <span className="cn-rv__spy" title="Spymaster">
                <Lens size={28} />
                <span className="sr-only">Spymaster</span>
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The TV's results for Codenames: the case closed. All 25 index cards with the stamp of what each
 * word really was (solid where it was found, outlined where nobody found it), the stamps landing
 * one after another, beside the two team folders. The winning folder gets CASE CLOSED; when the
 * game ended on the assassin the losing folder is COMPROMISED and the assassin card is ringed.
 * It fills the box the platform gives it and never scrolls.
 */
export const TvReveal: NonNullable<GameUi['TvReveal']> = ({ result, players }) => {
  const r = result.reveal as CodenamesReveal;
  const look = useTheme();
  const loser = r.how === 'assassin' && r.winner ? other(r.winner) : null;
  const stampOf = (t: Team) =>
    loser ? (t === loser ? 'Compromised' : null) : r.winner === t ? 'Case closed' : null;

  return (
    <div className="cn cn-rv" data-look={look}>
      <ol className="cn-rv__board" aria-label="The whole key">
        {r.words.map((word, i) => {
          const card = r.key[i]!;
          const found = Boolean(r.revealed[i]);
          const what =
            card === 'bystander' || card === 'assassin' ? card : `${TEAM_NAME[card]} agent`;
          return (
            <li
              key={i}
              className={`cn-rv__card is-${card}${found ? ' is-found' : ' is-missed'}${
                card === 'assassin' && r.how === 'assassin' ? ' is-ringed' : ''
              }`}
              style={vars({ '--i': i })}
              aria-label={`${word}: ${what}${found ? ', found' : ', never found'}`}
            >
              <span className="cn-rv__stamp" aria-hidden="true">
                <CardMark card={card} size="64%" />
              </span>
            </li>
          );
        })}
      </ol>
      <div className="cn-rv__side">
        <p className="cn-rv__line">{endLine(r)}</p>
        {TEAMS.map((t) => (
          <Folder key={t} team={t} players={players} r={r} stamp={stampOf(t)} />
        ))}
      </div>
    </div>
  );
};
