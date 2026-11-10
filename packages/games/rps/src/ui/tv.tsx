'use client';

import { useMoment, VerdictMoment, type GameUi, type ScreenPlayer } from '@jackdaw/ui';
import { listNames, roundWinners } from '../outcome';
import { beats, type RoundResult, type RpsTableView } from '../rules';
import { flipped, revealing, useRevealBeat } from './beat';
import { ScorePad } from './pad';
import { Ring, shownHistory, shownScores } from './ring';
import { THROW_NAME } from './throw';
import './tv.css';

/**
 * Rock Paper Scissors on the TV: the ring fills the stage with everyone's token, name plaque and
 * disc. The count and the flip happen big in the middle, and a tally board at the side keeps the
 * points and the round history. Readable from across a room.
 */
export const TvScreen: GameUi['TvScreen'] = ({ tableView, players, reactions }) => {
  const view = tableView as RpsTableView;
  const byId = new Map((players as ScreenPlayer[]).map((p) => [p.id, p] as const));
  const name = (id: string) => byId.get(id)?.name ?? 'Left the lobby';
  const waiting = view.players.length - view.picked.length;
  const last = view.history[view.history.length - 1];
  const [fresh, dismiss] = useMoment(view.history.length);
  const step = useRevealBeat(view.history.length);
  const roundWon = last ? roundWinners(last) : [];
  const finished = view.round > view.rounds;
  const scores = shownScores(view, step);
  const history = shownHistory(view, step);

  const status = finished
    ? 'Adding up the scores'
    : last && revealing(step)
      ? flipped(step)
        ? `Round ${last.round} result`
        : 'Everyone has thrown'
      : waiting === 0
        ? 'Everyone has picked'
        : `Waiting on ${waiting} ${waiting === 1 ? 'player' : 'players'}`;

  return (
    <div className="rps-tv">
      <header className="rps-tv__head">
        <h2 className="rps-tv__round jd-display">
          {finished ? 'Final round done' : `Round ${view.round} of ${view.rounds}`}
        </h2>
        <p className="rps-tv__status">{status}</p>
      </header>

      <section className="rps-tv__ring" aria-label="The ring">
        <Ring
          table={view}
          players={players as ScreenPlayer[]}
          step={step}
          reactions={reactions}
          tv
        />
      </section>

      <section className="rps-tv__board" aria-label="Scores">
        <h2 className="rps-tv__heading jd-display">Scores</h2>
        <ScorePad
          table={view}
          players={players as ScreenPlayer[]}
          scores={scores}
          history={history}
          tv
        />
      </section>

      {fresh !== null && step >= 5 && last && !finished && (
        <VerdictMoment
          key={last.round}
          size="tv"
          ms={4200}
          outcome={roundWon.length ? 'win' : 'draw'}
          title={roundTitle(last, roundWon, name)}
          detail={roundDetail(last, roundWon, name)}
          avatar={roundWon.length === 1 ? byId.get(roundWon[0]!)?.avatar : undefined}
          onDone={dismiss}
        />
      )}
    </div>
  );
};

export function roundTitle(last: RoundResult, winners: string[], name: (id: string) => string) {
  if (winners.length === 0) return `Round ${last.round} is a stand-off`;
  if (winners.length === 1) return `${name(winners[0]!)} takes round ${last.round}`;
  return `${listNames(winners, name)} share round ${last.round}`;
}

/** "Rock beat Lark and Magpie", from the public throws only. */
export function roundDetail(last: RoundResult, winners: string[], name: (id: string) => string) {
  if (winners.length === 0) return 'Nobody got ahead this round.';
  const pick = last.picks[winners[0]!]!;
  const beaten = Object.keys(last.picks).filter((id) => beats(pick, last.picks[id]!));
  const sameThrow = winners.every((id) => last.picks[id] === pick);
  if (!sameThrow) return 'Everyone at the top scored the same.';
  return `${THROW_NAME[pick]} beat ${listNames(beaten, name, 3)}.`;
}
