'use client';

import {
  OutcomeChip,
  Tally,
  Token,
  useMoment,
  VerdictMoment,
  type GameUi,
  type Outcome,
  type ScreenPlayer,
} from '@jackdaw/ui';
import { describeRound, roundOutcome, roundWinners } from '../outcome';
import { PICKS, type Pick, type RpsAction, type RpsPlayerView, type RpsTableView } from '../rules';
import './rps-player.css';

const line = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 3.4,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

/** The three throws, in the house line style. */
export function Throw({ pick, size = 48 }: { pick: Pick; size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
      {pick === 'rock' && (
        <g {...line}>
          <path d="M9 44c-2-8 2-17 9-22 4-7 12-10 19-8 9 1 17 8 19 17 2 8-1 15-8 18-10 4-30 4-39-5z" />
          <path d="M17 40c6 1 11 4 14 9M37 15c-1 5 1 9 6 12" strokeWidth="2.4" />
        </g>
      )}
      {pick === 'paper' && (
        <g {...line}>
          <path d="M17 7h21l10 10v40H17z" />
          <path d="M38 7v10h10M24 28h17M24 36h17M24 44h11" strokeWidth="2.6" />
        </g>
      )}
      {pick === 'scissors' && (
        <g {...line}>
          <circle cx="17" cy="45" r="7" />
          <circle cx="17" cy="19" r="7" />
          <path d="M23 41L55 18M23 23l32 23" />
          <circle cx="35" cy="32" r="1.8" fill="currentColor" />
        </g>
      )}
    </svg>
  );
}

const LABEL: Record<Pick, string> = { rock: 'Rock', paper: 'Paper', scissors: 'Scissors' };

/**
 * Rock Paper Scissors on a phone: the whole public table (round, who has thrown, scores, the last
 * reveal) plus this player's three throws at the bottom, within thumb reach.
 */
export const PlayerScreen: GameUi['PlayerScreen'] = ({ view, me, players, sendAction }) => {
  const v = view as RpsPlayerView;
  return (
    <RpsTable
      table={v}
      me={me}
      players={players}
      mine={v.myPick}
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
}: {
  table: RpsTableView;
  me?: string;
  players: ScreenPlayer[];
  mine?: Pick | null;
  onPick?: (p: Pick) => void;
}) {
  const byId = new Map(players.map((p) => [p.id, p]));
  const name = (id: string) => byId.get(id)?.name ?? 'Someone';
  const waiting = table.players.length - table.picked.length;
  const last = table.history[table.history.length - 1];
  const ranked = [...table.players].sort((a, b) => (table.scores[b] ?? 0) - (table.scores[a] ?? 0));
  const finished = table.round > table.rounds;
  // A round that resolves while this screen is open gets its moment (not one from before a refresh).
  const [fresh, dismiss] = useMoment(table.history.length);
  const roundWon = last ? roundWinners(last) : [];
  const mineOutcome = last && me && last.picks[me] ? roundOutcome(last, me) : null;
  const meP = me ? byId.get(me) : undefined;

  return (
    <div className="rps">
      <header className="rps__head">
        <h2 className="jd-display">
          {finished ? 'Final round done' : `Round ${table.round} of ${table.rounds}`}
        </h2>
        <p>
          {finished
            ? 'Adding up the scores…'
            : waiting === 0
              ? 'Revealing…'
              : `${table.picked.length} of ${table.players.length} have thrown. Waiting for ${waiting} more.`}
        </p>
      </header>

      <section className="rps__board" aria-label="Scores">
        <ol>
          {ranked.map((id) => {
            const p = byId.get(id);
            const thrown = table.picked.includes(id);
            return (
              <li key={id} className={id === me ? 'me' : undefined}>
                {p && <Token avatar={p.avatar} size={34} away={!p.online} />}
                <span className="rps__name">
                  {name(id)}
                  {id === me && <small> (you)</small>}
                </span>
                <span className={thrown ? 'rps__thrown' : 'rps__thinking'}>
                  {thrown ? 'Thrown' : 'Thinking'}
                </span>
                <Tally className="rps__score" value={table.scores[id] ?? 0} />
              </li>
            );
          })}
        </ol>
      </section>

      {last && (
        <section className="rps__reveal" aria-label={`Round ${last.round} throws`}>
          <h3 className="jd-label">Round {last.round} throws</h3>
          {/* keyed by round, so each new reveal flips in */}
          <ul key={last.round}>
            {table.players.map((id, i) => {
              const pick = last.picks[id];
              const points = last.points[id] ?? 0;
              const outcome: Outcome =
                roundWon.length === 0 ? 'draw' : roundWon.includes(id) ? 'win' : 'loss';
              return (
                <li
                  key={id}
                  className={`rps__card rps__card--${outcome}${id === me ? ' rps__card--me' : ''}`}
                  style={{ animationDelay: `${i * 90}ms` }}
                >
                  <span className="rps__throw">{pick && <Throw pick={pick} size={34} />}</span>
                  <span className="rps__card-name">
                    {id === me ? 'You' : name(id)}
                    <small>{pick ? LABEL[pick] : 'No throw'}</small>
                  </span>
                  <OutcomeChip outcome={outcome}>+{points}</OutcomeChip>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {onPick && !finished && (
        <section className="rps__hand" aria-label="Your throw">
          <div className="rps__picks" role="radiogroup" aria-label="Throw">
            {PICKS.map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={mine === p}
                className="rps__pick"
                onClick={() => onPick(p)}
              >
                <Throw pick={p} size={52} />
                <span>{LABEL[p]}</span>
              </button>
            ))}
          </div>
          <p className="rps__status" role="status">
            {mine
              ? waiting === 0
                ? `Locked in: ${LABEL[mine]}.`
                : `Locked in: ${LABEL[mine]}. You can change it until the last throw is in.`
              : 'Pick your throw. Nobody sees it until everyone has thrown.'}
          </p>
        </section>
      )}

      {fresh !== null && last && mineOutcome && !finished && (
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
