'use client';

import { useTheme, type GameUi } from '@jackdaw/ui';
import type { CodenamesReveal } from '../rules';
import { TEAM_NAME } from '../teams';
import { Board } from './board';
import { ClueLog } from './player';
import { TeamFiles } from './teams';
import './codenames.css';

/**
 * The end of a game: both teams, the whole key laid open (words nobody found are dimmed), and
 * every clue in order with the words guessed for it and which were wrong.
 */
export const Reveal: NonNullable<GameUi['Reveal']> = ({ result, players, me }) => {
  const r = result.reveal as CodenamesReveal;
  const look = useTheme();
  const byId = new Map(players.map((p) => [p.id, p]));
  const name = (id: string) => byId.get(id)?.name ?? 'Someone';
  const shown = r.key.map((c, i) => (r.revealed[i] ? c : null));

  return (
    <div className="cn cn-reveal" data-look={look}>
      <TeamFiles
        teams={r.teams}
        spymasters={r.spymasters}
        players={players}
        me={me}
        outcome={r.winner}
      />
      <section className="cn-reveal__board" aria-label="The whole key">
        <h3 className="cn-log__title">The key</h3>
        <p className="cn-reveal__note">
          {TEAM_NAME[r.starting]} went first. Stamped words were guessed; the faded ones were never
          found.
        </p>
        <Board
          words={r.words}
          revealed={shown}
          keyCards={r.key}
          players={players}
          size="small"
          final
        />
      </section>
      <ClueLog clues={r.clues} words={r.words} name={name} oldestFirst />
    </div>
  );
};
