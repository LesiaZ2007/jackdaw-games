'use client';

import { useMoment, useTheme, VerdictMoment, type GameUi } from '@jackdaw/ui';
import { guessDetail, guessTitle, lastGuess } from '../outcome';
import type { CodenamesTableView } from '../rules';
import { TEAM_NAME } from '../teams';
import { CardMark } from './art';
import { Board } from './board';
import { ClueLog, ClueStamp, turnLine } from './player';
import { TeamFiles } from './teams';
import './codenames.css';

/**
 * Codenames for someone watching on a phone: the phone's own turn header, team folders and board,
 * then the clues so far. Only uncovered colours, as on the TV: it gets the table view.
 */
export const WatchScreen: NonNullable<GameUi['WatchScreen']> = ({
  tableView,
  players,
  reactions,
}) => {
  const t = tableView as CodenamesTableView;
  const look = useTheme();
  const byId = new Map(players.map((p) => [p.id, p]));
  const name = (id: string) => byId.get(id)?.name ?? 'Someone';
  const current = t.phase === 'guess' ? t.clues[t.clues.length - 1] : undefined;
  const last = lastGuess(t);
  const [fresh, dismiss] = useMoment(t.guessCount);

  return (
    <div className="cn cn-play cn-watch" data-look={look}>
      <header className={`cn-turn cn-turn--${t.turn}`}>
        <span className="cn-turn__team">{TEAM_NAME[t.turn]}&rsquo;s turn</span>
        {current ? <ClueStamp clue={current} /> : null}
        <p className="cn-turn__line" role="status">
          {turnLine(t, name)}
        </p>
        {current?.onBoard && <p className="cn-turn__flag">That clue is a word on the board.</p>}
      </header>

      <TeamFiles
        teams={t.teams}
        spymasters={t.spymasters}
        left={t.left}
        turn={t.turn}
        players={players}
        reactions={reactions}
      />

      <Board
        words={t.words}
        revealed={t.revealed}
        suggestions={t.suggestions}
        players={players}
        latest={last ? { index: last.guess.index, at: t.guessCount } : null}
      />

      {t.clues.length > 0 ? (
        <ClueLog clues={t.clues} words={t.words} name={name} />
      ) : (
        <p className="cn-watch__empty">The spymasters&rsquo; clues are listed here as they come.</p>
      )}

      {fresh !== null && last && t.phase !== 'over' && (
        <VerdictMoment
          key={t.guessCount}
          outcome="reveal"
          title={guessTitle(t.words[last.guess.index]!, last.clue, last.guess, null)}
          detail={guessDetail(last.clue, last.guess, name)}
          emblem={<CardMark card={last.guess.card} size={34} />}
          onDone={dismiss}
        />
      )}
    </div>
  );
};
