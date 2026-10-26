'use client';

import {
  PlayerReaction,
  Token,
  useCountdown,
  useMoment,
  VerdictMoment,
  type GameUi,
  type ScreenPlayer,
} from '@jackdaw/ui';
import type { Reaction } from '@jackdaw/engine';
import { MIDDLE, other, TEAM_NAME, type WavelengthTableView } from '../rules';
import { Dial } from './dial';
import { Clock, lockTally, Offer, Scores } from './player';
import { cardOf, pointsLine, roundMoment, statusLine, teamWord } from './words';
import './wavelength.css';

/**
 * Wavelength for someone watching on a phone: the phone's own scores, clue and dial, with the
 * needle easing as the team drags it, then who is acting this round and what they've done. The
 * target shows only once the shutter opens, as on the TV.
 */
export const WatchScreen: NonNullable<GameUi['WatchScreen']> = ({
  tableView,
  reactions,
  now,
  ...props
}) => {
  const t = tableView as WavelengthTableView;
  const players = props.players as ScreenPlayer[];
  const byId = new Map(players.map((p) => [p.id, p]));
  const name = (id: string) => byId.get(id)?.name ?? 'Someone';
  const [fresh, dismiss] = useMoment(t.history.length);
  const moment = fresh !== null ? roundMoment(t, null, name) : null;
  const r = t.round;
  const shown = t.phase === 'reveal' || t.phase === 'over';
  const last = t.history[t.history.length - 1];
  const marks =
    shown && last?.dials
      ? Object.entries(last.dials).map(([id, value]) => ({
          id,
          value,
          tint: `var(--tint-${byId.get(id)?.avatar.tint ?? 'slate'})`,
        }))
      : undefined;

  return (
    <div className="wl wl--phone wl-watch">
      <Scores t={t} me={null} />

      <header className="wl__head">
        {r.clue && t.phase !== 'clue' ? (
          <>
            <p className="wl__by">{name(r.psychic)}’s clue</p>
            <h2 className="wl__clue">{r.clue}</h2>
          </>
        ) : (
          <h2 className="jd-display wl__status">{statusLine(t, name)}</h2>
        )}
      </header>

      <div className="wl-stage">
        <Dial
          spectrum={cardOf(t)}
          value={shown && last ? last.guess : t.guessing === 'shared' ? r.dial : MIDDLE}
          target={shown ? r.target : null}
          open={shown}
          marks={marks}
          team={r.team}
        />
      </div>

      <WatchDock t={t} now={now} name={name} players={byId} reactions={reactions} />

      {moment && (
        <VerdictMoment
          key={t.history.length}
          outcome="reveal"
          title={moment.title}
          detail={moment.detail}
          onDone={dismiss}
        />
      )}
    </div>
  );
};

/** What the table is doing now: the line a waiting phone shows, and who is acting on it. */
function WatchDock({
  t,
  now,
  name,
  players,
  reactions,
}: {
  t: WavelengthTableView;
  now: () => number;
  name: (id: string) => string;
  players: Map<string, ScreenPlayer>;
  reactions: Reaction[];
}) {
  const r = t.round;
  const left = useCountdown(t.nextAt, now);
  const last = t.history[t.history.length - 1];

  if (t.phase === 'reveal' || t.phase === 'over') {
    if (!last) return null;
    return (
      <section className="wl-dock" aria-label="This round">
        <p className={`wl-stamp wl-stamp--${last.points}`} key={last.n}>
          {pointsLine(last)}
          {last.call && (
            <span className="wl-stamp__call">
              {TEAM_NAME[other(last.team)]} called {last.call}: {last.callPoint ? '+1' : 'wrong'}
            </span>
          )}
        </p>
        {t.phase === 'reveal' && left !== null && (
          <p className="wl-dock__count wl-watch__next" role="status">
            {last.final ? 'Results' : 'Next round'} in {left}
          </p>
        )}
      </section>
    );
  }

  const votes = (side: 'left' | 'right') => t.callers.filter((id) => r.calls[id] === side).length;
  const say =
    t.phase === 'clue'
      ? `${name(r.psychic)} can see the target and is thinking of a clue.`
      : t.phase === 'guess'
        ? `${teamWord(t, r.team)} is guessing. ${lockTally(t).tally}.`
        : `${TEAM_NAME[other(r.team)]} is calling left or right: ${votes('left')} left, ${votes('right')} right.`;
  // The psychic first, then whoever is acting: the guessers, or the team calling left or right.
  const acting =
    t.phase === 'call'
      ? t.callers
      : t.phase === 'guess'
        ? t.guessers
        : t.players.filter((id) => id !== r.psychic && t.teams[id] === r.team);

  return (
    <section className="wl-dock" aria-label="This round">
      <p className="wl-dock__say" role="status">
        <span>{say}</span>
        <Clock at={t.actBy} now={now} />
      </p>
      {t.phase === 'clue' && <Offer v={t} />}
      <ul className="wl-watch__who" aria-label="Who is playing this round">
        {[r.psychic, ...acting].map((id) => {
          const p = players.get(id);
          const psychic = id === r.psychic;
          const call = t.phase === 'call' ? r.calls[id] : undefined;
          const locked = t.phase === 'guess' && r.locks.includes(id);
          const done = locked || Boolean(call);
          return (
            <li
              key={id}
              className={`wl-watch__p wl-watch__p--${t.teams[id] ?? 'sun'}${psychic ? ' is-psychic' : ''}${done ? ' is-done' : ''}`}
            >
              <span className="wl-watch__tok">
                {p && <Token avatar={p.avatar} away={!p.online} size={34} />}
                <PlayerReaction reactions={reactions} playerId={id} name={name(id)} size={34} />
              </span>
              <span className="wl-watch__name">
                {name(id)}
                <small key={`${t.phase}-${done}`}>{roleOf(t, id, psychic, locked, call)}</small>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** One word or two under each name: what that player is doing this round. */
function roleOf(
  t: WavelengthTableView,
  id: string,
  psychic: boolean,
  locked: boolean,
  call: 'left' | 'right' | undefined,
): string {
  if (psychic) return 'Psychic';
  if (t.phase === 'clue') return 'Guesser';
  if (t.phase === 'call') return call ? `Calls ${call}` : 'Deciding';
  if (locked) return 'Locked in';
  return t.guessing === 'average' && t.round.moved.includes(id) ? 'Dial set' : 'Turning';
}
