'use client';

import { useMoment, VerdictMoment, type GameUi, type ScreenPlayer } from '@jackdaw/ui';
import type { Reaction } from '@jackdaw/engine';
import { describeRound, roundOutcome, roundWinners } from '../outcome';
import { PICKS, type Pick, type RpsAction, type RpsPlayerView, type RpsTableView } from '../rules';
import { flipped, revealing, useRevealBeat } from './beat';
import { ScorePad, ScoreStrip } from './pad';
import { Ring, shownHistory, shownScores } from './ring';
import { THROW_NAME, ThrowDisc } from './throw';
import './rps-player.css';

/**
 * Rock Paper Scissors on a phone: the ring (everyone's disc lies face down until all are in, then
 * all turn over together), the scores and round history, and this player's three throws at the
 * bottom, within thumb reach.
 */
export const PlayerScreen: GameUi['PlayerScreen'] = ({
  view,
  me,
  players,
  sendAction,
  reactions,
}) => {
  const v = view as RpsPlayerView;
  return (
    <RpsTable
      table={v}
      me={me}
      players={players}
      mine={v.myPick}
      reactions={reactions}
      onPick={(pick) => sendAction({ type: 'pick', pick } satisfies RpsAction)}
    />
  );
};

/** The public table, optionally with this player's throw controls. Shared shape with the TV. */
export function RpsTable({
  table,
  me,
  players,
  mine,
  onPick,
  reactions,
}: {
  table: RpsTableView;
  me?: string;
  players: ScreenPlayer[];
  mine?: Pick | null;
  onPick?: (p: Pick) => void;
  reactions?: Reaction[];
}) {
  const byId = new Map(players.map((p) => [p.id, p]));
  const name = (id: string) => byId.get(id)?.name ?? 'Someone';
  const last = table.history[table.history.length - 1];
  const finished = table.round > table.rounds;
  // A round that resolves while this screen is open gets its moment (not one from before a refresh):
  // a three-beat count, the discs turning over, then the verdict.
  const [fresh, dismiss] = useMoment(table.history.length);
  const step = useRevealBeat(table.history.length);
  const roundWon = last ? roundWinners(last) : [];
  const mineOutcome = last && me && last.picks[me] ? roundOutcome(last, me) : null;
  const meP = me ? byId.get(me) : undefined;
  const scores = shownScores(table, step);
  const history = shownHistory(table, step);

  const status = finished
    ? 'Adding up the scores…'
    : last && revealing(step)
      ? flipped(step)
        ? `Round ${last.round} result`
        : 'Everyone has thrown. Turning over…'
      : `${table.picked.length} of ${table.players.length} have thrown`;

  return (
    <div className="rps">
      <header className="rps__head">
        <h2 className="jd-display">
          {finished ? 'Final round done' : `Round ${table.round} of ${table.rounds}`}
        </h2>
        <p>{status}</p>
      </header>

      <Ring table={table} players={players} me={me} step={step} reactions={reactions} />

      <div className="rps__side">
        <div className="rps-scores">
          <ScoreStrip table={table} players={players} me={me} scores={scores} />
          <ScorePad table={table} players={players} me={me} scores={scores} history={history} />
        </div>

        {onPick && !finished && (
          <section className="rps__hand" aria-label="Your throw">
            <div
              className={mine ? 'rps-picks has-pick' : 'rps-picks'}
              role="radiogroup"
              aria-label="Throw"
            >
              {PICKS.map((p) => (
                <button
                  key={p}
                  type="button"
                  role="radio"
                  aria-checked={mine === p}
                  className="rps-pick"
                  onClick={() => onPick(p)}
                >
                  <ThrowDisc pick={p} selected={mine === p} />
                  <span className="rps-pick__label">{THROW_NAME[p]}</span>
                </button>
              ))}
            </div>
            <p className="rps__status" role="status">
              {mine
                ? `Locked in: ${THROW_NAME[mine]}. Tap another to change it.`
                : 'Pick a throw. Nobody sees it yet.'}
            </p>
          </section>
        )}
      </div>

      {fresh !== null && step >= 5 && last && mineOutcome && !finished && (
        <VerdictMoment
          key={last.round}
          outcome={mineOutcome.outcome}
          title={
            mineOutcome.outcome === 'win'
              ? roundWon.length > 1
                ? `You share round ${last.round}`
                : `You won round ${last.round}`
              : mineOutcome.outcome === 'loss'
                ? `You lost round ${last.round}`
                : `Round ${last.round} is a stand-off`
          }
          detail={describeRound(last, me!, name)}
          avatar={meP?.avatar}
          onDone={dismiss}
        />
      )}
    </div>
  );
}
