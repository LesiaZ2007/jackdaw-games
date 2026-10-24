'use client';

import { useMoment, useTheme, VerdictMoment, type GameUi } from '@jackdaw/ui';
import { guessDetail, guessOutcome, guessTitle, lastGuess } from '../outcome';
import type { CodenamesTableView } from '../rules';
import { TEAM_NAME } from '../teams';
import { CardMark } from './art';
import { Board } from './board';
import { ClueLog, ClueStamp, turnLine } from './player';
import { TeamFiles } from './teams';
import './codenames.css';

/**
 * Codenames on the TV: the board as big as the screen allows, with the team files, the clue in
 * play and the clues so far beside it. Only uncovered colours, ever: the TV gets the table view.
 */
export const TvScreen: GameUi['TvScreen'] = ({ tableView, players, reactions }) => {
  const t = tableView as CodenamesTableView;
  const look = useTheme();
  const byId = new Map(players.map((p) => [p.id, p]));
  const name = (id: string) => byId.get(id)?.name ?? 'Someone';
  const current = t.phase === 'guess' ? t.clues[t.clues.length - 1] : undefined;
  const last = lastGuess(t);
  // Each guess gets its moment on the TV too, told from the room's side.
  const [fresh, dismiss] = useMoment(t.guessCount);

  return (
    <div className="cn cn-tv" data-look={look}>
      <div className="cn-tv__board">
        <Board
          words={t.words}
          revealed={t.revealed}
          suggestions={t.suggestions}
          players={players}
          latest={last ? { index: last.guess.index, at: t.guessCount } : null}
          size="tv"
        />
      </div>
      <aside className="cn-tv__side">
        <div className={`cn-turn cn-turn--${t.turn} cn-turn--tv`}>
          <span className="cn-turn__team">{TEAM_NAME[t.turn]}&rsquo;s turn</span>
          {current && <ClueStamp clue={current} size="tv" />}
          <p className="cn-turn__line">{turnLine(t, name)}</p>
          {current?.onBoard && <p className="cn-turn__flag">That clue is a word on the board.</p>}
        </div>
        <TeamFiles
          teams={t.teams}
          spymasters={t.spymasters}
          left={t.left}
          turn={t.turn}
          players={players}
          reactions={reactions}
          size="tv"
        />
        {t.clues.length > 0 && <ClueLog clues={t.clues} words={t.words} name={name} size="tv" />}
      </aside>

      {fresh !== null && last && t.phase !== 'over' && (
        <VerdictMoment
          key={t.guessCount}
          size="tv"
          outcome={guessOutcome(last.clue, last.guess, null)}
          title={guessTitle(t.words[last.guess.index]!, last.clue, last.guess, null)}
          detail={guessDetail(last.clue, last.guess, name)}
          emblem={<CardMark card={last.guess.card} size={68} />}
          onDone={dismiss}
        />
      )}
    </div>
  );
};
